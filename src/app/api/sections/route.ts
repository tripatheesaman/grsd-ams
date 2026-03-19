import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { sectionScopedWhere } from "@/server/permissions";
import { jsonWithNumber } from "@/server/serializers";
import { mutationOriginError } from "@/server/security";

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  departmentId: z.string().optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(req: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const where = sectionScopedWhere(user);
  const sections = await prisma.section.findMany({
    where: q
      ? {
          AND: [
            where,
            {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        }
      : where,
    include: { department: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ sections: jsonWithNumber(sections) });
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const departmentId = user.isSuperuser
    ? parsed.data.departmentId
      ? Number(parsed.data.departmentId)
      : null
    : user.departmentId;

  if (!departmentId) {
    return NextResponse.json({ error: "Department is required" }, { status: 400 });
  }

  const created = await prisma.section.create({
    data: {
      name: parsed.data.name,
      code: parsed.data.code,
      departmentId,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive,
    },
  });

  return NextResponse.json({ section: jsonWithNumber(created) });
}
