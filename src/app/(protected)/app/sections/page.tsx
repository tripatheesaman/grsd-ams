import Link from "next/link";
import SectionDeleteButton from "@/features/sections/components/SectionDeleteButton";
import { requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { sectionScopedWhere } from "@/server/authorization/permissions";
import type { Prisma } from "@/generated/prisma/client";
import AutoFilterForm from "@/features/common/components/AutoFilterForm";

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string; sortBy?: string; sortDir?: string }>;
}) {
  const user = await requireSessionUser();
  const { q, page = "1", pageSize = "25", sortBy = "name", sortDir = "asc" } = await searchParams;
  const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const resolvedPageSize = [10, 25, 50, 100].includes(Number.parseInt(pageSize, 10)) ? Number.parseInt(pageSize, 10) : 25;
  const resolvedSortDir: Prisma.SortOrder = sortDir === "desc" ? "desc" : "asc";

  const whereClause: Prisma.SectionWhereInput = q
    ? {
        AND: [
          sectionScopedWhere(user),
          {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          },
        ],
      }
    : sectionScopedWhere(user);

  const totalCount = await prisma.section.count({ where: whereClause });
  const totalPages = Math.max(Math.ceil(totalCount / resolvedPageSize), 1);
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * resolvedPageSize;
  const sortOrderByMap: Record<string, Prisma.SectionOrderByWithRelationInput[]> = {
    name: [{ name: resolvedSortDir }],
    code: [{ code: resolvedSortDir }],
    email: [{ email: resolvedSortDir }, { name: "asc" }],
    department: [{ department: { name: resolvedSortDir } }, { name: "asc" }],
    active: [{ isActive: resolvedSortDir }, { name: "asc" }],
  };
  const orderBy = sortOrderByMap[sortBy] ?? [{ name: "asc" }];

  const sections = await prisma.section.findMany({
    where: whereClause,
    include: { department: true },
    orderBy,
    skip: start,
    take: resolvedPageSize,
  });
  const buildPageQuery = (nextPage: number) =>
    new URLSearchParams({
      ...(q ? { q } : {}),
      ...(sortBy ? { sortBy } : {}),
      ...(sortDir ? { sortDir } : {}),
      page: String(nextPage),
      pageSize: String(resolvedPageSize),
    }).toString();
  const buildSortQuery = (nextSortBy: string) => {
    const nextSortDir = sortBy === nextSortBy && resolvedSortDir === "asc" ? "desc" : "asc";
    return new URLSearchParams({
      ...(q ? { q } : {}),
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
        <h1 className="nac-heading text-xl font-semibold">Sections</h1>
        <div className="flex items-center gap-2">
          <Link href="/app/staff" className="nac-btn-secondary px-3 py-2 text-xs">Staff</Link>
          <Link href="/app/sections/new" className="nac-btn-primary px-3 py-2">Add Section</Link>
        </div>
      </div>
      <AutoFilterForm actionPath="/app/sections" className="nac-card p-3">
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="sortBy" value={sortBy} />
        <input type="hidden" name="sortDir" value={resolvedSortDir} />
        <div className="grid gap-3 md:grid-cols-[1fr,180px,auto] md:items-end">
          <input name="q" defaultValue={q ?? ""} placeholder="Search sections" className="nac-input" />
          <select name="pageSize" defaultValue={String(resolvedPageSize)} className="nac-select">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <button className="nac-btn-primary px-4 py-2.5 text-sm">Apply</button>
        </div>
      </AutoFilterForm>
      <div className="nac-card overflow-auto">
        <table className="nac-table w-full text-sm">
          <thead>
            <tr>
              <th><Link href={`/app/sections?${buildSortQuery("name")}`} className="nac-link">{sortLabel("name", "Name")}</Link></th>
              <th><Link href={`/app/sections?${buildSortQuery("code")}`} className="nac-link">{sortLabel("code", "Code")}</Link></th>
              <th><Link href={`/app/sections?${buildSortQuery("email")}`} className="nac-link">{sortLabel("email", "Email")}</Link></th>
              <th><Link href={`/app/sections?${buildSortQuery("department")}`} className="nac-link">{sortLabel("department", "Department")}</Link></th>
              <th><Link href={`/app/sections?${buildSortQuery("active")}`} className="nac-link">{sortLabel("active", "Active")}</Link></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.id.toString()}>
                <td>{s.name}</td>
                <td>{s.code}</td>
                <td>{s.email || "-"}</td>
                <td>{s.department.name}</td>
                <td>{s.isActive ? "Yes" : "No"}</td>
                <td className="space-x-2">
                  <Link className="nac-link mr-2" href={`/app/sections/${s.id.toString()}/edit`}>Edit</Link>
                  <SectionDeleteButton id={s.id.toString()} />
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
            href={`/app/sections?${buildPageQuery(Math.max(safePage - 1, 1))}`}
            className={`nac-btn-secondary px-3 py-1.5 text-xs ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`}
          >
            Previous
          </Link>
          <span className="text-xs font-semibold text-slate-600">Page {safePage} / {totalPages}</span>
          <Link
            href={`/app/sections?${buildPageQuery(Math.min(safePage + 1, totalPages))}`}
            className={`nac-btn-secondary px-3 py-1.5 text-xs ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`}
          >
            Next
          </Link>
        </div>
      </div>
      {totalCount === 0 ? <p className="text-sm text-slate-600">No sections found for current filters.</p> : null}
    </section>
  );
}
