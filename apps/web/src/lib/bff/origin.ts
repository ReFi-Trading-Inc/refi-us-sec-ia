/**
 * Same-origin CSRF guard for mutating BFF routes.
 *
 * Cookie-authenticated mutations are the classic CSRF target. Modern browsers
 * send an `Origin` header on all cross-origin credentialed requests, so a
 * server-side same-origin check closes CSRF for browser attackers without any
 * client change. For the current cookie-authenticated BFF, this fail-closed
 * same-origin check IS the implemented CSRF control. A separate double-submit
 * token is not part of the current architecture — a half-implemented one
 * (cookie issued, never echoed or validated) was removed 2026-08-25 (CS-02)
 * rather than expanded; reintroducing its identifiers trips the
 * investor-boundary tripwire until a new CSRF architecture is reviewed.
 *
 * The expected origin is the request's own server-resolved origin
 * (`req.nextUrl.origin`) — never a client-supplied forwarded header used as the
 * sole authority. The manual alpha-claim route implements the same rule inline.
 */
import type { NextRequest } from "next/server";

/** The origin declared by the request: Origin header, else Referer's origin. */
export function declaredOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") return origin;
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * True only when the request declares an origin that exactly matches the
 * server-resolved origin. A missing or unparseable declaration is treated as
 * not-same-origin (fail closed) — a credentialed browser mutation without an
 * Origin/Referer is the classic CSRF fingerprint.
 */
/**
 * The origin this server is being addressed as.
 *
 * Default: `req.nextUrl.origin`, which Next derives from its own bind
 * hostname/port in standalone mode. Behind a reverse proxy that terminates
 * TLS (Cloud Run), that is `https://0.0.0.0:3000` — a value no browser can
 * ever send as `Origin`, so every same-origin check would fail closed.
 *
 * When `REFI_TRUST_PROXY_HOST=1` is set — ONLY on deployments whose edge
 * proxy owns the `Host` and `X-Forwarded-Proto` headers (Cloud Run's Google
 * front end does; a client cannot inject them past it) — the expected origin
 * is `${x-forwarded-proto}://${host}` instead. This is the standard
 * Origin-vs-Host CSRF comparison; it still rejects any Origin that is not
 * exactly the host the proxy routed to us. Never set it on a host where the
 * `Host` header is client-controlled.
 */
export function requestOrigin(req: NextRequest): string {
  if (process.env["REFI_TRUST_PROXY_HOST"] === "1") {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (host) {
      const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      return `${proto === "http" ? "http" : "https"}://${host}`;
    }
  }
  return req.nextUrl.origin;
}

export function isSameOrigin(req: NextRequest): boolean {
  const declared = declaredOrigin(req);
  if (!declared) return false;
  try {
    return new URL(declared).origin === requestOrigin(req);
  } catch {
    return false;
  }
}
