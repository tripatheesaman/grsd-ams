import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { absoluteFromMedia } from "@/server/storage/files";
import { promises as fs } from "node:fs";
import { jsonWithNumber } from "@/server/serialization/serializers";
import { mutationOriginError } from "@/server/security/origin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({
    where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] },
    include: { user: true },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ file: jsonWithNumber(file) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({
    where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await prisma.processedFile.delete({ where: { id: file.id } });

  await fs.unlink(absoluteFromMedia(file.originalFile)).catch(() => {});
  if (file.processedFile) {
    await fs.unlink(absoluteFromMedia(file.processedFile)).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
