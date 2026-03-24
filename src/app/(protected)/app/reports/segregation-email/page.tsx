import Link from "next/link";
import { requireSessionUser } from "@/server/auth/session";
import { departmentScopedWhere, sectionScopedWhere } from "@/server/authorization/permissions";
import { prisma } from "@/server/db/prisma";
import { readEmailConfigForUi } from "@/server/email/config";
import SegregationEmailSender from "@/features/reports/components/SegregationEmailSender";

type PageProps = {
  searchParams: Promise<{
    fileId?: string;
  }>;
};

const NEPALI_MONTH_NAMES = [
  "",
  "Baiskah",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashoj",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
];

function formatRecordLabel(originalFile: string, createdAt: Date) {
  const m = /attendance_(\d{4})_(\d{1,2})\.xlsx/i.exec(originalFile.split("/").pop() ?? originalFile);
  if (!m) return new Date(createdAt).toLocaleDateString();
  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  if (!year || !month || month < 1 || month > 12) return new Date(createdAt).toLocaleDateString();
  const monthName = NEPALI_MONTH_NAMES[month] || `Month ${month}`;
  return `${monthName} ${year}`;
}

export default async function SegregationEmailPage({ searchParams }: PageProps) {
  const user = await requireSessionUser();
  const { fileId = "" } = await searchParams;

  const [files, sections, emailConfig] = await Promise.all([
    prisma.processedFile.findMany({
      where: { AND: [departmentScopedWhere(user), { status: "completed" }] },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.section.findMany({
      where: sectionScopedWhere(user),
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, email: true },
    }),
    readEmailConfigForUi(),
  ]);

  const selectedFileId = files.find((f) => f.id.toString() === fileId)?.id.toString() ?? files[0]?.id.toString() ?? "";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="nac-heading text-xl font-semibold">Email Section-wise Attendance</h1>
        <div className="flex gap-2">
          <Link href="/app/reports" className="nac-btn-secondary px-3 py-2 text-xs">
            Back to Reports
          </Link>
          {user.isSuperuser ? (
            <Link href="/app/email-settings" className="nac-btn-secondary px-3 py-2 text-xs">
              SMTP & Templates
            </Link>
          ) : null}
        </div>
      </div>

      <SegregationEmailSender
        files={files.map((f) => ({ id: f.id.toString(), label: formatRecordLabel(f.originalFile, f.createdAt) }))}
        selectedFileId={selectedFileId}
        sections={sections.map((s) => ({ id: s.id.toString(), name: s.name, code: s.code, email: s.email }))}
        defaultSubject={emailConfig.defaultSubject}
        defaultBody={emailConfig.defaultBody}
      />
    </section>
  );
}
