import path from "node:path";
import { promises as fs } from "node:fs";
import { PROCESSED_ROOT, UPLOAD_ROOT, ensureMediaDirs } from "@/server/paths";

export { PROCESSED_ROOT };

export async function writeUpload(file: File) {
  ensureMediaDirs();
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const fullPath = path.join(UPLOAD_ROOT, filename);
  await fs.writeFile(fullPath, buffer);
  return {
    relativePath: path.join("uploads", filename).replaceAll("\\", "/"),
    fullPath,
    filename,
  };
}

export async function writeUploadNamed(file: File, desiredName: string) {
  ensureMediaDirs();
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filename = desiredName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fullPath = path.join(UPLOAD_ROOT, filename);
  await fs.writeFile(fullPath, buffer);
  return {
    relativePath: path.join("uploads", filename).replaceAll("\\", "/"),
    fullPath,
    filename,
  };
}

export function absoluteFromMedia(relativePath: string) {
  const decoded = (() => {
    try {
      return decodeURIComponent(relativePath);
    } catch {
      return relativePath;
    }
  })();
  const normalized = decoded.replaceAll("\\", "/").replace(/^\/+/, "");
  if (path.isAbsolute(decoded)) {
    return path.normalize(decoded);
  }
  const clean = normalized.replace(/^media\//, "");
  return path.join(process.cwd(), "media", clean);
}

export function processedOutputFor(originalAbsolutePath: string) {
  const base = path.basename(originalAbsolutePath);
  const filename = `processed_${base.endsWith(".xlsx") ? base : `${base}.xlsx`}`;
  return {
    filename,
    fullPath: path.join(PROCESSED_ROOT, filename),
    relativePath: path.join("processed", filename).replaceAll("\\", "/"),
  };
}

export async function renameUploadedFile(relativePath: string, desiredName: string) {
  ensureMediaDirs();
  const currentAbs = absoluteFromMedia(relativePath);
  const filename = desiredName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const targetAbs = path.join(UPLOAD_ROOT, filename);
  try {
    await fs.unlink(targetAbs);
  } catch {}
  await fs.rename(currentAbs, targetAbs);
  return {
    relativePath: path.join("uploads", filename).replaceAll("\\", "/"),
    fullPath: targetAbs,
    filename,
  };
}

