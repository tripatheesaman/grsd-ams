"use client";

import { useEffect, useState } from "react";

export default function ExtensionInstaller() {
  const [bookmarklet, setBookmarklet] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bookmarkName = "GrSD-AMS";

  useEffect(() => {
    fetch("/api/extension/bookmarklet")
      .then((r) => r.json())
      .then((d) => setBookmarklet(typeof d?.bookmarklet === "string" ? d.bookmarklet : null))
      .catch(() => setBookmarklet(null));
  }, []);

  function copyBookmarklet() {
    if (!bookmarklet) return;
    navigator.clipboard.writeText(bookmarklet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = bookmarklet;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="nac-card space-y-4 p-4 md:p-5">
      <div>
        <h2 className="nac-heading text-base font-semibold">Sync from External Systems</h2>
        <p className="mt-1 text-sm text-slate-600">
          Click a single bookmark on HRMS pages to sync.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-blue-900 text-sm mb-1">Bookmarklet</h3>
            <p className="text-xs text-blue-700">
              Add the bookmark once. Then, on HRMS Attendance or Logs pages, click it to sync.
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={copyBookmarklet} className="nac-btn-primary px-4 py-2 text-sm" type="button" disabled={!bookmarklet}>
              {copied ? "✓ Copied!" : bookmarklet ? "Copy bookmarklet" : "Loading…"}
            </button>
          </div>
        </div>

      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <p className="font-semibold mb-1">How to use:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Copy the bookmarklet</li>
          <li>Create a browser bookmark named “{bookmarkName}” and paste the copied code as the URL</li>
          <li>Open HRMS Attendance page and click the bookmark (stages attendance)</li>
          <li>Open HRMS Logs page and click the bookmark (auto processes with logs)</li>
        </ol>
      </div>
    </div>
  );
}
