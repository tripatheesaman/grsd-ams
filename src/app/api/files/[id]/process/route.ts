import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { departmentScopedWhere } from "@/server/permissions";
import { absoluteFromMedia, processedOutputFor, renameUploadedFile } from "@/server/files";
import { processAttendance } from "@/server/attendance";
import { mutationOriginError } from "@/server/security";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({
    where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.status === "completed") {
    return NextResponse.json({ error: "Already processed" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as { periodYear?: number; periodMonth?: number } | undefined;
  const periodYear = body?.periodYear;
  const periodMonth = body?.periodMonth;

  if (!Number.isFinite(periodYear) || !Number.isFinite(periodMonth)) {
    const base = file.originalFile.split("/").pop() ?? "";
    if (base.startsWith("attendance_import_")) {
      return NextResponse.json({ error: "Month/year is required to process attendance without logs." }, { status: 400 });
    }
  }

  if (Number.isFinite(periodYear) && Number.isFinite(periodMonth)) {
    const y = Number(periodYear);
    const m = Number(periodMonth);
    if (y >= 2000 && m >= 1 && m <= 12) {
      const month = String(m).padStart(2, "0");
      const desiredName = `attendance_${y}_${month}.xlsx`;
      const renamed = await renameUploadedFile(file.originalFile, desiredName);

      const existing = await prisma.processedFile.findFirst({
        where: { originalFile: renamed.relativePath, id: { not: file.id }, status: { not: "log-import" } },
      });
      if (existing) {
        await prisma.processedFile.delete({ where: { id: existing.id } });
      }
      await prisma.processedFile.update({ where: { id: file.id }, data: { originalFile: renamed.relativePath } });
      file.originalFile = renamed.relativePath;
    }
  }

  await prisma.processedFile.update({ where: { id: file.id }, data: { status: "processing", errorMessage: null } });

  try {
    const inputPath = absoluteFromMedia(file.originalFile);
    const output = processedOutputFor(inputPath);
    const result = await processAttendance(inputPath, output.fullPath);

    if (result.success) {
      await prisma.processedFile.update({
        where: { id: file.id },
        data: { status: "completed", processedFile: output.relativePath, errorMessage: null },
      });
      return NextResponse.json({ success: true, message: `Processed ${result.output_rows ?? 0} rows` });
    }

    await prisma.processedFile.update({
      where: { id: file.id },
      data: { status: "failed", errorMessage: result.error ?? "Unknown processing error" },
    });
    return NextResponse.json({ error: result.error ?? "Processing failed" }, { status: 500 });
  } catch (error) {
    await prisma.processedFile.update({
      where: { id: file.id },
      data: { status: "failed", errorMessage: error instanceof Error ? error.message : "Unknown processing error" },
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Processing failed" }, { status: 500 });
  }
}
