import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { departmentScopedWhere } from "@/server/permissions";
import { absoluteFromMedia } from "@/server/files";
import { leaveSummary } from "@/server/attendance";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({ where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  let staffIds: string[] = [];
  if (!user.isSuperuser && user.departmentId) {
    const staff = await prisma.staffDetail.findMany({
      where: { departmentId: user.departmentId, sectionId: { not: null } },
      select: { staffid: true },
    });
    staffIds = staff.map((s) => s.staffid);
  }

  const inputPath = absoluteFromMedia(file.originalFile);
  const payload = await leaveSummary(inputPath, staffIds);

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const pageSize = 25;

  let rows = payload.leave_list ?? [];
  if (q) {
    rows = rows.filter((row: Record<string, unknown>) =>
      ["employee_id", "employee_name", "designation"].some((k) => String(row[k] ?? "").toLowerCase().includes(q)),
    );
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;

  return NextResponse.json({ rows: rows.slice(start, start + pageSize), total, page, pageSize });
}
