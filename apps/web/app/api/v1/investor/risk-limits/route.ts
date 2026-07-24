/**
 * GET /api/v1/investor/risk-limits
 *
 * Caller's risk limits. Dark behind FLAG_ADMIN_PROXY_RISK_LIMITS.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchRiskLimits } from "@lib/admin-portal-proxy/endpoints/risk-limits"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: risk-limits requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_RISK_LIMITS")) {
      return { limits: null };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { limits: null };
    const limits = await fetchRiskLimits({
      accountId,
      correlationId: ctx.correlationId,
    });
    return { limits };
  },
});
