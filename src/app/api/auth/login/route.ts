import { NextResponse } from "next/server";
import { z } from "zod";
import { loginWithUsername } from "@/server/auth/session";
import { mutationOriginError } from "@/server/security/origin";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const user = await loginWithUsername(parsed.data.username, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
