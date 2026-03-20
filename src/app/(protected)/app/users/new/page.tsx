import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import UserForm from "@/features/users/components/UserForm";

export default async function NewUserPage() {
  const session = await requireSessionUser();
  if (!session.isSuperuser) redirect("/app");

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="nac-heading text-xl font-semibold">Create User</h1>
        <Link href="/app/users" className="nac-btn-secondary px-3 py-2 text-xs">Back</Link>
      </div>
      <UserForm
        mode="create"
        departments={departments}
        initial={{
          username: "",
          email: "",
          firstName: "",
          lastName: "",
          departmentId: "",
          isActive: true,
          isStaff: false,
          isSuperuser: false,
        }}
      />
    </section>
  );
}

