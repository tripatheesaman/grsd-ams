"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

type Props = {
  initial: {
    smtpUsername: string;
    hasPassword: boolean;
    ccRecipients: string;
    defaultSubject: string;
    defaultBody: string;
    oddShiftInBefore: string;
    oddShiftOutAfter: string;
  };
};

export default function EmailSettingsForm({ initial }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      smtpUsername: String(form.get("smtpUsername") ?? ""),
      smtpPassword: String(form.get("smtpPassword") ?? ""),
      ccRecipients: String(form.get("ccRecipients") ?? ""),
      defaultSubject: String(form.get("defaultSubject") ?? ""),
      defaultBody: String(form.get("defaultBody") ?? ""),
      oddShiftInBefore: String(form.get("oddShiftInBefore") ?? ""),
      oddShiftOutAfter: String(form.get("oddShiftOutAfter") ?? ""),
    };
    try {
      const res = await fetch(withBasePath("/api/email/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setMessage("Email settings saved.");
      router.refresh();
      (e.currentTarget.querySelector("input[name='smtpPassword']") as HTMLInputElement | null)?.setAttribute("value", "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="nac-card space-y-3 p-4">
      <div>
        <label htmlFor="smtpUsername" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          SMTP Username
        </label>
        <input id="smtpUsername" name="smtpUsername" defaultValue={initial.smtpUsername} className="nac-input" required />
      </div>
      <div>
        <label htmlFor="smtpPassword" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          SMTP Password {initial.hasPassword ? "(leave blank to keep current)" : ""}
        </label>
        <input id="smtpPassword" name="smtpPassword" type="password" className="nac-input" placeholder={initial.hasPassword ? "••••••••" : ""} />
      </div>
      <div>
        <label htmlFor="defaultSubject" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Default Subject Template
        </label>
        <input id="defaultSubject" name="defaultSubject" defaultValue={initial.defaultSubject} className="nac-input" required />
      </div>
      <div>
        <label htmlFor="ccRecipients" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          CC Recipients (comma separated)
        </label>
        <input
          id="ccRecipients"
          name="ccRecipients"
          defaultValue={initial.ccRecipients}
          className="nac-input"
          placeholder="hr@example.com, manager@example.com"
        />
      </div>
      <div>
        <label htmlFor="defaultBody" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Default Body Template
        </label>
        <textarea id="defaultBody" name="defaultBody" defaultValue={initial.defaultBody} className="nac-textarea min-h-36" required />
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
        <p className="font-semibold">Available placeholders</p>
        <p>{"{{section_name}}, {{section_code}}, {{section_email}}, {{department_name}}, {{record_id}}, {{period}}"}</p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Odd Shift Rules</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="oddShiftInBefore" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Odd Shift In-Time Before (HH:mm)
            </label>
            <input id="oddShiftInBefore" name="oddShiftInBefore" defaultValue={initial.oddShiftInBefore} className="nac-input" required />
          </div>
          <div>
            <label htmlFor="oddShiftOutAfter" className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Odd Shift Out-Time After (HH:mm)
            </label>
            <input id="oddShiftOutAfter" name="oddShiftOutAfter" defaultValue={initial.oddShiftOutAfter} className="nac-input" required />
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      <button type="submit" className="nac-btn-primary px-4 py-2 text-sm" disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </form>
  );
}
