/**
 * GET /api/v1/investor/broker-interactions[?limit=<n>]
 *
 * Caller's broker-gateway interaction log. Dark behind
 * FLAG_ADMIN_PROXY_BROKER_INTERACTIONS.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchBrokerInteractions } from "@lib/admin-portal-proxy/endpoints/broker-interactions"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: broker-interactions requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_BROKER_INTERACTIONS")) {
      return { interactions: [] };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { interactions: [] };
    const limitRaw = new URL(ctx.req.url).searchParams.get("limit");
    const limit = limitRaw
      ? Math.max(1, Math.min(200, Number(limitRaw)))
      : undefined;
    const interactions = await fetchBrokerInteractions({
      accountId,
      correlationId: ctx.correlationId,
      ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
    });
    return { interactions };
  },
});
