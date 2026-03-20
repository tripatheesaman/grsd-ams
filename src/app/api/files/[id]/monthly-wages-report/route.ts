import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { absoluteFromMedia, PROCESSED_ROOT } from "@/server/storage/files";
import { monthlyReport } from "@/server/imports/attendance";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({ where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const inputPath = absoluteFromMedia(file.originalFile);
  const outputPath = path.join(PROCESSED_ROOT, `monthly_wages_${id}_${Date.now()}.xlsx`);
  const templatePath = path.join(process.cwd(), "public", "detailed_attendance_template.xlsx");

  try {
    await monthlyReport(inputPath, outputPath, templatePath, user.isSuperuser ? undefined : user.departmentId?.toString());
    const data = await fs.readFile(outputPath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=\"${path.basename(outputPath)}\"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await fs.unlink(outputPath).catch(() => {});
  }
}
