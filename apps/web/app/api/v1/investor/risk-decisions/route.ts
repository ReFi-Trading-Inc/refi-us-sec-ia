/**
 * GET /api/v1/investor/risk-decisions[?intent_id=<id>]
 *
 * Risk-engine decisions on the caller's intents. Dark behind
 * FLAG_ADMIN_PROXY_RISK_DECISIONS.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchRiskDecisions } from "@lib/admin-portal-proxy/endpoints/risk-decisions"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: risk-decisions requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_RISK_DECISIONS")) {
      return { decisions: [] };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { decisions: [] };
    const intentId =
      new URL(ctx.req.url).searchParams.get("intent_id") ?? undefined;
    const decisions = await fetchRiskDecisions({
      accountId,
      correlationId: ctx.correlationId,
      ...(intentId ? { intentId } : {}),
    });
    return { decisions };
  },
});
