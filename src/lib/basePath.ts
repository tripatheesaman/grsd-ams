const envBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const normalizedEnvBasePath =
  envBasePath && envBasePath !== "/" ? envBasePath.replace(/\/+$/, "") : "";
const serverBasePath =
  normalizedEnvBasePath || (process.env.NODE_ENV === "production" ? "/ams" : "");

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
  return `${resolvedBasePath}${normalized}`;
}

