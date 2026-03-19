import Link from "next/link";
import Image from "next/image";
import { requireSessionUser } from "@/server/auth";
import UserMenu from "@/features/auth/components/UserMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionUser();

  return (
    <div className="na-shell">
      <aside className="na-sidebar">
        <Link href="/app" className="flex items-center gap-3 rounded-xl p-2 text-slate-50 transition hover:bg-white/10">
          <Image
            src="/logo.png"
            alt="Nepal Airlines logo"
            width={190}
            height={46}
            className="h-11 w-auto max-w-[190px] object-contain"
            priority
          />
        </Link>
        <div className="px-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-300/90">Admin Console</p>
        </div>
        <nav className="mt-3 flex flex-col gap-1 text-sm nac-top-nav">
          <Link href="/app">Dashboard</Link>
          <Link href="/app/attendance">Attendance</Link>
          <Link href="/app/reports">Reports</Link>
          <Link href="/app/staff">Staff</Link>
          <Link href="/app/sections">Sections</Link>
          <Link href="/app/profile">Profile</Link>
        </nav>
        <div className="mt-auto space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/70 p-3 text-xs text-slate-100 shadow-lg shadow-black/70">
          <div className="leading-tight">
            <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-400">Signed in as</p>
            <p className="mt-1 font-semibold">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-[0.72rem] text-slate-300">{user.username}</p>
          </div>
        </div>
      </aside>
      <div className="na-main">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-white/85 px-6 py-4 text-sm shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Nepal Airlines logo" width={128} height={30} className="h-8 w-auto object-contain" />
            <div className="leading-tight">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Nepal Airlines • GrSD
              </p>
              <p className="text-sm font-semibold text-slate-900">
                Admin Dashboard
              </p>
            </div>
          </div>
          <UserMenu firstName={user.firstName} lastName={user.lastName} username={user.username} />
        </header>
        <div className="na-main-inner">
          <main className="mx-auto w-full max-w-6xl space-y-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
