import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { writeUploadNamed, absoluteFromMedia, processedOutputFor, renameUploadedFile } from "@/server/storage/files";
import { processAttendance } from "@/server/imports/attendance";
import { mutationOriginError } from "@/server/security/origin";
import { ensureMediaDirsWritable } from "@/server/paths";

function parseFileId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fileId = parseFileId(String(form.get("fileId") ?? ""));
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required." }, { status: 400 });
  }

  const record = await prisma.processedFile.findFirst({
    where: { AND: [{ id: fileId }, departmentScopedWhere(user)] },
  });
  if (!record) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const upload = form.get("file");
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Logs Excel file is required." }, { status: 400 });
  }

  const buffer = Buffer.from(await upload.arrayBuffer());
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  const dateRe = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
  let year: number | null = null;
  let month: number | null = null;

  for (const row of matrix) {
    for (const cell of row) {
      const s = String(cell ?? "").trim();
      const match = dateRe.exec(s);
      if (!match) continue;
      const y = Number.parseInt(match[1], 10);
      const m = Number.parseInt(match[2], 10);
      if (y >= 2000 && m >= 1 && m <= 12) {
        year = y;
        month = m;
        break;
      }
    }
    if (year && month) break;
  }

  if (!year || !month) {
    return NextResponse.json({ error: "Could not determine log month/year from Excel." }, { status: 400 });
  }

  const logsName = `hrms_logs_${year}_${String(month).padStart(2, "0")}.xlsx`;
  try {
    await ensureMediaDirsWritable();
  } catch {
    return NextResponse.json(
      { error: "Media directories are missing or not writable. Please check server folder permissions for /app/media." },
      { status: 500 },
    );
  }
  await writeUploadNamed(upload, logsName);

  const attendanceBase = path.basename(record.originalFile);
  const desiredAttendanceName = `attendance_${year}_${String(month).padStart(2, "0")}.xlsx`;
  if (!attendanceBase.toLowerCase().includes(`attendance_${year}_`) || !attendanceBase.includes(`_${String(month).padStart(2, "0")}`)) {
    const renamed = await renameUploadedFile(record.originalFile, desiredAttendanceName);
    await prisma.processedFile.update({
      where: { id: record.id },
      data: { originalFile: renamed.relativePath },
    });
    record.originalFile = renamed.relativePath;
  }

  await prisma.processedFile.update({
    where: { id: record.id },
    data: { status: "processing", errorMessage: null },
  });

  try {
    const inputPath = absoluteFromMedia(record.originalFile);
    const output = processedOutputFor(inputPath);
    const result = await processAttendance(inputPath, output.fullPath);

    if (!result.success) {
      await prisma.processedFile.update({
        where: { id: record.id },
        data: { status: "failed", errorMessage: result.error ?? "Processing failed" },
      });
      return NextResponse.json({ error: result.error ?? "Processing failed" }, { status: 500 });
    }

    await prisma.processedFile.update({
      where: { id: record.id },
      data: { status: "completed", processedFile: output.relativePath, errorMessage: null },
    });

    return NextResponse.json({
      success: true,
      message: `Logs imported and attendance reprocessed (${result.output_rows ?? 0} rows).`,
    });
  } catch (error) {
    await prisma.processedFile.update({
      where: { id: record.id },
      data: { status: "failed", errorMessage: error instanceof Error ? error.message : "Processing failed" },
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Processing failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fileId = parseFileId(url.searchParams.get("fileId"));
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required." }, { status: 400 });
  }

  const record = await prisma.processedFile.findFirst({
    where: { AND: [{ id: fileId }, departmentScopedWhere(user)] },
  });
  if (!record) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const base = path.basename(record.originalFile);
  const m = /^attendance_(\d{4})_(\d{2})\.xlsx$/i.exec(base);
  if (!m) {
    return NextResponse.json(
      { error: "Attendance record does not have month/year naming yet." },
      { status: 400 },
    );
  }
  const logsName = `hrms_logs_${m[1]}_${m[2]}.xlsx`;
  const logsPath = path.join(process.cwd(), "media", "uploads", logsName);
  await fs.unlink(logsPath).catch(() => {});
  return NextResponse.json({ success: true, message: "Existing logs reset. You can import a new logs file now." });
}
