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

type FileLogHandlerOptions = {
  fileId?: number | null;
};

function logFileLogs(event: string, req: Request, details?: Record<string, unknown>) {
  const url = new URL(req.url);
  console.info("[file-logs]", {
    event,
    method: req.method,
    path: url.pathname,
    contentType: req.headers.get("content-type"),
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    userAgent: req.headers.get("user-agent"),
    ...details,
  });
}

export async function postFileLogs(req: Request, options?: FileLogHandlerOptions) {
  logFileLogs("post:start", req, { fileIdFromPath: options?.fileId ?? null });
  const originError = mutationOriginError(req);
  if (originError) {
    logFileLogs("post:blocked-origin", req, { reason: originError });
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    logFileLogs("post:unauthorized", req);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    logFileLogs("post:bad-form", req);
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fileId = options?.fileId && Number.isFinite(options.fileId)
    ? options.fileId
    : parseFileId(String(form.get("fileId") ?? ""));
  if (!fileId) {
    logFileLogs("post:missing-file-id", req);
    return NextResponse.json({ error: "fileId is required." }, { status: 400 });
  }

  const record = await prisma.processedFile.findFirst({
    where: { AND: [{ id: fileId }, departmentScopedWhere(user)] },
  });
  if (!record) {
    logFileLogs("post:file-not-found", req, { fileId });
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const upload = form.get("file");
  if (!(upload instanceof File)) {
    logFileLogs("post:missing-upload", req, { fileId });
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
    logFileLogs("post:period-detection-failed", req, { fileId });
    return NextResponse.json({ error: "Could not determine log month/year from Excel." }, { status: 400 });
  }

  const logsName = `hrms_logs_${year}_${String(month).padStart(2, "0")}.xlsx`;
  try {
    await ensureMediaDirsWritable();
  } catch {
    logFileLogs("post:media-dir-error", req, { fileId });
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
      logFileLogs("post:process-failed", req, { fileId, error: result.error ?? "Processing failed" });
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
    logFileLogs("post:success", req, { fileId, rows: result.output_rows ?? 0 });

    return NextResponse.json({
      success: true,
      message: `Logs imported and attendance reprocessed (${result.output_rows ?? 0} rows).`,
    });
  } catch (error) {
    logFileLogs("post:exception", req, { fileId, error: error instanceof Error ? error.message : String(error) });
    await prisma.processedFile.update({
      where: { id: record.id },
      data: { status: "failed", errorMessage: error instanceof Error ? error.message : "Processing failed" },
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Processing failed" }, { status: 500 });
  }
}

export async function deleteFileLogs(req: Request, options?: FileLogHandlerOptions) {
  logFileLogs("delete:start", req, { fileIdFromPath: options?.fileId ?? null });
  const originError = mutationOriginError(req);
  if (originError) {
    logFileLogs("delete:blocked-origin", req, { reason: originError });
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    logFileLogs("delete:unauthorized", req);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fileId = options?.fileId && Number.isFinite(options.fileId)
    ? options.fileId
    : parseFileId(url.searchParams.get("fileId"));
  if (!fileId) {
    logFileLogs("delete:missing-file-id", req);
    return NextResponse.json({ error: "fileId is required." }, { status: 400 });
  }

  const record = await prisma.processedFile.findFirst({
    where: { AND: [{ id: fileId }, departmentScopedWhere(user)] },
  });
  if (!record) {
    logFileLogs("delete:file-not-found", req, { fileId });
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const base = path.basename(record.originalFile);
  const m = /^attendance_(\d{4})_(\d{2})\.xlsx$/i.exec(base);
  if (!m) {
    logFileLogs("delete:attendance-not-periodized", req, { fileId });
    return NextResponse.json(
      { error: "Attendance record does not have month/year naming yet." },
      { status: 400 },
    );
  }
  const logsName = `hrms_logs_${m[1]}_${m[2]}.xlsx`;
  const logsPath = path.join(process.cwd(), "media", "uploads", logsName);
  await fs.unlink(logsPath).catch(() => {});
  logFileLogs("delete:success", req, { fileId, logsName });
  return NextResponse.json({ success: true, message: "Existing logs reset. You can import a new logs file now." });
}

export async function POST(req: Request) {
  return postFileLogs(req);
}

export async function DELETE(req: Request) {
  return deleteFileLogs(req);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
