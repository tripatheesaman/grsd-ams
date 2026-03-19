import Link from "next/link";
import { requireSessionUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { staffScopedWhere } from "@/server/permissions";
import StaffDeleteButton from "@/features/staff/components/StaffDeleteButton";
import BulkStaffSync from "@/features/staff/components/BulkStaffSync";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bulk?: string; employeeName?: string; staffId?: string; designation?: string; sectionId?: string }>;
}) {
  const user = await requireSessionUser();
  const { q, bulk, employeeName, staffId, designation, sectionId } = await searchParams;

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

  const staff = await prisma.staffDetail.findMany({
    where: { AND: filters },
    include: { section: true },
    orderBy: { staffid: "asc" },
  });
  const sections = await prisma.section.findMany({
    where: user.isSuperuser ? { isActive: true } : user.departmentId ? { departmentId: user.departmentId, isActive: true } : { id: -1 },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const staffOptions = await prisma.staffDetail.findMany({
    where,
    select: { designation: true, typeOfEmployment: true },
  });
  const designationSuggestions = [...new Set(staffOptions.map((s) => s.designation.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const employmentSuggestions = [...new Set(["permanent", "contract", "monthly wages", ...staffOptions.map((s) => s.typeOfEmployment.trim().toLowerCase()).filter(Boolean)])];
  const addBulkHref = `/app/staff?${new URLSearchParams({ ...(q ? { q } : {}), ...(bulk === "add" ? {} : { bulk: "add" }) }).toString()}`;
  const editBulkHref = `/app/staff?${new URLSearchParams({ ...(q ? { q } : {}), ...(bulk === "edit" ? {} : { bulk: "edit" }) }).toString()}`;
  const filteredExportHref = `/api/staff/export?${new URLSearchParams({
    scope: "filtered",
    ...(q ? { q } : {}),
    ...(employeeName ? { employeeName } : {}),
    ...(staffId ? { staffId } : {}),
    ...(designation ? { designation } : {}),
    ...(sectionId ? { sectionId } : {}),
  }).toString()}`;
  const allExportHref = "/api/staff/export?scope=all";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="nac-heading text-xl font-semibold">Staff</h1>
        <div className="flex items-center gap-2">
          <Link href={addBulkHref} className="nac-btn-secondary px-3 py-2 text-xs">
            Add Bulk Staff
          </Link>
          <Link href={editBulkHref} className="nac-btn-secondary px-3 py-2 text-xs">
            Bulk Edit Staff
          </Link>
          <Link href={allExportHref} className="nac-btn-secondary px-3 py-2 text-xs">
            Export All (Excel)
          </Link>
          <Link href={filteredExportHref} className="nac-btn-secondary px-3 py-2 text-xs">
            Export Filtered (Excel)
          </Link>
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
      <form className="nac-card grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
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
        <div className="md:col-span-2 xl:col-span-3 flex justify-end">
          <button className="nac-btn-primary px-4 py-2.5 text-sm">Apply Filters</button>
        </div>
      </form>
      <div className="nac-card overflow-auto">
        <table className="nac-table w-full text-sm">
          <thead>
            <tr>
              <th>Staff ID</th>
              <th>Name</th>
              <th>Section</th>
              <th>Type</th>
              <th>Status</th>
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
    </section>
  );
}
