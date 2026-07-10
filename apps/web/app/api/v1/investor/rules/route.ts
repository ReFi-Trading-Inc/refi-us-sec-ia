/**
 * GET /api/v1/investor/rules[?template_id=<id>]
 *
 * Investor-facing rules for one or all templates. Dark behind
 * FLAG_ADMIN_PROXY_RULES until D2 route ratification.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchRules } from "@lib/admin-portal-proxy/endpoints/rules"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: rules requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_RULES")) {
      return { rules: [] };
    }
    const accountId = ctx.auth.accountId ?? "unlinked";
    const templateId =
      new URL(ctx.req.url).searchParams.get("template_id") ?? undefined;
    const rules = await fetchRules({
      accountId,
      correlationId: ctx.correlationId,
      ...(templateId ? { templateId } : {}),
    });
    return { rules };
  },
});
