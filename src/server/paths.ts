import path from "node:path";
import { mkdirSync } from "node:fs";

const ROOT = process.cwd();
export const MEDIA_ROOT = path.join(ROOT, "media");
export const UPLOAD_ROOT = path.join(MEDIA_ROOT, "uploads");
export const PROCESSED_ROOT = path.join(MEDIA_ROOT, "processed");

export function ensureMediaDirs() {
  mkdirSync(UPLOAD_ROOT, { recursive: true });
  mkdirSync(PROCESSED_ROOT, { recursive: true });
}
