import Link from "next/link";
import { requireSessionUser } from "@/server/auth";
import { departmentScopedWhere } from "@/server/permissions";
import { prisma } from "@/server/prisma";
import { absoluteFromMedia } from "@/server/files";
import { leaveSummary, previewAttendance } from "@/server/attendance";

type TabKey = "detailed" | "leave";

type PageProps = {
  searchParams: Promise<{
    tab?: TabKey;
    fileId?: string;
    q?: string;
    employeeName?: string;
    staffId?: string;
    designation?: string;
    section?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 25;

export default async function AttendancePage({ searchParams }: PageProps) {
  const user = await requireSessionUser();
  const {
    tab = "detailed",
    fileId = "",
    q = "",
    employeeName = "",
    staffId = "",
    designation = "",
    section = "",
    page = "1",
  } = await searchParams;
  const currentTab: TabKey = tab === "leave" ? "leave" : "detailed";
  const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);

  const staffScope = !user.isSuperuser && user.departmentId ? { departmentId: user.departmentId } : undefined;
  const staffRows = await prisma.staffDetail.findMany({
    where: staffScope,
    include: { section: { select: { name: true } } },
    orderBy: { staffid: "asc" },
  });

  const normalizeStaffId = (value: unknown) => {
    if (value === null || value === undefined || String(value).trim() === "") return "";
    const staffIdStr = String(value).trim().toUpperCase();
    if (staffIdStr.startsWith("MW")) {
      const m = /^(MW)[-\s]?0*(\d+)$/.exec(staffIdStr);
      return m ? `${m[1]}-${Number.parseInt(m[2], 10)}` : staffIdStr;
    }
    const normalized = staffIdStr.replace(/[^A-Z0-9]/g, "");
    let m = /^([A-Z]+)(\d+)$/.exec(normalized);
    if (m) return `${m[1]}${Number.parseInt(m[2], 10)}`;
    if (/^\d+$/.test(normalized)) return String(Number.parseInt(normalized, 10));
    if (/^\d+[A-Z]+$/.test(normalized)) return normalized;
    m = /^([A-Z]+)(\d+)([A-Z]*)$/.exec(normalized);
    if (m) return `${m[1]}${Number.parseInt(m[2], 10)}${m[3]}`;
    return normalized;
  };

  const staffByNorm = new Map(
    staffRows.map((s) => [
      normalizeStaffId(s.staffid),
      {
        staffid: s.staffid,
        name: s.name,
        designation: s.designation,
        section: s.section?.name ?? "",
      },
    ]),
  );
  const sectionOptions = [...new Set(staffRows.map((s) => s.section?.name ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const files = await prisma.processedFile.findMany({
    where: { AND: [departmentScopedWhere(user), { status: "completed" }] },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const selected = files.find((f) => f.id.toString() === fileId) ?? files[0] ?? null;
  let detailedColumns: string[] = [];
  let detailedRows: Record<string, unknown>[] = [];
  let leaveRows: Array<Record<string, unknown> & { section: string; canonical_staffid: string }> = [];

  if (selected) {
    const inputPath = absoluteFromMedia(selected.originalFile);
    const [detailedPayload, leavePayload] = await Promise.all([
      previewAttendance(inputPath),
      (async () => {
        let scopedStaffIds: string[] = [];
        if (!user.isSuperuser && user.departmentId) {
          scopedStaffIds = staffRows.map((s) => s.staffid);
        }
        return leaveSummary(inputPath, scopedStaffIds);
      })(),
    ]);

    detailedRows = detailedPayload.rows.map((row) => {
      const normalized = normalizeStaffId(row.Employee_ID);
      const meta = staffByNorm.get(normalized);
      return {
        ...row,
        Staff_ID: meta?.staffid ?? row.Employee_ID,
        Section: meta?.section ?? "",
      };
    });

    detailedColumns = detailedPayload.columns.includes("Section")
      ? detailedPayload.columns
      : [...detailedPayload.columns.slice(0, 3), "Section", ...detailedPayload.columns.slice(3)];

    leaveRows = leavePayload.leave_list.map((row) => {
      const norm = normalizeStaffId(row.employee_id);
      const meta = staffByNorm.get(norm);
      return {
        ...row,
        section: meta?.section ?? "",
        canonical_staffid: meta?.staffid ?? String(row.employee_id ?? ""),
      };
    });
  }

  const applySharedFilters = <T extends Record<string, unknown>>(rows: T[], getValues: (row: T) => string[]) => {
    let out = rows;
    if (employeeName.trim()) {
      const needle = employeeName.toLowerCase();
      out = out.filter((row) => String(row.Employee_Name ?? row.employee_name ?? "").toLowerCase().includes(needle));
    }
    if (staffId.trim()) {
      const needle = staffId.toLowerCase();
      out = out.filter((row) =>
        String(row.Employee_ID ?? row.employee_id ?? "").toLowerCase().includes(needle) ||
        String(row.Staff_ID ?? row.canonical_staffid ?? "").toLowerCase().includes(needle),
      );
    }
    if (designation.trim()) {
      const needle = designation.toLowerCase();
      out = out.filter((row) => String(row.Designation ?? row.designation ?? "").toLowerCase().includes(needle));
    }
    if (section.trim()) {
      const needle = section.toLowerCase();
      out = out.filter((row) => String(row.Section ?? row.section ?? "").toLowerCase().includes(needle));
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((row) => getValues(row).some((v) => v.toLowerCase().includes(needle)));
    }
    return out;
  };

  detailedRows = applySharedFilters(detailedRows, (row) => Object.values(row).map((v) => String(v ?? "")));
  leaveRows = applySharedFilters(leaveRows, (row) => Object.values(row).map((v) => String(v ?? "")));

  const activeRowsCount = currentTab === "detailed" ? detailedRows.length : leaveRows.length;
  const totalPages = Math.max(Math.ceil(activeRowsCount / PAGE_SIZE), 1);
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pagedDetailed = detailedRows.slice(start, end);
  const pagedLeave = leaveRows.slice(start, end);

  const buildQuery = (nextPage: number) =>
    new URLSearchParams({
      tab: currentTab,
      fileId: selected?.id.toString() ?? "",
      q,
      employeeName,
      staffId,
      designation,
      section,
      page: String(nextPage),
    }).toString();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="nac-heading text-xl font-semibold">Attendance</h1>
        <div className="flex items-center gap-2">
          <Link href="/app/reports" className="nac-btn-secondary px-3 py-2 text-xs">Reports</Link>
          <Link href="/app" className="nac-btn-secondary px-3 py-2 text-xs">Dashboard</Link>
        </div>
      </div>

      <div className="flex gap-2">
        <Link
          href={`/app/attendance?${new URLSearchParams({ tab: "detailed", fileId: selected?.id.toString() ?? "", q, employeeName, staffId, designation, section, page: "1" }).toString()}`}
          className={`${currentTab === "detailed" ? "nac-btn-primary" : "nac-btn-secondary"} px-3 py-2 text-xs`}
        >
          Detailed Attendance
        </Link>
        <Link
          href={`/app/attendance?${new URLSearchParams({ tab: "leave", fileId: selected?.id.toString() ?? "", q, employeeName, staffId, designation, section, page: "1" }).toString()}`}
          className={`${currentTab === "leave" ? "nac-btn-primary" : "nac-btn-secondary"} px-3 py-2 text-xs`}
        >
          Leave Details
        </Link>
      </div>

      <form className="nac-card grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
        <input type="hidden" name="tab" value={currentTab} />
        <input type="hidden" name="page" value="1" />
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Search Everything</label>
          <input id="q" name="q" defaultValue={q} placeholder="Any field" className="nac-input" />
        </div>
        <div>
          <label htmlFor="employeeName" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Employee Name</label>
          <input id="employeeName" name="employeeName" defaultValue={employeeName} placeholder="Employee name" className="nac-input" />
        </div>
        <div>
          <label htmlFor="staffId" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Staff ID</label>
          <input id="staffId" name="staffId" defaultValue={staffId} placeholder="Staff ID" className="nac-input" />
        </div>
        <div>
          <label htmlFor="designation" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Designation</label>
          <input id="designation" name="designation" defaultValue={designation} placeholder="Designation" className="nac-input" />
        </div>
        <div>
          <label htmlFor="section" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Section</label>
          <select id="section" name="section" defaultValue={section} className="nac-select">
            <option value="">All sections</option>
            {sectionOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fileId" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Record</label>
          <select id="fileId" name="fileId" defaultValue={selected?.id.toString() ?? ""} className="nac-select">
            {files.map((f) => (
              <option key={f.id.toString()} value={f.id.toString()}>
                #{f.id.toString()} • {new Date(f.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 xl:col-span-3 flex justify-end">
          <button className="nac-btn-primary px-4 py-2.5 text-sm">Apply Filters</button>
        </div>
      </form>

      {currentTab === "detailed" ? (
        <div className="nac-card overflow-auto">
          <table className="nac-table w-full text-sm">
            <thead>
              <tr>
                {detailedColumns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedDetailed.map((row, idx) => (
                <tr key={idx}>
                  {detailedColumns.map((column) => (
                    <td key={`${idx}-${column}`}>{String(row[column] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="nac-card overflow-auto">
          <table className="nac-table w-full text-sm">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Section</th>
                <th>Designation</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Weekly Off</th>
                <th>Allow.</th>
                <th>Sick</th>
                <th>Casual</th>
                <th>Personal</th>
                <th>Substitute</th>
                <th>Duty</th>
                <th>Other</th>
              </tr>
            </thead>
            <tbody>
              {pagedLeave.map((row, idx) => (
                <tr key={`${row.employee_id ?? "row"}-${idx}`}>
                  <td>{String(row.employee_id ?? "")}</td>
                  <td>{String(row.employee_name ?? "")}</td>
                  <td>{String(row.section ?? "-")}</td>
                  <td>{String(row.designation ?? "")}</td>
                  <td>{String(row.present_days ?? 0)}</td>
                  <td>{String(row.absent_days ?? 0)}</td>
                  <td>{String(row.weekly_off_days ?? 0)}</td>
                  <td>{String(row.allowance_days ?? 0)}</td>
                  <td>{String(row.sick_leave_days ?? 0)}</td>
                  <td>{String(row.casual_leave_days ?? 0)}</td>
                  <td>{String(row.personal_leave_days ?? 0)}</td>
                  <td>{String(row.substitute_leave_days ?? 0)}</td>
                  <td>{String(row.duty_leave_days ?? 0)}</td>
                  <td>{String(row.other_leave_days ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600">
          Showing {activeRowsCount === 0 ? 0 : start + 1}-{Math.min(end, activeRowsCount)} of {activeRowsCount}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/attendance?${buildQuery(Math.max(safePage - 1, 1))}`}
            className={`nac-btn-secondary px-3 py-1.5 text-xs ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`}
          >
            Previous
          </Link>
          <span className="text-xs font-semibold text-slate-600">Page {safePage} / {totalPages}</span>
          <Link
            href={`/app/attendance?${buildQuery(Math.min(safePage + 1, totalPages))}`}
            className={`nac-btn-secondary px-3 py-1.5 text-xs ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`}
          >
            Next
          </Link>
        </div>
      </div>

      {files.length === 0 ? <p className="text-sm text-slate-600">No completed records available yet.</p> : null}
      {files.length > 0 && activeRowsCount === 0 ? <p className="text-sm text-slate-600">No rows match your filters.</p> : null}
    </section>
  );
}
