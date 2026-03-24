import { prisma } from "@/server/db/prisma";

let ensureTablePromise: Promise<void> | null = null;

function isMissingAppSettingsTableError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021";
}

async function ensureAppSettingsTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).then(() => undefined);
  }
  await ensureTablePromise;
}

export async function getAppSetting(key: string): Promise<string | null> {
  await ensureAppSettingsTable();
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch (error) {
    if (!isMissingAppSettingsTableError(error)) throw error;
    await ensureAppSettingsTable();
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await ensureAppSettingsTable();
  try {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  } catch (error) {
    if (!isMissingAppSettingsTableError(error)) throw error;
    await ensureAppSettingsTable();
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}

export async function getAppSettings(keys: string[]): Promise<Record<string, string | null>> {
  if (keys.length === 0) return {};
  await ensureAppSettingsTable();
  let rows;
  try {
    rows = await prisma.appSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
  } catch (error) {
    if (!isMissingAppSettingsTableError(error)) throw error;
    await ensureAppSettingsTable();
    rows = await prisma.appSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, string | null> = {};
  for (const key of keys) {
    out[key] = map.get(key) ?? null;
  }
  return out;
}
