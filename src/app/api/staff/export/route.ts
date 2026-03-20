import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireApiUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { staffScopedWhere } from "@/server/authorization/permissions";

export async function GET(req: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope")?.trim() ?? "filtered";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const employeeName = url.searchParams.get("employeeName")?.trim() ?? "";
  const staffId = url.searchParams.get("staffId")?.trim() ?? "";
  const designation = url.searchParams.get("designation")?.trim() ?? "";
  const sectionId = url.searchParams.get("sectionId")?.trim() ?? "";

  const baseWhere = staffScopedWhere(user);
  const filters: Array<Record<string, unknown>> = [baseWhere];

  if (scope !== "all") {
    if (q) {
      filters.push({
        OR: [
          { staffid: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { designation: { contains: q, mode: "insensitive" } },
          { section: { name: { contains: q, mode: "insensitive" } } },
        ],
      });
    }
    if (employeeName) {
      filters.push({ name: { contains: employeeName, mode: "insensitive" } });
    }
    if (staffId) {
      filters.push({ staffid: { contains: staffId, mode: "insensitive" } });
    }
    if (designation) {
      filters.push({ designation: { contains: designation, mode: "insensitive" } });
    }
    if (sectionId) {
      const parsed = Number.parseInt(sectionId, 10);
      if (Number.isFinite(parsed)) {
        filters.push({ sectionId: parsed });
      }
    }
  }

  const rows = await prisma.staffDetail.findMany({
    where: { AND: filters },
    include: { section: true, department: true },
    orderBy: { staffid: "asc" },
  });

  const exportRows = rows.map((row) => ({
    StaffID: row.staffid,
    Name: row.name,
    Section: row.section?.name ?? "",
    Designation: row.designation ?? "",
    EmploymentType: row.typeOfEmployment,
    WeeklyOff: row.weeklyOff,
    Level: row.level,
    Priority: row.priority,
    Status: row.sectionId ? "Active" : "Inactive",
    Department: row.department?.name ?? "",
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Staff");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const fileName = scope === "all" ? "staff_all.xlsx" : "staff_filtered.xlsx";

  return new NextResponse(Buffer.from(output), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
