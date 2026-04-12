const APP_ORIGIN = process.env.APP_ORIGIN?.trim();
const APP_ORIGIN_NORMALIZED = safeOrigin(APP_ORIGIN ?? null);

function safeOrigin(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function originHost(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function parseForwardedHeader(forwarded: string | null): { proto?: string; host?: string } {
  if (!forwarded) {
    return {};
  }
  const firstEntry = forwarded.split(",")[0]?.trim() ?? "";
  const parts = firstEntry.split(";").map((part) => part.trim());
  let proto: string | undefined;
  let host: string | undefined;
  for (const part of parts) {
    const [rawKey, rawValue] = part.split("=", 2);
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue?.trim().replace(/^"|"$/g, "");
    if (!key || !value) continue;
    if (key === "proto") proto = value;
    if (key === "host") host = value;
  }
  return { proto, host };
}

export function expectedOriginForRequest(request: Request): string {
  if (APP_ORIGIN_NORMALIZED) {
    return APP_ORIGIN_NORMALIZED;
  }
  const forwarded = parseForwardedHeader(request.headers.get("forwarded"));
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    || forwarded.proto
    || request.headers.get("x-forwarded-protocol")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-scheme")?.split(",")[0]?.trim();
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    || forwarded.host;
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (forwardedProto && host) {
    return `${forwardedProto}://${host}`;
  }
  if (host) {
    const fallbackProto = new URL(request.url).protocol.replace(/:$/, "");
    return `${fallbackProto}://${host}`;
  }
  return new URL(request.url).origin;
}

export function mutationOriginError(request: Request): string | null {
  const expectedOrigin = expectedOriginForRequest(request);
  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const origin = safeOrigin(originHeader);
  const refererOrigin = safeOrigin(refererHeader);

  if (!origin && !refererOrigin) {
    if (process.env.NODE_ENV === "production") {
      return "Origin is required for state-changing requests";
    }
    return null;
  }

  const expectedHost = originHost(expectedOrigin);
  if (origin && origin !== expectedOrigin) {
    const actualHost = originHost(origin);
    if (!expectedHost || !actualHost || expectedHost !== actualHost) {
      return "Origin is not allowed";
    }
  }

  if (!origin && refererOrigin && refererOrigin !== expectedOrigin) {
    const refererHost = originHost(refererOrigin);
    if (!expectedHost || !refererHost || expectedHost !== refererHost) {
      return "Referer is not allowed";
    }
  }

  if (origin && !originHost(origin)) {
    return "Origin is not allowed";
  }

  return null;
}

