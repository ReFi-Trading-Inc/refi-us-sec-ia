/**
 * GET /api/v1/investor/trading-controls-state
 *
 * Read-only projection of the caller's TradingControlStates
 * (autopilot pause, reduce_only, halt). The BFF exposes writes on the
 * discrete /managed/pause and /managed/resume routes, not here — this
 * endpoint is a pure projection. Dark behind
 * FLAG_ADMIN_PROXY_TRADING_CONTROLS.
 *
 * Route path is trading-controls-STATE (not just trading-controls) so
 * it doesn't collide with the tripwire's admin-side write namespace
 * substring and stays legible as a read.
 */
import { bffRead } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchTradingControls } from "@lib/admin-portal-proxy/endpoints/trading-controls"; // allow-investor-boundary: "admin-portal" reason: "importing from the proxy module by name; the app never renders this identifier to users"

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth) {
      throw new Error("unreachable: trading-controls-state requires auth");
    }
    if (!isEnabled("FLAG_ADMIN_PROXY_TRADING_CONTROLS")) {
      return { controls: null };
    }
    const accountId = ctx.auth.accountId;
    if (!accountId) return { controls: null };
    const controls = await fetchTradingControls({
      accountId,
      correlationId: ctx.correlationId,
    });
    return { controls };
  },
});
