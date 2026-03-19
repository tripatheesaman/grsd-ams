import { NextResponse } from "next/server";
import { logout } from "@/server/auth";
import { mutationOriginError } from "@/server/security";

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  await logout();
  return NextResponse.json({ success: true });
}
