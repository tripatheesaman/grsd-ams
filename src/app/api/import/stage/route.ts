import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { requireApiUser } from "@/server/auth/session";
import { mutationOriginError } from "@/server/security/origin";
import { STAGING_ROOT } from "@/server/paths";
import * as XLSX from "xlsx";

type ExtensionRow = Record<string, unknown>;
type ExtensionTable = {
  headers: string[];
  data: ExtensionRow[];
};

type ImportType = "attendance" | "logs";
type Period = { year: number; month: number };

function isExtensionTable(value: unknown): value is ExtensionTable {
  if (!value || typeof value !== "object") return false;
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
          if (year >= 2000 && month >= 1 && month <= 12) return { year, month };
        }
      }
      for (const v of Object.values(row)) {
        const raw = String(v ?? "").trim();
        const match = datePattern.exec(raw);
        if (!match) continue;
        const year = Number.parseInt(match[1], 10);
        const month = Number.parseInt(match[2], 10);
        if (year >= 2000 && month >= 1 && month <= 12) return { year, month };
      }
    }
  }
  return null;
}

function tablesToWorkbookBuffer(tables: ExtensionTable[]) {
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
          if (m2) timeTypes.add(normalizeTimeType(m2[2]));
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
          const matrixRow: unknown[] = [timeTypeIdx === 0 ? empSN : "", timeTypeIdx === 0 ? empID : "", timeTypeIdx === 0 ? empName : "", timeTypeIdx === 0 ? empPost : "", timeType];

          sortedDays.forEach((day) => {
            const colName = `${day}_${timeType}`;
            matrixRow.push((row as Record<string, unknown>)[colName] ?? "");
          });

          summaryHeaders.forEach((h) => {
            const v = timeType === "Status" ? (row as Record<string, unknown>)[h] : "";
            matrixRow.push(v ?? "");
          });

          extraTimeTypeHeaders.forEach((h) => {
            const m2 = String(h).match(timeTypeSuffixHeaderRe);
            const suffix = m2 ? normalizeTimeType(m2[2]) : null;
            const v = suffix === timeType ? (row as Record<string, unknown>)[h] : "";
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

    const worksheetData: unknown[][] = [headers];
    data.forEach((row) => {
      const rowData = headers.map((h: string) => (row[h] ?? ""));
      worksheetData.push(rowData);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const sheetName = tables.length > 1 ? `Table${idx + 1}` : "Data";
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    if (isAlreadyMatrixTable) {
      return;
    }
  });

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  type StageBody = {
    tables?: unknown;
    importType?: unknown;
    periodYear?: unknown;
    periodMonth?: unknown;
  };
  const bodyUnknown: unknown = await req.json().catch(() => ({}));
  const body: StageBody = bodyUnknown && typeof bodyUnknown === "object" ? (bodyUnknown as StageBody) : {};
  const rawTables = body.tables;
  const tables: ExtensionTable[] = Array.isArray(rawTables) ? rawTables.filter(isExtensionTable) : [];
  const importType: ImportType = String(body.importType ?? "attendance").toLowerCase() === "logs" ? "logs" : "attendance";

  if (tables.length === 0) return NextResponse.json({ error: "No table data provided" }, { status: 400 });

  const detectedPeriod = importType === "logs" ? getPeriodFromLogsTables(tables) : null;
  const periodYearRaw = body.periodYear;
  const periodMonthRaw = body.periodMonth;
  const periodYear = typeof periodYearRaw === "number" ? periodYearRaw : Number.parseInt(String(periodYearRaw ?? ""), 10);
  const periodMonth = typeof periodMonthRaw === "number" ? periodMonthRaw : Number.parseInt(String(periodMonthRaw ?? ""), 10);
  const providedPeriod: Period | null =
    periodYear >= 2000 && periodMonth >= 1 && periodMonth <= 12 ? { year: periodYear, month: periodMonth } : null;
  const period = detectedPeriod ?? providedPeriod;

  if (importType === "logs" && !period) {
    return NextResponse.json({ error: "Could not determine log month/year. Please provide period." }, { status: 400 });
  }

  const buffer = tablesToWorkbookBuffer(tables);

  const stageDir = STAGING_ROOT;
  await fs.mkdir(stageDir, { recursive: true });

  const key = importType === "logs" ? `logs_${period!.year}_${String(period!.month).padStart(2, "0")}` : "attendance";
  const stagePath = path.join(stageDir, `stage_${user.id}_${key}.xlsx`);
  await fs.writeFile(stagePath, buffer);

  return NextResponse.json({
    success: true,
    importType,
    periodYear: period?.year ?? null,
    periodMonth: period?.month ?? null,
    rowCount: tables.reduce((s, t) => s + (Array.isArray(t.data) ? t.data.length : 0), 0),
  });
}

