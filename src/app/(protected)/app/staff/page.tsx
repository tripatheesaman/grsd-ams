import Link from "next/link";
import { requireSessionUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { staffScopedWhere } from "@/server/permissions";
import StaffDeleteButton from "@/features/staff/components/StaffDeleteButton";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireSessionUser();
  const { q } = await searchParams;

  const where = staffScopedWhere(user);
  const staff = await prisma.staffDetail.findMany({
    where: q
      ? {
          AND: [
            where,
            {
              OR: [
                { staffid: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { designation: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        }
      : where,
    include: { section: true },
    orderBy: { staffid: "asc" },
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="nac-heading text-xl font-semibold">Staff</h1>
        <div className="flex items-center gap-2">
          <Link href="/app/sections" className="nac-btn-secondary px-3 py-2 text-xs">Sections</Link>
          <Link href="/app/staff/new" className="nac-btn-primary px-3 py-2">Add Staff</Link>
        </div>
      </div>
      <form className="nac-card p-3">
        <input name="q" defaultValue={q ?? ""} placeholder="Search staff" className="nac-input" />
      </form>
      <div className="nac-card overflow-auto">
        <table className="nac-table w-full text-sm">
          <thead>
            <tr>
              <th>Staff ID</th>
              <th>Name</th>
              <th>Section</th>
              <th>Type</th>
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
