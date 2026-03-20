import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { absoluteFromMedia } from "@/server/storage/files";
import { previewAttendance } from "@/server/imports/attendance";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({ where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const pageSize = 25;

  const inputPath = absoluteFromMedia(file.originalFile);
  const payload = await previewAttendance(inputPath);

  let rows: Record<string, unknown>[] = payload.rows ?? [];
  if (q) {
    rows = rows.filter((row) => Object.values(row).some((v) => String(v).toLowerCase().includes(q)));
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return NextResponse.json({ columns: payload.columns ?? [], rows: pageRows, total, page, pageSize });
}
