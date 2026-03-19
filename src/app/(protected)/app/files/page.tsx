import FileActions from "@/features/files/components/FileActions";
import { requireSessionUser } from "@/server/auth";
import { departmentScopedWhere } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import Link from "next/link";

export default async function FilesPage() {
  const user = await requireSessionUser();
  const files = await prisma.processedFile.findMany({
    where: {
      AND: [
        departmentScopedWhere(user),
        {
          NOT: {
            originalFile: {
              contains: "extension_sync_",
            },
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="nac-heading text-xl font-semibold">Manual Uploads</h1>
        <div className="flex items-center gap-2">
          <Link href="/app" className="nac-btn-secondary px-3 py-2 text-xs">Dashboard</Link>
          <Link href="/app/reports" className="nac-btn-secondary px-3 py-2 text-xs">Reports</Link>
          <Link href="/app/profile" className="nac-btn-secondary px-3 py-2 text-xs">Profile</Link>
        </div>
      </div>
      {files.map((f) => (
        <div key={f.id.toString()} className="nac-card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">File #{f.id.toString()}</p>
            <span className="nac-pill px-2 py-1">{f.status}</span>
          </div>
          <p className="text-xs text-slate-600">Record ready for attendance operations.</p>
          <FileActions id={f.id.toString()} status={f.status} />
        </div>
      ))}
      {files.length === 0 ? <p className="text-sm text-gray-600">No files found.</p> : null}
    </section>
  );
}
