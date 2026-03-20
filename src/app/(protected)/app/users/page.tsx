import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import UserDeleteButton from "@/features/users/components/UserDeleteButton";

export default async function UsersPage() {
  const session = await requireSessionUser();
  if (!session.isSuperuser) {
    redirect("/app");
  }

  const users = await prisma.user.findMany({
    include: { department: { select: { name: true } } },
    orderBy: [{ isSuperuser: "desc" }, { username: "asc" }],
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="nac-heading text-xl font-semibold">Users</h1>
        <Link href="/app/users/new" className="nac-btn-primary px-3 py-2 text-sm">
          Add User
        </Link>
      </div>
      <div className="nac-card overflow-auto">
        <table className="nac-table w-full text-sm">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.firstName} {u.lastName}</td>
                <td>{u.email}</td>
                <td>{u.department?.name ?? "-"}</td>
                <td>{u.isSuperuser ? "Superadmin" : "Department User"}</td>
                <td>{u.isActive ? "Active" : "Inactive"}</td>
                <td className="space-x-2">
                  <Link className="nac-link mr-2" href={`/app/users/${u.id}/edit`}>Edit</Link>
                  <UserDeleteButton id={String(u.id)} disabled={u.id === session.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

