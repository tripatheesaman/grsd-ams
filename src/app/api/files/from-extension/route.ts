import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { writeUpload, writeUploadNamed } from "@/server/storage/files";
import { expectedOriginForRequest, mutationOriginError } from "@/server/security/origin";
import * as XLSX from "xlsx";

type ExtensionRow = Record<string, unknown>;
type ExtensionTable = {
  headers: string[];
  data: ExtensionRow[];
};

type Period = { year: number; month: number };

function isExtensionTable(value: unknown): value is ExtensionTable {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybe = value as Partial<ExtensionTable>;
  return Array.isArray(maybe.headers) && Array.isArray(maybe.data);
}

function normalizeHeader(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[\s._-]+/g, "");
}

function getPeriodFromLogsTables(tables: ExtensionTable[]): Period | null {
  const datePattern = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
  for (const table of tables) {
    const dateHeader = table.headers.find((h) => normalizeHeader(h) === "attendancedatenepali");
    for (const row of table.data) {
      if (dateHeader) {
        const raw = String(row[dateHeader] ?? "").trim();
        const match = datePattern.exec(raw);
        if (match) {
          const year = Number.parseInt(match[1], 10);
          const month = Number.parseInt(match[2], 10);
          if (year >= 2000 && month >= 1 && month <= 12) {
            return { year, month };
          }
        }
      }
      for (const v of Object.values(row)) {
        const raw = String(v ?? "").trim();
        const match = datePattern.exec(raw);
        if (!match) continue;
        const year = Number.parseInt(match[1], 10);
        const month = Number.parseInt(match[2], 10);
        if (year >= 2000 && month >= 1 && month <= 12) {
          return { year, month };
        }
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) {
    return NextResponse.json({ error: originError }, { status: 403 });
  }

  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await req.json();
    const sourceUrl = typeof (body as { sourceUrl?: unknown })?.sourceUrl === "string"
      ? (body as { sourceUrl: string }).sourceUrl
      : "";
    const timestamp = typeof (body as { timestamp?: unknown })?.timestamp === "string"
      ? (body as { timestamp: string }).timestamp
      : "";
    const rawTables = (body as { tables?: unknown[] })?.tables;
    const tables: ExtensionTable[] = Array.isArray(rawTables) ? rawTables.filter(isExtensionTable) : [];
    const importType = typeof (body as { importType?: unknown })?.importType === "string"
      ? String((body as { importType?: string }).importType).toLowerCase()
      : "attendance";
    const periodYearRaw = (body as { periodYear?: unknown })?.periodYear;
    const periodMonthRaw = (body as { periodMonth?: unknown })?.periodMonth;
    const periodYear = typeof periodYearRaw === "number" ? periodYearRaw : Number.parseInt(String(periodYearRaw ?? ""), 10);
    const periodMonth = typeof periodMonthRaw === "number" ? periodMonthRaw : Number.parseInt(String(periodMonthRaw ?? ""), 10);

    if (tables.length === 0) {
      return NextResponse.json({ error: "No table data provided" }, { status: 400 });
    }

    if (process.env.EXTENSION_DEBUG_LOGS === "true") {
      // Optional debug logging is gated to avoid sensitive payload persistence by default.
      try {
        const logsDir = path.join(process.cwd(), "logs");
        await fs.mkdir(logsDir, { recursive: true });
        const fileName = `extension_payload_${Date.now()}.json`;
        const logPath = path.join(logsDir, fileName);
        await fs.writeFile(
          logPath,
          JSON.stringify(
            {
              receivedAt: new Date().toISOString(),
              sourceUrl,
              timestamp,
              tableCount: tables.length,
            },
            null,
            2,
          ),
          "utf-8",
        );
      } catch (e) {
        console.error("Failed to write extension payload log", e);
      }
    }

    const workbook = XLSX.utils.book_new();

    tables.forEach((table, idx) => {
      const { headers, data } = table;
      if (!headers || !data || data.length === 0) return;

      const dayTimeHeaderRe = /^(\d{1,2}\s+\w+)_(.+)$/;
      const dayOnlyHeaderRe = /^\d{1,2}\s+\w+$/;
      const timeTypeSuffixHeaderRe = /^(.*)_(InTime|OutTime|Status|WorkedHour)$/;
      const normalizeTimeType = (raw: string) => {
        const t = String(raw).trim().toLowerCase().replace(/\s+/g, "");
        if (t === "intime" || t === "in") return "InTime";
        if (t === "outtime" || t === "out") return "OutTime";
        if (t === "status") return "Status";
        if (t === "workedhour" || t === "workedhours" || t === "workhour" || t === "hours") return "WorkedHour";
        return raw;
      };

      const timeTypeOrder = ["InTime", "OutTime", "Status", "WorkedHour"];

      const isDayTimeWideMatrix = headers.some((h: string) => dayTimeHeaderRe.test(String(h)));
      const isAlreadyMatrixTable =
        !isDayTimeWideMatrix &&
        headers.some((h: string) => dayOnlyHeaderRe.test(String(h))) &&
        headers.some((h: string) => String(h).trim().toLowerCase() === "time");
      
      if (isDayTimeWideMatrix) {
        const dayHeaders = new Set<string>();
        const timeTypes = new Set<string>();
        const summaryHeaders: string[] = [];
        const extraTimeTypeHeaders: string[] = [];

        headers.forEach((h: string) => {
          const text = String(h);
          const match = text.match(dayTimeHeaderRe);
          if (match) {
            dayHeaders.add(match[1]);
            timeTypes.add(normalizeTimeType(match[2]));
          } else if (timeTypeSuffixHeaderRe.test(text)) {
            extraTimeTypeHeaders.push(text);
            const m2 = text.match(timeTypeSuffixHeaderRe);
            if (m2) {
              timeTypes.add(normalizeTimeType(m2[2]));
            }
          } else if (!["SN.", "SN", "Emp ID", "EmpID", "Name", "Post"].includes(text)) {
            summaryHeaders.push(text);
          }
        });

        const maxDay = Math.max(
          0,
          ...Array.from(dayHeaders).map((d) => Number.parseInt(d.match(/^\d+/)?.[0] ?? "0", 10)),
        );

        const dayLabelByNumber = new Map<number, string>();
        Array.from(dayHeaders).forEach((d) => {
          const n = Number.parseInt(d.match(/^\d+/)?.[0] ?? "0", 10);
          if (n) dayLabelByNumber.set(n, d);
        });

        const sortedDays = Array.from({ length: maxDay }, (_, i) => {
          const n = i + 1;
          const label = dayLabelByNumber.get(n);
          if (label) return label;
          const dayNum = String(n).padStart(2, "0");
          return `${dayNum} Day`;
        });

        const uniqueTimeTypes = Array.from(timeTypes);
        uniqueTimeTypes.sort((a, b) => {
          const ia = timeTypeOrder.indexOf(a);
          const ib = timeTypeOrder.indexOf(b);
          if (ia === -1 && ib === -1) return String(a).localeCompare(String(b));
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });

        const matrixHeaders = ["SN.", "Emp ID", "Name", "Post", "Time", ...sortedDays, ...summaryHeaders, ...extraTimeTypeHeaders];
        const matrixData: unknown[][] = [matrixHeaders];

        data.forEach((row) => {
          const empSN = row["SN."] ?? row["SN"] ?? "";
          const empID = row["Emp ID"] ?? row["EmpID"] ?? "";
          const empName = row["Name"] ?? "";
          const empPost = row["Post"] ?? "";

          uniqueTimeTypes.forEach((timeType, timeTypeIdx) => {
            const matrixRow: unknown[] = [
              timeTypeIdx === 0 ? empSN : "",
              timeTypeIdx === 0 ? empID : "",
              timeTypeIdx === 0 ? empName : "",
              timeTypeIdx === 0 ? empPost : "",
              timeType,
            ];

            sortedDays.forEach((day) => {
              const colName = `${day}_${timeType}`;
              const value = row[colName];
              matrixRow.push(value ?? "");
            });

            summaryHeaders.forEach((h) => {
              const v = timeType === "Status" ? row[h] : "";
              matrixRow.push(v ?? "");
            });

            extraTimeTypeHeaders.forEach((h) => {
              const m2 = String(h).match(timeTypeSuffixHeaderRe);
              const suffix = m2 ? normalizeTimeType(m2[2]) : null;
              const v = suffix === timeType ? row[h] : "";
              matrixRow.push(v ?? "");
            });

            matrixData.push(matrixRow);
          });
        });

        const worksheet = XLSX.utils.aoa_to_sheet(matrixData);
        const sheetName = tables.length > 1 ? `Table${idx + 1}` : "Data";
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        return;
      }

      if (isAlreadyMatrixTable) {
        const worksheetData: unknown[][] = [headers];
        data.forEach((row) => {
          const rowData = headers.map((h: string) => (row[h] ?? ""));
          worksheetData.push(rowData);
        });
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        const sheetName = tables.length > 1 ? `Table${idx + 1}` : "Data";
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        return;
      }

      const worksheetData: unknown[][] = [headers];
      data.forEach((row) => {
        const rowData = headers.map((h: string) => (row[h] ?? ""));
        worksheetData.push(rowData);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const sheetName = tables.length > 1 ? `Table${idx + 1}` : "Data";
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const detectedPeriod = getPeriodFromLogsTables(tables);
    const period: Period | null = detectedPeriod ?? (
      Number.isFinite(periodYear) && Number.isFinite(periodMonth) && periodYear >= 2000 && periodMonth >= 1 && periodMonth <= 12
        ? { year: periodYear, month: periodMonth }
        : null
    );

    if (importType === "logs") {
      if (!period) {
        return NextResponse.json({ error: "Could not determine log month/year. Please provide period." }, { status: 400 });
      }
      const month = String(period.month).padStart(2, "0");
      const filename = `hrms_logs_${period.year}_${month}.xlsx`;
      const file = new File([excelBuffer], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      await writeUploadNamed(file, filename);

      return NextResponse.json({
        success: true,
        message: `Logs imported for ${period.year}-${month}.`,
        importType: "logs",
        periodYear: period.year,
        periodMonth: period.month,
      });
    }

    const filename = `attendance_import_${Date.now()}.xlsx`;
    const file = new File([excelBuffer], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const uploaded = await writeUpload(file);

    const record = await prisma.processedFile.create({
      data: { userId: user.id, originalFile: uploaded.relativePath, status: "pending_logs", processedFile: null, errorMessage: null },
    });

    return NextResponse.json({
      success: true,
      message: "Attendance imported. Waiting for your choice to process with/without logs.",
      importType: "attendance",
      fileId: record.id.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process extension data" },
      { status: 500 },
    );
  }
}

export async function OPTIONS(req: Request) {
  const origin = expectedOriginForRequest(req);
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    },
  });
}
