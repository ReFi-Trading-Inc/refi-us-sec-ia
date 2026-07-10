/**
 * GET /api/v1/investor/execution-plans[?intent_id=<id>]
 *
 * Caller's execution plans. Dark behind FLAG_ADMIN_PROXY_EXECUTION_PLANS.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchExecutionPlans } from "@lib/admin-portal-proxy/endpoints/execution-plans"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: execution-plans requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_EXECUTION_PLANS")) {
      return { plans: [] };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { plans: [] };
    const intentId =
      new URL(ctx.req.url).searchParams.get("intent_id") ?? undefined;
    const plans = await fetchExecutionPlans({
      accountId,
      correlationId: ctx.correlationId,
      ...(intentId ? { intentId } : {}),
    });
    return { plans };
  },
});
