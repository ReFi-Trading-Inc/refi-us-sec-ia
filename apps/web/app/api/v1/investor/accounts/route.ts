/**
 * GET /api/v1/investor/accounts
 *
 * Investor-facing view of the caller's account. Always scoped to the
 * auth-bound accountId — the route does not accept a target-account
 * query param, closing the ACL surface by construction. Dark behind
 * FLAG_ADMIN_PROXY_ACCOUNTS until D2 route ratification.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchAccount } from "@lib/admin-portal-proxy/endpoints/accounts"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: accounts requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_ACCOUNTS")) {
      return { account: null };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) {
      return { account: null };
    }
    const account = await fetchAccount({
      accountId,
      correlationId: ctx.correlationId,
    });
    return { account };
  },
});
