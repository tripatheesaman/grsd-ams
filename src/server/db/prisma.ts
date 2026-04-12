import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;
// Important: do not throw at import-time during `next build` inside Docker.
// Docker builds often don't have DATABASE_URL available (env is injected at runtime).
// Prisma will require DATABASE_URL only when a query is executed.
const fallbackConnectionString =
  "postgresql://postgres:postgres@localhost:5432/admin_db?schema=public";

const adapterConnectionString = connectionString || fallbackConnectionString;
const adapter = new PrismaPg(new Pool({ connectionString: adapterConnectionString }));
export const prisma = global.prismaGlobal ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

