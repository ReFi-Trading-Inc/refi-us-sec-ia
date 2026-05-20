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
