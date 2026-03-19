import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { staffScopedWhere } from "@/server/permissions";
import { jsonWithNumber } from "@/server/serializers";
import { mutationOriginError } from "@/server/security";

const createSchema = z.object({
  staffid: z.string().min(1),
  name: z.string().min(1),
  sectionId: z.string().min(1),
  designation: z.string().optional().default(""),
  weeklyOff: z.enum(["sun", "mon", "tue", "wed", "thurs", "fri", "sat"]).default("sun"),
  level: z.coerce.number().int().min(1).max(10).default(1),
  typeOfEmployment: z.enum(["permanent", "contract", "monthly wages"]).default("permanent"),
  priority: z.coerce.number().int().min(0).default(1),
});

export async function GET(req: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const employeeName = url.searchParams.get("employeeName")?.trim() ?? "";
  const staffId = url.searchParams.get("staffId")?.trim() ?? "";
  const designation = url.searchParams.get("designation")?.trim() ?? "";
  const sectionId = url.searchParams.get("sectionId")?.trim() ?? "";
  const typeOfEmployment = url.searchParams.get("typeOfEmployment")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";

  const where = staffScopedWhere(user);
  const filters: Array<Record<string, unknown>> = [where];
  if (q) {
    filters.push({
      OR: [
        { staffid: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { designation: { contains: q, mode: "insensitive" } },
        { section: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (employeeName) {
    filters.push({ name: { contains: employeeName, mode: "insensitive" } });
  }
  if (staffId) {
    filters.push({ staffid: { contains: staffId, mode: "insensitive" } });
  }
  if (designation) {
    filters.push({ designation: { contains: designation, mode: "insensitive" } });
  }
  if (sectionId) {
    const parsed = Number.parseInt(sectionId, 10);
    if (Number.isFinite(parsed)) {
      filters.push({ sectionId: parsed });
    }
  }
  if (typeOfEmployment) {
    filters.push({ typeOfEmployment: { equals: typeOfEmployment, mode: "insensitive" } });
  }
  if (status === "active") {
    filters.push({ sectionId: { not: null } });
  } else if (status === "inactive") {
    filters.push({ sectionId: null });
  }

  const staff = await prisma.staffDetail.findMany({
    where: { AND: filters },
    include: { section: true, department: true },
    orderBy: { staffid: "asc" },
  });

  return NextResponse.json({ staff: jsonWithNumber(staff) });
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperuser && !user.departmentId) {
    return NextResponse.json({ error: "You must be assigned to a department" }, { status: 400 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const section = await prisma.section.findUnique({ where: { id: Number(parsed.data.sectionId) } });
  if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
  if (!user.isSuperuser && section.departmentId !== user.departmentId) {
    return NextResponse.json({ error: "Section is outside your department" }, { status: 403 });
  }

  const departmentId = user.isSuperuser ? section.departmentId : user.departmentId;

  const created = await prisma.staffDetail.create({
    data: {
      staffid: parsed.data.staffid,
      name: parsed.data.name,
      sectionId: section.id,
      designation: parsed.data.designation,
      departmentId,
      weeklyOff: parsed.data.weeklyOff,
      level: parsed.data.level,
      typeOfEmployment: parsed.data.typeOfEmployment,
      priority: parsed.data.priority,
    },
  });

  return NextResponse.json({ staff: jsonWithNumber(created) });
}
