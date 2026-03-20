import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, createPasswordHash } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { mutationOriginError } from "@/server/security";

const createSchema = z.object({
  username: z.string().trim().min(3),
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  password: z.string().min(8),
  departmentId: z.union([z.string(), z.number()]),
  isActive: z.boolean().optional().default(true),
  isStaff: z.boolean().optional().default(false),
  isSuperuser: z.boolean().optional().default(false),
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperuser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    include: { department: { select: { id: true, name: true } } },
    orderBy: [{ isSuperuser: "desc" }, { username: "asc" }],
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      departmentId: u.departmentId,
      departmentName: u.department?.name ?? null,
      isActive: u.isActive,
      isStaff: u.isStaff,
      isSuperuser: u.isSuperuser,
      dateJoined: u.dateJoined,
      lastLogin: u.lastLogin,
    })),
  });
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperuser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
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
  const dep = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dep) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  const passwordHash = await createPasswordHash(parsed.data.password);
  const created = await prisma.user.create({
    data: {
      username: parsed.data.username,
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      password: passwordHash,
      departmentId,
      isActive: parsed.data.isActive,
      isStaff: parsed.data.isStaff,
      isSuperuser: parsed.data.isSuperuser,
      dateJoined: new Date(),
      lastLogin: new Date(),
    },
  });

  return NextResponse.json({ id: created.id });
}

