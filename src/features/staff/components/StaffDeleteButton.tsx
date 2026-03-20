"use client";

import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

export default function StaffDeleteButton({ id }: { id: string }) {
  const router = useRouter();

  async function onDelete() {
    if (!confirm("Delete this staff member?")) return;
    await fetch(withBasePath(`/api/staff/${id}`), { method: "DELETE" });
    router.refresh();
  }

  return (
    <button type="button" className="nac-btn-danger px-2.5 py-1.5" onClick={onDelete}>
      Delete
    </button>
  );
}
