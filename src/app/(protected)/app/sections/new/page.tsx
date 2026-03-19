import SectionForm from "@/features/sections/components/SectionForm";
import { requireSessionUser } from "@/server/auth";
import { prisma } from "@/server/prisma";

export default async function NewSectionPage() {
  const user = await requireSessionUser();
  const departments = await prisma.department.findMany({
    where: user.isSuperuser ? { isActive: true } : user.departmentId ? { id: user.departmentId } : { id: -1 },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-3">
      <h1 className="nac-heading text-xl font-semibold">Add Section</h1>
      <SectionForm departments={departments.map((d) => ({ id: d.id.toString(), name: d.name }))} />
    </div>
  );
}
