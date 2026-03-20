"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/basePath";

export default function FileActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reprocess() {
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(withBasePath(`/api/files/${id}/process`), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        setMessage(data.error || "Processing failed");
        setProcessing(false);
        return;
      }
      
      setMessage(data.message || "Processing started");
      router.refresh();
      setTimeout(() => {
        setProcessing(false);
        setMessage(null);
        router.refresh();
      }, 2000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Processing failed");
      setProcessing(false);
    }
  }

  async function deleteRow() {
    if (!confirm("Delete this file?")) return;
    await fetch(withBasePath(`/api/files/${id}`), { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="nac-btn-secondary px-2.5 py-1.5" href={`/app/files/${id}`}>Details</Link>
        <a className="nac-btn-secondary px-2.5 py-1.5" href={withBasePath(`/api/files/${id}/download`)}>Download</a>
        <a className="nac-btn-secondary px-2.5 py-1.5" href={withBasePath(`/api/files/${id}/detailed-attendance-report`)}>Detailed</a>
        <a className="nac-btn-secondary px-2.5 py-1.5" href={withBasePath(`/api/files/${id}/monthly-wages-report`)}>Monthly Wages</a>
        <a className="nac-btn-secondary px-2.5 py-1.5" href={withBasePath(`/api/files/${id}/segregation-report`)}>Segregation ZIP</a>
        {status !== "completed" ? (
          <button 
            onClick={reprocess} 
            disabled={processing} 
            className="nac-btn-primary px-2.5 py-1.5 disabled:opacity-60" 
            type="button"
          >
            {processing ? "Processing..." : "Process"}
          </button>
        ) : null}
        <button onClick={deleteRow} className="nac-btn-danger px-2.5 py-1.5" type="button">Delete</button>
      </div>
      {message && (
        <p className={`text-xs ${message.includes("failed") || message.includes("error") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
