"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

type Props = {
  fileId: string | null;
  hasLogs: boolean;
};

export default function LogsUploader({ fileId, hasLogs }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [logsPresent, setLogsPresent] = useState(hasLogs);

  if (!fileId) return null;
  const resolvedFileId = fileId;

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("Uploading logs and reprocessing…");
    try {
      const form = new FormData();
      form.append("file", file);
      let res = await fetch(withBasePath(`/api/files/${resolvedFileId}/logs`), {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (res.status === 404) {
        form.append("fileId", resolvedFileId);
        res = await fetch(withBasePath("/api/files/logs"), {
          method: "POST",
          body: form,
          credentials: "include",
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setMessage(data?.message || "Logs imported.");
      setLogsPresent(true);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to import logs.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function resetLogs() {
    setBusy(true);
    setMessage("Resetting existing logs…");
    try {
      let res = await fetch(withBasePath(`/api/files/${resolvedFileId}/logs`), {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 404) {
        res = await fetch(withBasePath(`/api/files/logs?fileId=${encodeURIComponent(resolvedFileId)}`), {
          method: "DELETE",
          credentials: "include",
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setLogsPresent(false);
      setMessage(data?.message || "Logs reset.");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to reset logs.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nac-card flex flex-col gap-2 p-3 text-sm text-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Logs Excel</span>
        {logsPresent ? (
          <button
            type="button"
            onClick={resetLogs}
            className="nac-btn-secondary px-3 py-1.5 text-xs"
            disabled={busy}
          >
            {busy ? "Working…" : "Reset Logs"}
          </button>
        ) : (
          <label className="nac-btn-secondary px-3 py-1.5 text-xs cursor-pointer">
            {busy ? "Working…" : "Import Logs Excel"}
            <input
              type="file"
              accept=".xlsx"
              onChange={handleChange}
              className="hidden"
              disabled={busy}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Export the logs from HRMS to Excel, then select that file here. It will be merged into this attendance record
        and discarded from the app after processing.
      </p>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}

