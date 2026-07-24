/**
 * GET /api/v1/investor/orders[?plan_id=<id>&limit=<n>]
 *
 * Read model of orders sent by the system on the investor's behalf under
 * the active execution policy. When FLAG_ADMIN_PROXY_ORDERS is on the S4
 * upstream proxy sources this; otherwise the stub-shaped preview stays.
 * The stub keeps existing e2e specs green during the dark-to-live flip.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchOrders } from "@lib/admin-portal-proxy/endpoints/orders"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-001",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) {
      return { items: [], notice: "Sign in to view orders." };
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_ORDERS")) {
      return {
        items: [] as unknown[],
        notice: "Order projections are available in preview.",
      };
    }
    const params = new URL(ctx.req.url).searchParams;
    const planId = params.get("plan_id") ?? undefined;
    const limitRaw = params.get("limit");
    const limit = limitRaw
      ? Math.max(1, Math.min(200, Number(limitRaw)))
      : undefined;
    const items = await fetchOrders({
      accountId: ctx.auth.accountId,
      correlationId: ctx.correlationId,
      ...(planId ? { planId } : {}),
      ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
    });
    return { items };
  },
});
