import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, createPasswordHash } from "@/server/auth/session";
import { hasElevatedAdminAccess, isDepartmentScopedAdmin } from "@/server/authorization/permissions";
import { prisma } from "@/server/db/prisma";
import { mutationOriginError } from "@/server/security/origin";

const updateSchema = z.object({
  username: z.string().trim().min(3),
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  password: z.string().min(8).optional(),
  departmentId: z.union([z.string(), z.number()]),
  isActive: z.boolean().optional().default(true),
  isStaff: z.boolean().optional().default(false),
  isSuperuser: z.boolean().optional().default(false),
  isDepartmentAdmin: z.boolean().optional().default(false),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasElevatedAdminAccess(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const row = await prisma.user.findUnique({
    where: { id: Number(id) },
    include: { department: { select: { id: true, name: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isDepartmentScopedAdmin(user) && row.departmentId !== user.departmentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      departmentId: row.departmentId,
      departmentName: row.department?.name ?? null,
      isActive: row.isActive,
      isStaff: row.isStaff,
      isSuperuser: row.isSuperuser,
      isDepartmentAdmin: row.isDepartmentAdmin,
    },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const session = await requireApiUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasElevatedAdminAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const current = await prisma.user.findUnique({ where: { id: Number(id) } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isDeptAdminSession = isDepartmentScopedAdmin(session);
  if (isDeptAdminSession && current.departmentId !== session.departmentId) {
    return NextResponse.json({ error: "You can only update users in your own department." }, { status: 403 });
  }
  if (isDeptAdminSession && current.isSuperuser) {
    return NextResponse.json({ error: "Department superadmin cannot manage global superadmins." }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const departmentIdRaw = parsed.data.departmentId;
  const departmentId =
    typeof departmentIdRaw === "number"
      ? departmentIdRaw
      : typeof departmentIdRaw === "string" && departmentIdRaw.trim() !== ""
      ? Number.parseInt(departmentIdRaw, 10)
      : Number.NaN;

  if (!Number.isFinite(departmentId)) {
    return NextResponse.json({ error: "Department is required." }, { status: 400 });
  }

  if (isDeptAdminSession && !session.departmentId) {
    return NextResponse.json({ error: "Department admin must be assigned to a department." }, { status: 400 });
  }
  const finalDepartmentId = isDeptAdminSession ? session.departmentId! : departmentId;
  if (isDeptAdminSession && finalDepartmentId !== departmentId) {
    return NextResponse.json({ error: "You can only assign your own department." }, { status: 403 });
  }

  const dep = await prisma.department.findUnique({ where: { id: finalDepartmentId } });
  if (!dep) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  if (isDeptAdminSession && parsed.data.isSuperuser) {
    return NextResponse.json({ error: "Department superadmin cannot assign global superadmin role." }, { status: 403 });
  }

  const isSuperuser = isDeptAdminSession ? false : parsed.data.isSuperuser;
  const isDepartmentAdmin = !isSuperuser && parsed.data.isDepartmentAdmin;

  const data: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    departmentId: number;
    isActive: boolean;
    isStaff: boolean;
    isSuperuser: boolean;
    isDepartmentAdmin: boolean;
    password?: string;
  } = {
    username: parsed.data.username,
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    departmentId: finalDepartmentId,
    isActive: parsed.data.isActive,
    isStaff: parsed.data.isStaff,
    isSuperuser,
    isDepartmentAdmin,
  };
  if (parsed.data.password && parsed.data.password.trim() !== "") {
    data.password = await createPasswordHash(parsed.data.password);
  }

  await prisma.user.update({ where: { id: current.id }, data });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const session = await requireApiUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasElevatedAdminAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const targetId = Number(id);
  if (targetId === session.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const current = await prisma.user.findUnique({ where: { id: targetId } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isDepartmentScopedAdmin(session) && current.departmentId !== session.departmentId) {
    return NextResponse.json({ error: "You can only delete users in your own department." }, { status: 403 });
  }
  if (isDepartmentScopedAdmin(session) && current.isSuperuser) {
    return NextResponse.json({ error: "Department superadmin cannot delete global superadmins." }, { status: 403 });
  }

  await prisma.user.delete({ where: { id: targetId } });
  return NextResponse.json({ success: true });
}

