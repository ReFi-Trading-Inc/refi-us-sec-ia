/**
 * GET /api/v1/investor/orders-blocked
 *
 * Orders the risk engine or broker gateway blocked before submission.
 * Dark behind FLAG_ADMIN_PROXY_ORDERS_BLOCKED.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchOrdersBlocked } from "@lib/admin-portal-proxy/endpoints/orders-blocked"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: orders-blocked requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_ORDERS_BLOCKED")) {
      return { blocked: [] };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { blocked: [] };
    const blocked = await fetchOrdersBlocked({
      accountId,
      correlationId: ctx.correlationId,
    });
    return { blocked };
  },
});
