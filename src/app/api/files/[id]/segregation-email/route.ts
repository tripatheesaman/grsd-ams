import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { prisma } from "@/server/db/prisma";
import { absoluteFromMedia } from "@/server/storage/files";
import { mutationOriginError } from "@/server/security/origin";
import { readEmailConfigForSending, renderTemplate } from "@/server/email/config";
import { buildSmtpTransport } from "@/server/email/mailer";
import { segregationSectionReports } from "@/server/imports/attendance";

const schema = z.object({
  mode: z.enum(["all", "selected"]),
  sectionIds: z.array(z.number().int().positive()).optional(),
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
});

function derivePeriodLabelFromPath(inputPath: string) {
  const base = inputPath.split("/").pop() ?? inputPath;
  const m = /(20\d{2})_(\d{1,2})/.exec(base);
  if (!m) return "selected period";
  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  if (!year || !month || month < 1 || month > 12) return "selected period";
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const file = await prisma.processedFile.findFirst({
    where: { AND: [{ id: Number(id) }, { status: "completed" }, departmentScopedWhere(user)] },
  });
  if (!file) return NextResponse.json({ error: "Completed file record not found." }, { status: 404 });

  let config;
  try {
    config = await readEmailConfigForSending();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Email settings are incomplete." }, { status: 400 });
  }
  const transporter = buildSmtpTransport({ username: config.smtpUsername, password: config.smtpPassword });
  const fromAddress = config.smtpUsername;

  const reports = await segregationSectionReports(
    absoluteFromMedia(file.originalFile),
    user.isSuperuser ? undefined : user.departmentId?.toString(),
  );
  const period = derivePeriodLabelFromPath(file.originalFile);

  const selectedIds = new Set(parsed.data.sectionIds ?? []);
  const eligible = reports.filter((r) => {
    if (!r.sectionEmail) return false;
    if (parsed.data.mode === "all") return true;
    return r.sectionId !== null && selectedIds.has(r.sectionId);
  });

  if (eligible.length === 0) {
    return NextResponse.json({ error: "No sections with email selected for sending." }, { status: 400 });
  }

  const result = { sent: 0, failed: 0, errors: [] as string[] };
  for (const section of eligible) {
    const values = {
      section_name: section.sectionName,
      section_code: section.sectionCode ?? "",
      section_email: section.sectionEmail ?? "",
      department_name: section.departmentName ?? "",
      record_id: id,
      period,
    };
    const subject = renderTemplate(parsed.data.subjectTemplate, values);
    const bodyText = renderTemplate(parsed.data.bodyTemplate, values);
    const html = bodyText
      .split("\n")
      .map((line) => line.trim())
      .join("<br/>");

    try {
      await transporter.sendMail({
        from: fromAddress,
        to: section.sectionEmail!,
        cc: config.ccRecipients.length > 0 ? config.ccRecipients : undefined,
        subject,
        text: bodyText,
        html,
        attachments: [
          {
            filename: section.fileName,
            content: section.buffer,
          },
        ],
      });
      result.sent += 1;
      console.info("[segregation-email] sent", {
        recordId: id,
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        email: section.sectionEmail,
        rows: section.rows,
      });
    } catch (error) {
      result.failed += 1;
      const msg = `${section.sectionName} (${section.sectionEmail}): ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(msg);
      console.error("[segregation-email] failed", { recordId: id, error: msg });
    }
  }

  return NextResponse.json({
    success: result.failed === 0,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors,
  });
}
