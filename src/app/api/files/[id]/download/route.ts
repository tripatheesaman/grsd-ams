import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireApiUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { departmentScopedWhere } from "@/server/permissions";
import { absoluteFromMedia } from "@/server/files";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({ where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] } });
  if (!file || !file.processedFile || file.status !== "completed") {
    return NextResponse.json({ error: "Processed file not found" }, { status: 404 });
  }

  const fullPath = absoluteFromMedia(file.processedFile);
  const data = await fs.readFile(fullPath);

  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${path.basename(fullPath)}\"`,
    },
  });
}
