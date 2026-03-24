"use client";

import { FormEvent, useMemo, useState } from "react";
import { withBasePath } from "@/lib/basePath";

type FileOption = {
  id: string;
  label: string;
};

type SectionOption = {
  id: string;
  name: string;
  code: string;
  email: string | null;
};

type Props = {
  files: FileOption[];
  selectedFileId: string;
  sections: SectionOption[];
  defaultSubject: string;
  defaultBody: string;
};

export default function SegregationEmailSender({
  files,
  selectedFileId,
  sections,
  defaultSubject,
  defaultBody,
}: Props) {
  const [fileId, setFileId] = useState(selectedFileId || files[0]?.id || "");
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const sendableSections = useMemo(() => sections.filter((s) => Boolean(s.email)), [sections]);

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setErrors([]);

    if (!fileId) {
      setMessage("Please select a record first.");
      return;
    }

    const sectionIds = Object.entries(selected)
      .filter(([, checked]) => checked)
      .map(([id]) => Number(id))
      .filter((n) => Number.isFinite(n));

    if (mode === "selected" && sectionIds.length === 0) {
      setMessage("Select at least one section.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(withBasePath(`/api/files/${fileId}/segregation-email`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode,
          sectionIds,
          subjectTemplate: subject,
          bodyTemplate: body,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; sent?: number; failed?: number; errors?: string[] };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage(`Email send finished. Sent: ${data.sent ?? 0}, Failed: ${data.failed ?? 0}.`);
      setErrors(Array.isArray(data.errors) ? data.errors : []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Email send failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="nac-card space-y-3 p-4">
      <div>
        <label htmlFor="fileId" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Attendance Record
        </label>
        <select id="fileId" className="nac-select" value={fileId} onChange={(e) => setFileId(e.target.value)}>
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} />
          Send to all sections with email
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={mode === "selected"} onChange={() => setMode("selected")} />
          Send to selected sections
        </label>
      </div>

      {mode === "selected" ? (
        <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 p-3 text-sm">
          {sections.map((section) => {
            const disabled = !section.email;
            return (
              <label key={section.id} className={`flex items-center gap-2 py-1 ${disabled ? "text-slate-400" : ""}`}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={Boolean(selected[section.id])}
                  onChange={() => toggle(section.id)}
                />
                <span>
                  {section.name} ({section.code}) {section.email ? `- ${section.email}` : "- no email configured"}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-600">{sendableSections.length} section(s) currently have email configured.</p>
      )}

      <div>
        <label htmlFor="subject" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Subject Template
        </label>
        <input id="subject" className="nac-input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </div>

      <div>
        <label htmlFor="body" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Email Body Template
        </label>
        <textarea id="body" className="nac-textarea min-h-36" value={body} onChange={(e) => setBody(e.target.value)} required />
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
        <p className="font-semibold">Placeholders</p>
        <p>{"{{section_name}}, {{section_code}}, {{section_email}}, {{department_name}}, {{record_id}}, {{period}}"}</p>
      </div>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      {errors.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {errors.map((e, idx) => (
            <p key={`${idx}-${e}`}>{e}</p>
          ))}
        </div>
      ) : null}

      <button type="submit" className="nac-btn-primary px-4 py-2 text-sm" disabled={busy}>
        {busy ? "Sending..." : "Send Section Attendance Emails"}
      </button>
    </form>
  );
}
