"use client";

import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  async function onLogout() {
    await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
    router.push(withBasePath("/login"));
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      className={`${compact ? "nac-btn-secondary px-2.5 py-1.5 text-xs" : "nac-btn-secondary px-3 py-2 text-sm"}`}
    >
      Sign out
    </button>
  );
}
