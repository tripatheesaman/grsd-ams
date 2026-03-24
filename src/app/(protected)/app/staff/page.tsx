import Link from "next/link";
import { requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { staffScopedWhere } from "@/server/authorization/permissions";
import StaffDeleteButton from "@/features/staff/components/StaffDeleteButton";
import BulkStaffSync from "@/features/staff/components/BulkStaffSync";
import { withBasePath } from "@/lib/basePath";
import type { Prisma } from "@/generated/prisma/client";
import AutoFilterForm from "@/features/common/components/AutoFilterForm";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    bulk?: string;
    employeeName?: string;
    staffId?: string;
    designation?: string;
    sectionId?: string;
    employeeType?: string;
    employeeLevel?: string;
    page?: string;
    pageSize?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  const user = await requireSessionUser();
  const {
    q,
    bulk,
    employeeName,
    staffId,
    designation,
    sectionId,
    employeeType,
    employeeLevel,
    page = "1",
    pageSize = "25",
    sortBy = "priority",
    sortDir = "asc",
  } = await searchParams;
  const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const resolvedPageSize = [10, 25, 50, 100].includes(Number.parseInt(pageSize, 10)) ? Number.parseInt(pageSize, 10) : 25;
  const resolvedSortDir: Prisma.SortOrder = sortDir === "desc" ? "desc" : "asc";

  const where = staffScopedWhere(user);
  const filters: Array<Record<string, unknown>> = [where];
  if ((q ?? "").trim()) {
    filters.push({
      OR: [
        { staffid: { contains: (q ?? "").trim(), mode: "insensitive" } },
        { name: { contains: (q ?? "").trim(), mode: "insensitive" } },
        { designation: { contains: (q ?? "").trim(), mode: "insensitive" } },
        { section: { name: { contains: (q ?? "").trim(), mode: "insensitive" } } },
      ],
    });
  }
  if ((employeeName ?? "").trim()) {
    filters.push({ name: { contains: (employeeName ?? "").trim(), mode: "insensitive" } });
  }
  if ((staffId ?? "").trim()) {
    filters.push({ staffid: { contains: (staffId ?? "").trim(), mode: "insensitive" } });
  }
  if ((designation ?? "").trim()) {
    filters.push({ designation: { contains: (designation ?? "").trim(), mode: "insensitive" } });
  }
  if ((sectionId ?? "").trim()) {
    const parsed = Number.parseInt((sectionId ?? "").trim(), 10);
    if (Number.isFinite(parsed)) {
      filters.push({ sectionId: parsed });
    }
  }
  if ((employeeType ?? "").trim()) {
    filters.push({ typeOfEmployment: { contains: (employeeType ?? "").trim(), mode: "insensitive" } });
  }
  if ((employeeLevel ?? "").trim()) {
    const parsed = Number.parseInt((employeeLevel ?? "").trim(), 10);
    if (Number.isFinite(parsed)) {
      filters.push({ level: parsed });
    }
  }

  const whereClause = { AND: filters };
  const totalCount = await prisma.staffDetail.count({ where: whereClause });
  const totalPages = Math.max(Math.ceil(totalCount / resolvedPageSize), 1);
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * resolvedPageSize;
  const sortOrderByMap: Record<string, Prisma.StaffDetailOrderByWithRelationInput[]> = {
    staffid: [{ staffid: resolvedSortDir }],
    name: [{ name: resolvedSortDir }],
    section: [{ sectionId: resolvedSortDir }, { staffid: "asc" }],
    type: [{ typeOfEmployment: resolvedSortDir }, { staffid: "asc" }],
    status: [{ sectionId: resolvedSortDir }, { staffid: "asc" }],
    priority: [{ priority: resolvedSortDir }, { staffid: "asc" }],
  };
  const orderBy = sortOrderByMap[sortBy] ?? [{ priority: "asc" }, { staffid: "asc" }];

  const staff = await prisma.staffDetail.findMany({
    where: whereClause,
    include: { section: true },
    orderBy,
    skip: start,
    take: resolvedPageSize,
  });
  const sections = await prisma.section.findMany({
    where: user.isSuperuser ? { isActive: true } : user.departmentId ? { departmentId: user.departmentId, isActive: true } : { id: -1 },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const staffOptions = await prisma.staffDetail.findMany({
    where,
    select: { designation: true, typeOfEmployment: true, level: true },
  });
  const designationSuggestions = [...new Set(staffOptions.map((s) => s.designation.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const employmentSuggestions = [
    ...new Set(["permanent", "contract", "monthly wages", ...staffOptions.map((s) => s.typeOfEmployment.trim().toLowerCase()).filter(Boolean)]),
  ].sort((a, b) => a.localeCompare(b));
  const levelSuggestions = [...new Set(staffOptions.map((s) => s.level).filter((v) => Number.isFinite(v)))].sort((a, b) => a - b);
  const addBulkHref = `/app/staff?${new URLSearchParams({ ...(q ? { q } : {}), ...(bulk === "add" ? {} : { bulk: "add" }) }).toString()}`;
  const editBulkHref = `/app/staff?${new URLSearchParams({ ...(q ? { q } : {}), ...(bulk === "edit" ? {} : { bulk: "edit" }) }).toString()}`;
  const filteredExportHref = `/api/staff/export?${new URLSearchParams({
    scope: "filtered",
    ...(q ? { q } : {}),
    ...(employeeName ? { employeeName } : {}),
    ...(staffId ? { staffId } : {}),
    ...(designation ? { designation } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(employeeType ? { employeeType } : {}),
    ...(employeeLevel ? { employeeLevel } : {}),
  }).toString()}`;
  const allExportHref = withBasePath("/api/staff/export?scope=all");
  const buildPageQuery = (nextPage: number) =>
    new URLSearchParams({
      ...(q ? { q } : {}),
      ...(employeeName ? { employeeName } : {}),
      ...(staffId ? { staffId } : {}),
      ...(designation ? { designation } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(employeeType ? { employeeType } : {}),
      ...(employeeLevel ? { employeeLevel } : {}),
      ...(bulk ? { bulk } : {}),
      ...(sortBy ? { sortBy } : {}),
      ...(sortDir ? { sortDir } : {}),
      page: String(nextPage),
      pageSize: String(resolvedPageSize),
    }).toString();
  const buildSortQuery = (nextSortBy: string) => {
    const nextSortDir = sortBy === nextSortBy && resolvedSortDir === "asc" ? "desc" : "asc";
    return new URLSearchParams({
      ...(q ? { q } : {}),
      ...(employeeName ? { employeeName } : {}),
      ...(staffId ? { staffId } : {}),
      ...(designation ? { designation } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(employeeType ? { employeeType } : {}),
      ...(employeeLevel ? { employeeLevel } : {}),
      ...(bulk ? { bulk } : {}),
      sortBy: nextSortBy,
      sortDir: nextSortDir,
      page: "1",
      pageSize: String(resolvedPageSize),
    }).toString();
  };
  const sortLabel = (column: string, label: string) => {
    if (sortBy !== column) return label;
    return `${label} ${resolvedSortDir === "asc" ? "↑" : "↓"}`;
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="nac-heading text-xl font-semibold">Staff</h1>
          <p className="mt-1 text-xs text-slate-600">
            Total Staff: <span className="font-semibold text-slate-900">{totalCount}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={addBulkHref} className="nac-btn-secondary px-3 py-2 text-xs">
            Add Bulk Staff
          </Link>
          <Link href={editBulkHref} className="nac-btn-secondary px-3 py-2 text-xs">
            Bulk Edit Staff
          </Link>
          <a href={allExportHref} className="nac-btn-secondary px-3 py-2 text-xs">
            Export All (Excel)
          </a>
          <a href={withBasePath(filteredExportHref)} className="nac-btn-secondary px-3 py-2 text-xs">
            Export Filtered (Excel)
          </a>
          <Link href="/app/staff/new" className="nac-btn-primary px-3 py-2">Add Staff</Link>
        </div>
      </div>
      <BulkStaffSync
        sections={sections.map((s) => ({ id: s.id.toString(), name: s.name }))}
        designationSuggestions={designationSuggestions}
        employmentSuggestions={employmentSuggestions}
        initialShowAddBulk={bulk === "add"}
        initialShowEditBulk={bulk === "edit"}
      />
      <AutoFilterForm actionPath="/app/staff" className="nac-card grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="sortBy" value={sortBy} />
        <input type="hidden" name="sortDir" value={resolvedSortDir} />
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Search Everything</label>
          <input name="q" defaultValue={q ?? ""} placeholder="Any field" className="nac-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Employee Name</label>
          <input name="employeeName" defaultValue={employeeName ?? ""} placeholder="Employee name" className="nac-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Staff ID</label>
          <input name="staffId" defaultValue={staffId ?? ""} placeholder="Staff ID" className="nac-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Designation</label>
          <input name="designation" defaultValue={designation ?? ""} placeholder="Designation" className="nac-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Section</label>
          <select name="sectionId" defaultValue={sectionId ?? ""} className="nac-select">
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id.toString()} value={s.id.toString()}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Employee Type</label>
          <select name="employeeType" defaultValue={employeeType ?? ""} className="nac-select">
            <option value="">All types</option>
            {employmentSuggestions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Employee Level</label>
          <select name="employeeLevel" defaultValue={employeeLevel ?? ""} className="nac-select">
            <option value="">All levels</option>
            {levelSuggestions.map((level) => (
              <option key={String(level)} value={String(level)}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Rows per page</label>
          <select name="pageSize" defaultValue={String(resolvedPageSize)} className="nac-select">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <div className="md:col-span-2 xl:col-span-3 flex justify-end">
          <button className="nac-btn-primary px-4 py-2.5 text-sm">Apply Filters</button>
        </div>
      </AutoFilterForm>
      <div className="nac-card overflow-auto">
        <table className="nac-table w-full text-sm">
          <thead>
            <tr>
              <th><Link href={`/app/staff?${buildSortQuery("staffid")}`} className="nac-link">{sortLabel("staffid", "Staff ID")}</Link></th>
              <th><Link href={`/app/staff?${buildSortQuery("name")}`} className="nac-link">{sortLabel("name", "Name")}</Link></th>
              <th><Link href={`/app/staff?${buildSortQuery("section")}`} className="nac-link">{sortLabel("section", "Section")}</Link></th>
              <th><Link href={`/app/staff?${buildSortQuery("type")}`} className="nac-link">{sortLabel("type", "Type")}</Link></th>
              <th><Link href={`/app/staff?${buildSortQuery("priority")}`} className="nac-link">{sortLabel("priority", "Priority")}</Link></th>
              <th><Link href={`/app/staff?${buildSortQuery("status")}`} className="nac-link">{sortLabel("status", "Status")}</Link></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id.toString()}>
                <td>{s.staffid}</td>
                <td>{s.name}</td>
                <td>{s.section?.name ?? "-"}</td>
                <td>{s.typeOfEmployment}</td>
                <td>{s.priority}</td>
                <td>{s.sectionId ? "Active" : "Inactive"}</td>
                <td className="space-x-2">
                  <Link className="nac-link mr-2" href={`/app/staff/${s.id.toString()}/edit`}>Edit</Link>
                  <StaffDeleteButton id={s.id.toString()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600">
          Showing {totalCount === 0 ? 0 : start + 1}-{Math.min(start + resolvedPageSize, totalCount)} of {totalCount}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/staff?${buildPageQuery(Math.max(safePage - 1, 1))}`}
            className={`nac-btn-secondary px-3 py-1.5 text-xs ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`}
          >
            Previous
          </Link>
          <span className="text-xs font-semibold text-slate-600">Page {safePage} / {totalPages}</span>
          <Link
            href={`/app/staff?${buildPageQuery(Math.min(safePage + 1, totalPages))}`}
            className={`nac-btn-secondary px-3 py-1.5 text-xs ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`}
          >
            Next
          </Link>
        </div>
      </div>
      {totalCount === 0 ? <p className="text-sm text-slate-600">No staff found for current filters.</p> : null}
    </section>
  );
}
