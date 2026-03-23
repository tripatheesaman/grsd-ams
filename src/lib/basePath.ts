const envBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const normalizedEnvBasePath =
  envBasePath && envBasePath !== "/" ? envBasePath.replace(/\/+$/, "") : "";
const defaultBasePath = "/ams";
const serverBasePath =
  normalizedEnvBasePath || defaultBasePath;

export const basePath = serverBasePath;

export function getBasePath() {
  if (typeof window === "undefined") return serverBasePath;
  if (normalizedEnvBasePath) return normalizedEnvBasePath;
  const pathname = window.location.pathname || "";
  if (pathname === "/ams" || pathname.startsWith("/ams/")) return "/ams";
  return serverBasePath;
}

export function withBasePath(path: string) {
  const resolvedBasePath = getBasePath();
  if (!resolvedBasePath) return path.startsWith("/") ? path : `/${path}`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    normalized === resolvedBasePath ||
    normalized.startsWith(`${resolvedBasePath}/`)
  ) {
    return normalized;
  }
  return `${resolvedBasePath}${normalized}`;
}

