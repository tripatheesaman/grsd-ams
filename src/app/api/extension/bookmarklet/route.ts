import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function GET(req: Request) {
  try {
    const bookmarkletPath = path.join(process.cwd(), "public", "extension", "bookmarklet.js");
    const bookmarkletCode = await fs.readFile(bookmarkletPath, "utf-8");

    // Keep original line breaks to avoid breaking single-line comments.
    const cleaned = bookmarkletCode.trim();
    if (!cleaned) {
      throw new Error("Bookmarklet code is empty");
    }
    const bookmarkletUrl = "javascript:" + cleaned;
    
    return NextResponse.json({ 
      bookmarklet: bookmarkletUrl,
      instructions: [
        "Right-click the 'Sync to NAC' button below",
        "Select 'Bookmark this link' or 'Add to Favorites'",
        "When on the external system page, click the bookmark to sync"
      ]
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate bookmarklet" },
      { status: 500 }
    );
  }
}
