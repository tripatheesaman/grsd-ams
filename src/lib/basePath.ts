const envBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const normalizedEnvBasePath =
  envBasePath && envBasePath !== "/"
    ? envBasePath.replace(/\/+$/, "")
    : "";

// In this project production is served under /ams. If NEXT_PUBLIC_BASE_PATH is
// missing during image build/runtime, keep asset/api URLs on /ams instead of /.
export const basePath =
  normalizedEnvBasePath || (process.env.NODE_ENV === "production" ? "/ams" : "");

export function withBasePath(path: string) {
  if (!basePath) return path.startsWith("/") ? path : `/${path}`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalized}`;
}

