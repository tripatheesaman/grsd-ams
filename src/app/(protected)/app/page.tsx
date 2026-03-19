import { requireSessionUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { departmentScopedWhere } from "@/server/permissions";
import UploadForm from "@/features/files/components/UploadForm";
import FileActions from "@/features/files/components/FileActions";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireSessionUser();
  const where = departmentScopedWhere(user);

  const [recentFiles, totalFiles, completedFiles, pendingFiles, processingFiles, failedFiles] = await Promise.all([
    prisma.processedFile.findMany({ where, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.processedFile.count({ where }),
    prisma.processedFile.count({ where: { ...where, status: "completed" } }),
    prisma.processedFile.count({ where: { ...where, status: "pending" } }),
    prisma.processedFile.count({ where: { ...where, status: "processing" } }),
    prisma.processedFile.count({ where: { ...where, status: "failed" } }),
  ]);

  return (
    <div className="space-y-5">
      <section className="na-hero">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/90">
            Nepal Airlines • GrSD
          </p>
          <h1 className="na-hero-title mt-1">
            Good day, {user.firstName}.
          </h1>
          <div className="na-hero-meta">
            <div>
              <span>Total Records</span>
              {totalFiles}
            </div>
            <div>
              <span>Completed</span>
              {completedFiles}
            </div>
            <div>
              <span>Pending</span>
              {pendingFiles}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-5">
        <Stat title="Total" value={totalFiles} variant="neutral" href="/app/attendance?tab=detailed" />
        <Stat title="Completed" value={completedFiles} variant="success" href="/app/reports" />
        <Stat title="Pending" value={pendingFiles} variant="warning" href="/app/reports" />
        <Stat title="Processing" value={processingFiles} variant="info" href="/app/reports" />
        <Stat title="Failed" value={failedFiles} variant="danger" href="/app/reports" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
        <UploadForm />
        <section className="nac-card p-4">
          <h2 className="nac-heading mb-3 text-sm font-semibold">Recent Records</h2>
          <div className="space-y-2 text-sm text-slate-800">
            {recentFiles.map((f) => (
              <div key={f.id.toString()} className="nac-card bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">Record</span> #{f.id.toString()}
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    Status: {f.status}
                  </div>
                </div>
                <FileActions id={f.id.toString()} status={f.status} />
              </div>
            ))}
            {recentFiles.length === 0 ? <p className="text-sm text-slate-600">No files yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  title,
  value,
  variant,
  href,
}: {
  title: string;
  value: number;
  variant: "neutral" | "success" | "warning" | "info" | "danger";
  href: string;
}) {
  const base =
    "block rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:-translate-y-0.5";
  const variants: Record<typeof variant, string> = {
    neutral: "bg-white text-slate-700 shadow-sm border border-slate-200",
    success: "bg-emerald-600 text-emerald-50 shadow-md border border-emerald-700",
    warning: "bg-amber-500 text-amber-50 shadow-md border border-amber-600",
    info: "bg-sky-600 text-sky-50 shadow-md border border-sky-700",
    danger: "bg-rose-600 text-rose-50 shadow-md border border-rose-700",
  };

  return (
    <Link href={href} className={base + " " + variants[variant]}>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] opacity-80">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Link>
  );
}
