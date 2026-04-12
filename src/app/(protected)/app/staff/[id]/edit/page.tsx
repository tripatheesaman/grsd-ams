import { notFound } from "next/navigation";
import StaffForm from "@/features/staff/components/StaffForm";
import { requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { staffScopedWhere } from "@/server/authorization/permissions";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  const { id } = await params;

  const staff = await prisma.staffDetail.findFirst({ where: { AND: [{ id: Number(id) }, staffScopedWhere(user)] } });
  if (!staff) notFound();

  const sections = await prisma.section.findMany({
    where: user.isSuperuser ? {} : user.departmentId ? { departmentId: user.departmentId, isActive: true } : { id: -1 },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-3">
      <h1 className="nac-heading text-xl font-semibold">Edit Staff</h1>
      <StaffForm
        sections={sections.map((s) => ({ id: s.id.toString(), name: s.name }))}
        initial={{
          id,
          staffid: staff.staffid,
          name: staff.name,
          sectionId: staff.sectionId ? staff.sectionId.toString() : undefined,
          designation: staff.designation,
          weeklyOff: staff.weeklyOff,
          level: staff.level,
          typeOfEmployment: staff.typeOfEmployment,
          priority: staff.priority,
        }}
      />
    </div>
  );
}
