"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

type CapturedTable = { idx: number; h: string[]; d: Record<string, unknown>[]; cnt: number };
type ImportType = "attendance" | "logs";

type ImportMessage =
  | { type: "GRSD_AMS_PING" }
  | {
      type: "GRSD_AMS_IMPORT";
      importType: ImportType;
      tables: CapturedTable[];
      periodYear?: number | null;
      periodMonth?: number | null;
      sourceUrl?: string;
      timestamp?: string;
    };

export default function ImportBridgePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "working" | "success" | "error">("waiting");
  const [message, setMessage] = useState("Waiting for HRMS data…");

  const hrmsOriginAllow = useMemo(() => new Set(["https://hrms.nepalairlines.com.np"]), []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.data || typeof event.data !== "object") return;
      const data = event.data as ImportMessage;

      if (data.type === "GRSD_AMS_PING") {
        try {
          window.opener?.postMessage({ type: "GRSD_AMS_READY" }, event.origin);
        } catch {}
        return;
      }

      if (data.type !== "GRSD_AMS_IMPORT") return;

      if (event.origin && !hrmsOriginAllow.has(event.origin)) {
        setStatus("error");
        setMessage("Blocked: unexpected sender origin.");
        return;
      }

      if (!Array.isArray(data.tables) || data.tables.length === 0) {
        setStatus("error");
        setMessage("No table data received.");
        return;
      }

      setStatus("working");
      setMessage("Staging data…");

      const stage = async () => {
        const res = await fetch(withBasePath("/api/import/stage"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            importType: data.importType,
            tables: data.tables.map((t) => ({ headers: t.h, data: t.d })),
            periodYear: data.periodYear ?? undefined,
            periodMonth: data.periodMonth ?? undefined,
          }),
        });
        const jsonUnknown: unknown = await res.json().catch(() => ({}));
        const json = jsonUnknown as { error?: unknown; importType?: ImportType; periodYear?: unknown; periodMonth?: unknown };
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        return {
          importType: json.importType ?? data.importType,
          periodYear: typeof json.periodYear === "number" ? json.periodYear : null,
          periodMonth: typeof json.periodMonth === "number" ? json.periodMonth : null,
        };
      };

      const commit = async (periodYear?: number, periodMonth?: number) => {
        const res = await fetch(withBasePath("/api/import/commit"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            periodYear: periodYear ?? undefined,
            periodMonth: periodMonth ?? undefined,
          }),
        });
        const jsonUnknown: unknown = await res.json().catch(() => ({}));
        const json = jsonUnknown as { error?: unknown; fileId?: unknown; processedRows?: unknown };
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        return {
          fileId: typeof json.fileId === "string" ? json.fileId : undefined,
          processedRows: typeof json.processedRows === "number" ? json.processedRows : undefined,
        };
      };

      stage()
        .then(async (staged) => {
          if (staged.importType === "logs") {
            const y = Number(staged.periodYear ?? data.periodYear ?? 0);
            const m = Number(staged.periodMonth ?? data.periodMonth ?? 0);
            if (y < 2000 || m < 1 || m > 12) {
              throw new Error("Could not detect log period from the Excel export. Please ensure it's the correct logs file.");
            }
            setMessage("Processing…");
            return commit(y, m);
          }

          // Attendance: use detected period if provided (no prompt). If missing, commit without period.
          const y = Number(staged.periodYear ?? data.periodYear ?? 0);
          const m = Number(staged.periodMonth ?? data.periodMonth ?? 0);
          if (y >= 2000 && m >= 1 && m <= 12) {
            setMessage("Processing attendance…");
            return commit(y, m);
          }
          setMessage("Processing attendance…");
          return commit();
        })
        .then((committed) => {
          if (!committed) return;
          setStatus("success");
          setMessage("Attendance imported. Opening Attendance page…");
          setTimeout(() => {
            router.push("/app/attendance?tab=detailed");
            window.close();
          }, 900);
        })
        .catch((e) => {
          setStatus("error");
          setMessage(e?.message ? String(e.message) : "Import failed.");
        });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [hrmsOriginAllow, router]);

  return (
    <div className="na-auth-bg">
      <div className="na-auth-card">
        <div className="text-center space-y-3">
          <h1 className="text-xl font-bold">GrSD-AMS Import</h1>
          {status === "waiting" || status === "working" ? (
            <div className="text-blue-700">
              <div className="animate-spin inline-block w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full mb-2"></div>
              <p className="text-sm">{message}</p>
            </div>
          ) : null}
          {status === "success" ? <p className="text-sm text-green-700 font-semibold">{message}</p> : null}
          {status === "error" ? (
            <div className="text-sm text-red-700">
              <p className="font-semibold">{message}</p>
              <button onClick={() => window.close()} className="mt-3 px-4 py-2 bg-red-600 text-white rounded">
                Close
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

