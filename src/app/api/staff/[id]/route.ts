import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { staffScopedWhere } from "@/server/authorization/permissions";
import { jsonWithNumber } from "@/server/serialization/serializers";
import { mutationOriginError } from "@/server/security/origin";

const updateSchema = z.object({
  staffid: z.string().min(1),
  name: z.string().min(1),
  sectionId: z.string().min(1),
  designation: z.string().optional().default(""),
  weeklyOff: z.enum(["sun", "mon", "tue", "wed", "thurs", "fri", "sat"]),
  level: z.coerce.number().int().min(1).max(10),
  typeOfEmployment: z.enum(["permanent", "contract", "monthly wages"]),
  priority: z.coerce.number().int().min(0),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await prisma.staffDetail.findFirst({
    where: { AND: [{ id: Number(id) }, staffScopedWhere(user)] },
    include: { section: true, department: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ staff: jsonWithNumber(row) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const current = await prisma.staffDetail.findFirst({ where: { AND: [{ id: Number(id) }, staffScopedWhere(user)] } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const section = await prisma.section.findUnique({ where: { id: Number(parsed.data.sectionId) } });
  if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
  if (!user.isSuperuser && section.departmentId !== user.departmentId) {
    return NextResponse.json({ error: "Section is outside your department" }, { status: 403 });
  }

  const updated = await prisma.staffDetail.update({
    where: { id: current.id },
    data: {
      staffid: parsed.data.staffid,
      name: parsed.data.name,
      sectionId: section.id,
      designation: parsed.data.designation,
      weeklyOff: parsed.data.weeklyOff,
      level: parsed.data.level,
      typeOfEmployment: parsed.data.typeOfEmployment,
      priority: parsed.data.priority,
      departmentId: user.isSuperuser ? section.departmentId : user.departmentId,
    },
  });

  return NextResponse.json({ staff: jsonWithNumber(updated) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const current = await prisma.staffDetail.findFirst({ where: { AND: [{ id: Number(id) }, staffScopedWhere(user)] } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.staffDetail.delete({ where: { id: current.id } });
  return NextResponse.json({ success: true });
}
