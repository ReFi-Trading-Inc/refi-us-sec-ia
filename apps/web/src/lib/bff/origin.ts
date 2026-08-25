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
export function isSameOrigin(req: NextRequest): boolean {
  const declared = declaredOrigin(req);
  if (!declared) return false;
  try {
    return new URL(declared).origin === req.nextUrl.origin;
  } catch {
    return false;
  }
}
