"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

type Section = { id: string; name: string };

type Initial = {
  id?: string;
  staffid?: string;
  name?: string;
  sectionId?: string;
  designation?: string;
  weeklyOff?: string;
  level?: number;
  typeOfEmployment?: string;
  priority?: number;
};

export default function StaffForm({ sections, initial }: { sections: Section[]; initial?: Initial }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const payload = {
      staffid: f.get("staffid"),
      name: f.get("name"),
      sectionId: f.get("sectionId"),
      designation: f.get("designation"),
      weeklyOff: f.get("weeklyOff"),
      level: Number(f.get("level")),
      typeOfEmployment: f.get("typeOfEmployment"),
      priority: Number(f.get("priority")),
    };

    const method = initial?.id ? "PUT" : "POST";
    const url = initial?.id ? withBasePath(`/api/staff/${initial.id}`) : withBasePath("/api/staff");

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

    router.push(withBasePath("/app/staff"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="nac-card space-y-2 p-4">
      <input name="staffid" defaultValue={initial?.staffid} placeholder="Staff ID" className="nac-input" required />
      <input name="name" defaultValue={initial?.name} placeholder="Name" className="nac-input" required />
      <select name="sectionId" defaultValue={initial?.sectionId} className="nac-select" required>
        <option value="">Select section</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input name="designation" defaultValue={initial?.designation} placeholder="Designation" className="nac-input" />
      <select name="weeklyOff" defaultValue={initial?.weeklyOff ?? "sun"} className="nac-select">
        {[
          ["sun", "Sunday"],
          ["mon", "Monday"],
          ["tue", "Tuesday"],
          ["wed", "Wednesday"],
          ["thurs", "Thursday"],
          ["fri", "Friday"],
          ["sat", "Saturday"],
        ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input name="level" defaultValue={initial?.level ?? 1} type="number" min={1} max={10} className="nac-input" />
      <select name="typeOfEmployment" defaultValue={initial?.typeOfEmployment ?? "permanent"} className="nac-select">
        <option value="permanent">Permanent</option>
        <option value="contract">Contract</option>
        <option value="monthly wages">Monthly Wages</option>
      </select>
      <input name="priority" defaultValue={initial?.priority ?? 1} type="number" min={0} className="nac-input" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="nac-btn-primary px-3 py-2" type="submit">Save</button>
    </form>
  );
}
