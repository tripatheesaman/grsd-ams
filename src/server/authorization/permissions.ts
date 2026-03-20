import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/server/types";

export function departmentScopedWhere(user: SessionUser): Prisma.ProcessedFileWhereInput {
  if (user.isSuperuser) {
    return {};
  }
  if (!user.departmentId) {
    return { id: -1 };
  }
  return { user: { departmentId: user.departmentId } };
}

export function staffScopedWhere(user: SessionUser): Prisma.StaffDetailWhereInput {
  if (user.isSuperuser) {
    return {};
  }
  if (!user.departmentId) {
    return { id: -1 };
  }
  return { departmentId: user.departmentId };
}

export function sectionScopedWhere(user: SessionUser): Prisma.SectionWhereInput {
  if (user.isSuperuser) {
    return {};
  }
  if (!user.departmentId) {
    return { id: -1 };
  }
  return { departmentId: user.departmentId };
}

