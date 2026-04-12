import { prisma } from "@/server/db/prisma";

let ensurePromise: Promise<void> | null = null;
const isNextBuildPhase = (process.env.NEXT_PHASE ?? "").toLowerCase().includes("build");

export async function ensureRuntimeSchemaCompatibility() {
  if (isNextBuildPhase) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public.app_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE public.sections
        ADD COLUMN IF NOT EXISTS email VARCHAR(254);
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE public.users
        ADD COLUMN IF NOT EXISTS is_department_admin BOOLEAN NOT NULL DEFAULT FALSE;
      `);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}
