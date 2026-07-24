/**
 * GET /api/v1/investor/account-flow
 *
 * Caller's onboarding/lifecycle flow projection. Dark behind
 * FLAG_ADMIN_PROXY_ACCOUNT_FLOW.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchAccountFlow } from "@lib/admin-portal-proxy/endpoints/account-flow"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: account-flow requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_ACCOUNT_FLOW")) {
      return { flow: null };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { flow: null };
    const flow = await fetchAccountFlow({
      accountId,
      correlationId: ctx.correlationId,
    });
    return { flow };
  },
});
