/**
 * GET /api/v1/investor/intents[?limit=<n>]
 *
 * Caller's AccountIntent list. Dark behind FLAG_ADMIN_PROXY_INTENTS.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchIntents } from "@lib/admin-portal-proxy/endpoints/intents"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: intents requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_INTENTS")) {
      return { intents: [] };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { intents: [] };
    const limitRaw = new URL(ctx.req.url).searchParams.get("limit");
    const limit = limitRaw
      ? Math.max(1, Math.min(100, Number(limitRaw)))
      : undefined;
    const intents = await fetchIntents({
      accountId,
      correlationId: ctx.correlationId,
      ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
    });
    return { intents };
  },
});
