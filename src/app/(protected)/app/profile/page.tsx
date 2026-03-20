import ChangePasswordForm from "@/features/auth/components/ChangePasswordForm";
import { requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import Link from "next/link";
import LogoutButton from "@/features/auth/components/LogoutButton";

export default async function ProfilePage() {
  const session = await requireSessionUser();
  const user = await prisma.user.findUnique({ where: { id: session.id }, include: { department: true } });

  return (
    <div className="space-y-4">
      <section className="nac-card p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="nac-heading text-xl font-semibold">Profile</h1>
          <div className="flex items-center gap-2">
            <Link href="/app" className="nac-btn-secondary px-3 py-2 text-xs">Dashboard</Link>
            <LogoutButton compact />
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Username</p>
            <p className="mt-1 font-semibold text-slate-900">{user?.username}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Name</p>
            <p className="mt-1 font-semibold text-slate-900">{user?.firstName} {user?.lastName}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Email</p>
            <p className="mt-1 font-semibold text-slate-900">{user?.email}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Department</p>
            <p className="mt-1 font-semibold text-slate-900">{user?.department?.name ?? "N/A"}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Role</p>
            <p className="mt-1 font-semibold text-slate-900">{user?.isSuperuser ? "Superuser" : "User"}</p>
          </div>
        </div>
      </section>
      <ChangePasswordForm />
    </div>
  );
}
