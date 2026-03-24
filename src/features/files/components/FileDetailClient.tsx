"use client";

import { useEffect, useMemo, useState } from "react";
import { withBasePath } from "@/lib/basePath";

type Props = { fileId: string };
type TabKey = "preview" | "leave";

type PreviewResponse = {
  columns: string[];
  rows: Record<string, string>[];
  total: number;
  page: number;
  pageSize: number;
};

type LeaveResponse = {
  rows: Record<string, string>[];
  total: number;
  page: number;
  pageSize: number;
};

export default function FileDetailClient({ fileId, initialTab = "preview" }: Props & { initialTab?: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [leave, setLeave] = useState<LeaveResponse | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const url = tab === "preview"
      ? withBasePath(`/api/files/${fileId}/preview?q=${encodeURIComponent(debouncedQuery)}&page=${page}`)
      : withBasePath(`/api/files/${fileId}/leave-details?q=${encodeURIComponent(debouncedQuery)}&page=${page}`);

    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({} as { error?: string }));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        if (tab === "preview") setPreview(data as PreviewResponse);
        else setLeave(data as LeaveResponse);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load table.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [fileId, debouncedQuery, page, tab]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const activePage = tab === "preview" ? (preview?.page ?? 1) : (leave?.page ?? 1);
  const activePageSize = tab === "preview" ? (preview?.pageSize ?? 25) : (leave?.pageSize ?? 25);
  const activeTotal = tab === "preview" ? (preview?.total ?? 0) : (leave?.total ?? 0);
  const totalPages = Math.max(Math.ceil(activeTotal / activePageSize), 1);
  const canPrev = activePage > 1;
  const canNext = activePage < totalPages;

  const leaveColumns = useMemo(() => (leave?.rows?.[0] ? Object.keys(leave.rows[0]) : []), [leave?.rows]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`${tab === "preview" ? "nac-btn-primary" : "nac-btn-secondary"} px-3 py-1.5`}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => setTab("leave")}
          className={`${tab === "leave" ? "nac-btn-primary" : "nac-btn-secondary"} px-3 py-1.5`}
        >
          Leave Details
        </button>
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="nac-input" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-xs text-slate-500">Loading data...</p> : null}

      {tab === "preview" ? (
        <div className="nac-card overflow-auto">
          <table className="nac-table w-full text-sm">
            <thead>
              <tr>{preview?.columns?.map((c) => <th key={c} className="border-b px-2 py-1 text-left">{c}</th>)}</tr>
            </thead>
            <tbody>
              {preview?.rows?.map((row, idx) => (
                <tr key={idx}>
                  {(preview?.columns ?? []).map((c) => <td key={c} className="border-b px-2 py-1">{String(row[c] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="nac-card overflow-auto">
          <table className="nac-table w-full text-sm">
            <thead>
              <tr>{leaveColumns.map((c) => <th key={c} className="border-b px-2 py-1 text-left">{c}</th>)}</tr>
            </thead>
            <tbody>
              {leave?.rows?.map((row, idx) => (
                <tr key={idx}>
                  {leaveColumns.map((c) => <td key={c} className="border-b px-2 py-1">{String(row[c] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600">
          Showing {activeTotal === 0 ? 0 : (activePage - 1) * activePageSize + 1}-{Math.min(activePage * activePageSize, activeTotal)} of {activeTotal}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`nac-btn-secondary px-3 py-1.5 text-xs ${canPrev ? "" : "pointer-events-none opacity-50"}`}
          >
            Previous
          </button>
          <span className="text-xs font-semibold text-slate-600">Page {activePage} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className={`nac-btn-secondary px-3 py-1.5 text-xs ${canNext ? "" : "pointer-events-none opacity-50"}`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
