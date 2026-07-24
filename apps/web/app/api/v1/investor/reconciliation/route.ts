/**
 * GET /api/v1/investor/reconciliation[?limit=<n>]
 *
 * Reconciliation run history for the caller's account. Dark behind
 * FLAG_ADMIN_PROXY_RECONCILIATION.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchReconciliationRuns } from "@lib/admin-portal-proxy/endpoints/reconciliation"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: reconciliation requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_RECONCILIATION")) {
      return { runs: [] };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { runs: [] };
    const limitRaw = new URL(ctx.req.url).searchParams.get("limit");
    const limit = limitRaw
      ? Math.max(1, Math.min(100, Number(limitRaw)))
      : undefined;
    const runs = await fetchReconciliationRuns({
      accountId,
      correlationId: ctx.correlationId,
      ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
    });
    return { runs };
  },
});
