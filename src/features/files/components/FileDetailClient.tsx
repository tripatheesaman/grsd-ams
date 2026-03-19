"use client";

import { useEffect, useState } from "react";

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
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [leave, setLeave] = useState<LeaveResponse | null>(null);

  useEffect(() => {
    const url = tab === "preview"
      ? `/api/files/${fileId}/preview?q=${encodeURIComponent(query)}`
      : `/api/files/${fileId}/leave-details?q=${encodeURIComponent(query)}`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (tab === "preview") setPreview(data as PreviewResponse);
        else setLeave(data as LeaveResponse);
      });
  }, [fileId, query, tab]);

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
              <tr>{leave?.rows?.[0] ? Object.keys(leave.rows[0]).map((c) => <th key={c} className="border-b px-2 py-1 text-left">{c}</th>) : null}</tr>
            </thead>
            <tbody>
              {leave?.rows?.map((row, idx) => (
                <tr key={idx}>
                  {Object.keys(row).map((c) => <td key={c} className="border-b px-2 py-1">{String(row[c] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
