import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth";
import { prisma } from "@/server/prisma";
import { staffScopedWhere } from "@/server/permissions";
import { mutationOriginError } from "@/server/security";

const weeklyOffSchema = z.enum(["sun", "mon", "tue", "wed", "thurs", "fri", "sat"]);
const employmentSchema = z.enum(["permanent", "contract", "monthly wages"]);

const upsertSimpleSchema = z.object({
  action: z.literal("upsertSimple"),
  sectionId: z.string().min(1),
  designation: z.string().optional().default(""),
  weeklyOff: weeklyOffSchema.default("sun"),
  level: z.coerce.number().int().min(1).max(10).default(1),
  typeOfEmployment: employmentSchema.default("permanent"),
  priority: z.coerce.number().int().min(0).default(1),
  rows: z.array(
    z.object({
      staffid: z.string().min(1),
      name: z.string().min(1),
    }),
  ).min(1),
});

const bulkUpdateSchema = z.object({
  action: z.literal("updateByStaffIds"),
  staffIds: z.array(z.string().min(1)).min(1),
  updates: z.object({
    sectionId: z.string().min(1).optional(),
    designation: z.string().optional(),
    weeklyOff: weeklyOffSchema.optional(),
    level: z.coerce.number().int().min(1).max(10).optional(),
    typeOfEmployment: employmentSchema.optional(),
    priority: z.coerce.number().int().min(0).optional(),
    deactivate: z.boolean().optional().default(false),
  }),
});

const bulkAddSmartSchema = z.object({
  action: z.literal("bulkAddSmart"),
  sameSection: z.boolean(),
  sameEmployment: z.boolean(),
  sameLevel: z.boolean(),
  sameDesignation: z.boolean(),
  shared: z.object({
    section: z.string().optional().default(""),
    typeOfEmployment: z.string().optional().default(""),
    level: z.coerce.number().int().min(1).max(10).optional(),
    designation: z.string().optional().default(""),
  }),
  rows: z.array(
    z.object({
      name: z.string().min(1),
      staffid: z.string().min(1),
      priority: z.coerce.number().int().min(0).optional(),
      section: z.string().optional().default(""),
      typeOfEmployment: z.string().optional().default(""),
      level: z.coerce.number().int().min(1).max(10).optional(),
      designation: z.string().optional().default(""),
    }),
  ).min(1),
});

const transferSectionSchema = z.object({
  action: z.literal("transferBySection"),
  fromSectionId: z.string().min(1),
  toSectionId: z.string().min(1),
  typeOfEmployment: employmentSchema.optional(),
});

const updateByFilterSchema = z.object({
  action: z.literal("updateByFilter"),
  filters: z.object({
    sectionId: z.string().min(1).optional(),
    typeOfEmployment: employmentSchema.optional(),
    isActive: z.boolean().optional(),
  }),
  updates: z.object({
    sectionId: z.string().min(1).optional(),
    designation: z.string().optional(),
    weeklyOff: weeklyOffSchema.optional(),
    level: z.coerce.number().int().min(1).max(10).optional(),
    typeOfEmployment: employmentSchema.optional(),
    priority: z.coerce.number().int().min(0).optional(),
    deactivate: z.boolean().optional().default(false),
  }),
});

const commitBulkEditsSchema = z.object({
  action: z.literal("commitBulkEdits"),
  rows: z.array(
    z.object({
      id: z.coerce.number().int().positive(),
      staffid: z.string().min(1),
      name: z.string().min(1),
      sectionId: z.string().optional().default(""),
      designation: z.string().optional().default(""),
      weeklyOff: weeklyOffSchema,
      level: z.coerce.number().int().min(1).max(10),
      typeOfEmployment: employmentSchema,
      priority: z.coerce.number().int().min(0),
      isActive: z.boolean().default(true),
    }),
  ).min(1),
});

function uniqueRows(rows: Array<{ staffid: string; name: string }>) {
  const out = new Map<string, { staffid: string; name: string }>();
  for (const row of rows) {
    const id = row.staffid.trim();
    const name = row.name.trim();
    if (!id || !name) continue;
    out.set(id.toLowerCase(), { staffid: id, name });
  }
  return [...out.values()];
}

function normalizeEmploymentType(value: string) {
  const raw = value.trim().toLowerCase();
  if (raw === "permanent") return "permanent" as const;
  if (raw === "contract") return "contract" as const;
  if (raw === "monthly wages" || raw === "monthlywages" || raw === "monthly") return "monthly wages" as const;
  return null;
}

function defaultPriorityByEmployment(type: "permanent" | "contract" | "monthly wages") {
  if (type === "permanent") return 50;
  if (type === "contract") return 100;
  return 500;
}

export async function POST(req: Request) {
  const originError = mutationOriginError(req);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });

  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const action = String((payload as { action?: string }).action ?? "");

  if (action === "bulkAddSmart") {
    const parsed = bulkAddSmartSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    const rows = parsed.data.rows;
    const sameSection = parsed.data.sameSection;
    const sameEmployment = parsed.data.sameEmployment;
    const sameLevel = parsed.data.sameLevel;
    const sameDesignation = parsed.data.sameDesignation;

    const sectionLookup = await prisma.section.findMany({
      where: user.isSuperuser
        ? { isActive: true }
        : user.departmentId
          ? { departmentId: user.departmentId, isActive: true }
          : { id: -1 },
      select: { id: true, name: true, code: true, departmentId: true },
    });
    const sectionMap = new Map<string, { id: number; departmentId: number }>();
    for (const section of sectionLookup) {
      sectionMap.set(section.name.trim().toLowerCase(), { id: section.id, departmentId: section.departmentId });
      sectionMap.set(section.code.trim().toLowerCase(), { id: section.id, departmentId: section.departmentId });
      sectionMap.set(String(section.id), { id: section.id, departmentId: section.departmentId });
    }

    const details: string[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const sectionValue = (sameSection ? parsed.data.shared.section : row.section).trim();
      const employmentRaw = sameEmployment ? parsed.data.shared.typeOfEmployment : row.typeOfEmployment;
      const employment = normalizeEmploymentType(employmentRaw);
      const level = sameLevel ? parsed.data.shared.level : row.level;
      if (!sectionValue) details.push(`Row ${i + 1}: section is required`);
      if (sectionValue && !sectionMap.has(sectionValue.toLowerCase())) details.push(`Row ${i + 1}: unknown section '${sectionValue}'`);
      if (!employment) details.push(`Row ${i + 1}: invalid employment type`);
      if (!level) details.push(`Row ${i + 1}: level is required`);
    }
    if (details.length > 0) {
      return NextResponse.json({ error: "Validation failed", details: details.slice(0, 25) }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let blocked = 0;
    const seenIds = new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const staffid = row.staffid.trim();
        const name = row.name.trim();
        const key = staffid.toLowerCase();
        if (!staffid || !name || seenIds.has(key)) {
          continue;
        }
        seenIds.add(key);

        const sectionValue = (sameSection ? parsed.data.shared.section : row.section).trim();
        const section = sectionMap.get(sectionValue.toLowerCase());
        if (!section) {
          continue;
        }
        const employmentRaw = sameEmployment ? parsed.data.shared.typeOfEmployment : row.typeOfEmployment;
        const typeOfEmployment = normalizeEmploymentType(employmentRaw);
        if (!typeOfEmployment) {
          continue;
        }
        const level = sameLevel ? parsed.data.shared.level : row.level;
        if (!level) {
          continue;
        }
        const designation = (sameDesignation ? parsed.data.shared.designation : row.designation).trim();
        const priority = row.priority ?? defaultPriorityByEmployment(typeOfEmployment);

        const existing = await tx.staffDetail.findUnique({ where: { staffid } });
        if (existing) {
          if (!user.isSuperuser && existing.departmentId && existing.departmentId !== user.departmentId) {
            blocked += 1;
            continue;
          }
          await tx.staffDetail.update({
            where: { id: existing.id },
            data: {
              name,
              sectionId: section.id,
              departmentId: section.departmentId,
              designation,
              level,
              typeOfEmployment,
              priority,
            },
          });
          updated += 1;
        } else {
          await tx.staffDetail.create({
            data: {
              staffid,
              name,
              sectionId: section.id,
              departmentId: section.departmentId,
              designation,
              level,
              typeOfEmployment,
              priority,
            },
          });
          created += 1;
        }
      }
    });

    return NextResponse.json({
      success: true,
      summary: {
        received: seenIds.size,
        created,
        updated,
        blocked,
      },
    });
  }

  if (action === "upsertSimple") {
    const parsed = upsertSimpleSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    const section = await prisma.section.findUnique({ where: { id: Number(parsed.data.sectionId) } });
    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
    if (!user.isSuperuser && section.departmentId !== user.departmentId) {
      return NextResponse.json({ error: "Section is outside your department" }, { status: 403 });
    }

    const rows = uniqueRows(parsed.data.rows);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows to process" }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let blocked = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const existing = await tx.staffDetail.findUnique({ where: { staffid: row.staffid } });
        if (existing) {
          if (!user.isSuperuser && existing.departmentId && existing.departmentId !== user.departmentId) {
            blocked += 1;
            continue;
          }
          await tx.staffDetail.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              sectionId: section.id,
              departmentId: section.departmentId,
              designation: parsed.data.designation,
              weeklyOff: parsed.data.weeklyOff,
              level: parsed.data.level,
              typeOfEmployment: parsed.data.typeOfEmployment,
              priority: parsed.data.priority,
            },
          });
          updated += 1;
        } else {
          await tx.staffDetail.create({
            data: {
              staffid: row.staffid,
              name: row.name,
              sectionId: section.id,
              departmentId: section.departmentId,
              designation: parsed.data.designation,
              weeklyOff: parsed.data.weeklyOff,
              level: parsed.data.level,
              typeOfEmployment: parsed.data.typeOfEmployment,
              priority: parsed.data.priority,
            },
          });
          created += 1;
        }
      }
    });

    return NextResponse.json({
      success: true,
      summary: {
        received: rows.length,
        created,
        updated,
        blocked,
      },
    });
  }

  if (action === "updateByStaffIds") {
    const parsed = bulkUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    if (parsed.data.updates.deactivate && parsed.data.updates.sectionId) {
      return NextResponse.json({ error: "Cannot set section and deactivate together" }, { status: 400 });
    }

    const ids = [...new Set(parsed.data.staffIds.map((s) => s.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return NextResponse.json({ error: "No staff IDs provided" }, { status: 400 });
    }

    const targets = await prisma.staffDetail.findMany({
      where: {
        AND: [
          staffScopedWhere(user),
          { staffid: { in: ids } },
        ],
      },
      select: { id: true, staffid: true },
    });

    if (targets.length === 0) {
      return NextResponse.json({ error: "No matching staff found in your scope" }, { status: 404 });
    }

    let sectionDepartmentId: number | undefined;
    let sectionIdNumber: number | undefined;
    if (parsed.data.updates.sectionId) {
      const section = await prisma.section.findUnique({ where: { id: Number(parsed.data.updates.sectionId) } });
      if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
      if (!user.isSuperuser && section.departmentId !== user.departmentId) {
        return NextResponse.json({ error: "Section is outside your department" }, { status: 403 });
      }
      sectionIdNumber = section.id;
      sectionDepartmentId = section.departmentId;
    }

    const data: {
      sectionId?: number | null;
      departmentId?: number;
      designation?: string;
      weeklyOff?: "sun" | "mon" | "tue" | "wed" | "thurs" | "fri" | "sat";
      level?: number;
      typeOfEmployment?: "permanent" | "contract" | "monthly wages";
      priority?: number;
    } = {};

    if (parsed.data.updates.deactivate) {
      data.sectionId = null;
    }
    if (typeof sectionIdNumber === "number") {
      data.sectionId = sectionIdNumber;
      data.departmentId = sectionDepartmentId;
    }
    if (parsed.data.updates.designation !== undefined) data.designation = parsed.data.updates.designation;
    if (parsed.data.updates.weeklyOff !== undefined) data.weeklyOff = parsed.data.updates.weeklyOff;
    if (parsed.data.updates.level !== undefined) data.level = parsed.data.updates.level;
    if (parsed.data.updates.typeOfEmployment !== undefined) data.typeOfEmployment = parsed.data.updates.typeOfEmployment;
    if (parsed.data.updates.priority !== undefined) data.priority = parsed.data.updates.priority;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates selected" }, { status: 400 });
    }

    const targetIds = targets.map((t) => t.id);
    const missing = ids.filter((id) => !targets.some((t) => t.staffid === id));

    const result = await prisma.staffDetail.updateMany({
      where: { id: { in: targetIds } },
      data,
    });

    return NextResponse.json({
      success: true,
      summary: {
        requested: ids.length,
        updated: result.count,
        missing,
      },
    });
  }

  if (action === "transferBySection") {
    const parsed = transferSectionSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    if (parsed.data.fromSectionId === parsed.data.toSectionId) {
      return NextResponse.json({ error: "Source and destination section cannot be same" }, { status: 400 });
    }

    const fromSection = await prisma.section.findUnique({ where: { id: Number(parsed.data.fromSectionId) } });
    const toSection = await prisma.section.findUnique({ where: { id: Number(parsed.data.toSectionId) } });
    if (!fromSection || !toSection) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }
    if (!user.isSuperuser && (fromSection.departmentId !== user.departmentId || toSection.departmentId !== user.departmentId)) {
      return NextResponse.json({ error: "Section is outside your department" }, { status: 403 });
    }

    const result = await prisma.staffDetail.updateMany({
      where: {
        departmentId: toSection.departmentId,
        sectionId: fromSection.id,
        ...(parsed.data.typeOfEmployment ? { typeOfEmployment: parsed.data.typeOfEmployment } : {}),
      },
      data: {
        sectionId: toSection.id,
        departmentId: toSection.departmentId,
      },
    });

    return NextResponse.json({
      success: true,
      summary: {
        moved: result.count,
      },
    });
  }

  if (action === "updateByFilter") {
    const parsed = updateByFilterSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    if (parsed.data.updates.deactivate && parsed.data.updates.sectionId) {
      return NextResponse.json({ error: "Cannot set section and deactivate together" }, { status: 400 });
    }

    const filterData = parsed.data.filters;
    if (!filterData.sectionId && !filterData.typeOfEmployment && typeof filterData.isActive !== "boolean") {
      return NextResponse.json({ error: "Select at least one filter" }, { status: 400 });
    }

    let sectionDepartmentId: number | undefined;
    let sectionIdNumber: number | undefined;
    if (parsed.data.updates.sectionId) {
      const section = await prisma.section.findUnique({ where: { id: Number(parsed.data.updates.sectionId) } });
      if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
      if (!user.isSuperuser && section.departmentId !== user.departmentId) {
        return NextResponse.json({ error: "Section is outside your department" }, { status: 403 });
      }
      sectionIdNumber = section.id;
      sectionDepartmentId = section.departmentId;
    }

    const where: {
      AND: Array<Record<string, unknown>>;
    } = { AND: [staffScopedWhere(user)] };

    if (filterData.sectionId) {
      const section = await prisma.section.findUnique({ where: { id: Number(filterData.sectionId) } });
      if (!section) return NextResponse.json({ error: "Filter section not found" }, { status: 404 });
      if (!user.isSuperuser && section.departmentId !== user.departmentId) {
        return NextResponse.json({ error: "Filter section is outside your department" }, { status: 403 });
      }
      where.AND.push({ sectionId: section.id });
    }
    if (filterData.typeOfEmployment) {
      where.AND.push({ typeOfEmployment: filterData.typeOfEmployment });
    }
    if (typeof filterData.isActive === "boolean") {
      where.AND.push(filterData.isActive ? { sectionId: { not: null } } : { sectionId: null });
    }

    const data: {
      sectionId?: number | null;
      departmentId?: number;
      designation?: string;
      weeklyOff?: "sun" | "mon" | "tue" | "wed" | "thurs" | "fri" | "sat";
      level?: number;
      typeOfEmployment?: "permanent" | "contract" | "monthly wages";
      priority?: number;
    } = {};

    if (parsed.data.updates.deactivate) {
      data.sectionId = null;
    }
    if (typeof sectionIdNumber === "number") {
      data.sectionId = sectionIdNumber;
      data.departmentId = sectionDepartmentId;
    }
    if (parsed.data.updates.designation !== undefined) data.designation = parsed.data.updates.designation;
    if (parsed.data.updates.weeklyOff !== undefined) data.weeklyOff = parsed.data.updates.weeklyOff;
    if (parsed.data.updates.level !== undefined) data.level = parsed.data.updates.level;
    if (parsed.data.updates.typeOfEmployment !== undefined) data.typeOfEmployment = parsed.data.updates.typeOfEmployment;
    if (parsed.data.updates.priority !== undefined) data.priority = parsed.data.updates.priority;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updates selected" }, { status: 400 });
    }

    const result = await prisma.staffDetail.updateMany({
      where,
      data,
    });

    return NextResponse.json({
      success: true,
      summary: {
        updated: result.count,
      },
    });
  }

  if (action === "commitBulkEdits") {
    const parsed = commitBulkEditsSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    const rows = parsed.data.rows;
    const ids = rows.map((r) => r.id);
    const existingRows = await prisma.staffDetail.findMany({
      where: {
        AND: [
          staffScopedWhere(user),
          { id: { in: ids } },
        ],
      },
      select: { id: true, departmentId: true },
    });
    const existingIdSet = new Set(existingRows.map((r) => r.id));
    if (existingIdSet.size !== ids.length) {
      return NextResponse.json({ error: "One or more staff records are missing or out of scope" }, { status: 404 });
    }

    const requiredSectionIds = [...new Set(rows.filter((r) => r.isActive).map((r) => Number.parseInt(r.sectionId || "", 10)).filter(Number.isFinite))];
    const sectionRows = requiredSectionIds.length > 0
      ? await prisma.section.findMany({ where: { id: { in: requiredSectionIds } }, select: { id: true, departmentId: true } })
      : [];
    const sectionMap = new Map(sectionRows.map((s) => [s.id, s]));

    for (const row of rows) {
      if (row.isActive) {
        const sectionId = Number.parseInt(row.sectionId || "", 10);
        if (!Number.isFinite(sectionId)) {
          return NextResponse.json({ error: `Section is required for active staff (${row.staffid})` }, { status: 400 });
        }
        const section = sectionMap.get(sectionId);
        if (!section) {
          return NextResponse.json({ error: `Section not found for ${row.staffid}` }, { status: 404 });
        }
        if (!user.isSuperuser && section.departmentId !== user.departmentId) {
          return NextResponse.json({ error: `Section is outside your department for ${row.staffid}` }, { status: 403 });
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (!row.isActive) {
          await tx.staffDetail.update({
            where: { id: row.id },
            data: {
              staffid: row.staffid,
              name: row.name,
              sectionId: null,
              designation: row.designation,
              weeklyOff: row.weeklyOff,
              level: row.level,
              typeOfEmployment: row.typeOfEmployment,
              priority: row.priority,
            },
          });
          continue;
        }

        const sectionId = Number.parseInt(row.sectionId, 10);
        const section = sectionMap.get(sectionId);
        if (!section) {
          continue;
        }
        await tx.staffDetail.update({
          where: { id: row.id },
          data: {
            staffid: row.staffid,
            name: row.name,
            sectionId,
            departmentId: section.departmentId,
            designation: row.designation,
            weeklyOff: row.weeklyOff,
            level: row.level,
            typeOfEmployment: row.typeOfEmployment,
            priority: row.priority,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      summary: {
        updated: rows.length,
      },
    });
  }

  return NextResponse.json({ error: "Unknown bulk action" }, { status: 400 });
}
