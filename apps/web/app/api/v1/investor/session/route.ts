/**
 * GET /api/v1/investor/session
 *
 * Returns the current session projection. Authoritative SIWE session lives
 * upstream (G-002 Bucket A); this projection is what the UI consumes.
 */
import { bffRead } from "@lib/bff/handler";
import { getSession, putSession } from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-002",
  fetch: async (ctx) => {
    if (!ctx.auth) return null;
    const existing = await getSession(ctx.auth.authId);
    if (existing) return existing;
    return putSession({
      authId: ctx.auth.authId,
      ...(ctx.auth.accountId ? { accountId: ctx.auth.accountId } : {}),
      correlationId: ctx.correlationId,
    });
  },
});
