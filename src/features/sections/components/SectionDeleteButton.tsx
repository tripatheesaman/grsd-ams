"use client";

import { useRouter } from "next/navigation";

export default function SectionDeleteButton({ id }: { id: string }) {
  const router = useRouter();

  async function onDelete() {
    if (!confirm("Delete this section?")) return;
    const res = await fetch(`/api/sections/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "Delete failed");
      return;
    }
    router.refresh();
  }

  return (
    <button type="button" className="nac-btn-danger px-2.5 py-1.5" onClick={onDelete}>
      Delete
    </button>
  );
}
