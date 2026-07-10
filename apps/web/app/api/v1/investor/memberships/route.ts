/**
 * GET /api/v1/investor/memberships
 *
 * Investor-facing view of the caller's template memberships. Dark behind
 * FLAG_ADMIN_PROXY_MEMBERSHIPS until D2 route ratification.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchMemberships } from "@lib/admin-portal-proxy/endpoints/memberships"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: memberships requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_MEMBERSHIPS")) {
      return { memberships: [] };
    }
    const accountId = ctx.auth.accountId ?? "unlinked";
    const memberships = await fetchMemberships({
      accountId,
      correlationId: ctx.correlationId,
    });
    return { memberships };
  },
});
