import { NextResponse } from "next/server";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";

const execAsync = promisify(exec);

export async function GET() {
  try {
    const extensionDir = path.join(process.cwd(), "public", "extension");
    const zipPath = path.join(process.cwd(), "public", "extension.zip");
    
    const isWindows = process.platform === "win32";
    let zipCommand: string;
    
    if (isWindows) {
      zipCommand = `powershell Compress-Archive -Path "${extensionDir}\\*" -DestinationPath "${zipPath}" -Force`;
    } else {
      zipCommand = `cd "${extensionDir}" && zip -r "${zipPath}" . -x "*.zip" "README.md"`;
    }
    
    await execAsync(zipCommand);
    
    const zipBuffer = await fs.readFile(zipPath);
    await fs.unlink(zipPath).catch(() => {});
    
    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="nac-attendance-extension.zip"',
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create extension package. Please zip the extension folder manually." },
      { status: 500 }
    );
  }
}
