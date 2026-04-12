import { readFile } from "node:fs/promises";

const REQUIRED_ROUTES = ["/api/files/logs", "/api/files/[id]/logs"];
const manifestPath = ".next/app-path-routes-manifest.json";

async function run() {
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const knownRoutes = new Set(Object.values(manifest));

  for (const route of REQUIRED_ROUTES) {
    if (!knownRoutes.has(route)) {
      throw new Error(`Missing route in build manifest: ${route}`);
    }
    console.log(`Smoke check OK: ${route}`);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Smoke test failed: ${message}`);
  process.exit(1);
});
