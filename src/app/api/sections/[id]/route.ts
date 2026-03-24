import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { sectionScopedWhere } from "@/server/authorization/permissions";
import { jsonWithNumber } from "@/server/serialization/serializers";
import { mutationOriginError } from "@/server/security/origin";

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  email: z.string().email().optional().nullable(),
  departmentId: z.string().optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const section = await prisma.section.findFirst({
    where: { AND: [{ id: Number(id) }, sectionScopedWhere(user)] },
    include: { department: true },
  });

  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ section: jsonWithNumber(section) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const current = await prisma.section.findFirst({ where: { AND: [{ id: Number(id) }, sectionScopedWhere(user)] } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const departmentId = user.isSuperuser
    ? parsed.data.departmentId
      ? Number(parsed.data.departmentId)
      : current.departmentId
    : user.departmentId;

  if (!departmentId) return NextResponse.json({ error: "Department required" }, { status: 400 });

  const updated = await prisma.section.update({
    where: { id: current.id },
    data: {
      name: parsed.data.name,
      code: parsed.data.code,
      email: parsed.data.email ?? null,
      departmentId,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive,
    },
  });

  return NextResponse.json({ section: jsonWithNumber(updated) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const current = await prisma.section.findFirst({ where: { AND: [{ id: Number(id) }, sectionScopedWhere(user)] } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const used = await prisma.staffDetail.count({ where: { sectionId: current.id } });
  if (used > 0) {
    return NextResponse.json({ error: `Cannot delete section. Used by ${used} staff member(s).` }, { status: 400 });
  }

  await prisma.section.delete({ where: { id: current.id } });
  return NextResponse.json({ success: true });
}
