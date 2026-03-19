"use client";

import { useState, useEffect } from "react";

export default function ExtensionInstaller() {
  const [bookmarklet, setBookmarklet] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bookmarkName = "GrSD-AMS";

  useEffect(() => {
    fetch("/api/extension/bookmarklet")
      .then((res) => res.json())
      .then((data) => {
        if (data.bookmarklet) {
          setBookmarklet(data.bookmarklet);
        }
      })
      .catch(() => {});
  }, []);

  function copyBookmarklet() {
    if (bookmarklet) {
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
  }

  function createBookmark() {
    if (!bookmarklet) return;

    const w = window as Window & {
      external?: { AddFavorite?: (url: string, title: string) => void };
      sidebar?: { addPanel?: (title: string, url: string, extra?: string) => void };
    };

    let installed = false;
    try {
      if (typeof w.external?.AddFavorite === "function") {
        w.external.AddFavorite(bookmarklet, bookmarkName);
        installed = true;
      } else if (typeof w.sidebar?.addPanel === "function") {
        w.sidebar.addPanel(bookmarkName, bookmarklet, "");
        installed = true;
      }
    } catch {
      installed = false;
    }

    if (installed) {
      alert(`Bookmark installed as '${bookmarkName}'.`);
      return;
    }

    copyBookmarklet();
    alert(
      `Your browser blocks silent bookmark installation. The bookmarklet was copied.\n\nPress Ctrl+D (or Cmd+D on Mac), set Name to '${bookmarkName}', and paste the copied URL as the bookmark address.`,
    );
  }

  return (
    <div className="nac-card space-y-4 p-4 md:p-5">
      <div>
        <h2 className="nac-heading text-base font-semibold">Sync from External Systems</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sync attendance data directly from external websites without manual file downloads.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-semibold text-blue-900 text-sm mb-1">Bookmarklet (Recommended - No Installation)</h3>
              <p className="text-xs text-blue-700">
                Click the button below to copy the bookmarklet code, then create a bookmark with it.
              </p>
            </div>
          </div>
          
          {bookmarklet ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={copyBookmarklet}
                  className="nac-btn-primary px-4 py-2 text-sm"
                  type="button"
                >
                  {copied ? "✓ Copied!" : "📌 Copy Bookmarklet"}
                </button>
                <button
                  onClick={createBookmark}
                  className="nac-btn-secondary px-4 py-2 text-sm"
                  type="button"
                >
                  Direct Install
                </button>
              </div>
              {copied && (
                <div className="rounded border border-green-300 bg-green-50 p-3 text-xs text-green-800">
                  <p className="font-semibold mb-1">Bookmarklet copied to clipboard!</p>
                  <p className="mb-2">Now create a bookmark:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Right-click your bookmarks bar</li>
                    <li>Select &quot;Add page&quot; or &quot;New bookmark&quot;</li>
                    <li>Paste the copied code into the URL field</li>
                    <li>Name it &quot;{bookmarkName}&quot;</li>
                    <li>Save the bookmark</li>
                  </ol>
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold">Troubleshooting</summary>
                    <p className="mt-1 text-xs">This uses inline code for CSP-restricted pages. If you still see an error, delete the old bookmark and recreate it from this page.</p>
                  </details>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-blue-600">Loading bookmarklet...</p>
          )}
        </div>

      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <p className="font-semibold mb-1">How to use:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Open the external system website in your browser</li>
          <li>Navigate to the page with attendance data tables</li>
          <li>Click the &quot;{bookmarkName}&quot; bookmark in your bookmarks bar</li>
          <li>Enter your NAC app URL when prompted</li>
          <li>Data will be automatically synced to your NAC app</li>
        </ol>
      </div>
    </div>
  );
}
