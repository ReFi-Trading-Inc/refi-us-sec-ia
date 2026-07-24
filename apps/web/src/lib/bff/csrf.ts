/**
 * CSRF protection (S2, Sprint 1).
 *
 * Origin/Referer validation on every mutating investor route. The declared
 * origin (Origin header, or Referer's origin if Origin absent) must appear
 * in REFI_TRUSTED_ORIGINS or the request is rejected with 403.
 *
 * Modern browsers send Origin on all cross-origin credentialed requests, so
 * this check alone closes CSRF for browser attackers. Double-submit token
 * enforcement is scaffolded here but not yet wired into bffMutate — it
 * requires a client-side mint/echo round-trip landing in a follow-up.
 *
 * Why not SameSite=Strict on the session cookie alone? SameSite is a
 * per-cookie hint, not an enforcement boundary, and future flows (OAuth
 * callback, magic-link landing, embedded broker flows) may need Lax or
 * None on specific cookies. Origin check is uniform, explicit, testable.
 */
import type { NextResponse, NextRequest } from "next/server";
import { getServerEnv } from "../config/env";
import { bffError } from "./envelope";

const CSRF_COOKIE = "us_csrf_v1";
const CSRF_HEADER = "x-csrf-token";

/**
 * Parse REFI_TRUSTED_ORIGINS into a set of allowed origin strings.
 * Values are compared verbatim after trimming — scheme, host, and (if
 * present) port must all match. Wildcards are not accepted; each preview
 * environment must be listed explicitly so a misconfigured deploy fails
 * loud rather than silently trusting a broader set.
 */
function trustedOrigins(): Set<string> {
  const raw = getServerEnv().REFI_TRUSTED_ORIGINS;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set(parts);
}

function declaredOrigin(req: NextRequest): string | null {
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
 * Enforce origin/referer on a mutating request. Returns a 403 response on
 * failure, or null to indicate the request may proceed.
 *
 * The caller (bffMutate) is responsible for auditing the rejection via an
 * InvestorActionReceipt; this helper only shapes the HTTP response.
 */
export function enforceCsrfOrigin(
  req: NextRequest,
  correlationId: string,
): NextResponse | null {
  const trusted = trustedOrigins();
  const origin = declaredOrigin(req);

  if (!origin) {
    // A browser-issued credentialed mutation without an Origin/Referer is
    // the classic CSRF fingerprint. Fail closed; server-to-server callers
    // that legitimately need this path must be routed through a separate,
    // Bearer-authenticated surface (Sprint 5+).
    return csrfReject(correlationId, "origin_missing");
  }
  if (!trusted.has(origin)) {
    return csrfReject(correlationId, "origin_untrusted");
  }
  return null;
}

/**
 * Verify the double-submit CSRF token: header value must equal the cookie
 * value. Scaffolded for the follow-up commit that lands the client-side
 * mint. Not yet called from bffMutate.
 */
export function enforceCsrfDoubleSubmit(
  req: NextRequest,
  correlationId: string,
): NextResponse | null {
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) {
    return csrfReject(correlationId, "csrf_token_missing");
  }
  if (!constantTimeEqual(cookieToken, headerToken)) {
    return csrfReject(correlationId, "csrf_token_mismatch");
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function csrfReject(correlationId: string, reason: string): NextResponse {
  return bffError("forbidden", `CSRF check failed: ${reason}`, {
    status: 403,
    source: "prototype-bff",
    correlationId,
  });
}

export const CSRF_INTERNALS = { CSRF_COOKIE, CSRF_HEADER } as const;
