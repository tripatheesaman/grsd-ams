import path from "node:path";
import { mkdirSync, constants } from "node:fs";
import { promises as fs } from "node:fs";

const ROOT = process.cwd();
export const MEDIA_ROOT = path.join(ROOT, "media");
export const UPLOAD_ROOT = path.join(MEDIA_ROOT, "uploads");
export const PROCESSED_ROOT = path.join(MEDIA_ROOT, "processed");
export const STAGING_ROOT = path.join(MEDIA_ROOT, "staging");

export function ensureMediaDirs() {
  mkdirSync(MEDIA_ROOT, { recursive: true });
  mkdirSync(UPLOAD_ROOT, { recursive: true });
  mkdirSync(PROCESSED_ROOT, { recursive: true });
  mkdirSync(STAGING_ROOT, { recursive: true });
}

export async function ensureMediaDirsWritable() {
  ensureMediaDirs();
  const dirs = [MEDIA_ROOT, UPLOAD_ROOT, PROCESSED_ROOT, STAGING_ROOT];
  for (const dir of dirs) {
    await fs.access(dir, constants.W_OK);
  }
}
