import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { departmentScopedWhere } from "@/server/authorization/permissions";
import { absoluteFromMedia } from "@/server/storage/files";
import { leaveSummary } from "@/server/imports/attendance";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.processedFile.findFirst({ where: { AND: [{ id: Number(id) }, departmentScopedWhere(user)] } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  let staffIds: string[] = [];
  if (!user.isSuperuser && user.departmentId) {
    const staff = await prisma.staffDetail.findMany({
      where: { departmentId: user.departmentId, sectionId: { not: null } },
      select: { staffid: true },
    });
    staffIds = staff.map((s) => s.staffid);
  }

  const inputPath = absoluteFromMedia(file.originalFile);
  const payload = await leaveSummary(inputPath, staffIds);

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

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const pageSize = 25;

  let rows = payload.leave_list ?? [];
  if (q) {
    rows = rows.filter((row: Record<string, unknown>) =>
      ["employee_id", "employee_name", "designation"].some((k) => String(row[k] ?? "").toLowerCase().includes(q)),
    );
  }
  rows.sort((a, b) => {
    const aMeta = staffMeta.get(normalizeStaffId(a.employee_id));
    const bMeta = staffMeta.get(normalizeStaffId(b.employee_id));
    const aPriority = aMeta?.priority ?? 999;
    const bPriority = bMeta?.priority ?? 999;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return compareStaffIdNumericAsc(String(aMeta?.staffid ?? a.employee_id ?? ""), String(bMeta?.staffid ?? b.employee_id ?? ""));
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;

  return NextResponse.json({ rows: rows.slice(start, start + pageSize), total, page, pageSize });
}
