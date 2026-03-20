import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { mutationOriginError } from "@/server/security/origin";
import { writeUploadNamed, absoluteFromMedia, processedOutputFor } from "@/server/storage/files";
import { processAttendance } from "@/server/imports/attendance";
import { STAGING_ROOT } from "@/server/paths";

type Period = { year: number; month: number };

type CommitBody = { periodYear?: unknown; periodMonth?: unknown };

function parsePeriod(body: CommitBody): Period | null {
  const yRaw = body?.periodYear;
  const mRaw = body?.periodMonth;
  const y = typeof yRaw === "number" ? yRaw : Number.parseInt(String(yRaw ?? ""), 10);
  const m = typeof mRaw === "number" ? mRaw : Number.parseInt(String(mRaw ?? ""), 10);
  if (y >= 2000 && m >= 1 && m <= 12) return { year: y, month: m };
  return null;
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bodyUnknown: unknown = await req.json().catch(() => ({}));
  const body: CommitBody = (bodyUnknown && typeof bodyUnknown === "object" ? (bodyUnknown as CommitBody) : {}) satisfies CommitBody;
  const period = parsePeriod(body);

  const stageDir = STAGING_ROOT;
  const stagedAttendancePath = path.join(stageDir, `stage_${user.id}_attendance.xlsx`);

  try {
    await fs.access(stagedAttendancePath);
  } catch {
    return NextResponse.json({ error: "No staged attendance found. Collect attendance first." }, { status: 400 });
  }

  const attendanceTargetName = period
    ? `attendance_${period.year}_${String(period.month).padStart(2, "0")}.xlsx`
    : `attendance_import_${user.id}_${Date.now()}.xlsx`;
  const attendanceBuf = await fs.readFile(stagedAttendancePath);
  await writeUploadNamed(
    new File([attendanceBuf], attendanceTargetName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    attendanceTargetName,
  );

  let logsStaged = false;
  let stagedLogsPath: string | null = null;
  if (period) {
    const month = String(period.month).padStart(2, "0");
    stagedLogsPath = path.join(stageDir, `stage_${user.id}_logs_${period.year}_${month}.xlsx`);
    try {
      await fs.access(stagedLogsPath);
      const logsTargetName = `hrms_logs_${period.year}_${month}.xlsx`;
      const logsBuf = await fs.readFile(stagedLogsPath);
      await writeUploadNamed(
        new File([logsBuf], logsTargetName, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        logsTargetName,
      );
      logsStaged = true;
    } catch {
      logsStaged = false;
    }
  }

  const relativeAttendance = path.join("uploads", attendanceTargetName).replaceAll("\\", "/");

  const existing = await prisma.processedFile.findFirst({
    where: {
      userId: user.id,
      originalFile: relativeAttendance,
      status: { not: "log-import" },
    },
  });
  const record = existing
    ? await prisma.processedFile.update({
        where: { id: existing.id },
        data: { status: "processing", processedFile: null, errorMessage: null },
      })
    : await prisma.processedFile.create({
        data: { userId: user.id, originalFile: relativeAttendance, status: "processing", processedFile: null, errorMessage: null },
      });

  try {
    const inputAbs = absoluteFromMedia(relativeAttendance);
    const output = processedOutputFor(inputAbs);
    const result = await processAttendance(inputAbs, output.fullPath);

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

    await fs.unlink(stagedAttendancePath).catch(() => {});
    if (stagedLogsPath) await fs.unlink(stagedLogsPath).catch(() => {});

    return NextResponse.json({
      success: true,
      fileId: String(record.id),
      processedRows: result.output_rows ?? 0,
      logsMerged: logsStaged,
      periodYear: period?.year ?? null,
      periodMonth: period?.month ?? null,
    });
  } catch (e) {
    await prisma.processedFile.update({
      where: { id: record.id },
      data: { status: "failed", errorMessage: e instanceof Error ? e.message : "Processing failed" },
    });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Processing failed" }, { status: 500 });
  }
}

