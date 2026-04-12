import StaffForm from "@/features/staff/components/StaffForm";
import { requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

export default async function NewStaffPage() {
  const user = await requireSessionUser();
  const sections = await prisma.section.findMany({
    where: user.isSuperuser ? {} : user.departmentId ? { departmentId: user.departmentId, isActive: true } : { id: -1 },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-3">
      <h1 className="nac-heading text-xl font-semibold">Add Staff</h1>
      <StaffForm sections={sections.map((s) => ({ id: s.id.toString(), name: s.name }))} />
    </div>
  );
}
