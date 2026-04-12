import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { basePath } from "@/lib/basePath";
import { expectedOriginForRequest } from "@/server/security/origin";

function safeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const envOrigin = safeOrigin(process.env.APP_ORIGIN);
    const headerOrigin =
      safeOrigin(req.headers.get("origin")) ??
      safeOrigin(req.headers.get("referer"));
    const origin = envOrigin ?? headerOrigin ?? expectedOriginForRequest(req);
    const appBasePath = (basePath || "").replace(/\/$/, "");
    const bookmarkletPath = path.join(process.cwd(), "public", "extension", "bookmarklet.js");
    const raw = (await fs.readFile(bookmarkletPath, "utf-8")).trim();
    const code = raw
      .replace(/__GRSD_APP_ORIGIN__/g, origin)
      .replace(/__GRSD_BASE_PATH__/g, appBasePath)
      .replace('var bridgeUrl=base+"/app/import-bridge";', `var bridgeUrl=base+"${appBasePath}"+"/app/import-bridge";`);
    if (!code) {
      return NextResponse.json({ error: "Bookmarklet code is empty" }, { status: 500 });
    }
    return NextResponse.json(
      { bookmarklet: "javascript:" + code },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load bookmarklet" }, { status: 500 });
  }
}

