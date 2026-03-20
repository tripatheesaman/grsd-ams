import Link from "next/link";
import SectionDeleteButton from "@/features/sections/components/SectionDeleteButton";
import { requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { sectionScopedWhere } from "@/server/authorization/permissions";

export default async function SectionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireSessionUser();
  const { q } = await searchParams;

  const sections = await prisma.section.findMany({
    where: q
      ? {
          AND: [
            sectionScopedWhere(user),
            {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        }
      : sectionScopedWhere(user),
    include: { department: true },
    orderBy: { name: "asc" },
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="nac-heading text-xl font-semibold">Sections</h1>
        <div className="flex items-center gap-2">
          <Link href="/app/staff" className="nac-btn-secondary px-3 py-2 text-xs">Staff</Link>
          <Link href="/app/sections/new" className="nac-btn-primary px-3 py-2">Add Section</Link>
        </div>
      </div>
      <form className="nac-card p-3">
        <input name="q" defaultValue={q ?? ""} placeholder="Search sections" className="nac-input" />
      </form>
      <div className="nac-card overflow-auto">
        <table className="nac-table w-full text-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Department</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.id.toString()}>
                <td>{s.name}</td>
                <td>{s.code}</td>
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
    </section>
  );
}
