import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { mutationOriginError } from "@/server/security/origin";
import { hasElevatedAdminAccess } from "@/server/authorization/permissions";
import { readAttendanceRuleConfigForUi, saveAttendanceRuleConfig } from "@/server/settings/attendanceRules";

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;
const schema = z.object({
  oddShiftInBefore: z.string().regex(TIME_PATTERN, "Odd shift in-time threshold must be HH:mm."),
  oddShiftOutAfter: z.string().regex(TIME_PATTERN, "Odd shift out-time threshold must be HH:mm."),
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasElevatedAdminAccess(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const config = await readAttendanceRuleConfigForUi();
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasElevatedAdminAccess(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  await saveAttendanceRuleConfig({
    oddShiftInBefore: parsed.data.oddShiftInBefore,
    oddShiftOutAfter: parsed.data.oddShiftOutAfter,
  });
  return NextResponse.json({ success: true });
}
