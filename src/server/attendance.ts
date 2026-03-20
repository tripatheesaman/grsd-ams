import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { prisma } from "@/server/prisma";

type AttendanceRow = {
  Employee_ID: string;
  Employee_Name: string;
  Designation: string;
  Date: string;
  Day_Name: string;
  InTime: string;
  OutTime: string;
  Status: string;
  WorkedHours: string | number;
  Log?: string;
};

type LeaveSummaryRow = {
  employee_id: string;
  employee_name: string;
  designation: string;
  present_days: number;
  absent_days: number;
  weekly_off_days: number;
  allowance_days: number;
  sick_leave_days: number;
  casual_leave_days: number;
  personal_leave_days: number;
  substitute_leave_days: number;
  duty_leave_days: number;
  other_leave_days: number;
};

type StaffMeta = {
  staffid: string;
  name: string;
  designation: string;
  level: number;
  weeklyOff: string;
  typeOfEmployment: string;
  priority: number;
};

function normalizeStaffId(staffId: unknown): string | null {
  if (staffId === null || staffId === undefined || String(staffId).trim() === "") {
    return null;
  }
  const staffIdStr = String(staffId).trim().toUpperCase();
  if (staffIdStr.startsWith("MW")) {
    const m = /^(MW)[-\s]?0*(\d+)$/.exec(staffIdStr);
    if (m) {
      return `${m[1]}-${Number.parseInt(m[2], 10)}`;
    }
    return staffIdStr;
  }

  const normalized = staffIdStr.replace(/[^A-Z0-9]/g, "");
  let m = /^([A-Z]+)(\d+)$/.exec(normalized);
  if (m) {
    return `${m[1]}${Number.parseInt(m[2], 10)}`;
  }
  if (/^\d+$/.test(normalized)) {
    return String(Number.parseInt(normalized, 10));
  }
  if (/^\d+[A-Z]+$/.test(normalized)) {
    return normalized;
  }
  m = /^([A-Z]+)(\d+)([A-Z]*)$/.exec(normalized);
  if (m) {
    return `${m[1]}${Number.parseInt(m[2], 10)}${m[3]}`;
  }
  return normalized;
}

function isDateLike(value: unknown): boolean {
  if (value instanceof Date) {
    return true;
  }
  if (typeof value === "number") {
    return value >= 20000 && value <= 50000;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return false;
  }
  return /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(text);
}

function excelSerialToDate(serial: number): Date {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
}

function parseDateHeader(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number") {
    return excelSerialToDate(value);
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/,
    /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/,
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  ];
  for (const format of formats) {
    const m = format.exec(text);
    if (!m) {
      continue;
    }
    if (format === formats[2]) {
      const y = Number.parseInt(m[1], 10);
      const mon = Number.parseInt(m[2], 10) - 1;
      const d = Number.parseInt(m[3], 10);
      return new Date(Date.UTC(y, mon, d));
    }
    let d = Number.parseInt(m[1], 10);
    let mon = Number.parseInt(m[2], 10) - 1;
    const yRaw = Number.parseInt(m[3], 10);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    if (mon > 11) {
      const temp = d;
      d = mon + 1;
      mon = temp - 1;
    }
    return new Date(Date.UTC(y, mon, d));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTimeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (match) {
    return `${String(Number.parseInt(match[1], 10)).padStart(2, "0")}:${match[2]}`;
  }
  return text;
}

function timeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) {
    return null;
  }
  const h = Number.parseInt(m[1], 10);
  const mins = Number.parseInt(m[2], 10);
  if (h > 23 || mins > 59) {
    return null;
  }
  return h * 60 + mins;
}

function calculateWorkedHours(inTime: string, outTime: string): number {
  const inMins = timeToMinutes(inTime);
  const outMins = timeToMinutes(outTime);
  if (inMins === null || outMins === null) {
    return 0;
  }
  let delta = outMins - inMins;
  if (delta < 0) {
    delta += 24 * 60;
  }
  return Number((delta / 60).toFixed(2));
}

function readWorkbookFromDisk(filePath: string): XLSX.WorkBook {
  const fileBytes = readFileSync(filePath);
  return XLSX.read(fileBytes, { type: "buffer", cellDates: true, raw: true });
}

function getFirstSheetRows(inputPath: string): unknown[][] {
  const workbook = readWorkbookFromDisk(inputPath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Excel file has no sheets");
  }
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];
}

function processMatrixAttendance(inputPath: string): AttendanceRow[] {
  const raw = getFirstSheetRows(inputPath);
  if (raw.length === 0) {
    throw new Error("Matrix attendance file is empty");
  }

  const dayHeaderPattern = /^\s*\d{1,2}\s+[A-Za-z]+\s*$/;
  let headerRowIdx = -1;
  let dayColIndices: number[] = [];
  const scanLimit = Math.min(50, raw.length);

  for (let r = 0; r < scanLimit; r += 1) {
    const row = raw[r] ?? [];
    const matches = row
      .map((v, i) => ({ v: String(v ?? ""), i }))
      .filter((x) => x.i >= 3 && dayHeaderPattern.test(x.v.trim()))
      .map((x) => x.i);
    if (matches.length >= 3) {
      headerRowIdx = r;
      dayColIndices = matches;
      break;
    }
  }

  if (headerRowIdx < 0) {
    throw new Error("Could not locate matrix attendance headers");
  }

  const headers = raw[headerRowIdx] ?? [];
  const normalizeHeader = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const headerMap = headers.map(normalizeHeader);

  const findHeaderIndex = (keys: string[]) => {
    const keySet = new Set(keys.map((k) => k.toLowerCase()));
    return headerMap.findIndex((h) => keySet.has(h));
  };

  const snCol = findHeaderIndex(["sn", "sn.", "s.n."]) >= 0 ? findHeaderIndex(["sn", "sn.", "s.n."]) : 0;
  const empIdCol = findHeaderIndex(["emp id", "empid", "employee id", "emp no", "emp no."]) >= 0
    ? findHeaderIndex(["emp id", "empid", "employee id", "emp no", "emp no."])
    : 1;
  const nameCol = findHeaderIndex(["name", "employee name", "emp name"]) >= 0
    ? findHeaderIndex(["name", "employee name", "emp name"])
    : 2;
  const postCol = findHeaderIndex(["post", "designation", "desig"]) >= 0
    ? findHeaderIndex(["post", "designation", "desig"])
    : 3;
  const timeCol = findHeaderIndex(["time"]) >= 0 ? findHeaderIndex(["time"]) : 4;

  const excludeKeywords = ["annual", "leave", "sick", "other", "casual", "substitute", "absent", "opening"];
  dayColIndices = dayColIndices.filter((idx) => {
    const text = String(headers[idx] ?? "").trim();
    const low = text.toLowerCase();
    return dayHeaderPattern.test(text) && !excludeKeywords.some((k) => low.includes(k));
  });
  if (dayColIndices.length === 0) {
    throw new Error("No valid day columns found in matrix file");
  }

  const employeeData = new Map<string, { info: { id: string; name: string; post: string; sn: string }; time: Record<string, string[]> }>();
  const rows: AttendanceRow[] = [];
  let currentKey = "";

  const knownTimeLabel = (rawLabel: string): string | null => {
    const label = rawLabel.toLowerCase().replace(/\s+/g, "");
    if (label === "intime" || label === "in") {
      return "InTime";
    }
    if (label === "outtime" || label === "out") {
      return "OutTime";
    }
    if (label === "status") {
      return "Status";
    }
    if (label.includes("work") || label.includes("hour")) {
      return "WorkedHour";
    }
    return null;
  };

  const flushEmployee = (key: string) => {
    const block = employeeData.get(key);
    if (!block) {
      return;
    }
    for (let j = 0; j < dayColIndices.length; j += 1) {
      const dayHeader = String(headers[dayColIndices[j]] ?? "").trim();
      const dm = /^(\d{1,2})\s+([A-Za-z]+)$/.exec(dayHeader);
      const dayName = dm ? dm[2] : dayHeader;
      const dateText = dm ? `${dm[1].padStart(2, "0")} ${dm[2]}` : dayHeader;
      const inTime = block.time.InTime?.[j] ?? "";
      const outTime = block.time.OutTime?.[j] ?? "";
      const status = String(block.time.Status?.[j] ?? "").toUpperCase();
      const workedHours = block.time.WorkedHour?.[j] ?? "";
      rows.push({
        Employee_ID: block.info.id,
        Employee_Name: block.info.name,
        Designation: block.info.post,
        Date: dateText,
        Day_Name: dayName,
        InTime: inTime,
        OutTime: outTime,
        Status: status,
        WorkedHours: workedHours,
      });
    }
  };

  for (let r = headerRowIdx + 1; r < raw.length; r += 1) {
    const row = raw[r] ?? [];
    const sn = String(row[snCol] ?? "").trim();
    const empId = String(row[empIdCol] ?? "").trim();
    const name = String(row[nameCol] ?? "").trim();
    const post = String(row[postCol] ?? "").trim();
    const timeLabelRaw = String(row[timeCol] ?? "").trim();
    const hasEmpInfo = Boolean(sn || empId || name);
    if (hasEmpInfo) {
      const key = empId || name || sn;
      if (currentKey && key !== currentKey) {
        flushEmployee(currentKey);
      }
      currentKey = key;
      if (!employeeData.has(key)) {
        employeeData.set(key, {
          info: { id: empId, name, post, sn },
          time: {},
        });
      } else {
        const existing = employeeData.get(key);
        if (existing) {
          existing.info = {
            id: empId || existing.info.id,
            name: name || existing.info.name,
            post: post || existing.info.post,
            sn: sn || existing.info.sn,
          };
        }
      }
    }
    if (!currentKey) {
      continue;
    }
    const block = employeeData.get(currentKey);
    if (!block) {
      continue;
    }
    const dayValues = dayColIndices.map((idx) => String(row[idx] ?? "").trim());
    const explicit = knownTimeLabel(timeLabelRaw);
    let label = explicit;
    if (!label) {
      if (!block.time.InTime) {
        label = "InTime";
      } else if (!block.time.OutTime) {
        label = "OutTime";
      } else if (!block.time.Status) {
        label = "Status";
      } else if (!block.time.WorkedHour) {
        label = "WorkedHour";
      }
    }
    if (label) {
      block.time[label] = dayValues;
    }
  }
  if (currentKey) {
    flushEmployee(currentKey);
  }
  if (rows.length === 0) {
    throw new Error("Parsed matrix attendance produced 0 rows");
  }
  return rows;
}

function processLegacyAttendance(inputPath: string): AttendanceRow[] {
  const raw = getFirstSheetRows(inputPath);
  if (raw.length === 0) {
    throw new Error("Attendance file is empty");
  }

  const findHeaderRow = () => {
    const defaultIdx = 10;
    for (let idx = defaultIdx; idx < Math.min(defaultIdx + 10, raw.length); idx += 1) {
      const row = raw[idx] ?? [];
      let dateLikeCount = 0;
      for (let i = 5; i < row.length; i += 1) {
        if (isDateLike(row[i])) {
          dateLikeCount += 1;
        }
        if (dateLikeCount >= 3) {
          return idx;
        }
      }
    }
    return defaultIdx;
  };

  const headerRowIdx = findHeaderRow();
  const headers = raw[headerRowIdx] ?? [];
  const dateColumns: number[] = [];
  for (let i = 5; i < headers.length; i += 1) {
    if (isDateLike(headers[i])) {
      dateColumns.push(i);
    }
  }
  if (dateColumns.length === 0) {
    throw new Error("Could not detect date columns");
  }

  const rows: AttendanceRow[] = [];
  for (let r = headerRowIdx + 1; r < raw.length; r += 1) {
    const row = raw[r] ?? [];
    const empId = String(row[0] ?? "").trim();
    if (!empId) {
      continue;
    }
    const empName = String(row[1] ?? "").trim();
    const designation = String(row[2] ?? "").trim();
    for (const c of dateColumns) {
      const attendanceRaw = String(row[c] ?? "").trim();
      if (!attendanceRaw) {
        continue;
      }
      const timeMatches = [...attendanceRaw.matchAll(/(\d{1,2}:\d{2})/g)].map((m) => m[1]);
      let inTime = "";
      let outTime = "";
      let status = "Present";
      if (attendanceRaw.includes("P") || attendanceRaw.includes("Present")) {
        status = "Present";
      } else if (attendanceRaw.includes("A") || attendanceRaw.includes("Absent")) {
        status = "Absent";
      } else if (attendanceRaw.includes("L") || attendanceRaw.includes("Leave")) {
        status = "Leave";
      } else if (attendanceRaw.includes("H") || attendanceRaw.includes("Holiday")) {
        status = "Holiday";
      }
      if (timeMatches.length >= 1) {
        inTime = formatTimeValue(timeMatches[0]);
      }
      if (timeMatches.length >= 2) {
        outTime = formatTimeValue(timeMatches[1]);
      }

      const dateObj = parseDateHeader(headers[c]);
      if (!dateObj) {
        continue;
      }
      rows.push({
        Employee_ID: empId,
        Employee_Name: empName,
        Designation: designation,
        Date: dateObj.toISOString().slice(0, 10),
        Day_Name: dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
        InTime: inTime,
        OutTime: outTime,
        Status: status,
        WorkedHours: calculateWorkedHours(inTime, outTime),
      });
    }
  }
  if (rows.length === 0) {
    throw new Error("Parsed attendance produced 0 rows");
  }
  return rows;
}

function processGeneralAttendance(inputPath: string): AttendanceRow[] {
  const workbook = readWorkbookFromDisk(inputPath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Excel file has no sheets");
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
  if (records.length === 0) {
    throw new Error("Input data is empty");
  }

  const rows: AttendanceRow[] = [];
  for (const rec of records) {
    const entries = Object.entries(rec).map(([k, v]) => [k.trim().toLowerCase(), v] as const);
    const getByKeys = (keys: string[]) => {
      const set = new Set(keys);
      const found = entries.find(([k]) => set.has(k));
      return found ? found[1] : "";
    };
    const inTime = formatTimeValue(getByKeys(["in time", "intime", "in_time"]));
    const outTime = formatTimeValue(getByKeys(["out time", "outtime", "out_time"]));
    const workedHours = calculateWorkedHours(inTime, outTime);
    const dateVal = getByKeys(["date"]);
    const dateObj = parseDateHeader(dateVal);
    rows.push({
      Employee_ID: String(getByKeys(["employee id", "emp id", "empid", "emp no", "emp no."]) ?? ""),
      Employee_Name: String(getByKeys(["employee name", "name", "emp name"]) ?? ""),
      Designation: String(getByKeys(["designation", "post", "desig"]) ?? ""),
      Date: dateObj ? dateObj.toISOString().slice(0, 10) : String(dateVal ?? ""),
      Day_Name: dateObj ? dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : "",
      InTime: inTime,
      OutTime: outTime,
      WorkedHours: workedHours,
      Status: workedHours >= 8 ? "Present" : workedHours >= 4 ? "Half Day" : "Absent",
    });
  }

  return rows;
}

async function loadAttendance(inputPath: string): Promise<AttendanceRow[]> {
  let rows: AttendanceRow[];
  try {
    rows = processMatrixAttendance(inputPath);
  } catch {
    try {
      rows = processLegacyAttendance(inputPath);
    } catch {
      rows = processGeneralAttendance(inputPath);
    }
  }
  return mergeLogsIntoAttendance(rows, inputPath);
}

function deriveDayNumber(dateText: string): number | null {
  const parsed = parseDateHeader(dateText);
  if (parsed) {
    return parsed.getUTCDate();
  }
  const m = /^\s*(\d{1,2})/.exec(String(dateText));
  if (!m) {
    return null;
  }
  const day = Number.parseInt(m[1], 10);
  if (day < 1 || day > 31) {
    return null;
  }
  return day;
}

function extractPeriodFromPath(filePath: string): { year: number; month: number } | null {
  const base = path.basename(filePath);
  const m = /(20\d{2})[_-](\d{1,2})/.exec(base);
  if (!m) {
    return null;
  }
  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  if (!year || !month || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function normalizeHeaderKey(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[\s._-]+/g, "");
}

function valueByHeader(record: Record<string, unknown>, keys: string[]): unknown {
  for (const [k, v] of Object.entries(record)) {
    const nk = normalizeHeaderKey(k);
    if (keys.includes(nk)) {
      return v;
    }
  }
  return "";
}

async function loadLogsForAttendance(inputPath: string) {
  const period = extractPeriodFromPath(inputPath);
  const logFiles: string[] = [];
  if (period) {
    const month = String(period.month).padStart(2, "0");
    logFiles.push(path.join(process.cwd(), "media", "uploads", `hrms_logs_${period.year}_${month}.xlsx`));
  } else {
    const uploadsDir = path.join(process.cwd(), "media", "uploads");
    try {
      const entries = await fs.readdir(uploadsDir);
      for (const name of entries) {
        if (/^hrms_logs_\d{4}_\d{2}\.xlsx$/i.test(name)) {
          logFiles.push(path.join(uploadsDir, name));
        }
      }
    } catch {
      // ignore
    }
  }

  if (logFiles.length === 0) {
    return new Map<string, string>();
  }

  const primaryLogPath = logFiles[0];
  try {
    await fs.access(primaryLogPath);
  } catch {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();
  const dateRe = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

  const workbook = readWorkbookFromDisk(primaryLogPath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return map;
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
    defval: "",
    raw: false,
    header: 1,
  });
  if (matrix.length === 0) {
    return map;
  }

  let headerRowIndex = -1;
  let dateCol = -1;
  let empCol = -1;
  let logCol = -1;

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    for (let c = 0; c < row.length; c++) {
      const v = normalizeHeaderKey(row[c]);
      if (v === "attendancedatenepali") {
        headerRowIndex = i;
      }
    }
    if (headerRowIndex !== -1) break;
  }

  if (headerRowIndex === -1) {
    return map;
  }

  const headerRow = matrix[headerRowIndex];
  for (let c = 0; c < headerRow.length; c++) {
    const v = normalizeHeaderKey(headerRow[c]);
    if (v === "attendancedatenepali") dateCol = c;
    else if (v === "emppersonalcode") empCol = c;
    else if (v === "logs") logCol = c;
  }

  if (dateCol === -1 || empCol === -1 || logCol === -1) {
    return map;
  }

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const dateValue = String(row[dateCol] ?? "").trim();
    const empRaw = row[empCol];
    const logValue = String(row[logCol] ?? "").trim();
    const empNorm = normalizeStaffId(empRaw);
    if (!dateValue || !logValue || !empNorm) continue;
    const match = dateRe.exec(dateValue);
    if (!match) continue;
    const day = Number.parseInt(match[3], 10);
    if (!day) continue;
    const key = `${empNorm}|${day}`;
    const prev = map.get(key);
    map.set(key, prev ? `${prev} | ${logValue}` : logValue);
  }

  return map;
}

async function mergeLogsIntoAttendance(rows: AttendanceRow[], inputPath: string) {
  const logMap = await loadLogsForAttendance(inputPath);
  if (logMap.size === 0) {
    return rows;
  }
  return rows.map((row) => {
    const day = deriveDayNumber(String(row.Date ?? ""));
    const empNorm = normalizeStaffId(row.Employee_ID);
    if (!day || !empNorm) {
      return row;
    }
    const log = logMap.get(`${empNorm}|${day}`) ?? "";
    return { ...row, Log: log };
  });
}

function calcLeaveTotals(records: AttendanceRow[]) {
  let presentDays = 0;
  let absentDays = 0;
  let weeklyOffDays = 0;
  let allowanceDays = 0;
  let sickLeaveDays = 0;
  let casualLeaveDays = 0;
  let personalLeaveDays = 0;
  let substituteLeaveDays = 0;
  let dutyLeaveDays = 0;
  let otherLeaveDays = 0;

  for (const row of records) {
    const status = String(row.Status ?? "").trim().toUpperCase();
    if (!status) {
      continue;
    }
    const hasWorkTime = Boolean(
      (row.InTime && String(row.InTime).trim().toLowerCase() !== "nan") ||
      (row.OutTime && String(row.OutTime).trim().toLowerCase() !== "nan"),
    );
    if (status.includes("P") || status.includes("A *")) {
      presentDays += 1;
      allowanceDays += 1;
    } else if (status === "A") {
      absentDays += 1;
    } else if (status.includes("WO") || status.includes("HO")) {
      presentDays += 1;
      weeklyOffDays += 1;
      if (hasWorkTime) {
        allowanceDays += 1;
      }
    } else if (status.includes("SL")) {
      sickLeaveDays += 1;
    } else if (status.includes("CL")) {
      casualLeaveDays += 1;
    } else if (status.includes("PL")) {
      personalLeaveDays += 1;
    } else if (status.includes("SUBSTITUTE") || status.includes("SUBL")) {
      substituteLeaveDays += 1;
    } else if (status.includes("DUTY")) {
      dutyLeaveDays += 1;
      otherLeaveDays += 1;
    } else if (status.includes("L")) {
      otherLeaveDays += 1;
    } else {
      otherLeaveDays += 1;
    }
  }

  return {
    presentDays,
    absentDays,
    weeklyOffDays,
    allowanceDays,
    sickLeaveDays,
    casualLeaveDays,
    personalLeaveDays,
    substituteLeaveDays,
    dutyLeaveDays,
    otherLeaveDays,
  };
}

async function hrmsWorkbookBuffer(inputRows: AttendanceRow[]): Promise<Buffer> {
  const rows = inputRows.map((r) => ({
    ...r,
    Employee_ID: String(r.Employee_ID ?? ""),
    Employee_Name: String(r.Employee_Name ?? ""),
    Designation: String(r.Designation ?? ""),
  }));
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("HRMS Attendance");

  let monthEnd = 31;
  const dayNums = rows.map((r) => deriveDayNumber(String(r.Date ?? ""))).filter((v): v is number => v !== null);
  if (dayNums.length > 0) {
    monthEnd = Math.max(1, Math.min(31, Math.max(...dayNums)));
  }
  const dayCols = Array.from({ length: monthEnd }, (_, i) => i + 1);
  const totalsHeaders = ["PRESENT", "ABSENT", "WO/HO", "PL", "SL", "CL", "SUBL", "DL", "OTHER_L", "ALLOW"];
  const headers = ["SN.", "Emp ID", "Name", "Post", "Time", ...dayCols.map(String), ...totalsHeaders];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  ws.views = [{ state: "frozen", xSplit: 5, ySplit: 1 }];

  const grouped = new Map<string, AttendanceRow[]>();
  for (const row of rows) {
    const key = String(row.Employee_ID ?? "");
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)?.push(row);
  }

  const employees = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  let sn = 1;
  for (const [empId, empRows] of employees) {
    const first = empRows[0] ?? {
      Employee_Name: "",
      Designation: "",
    };
    const blockTop = ws.rowCount + 1;
    const dayMap: Record<number, { InTime: string; OutTime: string; Status: string; WorkedHours: string; Log: string }> = {};

    for (const row of empRows) {
      const day = deriveDayNumber(String(row.Date ?? ""));
      if (!day) {
        continue;
      }
      const statusUpper = String(row.Status ?? "").trim().toUpperCase();
      const inVal = statusUpper === "A" ? "" : String(row.InTime ?? "");
      const outVal = statusUpper === "A" ? "" : String(row.OutTime ?? "");
      const hoursVal = statusUpper === "A" ? "" : String(row.WorkedHours ?? "");
      dayMap[day] = {
        InTime: inVal,
        OutTime: outVal,
        Status: String(row.Status ?? ""),
        WorkedHours: hoursVal,
        Log: String(row.Log ?? ""),
      };
    }

    const totals = calcLeaveTotals(empRows);
    const rowTypes: Array<{ label: string; key: "InTime" | "OutTime" | "Status" | "WorkedHours" | "Log" }> = [
      { label: "InTime", key: "InTime" },
      { label: "OutTime", key: "OutTime" },
      { label: "Status", key: "Status" },
      { label: "WorkedHour", key: "WorkedHours" },
      { label: "Log", key: "Log" },
    ];
    for (const [idx, rowType] of rowTypes.entries()) {
      const rowValues: (string | number)[] = [
        idx === 0 ? sn : "",
        idx === 0 ? empId : "",
        idx === 0 ? String(first.Employee_Name ?? "") : "",
        idx === 0 ? String(first.Designation ?? "") : "",
        rowType.label,
      ];
      for (const day of dayCols) {
        rowValues.push(dayMap[day]?.[rowType.key] ?? "");
      }
      if (rowType.key === "Status") {
        rowValues.push(
          totals.presentDays,
          totals.absentDays,
          totals.weeklyOffDays,
          totals.personalLeaveDays,
          totals.sickLeaveDays,
          totals.casualLeaveDays,
          totals.substituteLeaveDays,
          totals.dutyLeaveDays,
          totals.otherLeaveDays,
          totals.allowanceDays,
        );
      } else {
        rowValues.push("", "", "", "", "", "", "", "", "", "");
      }
      ws.addRow(rowValues);
    }

    const blockBottom = ws.rowCount;
    const logRowIndex = blockTop + rowTypes.findIndex((t) => t.key === "Log");

    for (let r = blockTop; r <= blockBottom; r += 1) {
      for (let c = 1; c <= headers.length; c += 1) {
        const cell = ws.getRow(r).getCell(c);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
        };
        if (r === logRowIndex && c >= 6 && c < 6 + monthEnd) {
          cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
        } else if (c === 3 || c === 4) {
          cell.alignment = { horizontal: "left", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      }
    }
    sn += 1;
  }

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 26;
  ws.getColumn(4).width = 22;
  ws.getColumn(5).width = 14;
  for (let i = 6; i < 6 + monthEnd; i += 1) {
    ws.getColumn(i).width = 10;
  }
  for (let i = 6 + monthEnd; i < headers.length + 1; i += 1) {
    ws.getColumn(i).width = 10;
  }

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

async function writeHrmsWorkbook(outputPath: string, rows: AttendanceRow[]): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const buf = await hrmsWorkbookBuffer(rows);
  await fs.writeFile(outputPath, buf);
}

export async function processAttendance(inputPath: string, outputPath: string) {
  try {
    await fs.access(inputPath);
    const rows = await loadAttendance(inputPath);
    await writeHrmsWorkbook(outputPath, rows);
    return {
      success: true,
      input_rows: rows.length,
      output_rows: rows.length,
      output_path: outputPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Attendance processing failed",
    };
  }
}

export async function previewAttendance(inputPath: string) {
  const rows = await loadAttendance(inputPath);
  const columns = rows.length > 0
    ? Object.keys(rows[0])
    : ["Employee_ID", "Employee_Name", "Designation", "Date", "Day_Name", "InTime", "OutTime", "Status", "WorkedHours"];
  return { columns, rows };
}

export async function leaveSummary(inputPath: string, departmentStaffIds: string[]) {
  const rows = await loadAttendance(inputPath);
  const grouped = new Map<string, AttendanceRow[]>();
  for (const row of rows) {
    const key = String(row.Employee_ID ?? "");
    if (!key) {
      continue;
    }
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)?.push(row);
  }

  const allowed = new Set(departmentStaffIds.map((s) => String(s)));
  const leaveList: LeaveSummaryRow[] = [];
  for (const [employeeId, employeeRows] of grouped.entries()) {
    if (allowed.size > 0 && !allowed.has(employeeId)) {
      continue;
    }
    const first = employeeRows[0];
    const totals = calcLeaveTotals(employeeRows);
    leaveList.push({
      employee_id: employeeId,
      employee_name: String(first?.Employee_Name ?? "Unknown"),
      designation: String(first?.Designation ?? "Unknown"),
      present_days: totals.presentDays,
      absent_days: totals.absentDays,
      weekly_off_days: totals.weeklyOffDays,
      allowance_days: totals.allowanceDays,
      sick_leave_days: totals.sickLeaveDays,
      casual_leave_days: totals.casualLeaveDays,
      personal_leave_days: totals.personalLeaveDays,
      substitute_leave_days: totals.substituteLeaveDays,
      duty_leave_days: totals.dutyLeaveDays,
      other_leave_days: totals.otherLeaveDays,
    });
  }
  return { leave_list: leaveList };
}

async function sectionMap(departmentId?: string) {
  const rows = await prisma.staffDetail.findMany({
    where: {
      ...(departmentId ? { departmentId: Number(departmentId) } : {}),
      sectionId: { not: null },
    },
    select: {
      staffid: true,
      typeOfEmployment: true,
      priority: true,
      section: { select: { name: true } },
    },
  });
  const out = new Map<string, { section: string; typeOfEmployment: string; priority: number }>();
  for (const row of rows) {
    const norm = normalizeStaffId(row.staffid);
    if (!norm) {
      continue;
    }
    out.set(norm, {
      section: row.section?.name ?? "Unknown Section",
      typeOfEmployment: row.typeOfEmployment,
      priority: row.priority ?? 999,
    });
  }
  return out;
}

export async function segregationReport(inputPath: string, outputPath: string, departmentId?: string) {
  const rows = await loadAttendance(inputPath);
  if (rows.length === 0) {
    throw new Error("No attendance data found");
  }
  const staff = await sectionMap(departmentId);
  const sectionRows = new Map<string, AttendanceRow[]>();
  for (const row of rows) {
    const normalized = normalizeStaffId(row.Employee_ID);
    const section = normalized ? (staff.get(normalized)?.section ?? "Unknown Section") : "Unknown Section";
    if (!sectionRows.has(section)) {
      sectionRows.set(section, []);
    }
    sectionRows.get(section)?.push(row);
  }

  const zip = new JSZip();
  for (const [section, sectionData] of sectionRows.entries()) {
    if (sectionData.length === 0) {
      continue;
    }
    const buf = await hrmsWorkbookBuffer(sectionData);
    const clean = section.replace(/[^a-zA-Z0-9 _-]/g, "");
    zip.file(`${clean}_Attendance_Report.xlsx`, buf);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(outputPath, archive);
  return { success: true, output: outputPath };
}

async function getTemplateStaff(staffType: "detailed" | "monthly", departmentId?: string): Promise<StaffMeta[]> {
  const where = staffType === "detailed"
    ? {
      typeOfEmployment: { in: ["permanent", "contract"] },
      ...(departmentId ? { departmentId: Number(departmentId) } : {}),
      sectionId: { not: null },
    }
    : {
      typeOfEmployment: "monthly wages",
      ...(departmentId ? { departmentId: Number(departmentId) } : {}),
      sectionId: { not: null },
    };
  const rows = await prisma.staffDetail.findMany({
    where,
    orderBy: [{ priority: "asc" }, { staffid: "asc" }],
    select: {
      staffid: true,
      name: true,
      designation: true,
      level: true,
      weeklyOff: true,
      typeOfEmployment: true,
      priority: true,
    },
  });
  return rows;
}

async function fillTemplate(inputPath: string, outputPath: string, templatePath: string, staffType: "detailed" | "monthly", departmentId?: string) {
  const attendance = await loadAttendance(inputPath);
  const staffRows = await getTemplateStaff(staffType, departmentId);

  const attendanceIds = new Map<string, string>();
  for (const row of attendance) {
    const norm = normalizeStaffId(row.Employee_ID);
    if (norm) {
      attendanceIds.set(norm, row.Employee_ID);
    }
  }

  const targetStaff = staffRows
    .map((staff) => {
      const normalized = normalizeStaffId(staff.staffid);
      if (!normalized) {
        return null;
      }
      const matchedEmpId = attendanceIds.get(normalized);
      if (!matchedEmpId) {
        return null;
      }
      return { staff, empId: matchedEmpId };
    })
    .filter((v): v is { staff: StaffMeta; empId: string } => v !== null);

  await fs.access(templatePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const ws = workbook.getWorksheet("Template Sheet") ?? workbook.worksheets[0];
  if (!ws) {
    throw new Error("Template worksheet not found");
  }

  const styleTemplateRowNumber = 4;
  const styleTemplateRow = ws.getRow(styleTemplateRowNumber);
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const applyTemplateStyleToRow = (rowNumber: number) => {
    const targetRow = ws.getRow(rowNumber);
    targetRow.height = styleTemplateRow.height;
    for (let col = 1; col <= ws.columnCount; col += 1) {
      const sourceCell = styleTemplateRow.getCell(col);
      const targetCell = targetRow.getCell(col);
      if (sourceCell.style && Object.keys(sourceCell.style).length > 0) {
        targetCell.style = clone(sourceCell.style);
      }
    }
  };

  let rowIndex = 4;
  for (const { staff, empId } of targetStaff) {
    const empRows = attendance.filter((r) => String(r.Employee_ID) === String(empId));
    const totals = calcLeaveTotals(empRows);
    applyTemplateStyleToRow(rowIndex);
    ws.getCell(`B${rowIndex}`).value = String(staff.name ?? "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    ws.getCell(`C${rowIndex}`).value = staff.staffid;
    ws.getCell(`D${rowIndex}`).value = staff.designation;
    ws.getCell(`E${rowIndex}`).value = staff.level;
    ws.getCell(`F${rowIndex}`).value = totals.presentDays;
    ws.getCell(`G${rowIndex}`).value = totals.personalLeaveDays;
    ws.getCell(`H${rowIndex}`).value = totals.sickLeaveDays;
    ws.getCell(`I${rowIndex}`).value = totals.casualLeaveDays;
    ws.getCell(`J${rowIndex}`).value = totals.substituteLeaveDays;
    ws.getCell(`L${rowIndex}`).value = totals.absentDays;
    ws.getCell(`M${rowIndex}`).value = totals.otherLeaveDays;
    ws.getCell(`N${rowIndex}`).value = totals.allowanceDays;
    ws.getCell(`R${rowIndex}`).value = staff.weeklyOff
      ? String(staff.weeklyOff).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      : "";
    rowIndex += 1;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const outputBytes = await workbook.xlsx.writeBuffer();
  await fs.writeFile(outputPath, Buffer.from(outputBytes));
}

export async function detailedReport(inputPath: string, outputPath: string, templatePath: string, departmentId?: string) {
  await fillTemplate(inputPath, outputPath, templatePath, "detailed", departmentId);
  return { success: true, output: outputPath };
}

export async function monthlyReport(inputPath: string, outputPath: string, templatePath: string, departmentId?: string) {
  await fillTemplate(inputPath, outputPath, templatePath, "monthly", departmentId);
  return { success: true, output: outputPath };
}
