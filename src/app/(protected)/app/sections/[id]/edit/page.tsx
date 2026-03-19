import { notFound } from "next/navigation";
import SectionForm from "@/features/sections/components/SectionForm";
import { requireSessionUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { sectionScopedWhere } from "@/server/permissions";

export default async function EditSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  const { id } = await params;

  const section = await prisma.section.findFirst({ where: { AND: [{ id: Number(id) }, sectionScopedWhere(user)] } });
  if (!section) notFound();

  const departments = await prisma.department.findMany({
    where: user.isSuperuser ? { isActive: true } : user.departmentId ? { id: user.departmentId } : { id: -1 },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-3">
      <h1 className="nac-heading text-xl font-semibold">Edit Section</h1>
      <SectionForm
        departments={departments.map((d) => ({ id: d.id.toString(), name: d.name }))}
        initial={{
          id,
          name: section.name,
          code: section.code,
          departmentId: section.departmentId.toString(),
          description: section.description,
          isActive: section.isActive,
        }}
      />
    </div>
  );
}
