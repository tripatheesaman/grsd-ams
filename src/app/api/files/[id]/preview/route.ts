import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { absoluteFromMedia } from "@/server/storage/files";
import { previewAttendance } from "@/server/imports/attendance";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({ where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const pageSize = 25;

  const inputPath = absoluteFromMedia(file.originalFile);
  const payload = await previewAttendance(inputPath);

  const normalizeStaffId = (value: unknown) => {
    if (value === null || value === undefined || String(value).trim() === "") return "";
    const staffIdStr = String(value).trim().toUpperCase();
    if (staffIdStr.startsWith("MW")) {
      const m = /^(MW)[-\s]?0*(\d+)$/.exec(staffIdStr);
      return m ? `${m[1]}-${Number.parseInt(m[2], 10)}` : staffIdStr;
    }
    const normalized = staffIdStr.replace(/[^A-Z0-9]/g, "");
    let m = /^([A-Z]+)(\d+)$/.exec(normalized);
    if (m) return `${m[1]}${Number.parseInt(m[2], 10)}`;
    if (/^\d+$/.test(normalized)) return String(Number.parseInt(normalized, 10));
    if (/^\d+[A-Z]+$/.test(normalized)) return normalized;
    m = /^([A-Z]+)(\d+)([A-Z]*)$/.exec(normalized);
    if (m) return `${m[1]}${Number.parseInt(m[2], 10)}${m[3]}`;
    return normalized;
  };
  const staffIdNumericValue = (staffId: string) => {
    const m = /(\d+)/.exec(staffId);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  };
  const compareStaffIdNumericAsc = (a: string, b: string) => {
    const aNum = staffIdNumericValue(a);
    const bNum = staffIdNumericValue(b);
    if (aNum !== null && bNum !== null && aNum !== bNum) return aNum - bNum;
    if (aNum !== null && bNum === null) return -1;
    if (aNum === null && bNum !== null) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  };

  const staffScope = !user.isSuperuser && user.departmentId ? { departmentId: user.departmentId } : {};
  const staffRows = await prisma.staffDetail.findMany({
    where: { ...staffScope, sectionId: { not: null } },
    select: { staffid: true, priority: true },
  });
  const staffMeta = new Map(
    staffRows.map((s) => [normalizeStaffId(s.staffid), { staffid: s.staffid, priority: s.priority ?? 999 }]),
  );

  let rows: Record<string, unknown>[] = payload.rows ?? [];
  if (q) {
    rows = rows.filter((row) => Object.values(row).some((v) => String(v).toLowerCase().includes(q)));
  }
  rows.sort((a, b) => {
    const aMeta = staffMeta.get(normalizeStaffId(a.Employee_ID));
    const bMeta = staffMeta.get(normalizeStaffId(b.Employee_ID));
    const aPriority = aMeta?.priority ?? 999;
    const bPriority = bMeta?.priority ?? 999;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return compareStaffIdNumericAsc(String(aMeta?.staffid ?? a.Employee_ID ?? ""), String(bMeta?.staffid ?? b.Employee_ID ?? ""));
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return NextResponse.json({ columns: payload.columns ?? [], rows: pageRows, total, page, pageSize });
}
