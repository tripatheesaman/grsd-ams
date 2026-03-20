"use client";

import { useRouter } from "next/navigation";

export default function UserDeleteButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const router = useRouter();

  async function onDelete() {
    if (disabled) return;
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Failed to delete user.");
      return;
    }
    router.refresh();
  }

  return (
    <button type="button" className="nac-btn-danger px-2.5 py-1.5" onClick={onDelete} disabled={disabled}>
      Delete
    </button>
  );
}

