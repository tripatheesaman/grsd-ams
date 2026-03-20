import Link from "next/link";
import { requireSessionUser } from "@/server/auth/session";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { prisma } from "@/server/db/prisma";
import { withBasePath } from "@/lib/basePath";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

export default async function ReportsPage({ searchParams }: PageProps) {
  const user = await requireSessionUser();
  const { q = "", status = "completed" } = await searchParams;

  const rows = await prisma.processedFile.findMany({
    where: {
      AND: [
        departmentScopedWhere(user),
        status === "all" ? {} : { status },
        q
          ? {
            OR: [
              { id: Number.isNaN(Number(q)) ? -1 : Number(q) },
              { status: { contains: q, mode: "insensitive" } },
            ],
          }
          : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="nac-heading text-xl font-semibold">Reports</h1>
        <div className="flex items-center gap-2">
          <Link href="/app/attendance?tab=detailed" className="nac-btn-secondary px-3 py-2 text-xs">Attendance</Link>
        </div>
      </div>

      <form className="nac-card grid gap-3 p-3 md:grid-cols-[1fr,180px,auto] md:items-end">
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Record ID or status" className="nac-input" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="nac-select">
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="all">All</option>
          </select>
        </div>
        <button className="nac-btn-primary px-4 py-2.5 text-sm">Apply</button>
      </form>

      <div className="nac-card overflow-auto">
        <table className="nac-table w-full text-sm">
          <thead>
            <tr>
              <th>Record</th>
              <th>Status</th>
              <th>Created</th>
              <th>Permanent &amp; Contract Employees Detailed Report</th>
              <th>Monthly Wage Employees Detailed Report</th>
              <th>Section Wise Segregation Staff Attendance Report</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = row.id.toString();
              const downloadable = row.status === "completed";
              return (
                <tr key={id}>
                  <td className="font-semibold">#{id}</td>
                  <td><span className="nac-pill px-2 py-1">{row.status}</span></td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>
                    {downloadable ? (
                      <a className="nac-btn-secondary px-2.5 py-1.5 text-xs" href={withBasePath(`/api/files/${id}/detailed-attendance-report`)}>Download</a>
                    ) : (
                      <span className="text-xs text-slate-500">Not ready</span>
                    )}
                  </td>
                  <td>
                    {downloadable ? (
                      <a className="nac-btn-secondary px-2.5 py-1.5 text-xs" href={withBasePath(`/api/files/${id}/monthly-wages-report`)}>Download</a>
                    ) : (
                      <span className="text-xs text-slate-500">Not ready</span>
                    )}
                  </td>
                  <td>
                    {downloadable ? (
                      <a className="nac-btn-secondary px-2.5 py-1.5 text-xs" href={withBasePath(`/api/files/${id}/segregation-report`)}>Download</a>
                    ) : (
                      <span className="text-xs text-slate-500">Not ready</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="text-sm text-slate-600">No records found for current filters.</p> : null}
    </section>
  );
}
