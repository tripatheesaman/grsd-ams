import { NextResponse } from "next/server";
import { z } from "zod";
import { createPasswordHash, requireApiUser, verifyPassword } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { mutationOriginError } from "@/server/security/origin";

const schema = z
  .object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await verifyPassword(parsed.data.oldPassword, dbUser.password);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const hash = await createPasswordHash(parsed.data.newPassword);
  await prisma.user.update({ where: { id: dbUser.id }, data: { password: hash } });

  return NextResponse.json({ success: true });
}
