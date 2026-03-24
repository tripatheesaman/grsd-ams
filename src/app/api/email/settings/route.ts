import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { mutationOriginError } from "@/server/security/origin";
import { readEmailConfigForUi, saveEmailConfig } from "@/server/email/config";

const schema = z.object({
  smtpUsername: z.string().min(1, "SMTP username is required."),
  smtpPassword: z.string().optional(),
  defaultSubject: z.string().min(1, "Subject template is required."),
  defaultBody: z.string().min(1, "Email body template is required."),
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperuser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await readEmailConfigForUi();
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperuser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  await saveEmailConfig({
    smtpUsername: parsed.data.smtpUsername,
    smtpPassword: parsed.data.smtpPassword,
    defaultSubject: parsed.data.defaultSubject,
    defaultBody: parsed.data.defaultBody,
  });

  return NextResponse.json({ success: true });
}
