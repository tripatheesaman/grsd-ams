"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CapturedTable = {
  idx: number;
  h: string[];
  d: Record<string, unknown>[];
  cnt: number;
};

type BookmarkletMessage = {
  type: "NAC_BOOKMARKLET_DATA" | "NAC_BOOKMARKLET_PING";
  tables: CapturedTable[];
  sourceUrl?: string;
  timestamp?: string;
};

export default function BookmarkletReceiverPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "processing" | "success" | "error">("waiting");
  const [message, setMessage] = useState<string>("Waiting for data from bookmarklet...");
  const [fileId, setFileId] = useState<string | null>(null);

  useEffect(() => {
    const referrerOrigin = (() => {
      try {
        if (!document.referrer) return null;
        return new URL(document.referrer).origin;
      } catch {
        return null;
      }
    })();
    let trustedOpenerOrigin: string | null = referrerOrigin;

    function handleMessage(event: MessageEvent) {
      if (event.source !== window.opener) {
        return;
      }
      const payload = event.data as Partial<BookmarkletMessage> | undefined;
      if (!payload || !payload.type) {
        return;
      }

      if (payload.type === "NAC_BOOKMARKLET_PING") {
        trustedOpenerOrigin = event.origin;
        window.opener?.postMessage({ type: "NAC_BOOKMARKLET_READY" }, event.origin);
        return;
      }

      if (trustedOpenerOrigin && event.origin !== trustedOpenerOrigin) {
        return;
      }

      if (payload.type === "NAC_BOOKMARKLET_DATA" && Array.isArray(payload.tables)) {
        trustedOpenerOrigin = event.origin;
        const { tables, sourceUrl, timestamp } = payload;
        
        setStatus("processing");
        setMessage("Processing data...");

        fetch("/api/files/from-extension", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tables: tables.map((t) => ({
              tableIndex: t.idx,
              headers: t.h,
              data: t.d,
              rowCount: t.cnt,
            })),
            sourceUrl,
            timestamp,
          }),
        })
          .then((r) => {
            if (!r.ok) {
              return r.text().then((txt) => {
                try {
                  const json = JSON.parse(txt) as { error?: string };
                  throw new Error(json.error || `HTTP ${r.status}`);
                } catch (e: unknown) {
                  if (e instanceof Error && e.message) throw e;
                  throw new Error(`Server returned HTML. Status: ${r.status}`);
                }
              });
            }
            return r.json();
          })
          .then((data) => {
            if (data.error) {
              setStatus("error");
              setMessage(`Error: ${data.error}`);
            } else {
              setStatus("success");
              setMessage(data.message || "Data synced and processed successfully!");
              if (data.fileId) {
                setFileId(data.fileId);
                setTimeout(() => {
                  router.push(`/app/attendance?tab=detailed`);
                  window.close();
                }, 2000);
              }
            }
          })
          .catch((e) => {
            setStatus("error");
            setMessage(`Error: ${e.message || "Unknown error"}`);
          });
      }
    }

    window.addEventListener("message", handleMessage);
    
    if (referrerOrigin) {
      window.opener?.postMessage({ type: "NAC_BOOKMARKLET_READY" }, referrerOrigin);
    } else {
      window.opener?.postMessage({ type: "NAC_BOOKMARKLET_READY" }, "*");
    }

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [router]);

  return (
    <div className="na-auth-bg">
      <div className="na-auth-card">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">NAC Bookmarklet Receiver</h1>
          <div className="space-y-4">
            {status === "waiting" && (
              <div className="text-blue-600">
                <div className="animate-spin inline-block w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full mb-2"></div>
                <p>{message}</p>
              </div>
            )}
            {status === "processing" && (
              <div className="text-amber-600">
                <div className="animate-spin inline-block w-6 h-6 border-4 border-amber-600 border-t-transparent rounded-full mb-2"></div>
                <p>{message}</p>
              </div>
            )}
            {status === "success" && (
              <div className="text-green-600">
                <div className="text-4xl mb-2">✓</div>
                <p className="font-semibold">{message}</p>
                {fileId && <p className="text-sm mt-2">Redirecting to file...</p>}
              </div>
            )}
            {status === "error" && (
              <div className="text-red-600">
                <div className="text-4xl mb-2">✗</div>
                <p className="font-semibold">{message}</p>
                <button
                  onClick={() => window.close()}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
