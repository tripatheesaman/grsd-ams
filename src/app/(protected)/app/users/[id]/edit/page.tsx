import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import UserForm from "@/features/users/components/UserForm";
import { withBasePath } from "@/lib/basePath";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionUser();
  if (!session.isSuperuser) redirect(withBasePath("/app"));

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id: Number(id) } });
  if (!user) redirect(withBasePath("/app/users"));

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="nac-heading text-xl font-semibold">Edit User</h1>
        <Link href="/app/users" className="nac-btn-secondary px-3 py-2 text-xs">Back</Link>
      </div>
      <UserForm
        mode="edit"
        userId={String(user.id)}
        departments={departments}
        initial={{
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          departmentId: user.departmentId ? String(user.departmentId) : "",
          isActive: user.isActive,
          isStaff: user.isStaff,
          isSuperuser: user.isSuperuser,
        }}
      />
    </section>
  );
}

