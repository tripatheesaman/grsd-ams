import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { departmentScopedWhere } from "@/server/permissions";
import { jsonWithNumber } from "@/server/serializers";
import { mutationOriginError } from "@/server/security";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where = departmentScopedWhere(user);
  const files = await prisma.processedFile.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { user: true },
  });

  return NextResponse.json({ files: jsonWithNumber(files) });
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Manual uploading is disabled. Use direct sync from the dashboard." },
    { status: 410 },
  );
}
