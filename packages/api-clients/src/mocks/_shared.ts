// Shared MSW helpers used by every per-domain handlers file.
//
// `url()` honors NEXT_PUBLIC_API_BASE_URL so handlers can target both the
// star-prefix wildcard (dev default) and a specific staging origin.
// `jsonOk` / `jsonStatus` echo `x-correlation-id` back to the client per
// the production middleware contract (apps/web/proxy.ts:92).
// `csrfGuard` returns a 403 response when an in-flight write is missing
// the `x-csrf-token` header, mirroring the production middleware.

import { HttpResponse } from "msw";

declare const process: { env: Record<string, string | undefined> } | undefined;

const BASE =
  (typeof process !== "undefined" &&
    process?.env?.["NEXT_PUBLIC_API_BASE_URL"]) ||
  "*";

export function url(path: string): string {
  if (BASE === "*") return `*${path}`;
  return `${BASE.replace(/\/$/, "")}${path}`;
}

export const SESSION_COOKIE =
  "us_session_v1=mock-session-token; Path=/us; HttpOnly; SameSite=Lax";
export const CLEAR_SESSION_COOKIE =
  "us_session_v1=; Path=/us; Max-Age=0; HttpOnly; SameSite=Lax";

export function corrIdFrom(request: Request): string {
  return (
    request.headers.get("x-correlation-id") ??
    globalThis.crypto?.randomUUID?.() ??
    `mock-${Date.now()}`
  );
}

export function headersFor(
  request: Request,
  extra?: Record<string, string>,
): Record<string, string> {
  return { "x-correlation-id": corrIdFrom(request), ...(extra ?? {}) };
}

export function jsonOk(
  request: Request,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return HttpResponse.json(body as never, {
    headers: headersFor(request, extraHeaders),
  });
}

export function jsonStatus(
  request: Request,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return HttpResponse.json(body as never, {
    status,
    headers: headersFor(request, extraHeaders),
  });
}

/**
 * CSRF check for state-changing requests. The browser middleware at
 * apps/web/proxy.ts:107-120 issues `csrf_v1` cookie on /us/app/* navigations;
 * the client at packages/api-clients/src/client.ts reads it and sends
 * `x-csrf-token`. Handlers reject writes without the header.
 *
 * Returns `null` when the request passes; a 403 Response when it fails.
 */
export function csrfGuard(request: Request): Response | null {
  const token = request.headers.get("x-csrf-token");
  if (!token) {
    return jsonStatus(request, 403, {
      code: "CSRF_TOKEN_MISSING",
      message: "Missing x-csrf-token header.",
    });
  }
  return null;
}
