/**
 * GET /api/v1/investor/templates
 *
 * Investor-facing list of strategy templates, sourced from the upstream
 * Admin Portal via the S4 proxy. Ships behind FLAG_ADMIN_PROXY_TEMPLATES;
 * dark by default until D2 route ratification and D5 sample payloads land.
 *
 * The route is a thin composition of:
 *   - bffRead (auth + envelope + correlation)
 *   - flag gate
 *   - fetchTemplates (proxy call + strict redaction)
 */
import { bffRead } from "@lib/bff/handler";
import { BffErrors } from "@lib/bff/envelope";
import { isEnabled } from "@lib/feature-flags";
import { fetchTemplates } from "@lib/admin-portal-proxy/endpoints/templates"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      // bffRead sets allowAnonymous=false by default, but explicit for readers.
      throw new Error("unreachable: templates requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_TEMPLATES")) {
      // Dark route: report 404-style empty payload rather than 501 so
      // scanners can't fingerprint dark surfaces by response shape.
      return { templates: [] };
    }
    // account id may be absent pre-broker-link; forward "unlinked" so
    // upstream audit still receives a stable placeholder.
    const accountId = ctx.auth.accountId ?? "unlinked";
    const templates = await fetchTemplates({
      accountId,
      correlationId: ctx.correlationId,
    });
    return { templates };
  },
});

// Route-level 404 for anything but GET. bffRead is GET-only by
// convention; other verbs would hit the framework's default 405.
export function POST(): Response {
  return BffErrors.notFound("none", "route");
}
