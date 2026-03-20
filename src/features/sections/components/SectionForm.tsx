"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

type Department = { id: string; name: string };

type Initial = {
  id?: string;
  name?: string;
  code?: string;
  departmentId?: string;
  description?: string | null;
  isActive?: boolean;
};

export default function SectionForm({ departments, initial }: { departments: Department[]; initial?: Initial }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const f = new FormData(e.currentTarget);
    const payload = {
      name: f.get("name"),
      code: f.get("code"),
      departmentId: f.get("departmentId") || undefined,
      description: f.get("description") || null,
      isActive: f.get("isActive") === "on",
    };

    const url = initial?.id ? withBasePath(`/api/sections/${initial.id}`) : withBasePath("/api/sections");
    const method = initial?.id ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Save failed");
      return;
    }

    router.push("/app/sections");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="nac-card space-y-2 p-4">
      <input name="name" defaultValue={initial?.name} placeholder="Section name" required className="nac-input" />
      <input name="code" defaultValue={initial?.code} placeholder="Section code" required className="nac-input" />
      <select name="departmentId" defaultValue={initial?.departmentId} className="nac-select">
        <option value="">Select department</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <textarea name="description" defaultValue={initial?.description ?? ""} className="nac-textarea" placeholder="Description" />
      <label className="flex items-center gap-2">
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} /> Active
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="nac-btn-primary px-3 py-2" type="submit">Save</button>
    </form>
  );
}
