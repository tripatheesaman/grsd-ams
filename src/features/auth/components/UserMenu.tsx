"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

type Props = {
  firstName: string;
  lastName: string;
  username: string;
};

export default function UserMenu({ firstName, lastName, username }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initials = firstName?.[0] ?? username?.[0] ?? "U";

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function onLogout() {
    setLoading(true);
    await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
    router.push(withBasePath("/login"));
    router.refresh();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-sm transition hover:bg-slate-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-xs font-semibold text-slate-800">
            {firstName} {lastName}
          </p>
          <p className="text-[0.7rem] text-slate-500">{username}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-50">
          {initials}
        </div>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <Link
            href="/app/profile"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <button
            type="button"
            onClick={onLogout}
            disabled={loading}
            className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
          >
            {loading ? "Signing out..." : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
