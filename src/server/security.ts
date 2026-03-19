const APP_ORIGIN = process.env.APP_ORIGIN?.trim();

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

export function expectedOriginForRequest(request: Request): string {
  if (APP_ORIGIN) {
    return APP_ORIGIN;
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

  if (origin && origin !== expectedOrigin) {
    return "Origin is not allowed";
  }

  if (!origin && refererOrigin && refererOrigin !== expectedOrigin) {
    return "Referer is not allowed";
  }

  return null;
}
