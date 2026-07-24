import type { NextRequest } from "next/server";

/**
 * Extract the inbound correlation id, or mint a new one if absent.
 *
 * `proxy.ts` injects `x-correlation-id` on every request, so this should
 * normally read the existing value. We mint a fallback to avoid hard-failing
 * BFF routes when they are called outside the request pipeline (tests, direct
 * fetches in the same Node process).
 */
export function correlationIdFrom(req: NextRequest): string {
  const inbound = req.headers.get("x-correlation-id");
  if (inbound && inbound.length > 0) return inbound;
  return crypto.randomUUID();
}

/**
 * Extract the inbound W3C `traceparent` if present and well-formed.
 * Returns null when absent or malformed — the caller either forwards
 * the value to the next hop (Admin Portal proxy) or lets the proxy
 * client generate a fresh one.
 *
 * Shape: `<version>-<trace-id>-<span-id>-<flags>`; total 55 chars with
 * three hex segments of fixed sizes 32/16/2. Sentry and Cloud Trace
 * both consume this verbatim; validating loosely keeps forward-compat
 * with future W3C versions while rejecting obviously garbage input.
 */
const TRACEPARENT_RE = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i;

export function traceparentFrom(req: NextRequest): string | null {
  const inbound = req.headers.get("traceparent");
  if (!inbound) return null;
  return TRACEPARENT_RE.test(inbound) ? inbound : null;
}
