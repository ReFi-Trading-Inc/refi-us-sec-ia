/**
 * GET /api/v1/investor/portfolio
 *
 * Reconciled account truth for the authenticated investor through the frozen
 * v1.1.0-alpha.2 client: current valuation, bounded valuation history,
 * positions, template memberships, and the four supported preferences.
 * C1b-2 rows 15, 16, 24. Account scope is re-authorized server-side; the
 * browser supplies nothing. Read-only; fails closed with an explicit upstream
 * state and never computes account truth from browser data.
 */
import { bffRead } from "@lib/bff/handler";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import { resolveAccountScope } from "@lib/investor-api/account-scope";
import { getPortfolio, type PortfolioView } from "@lib/investor-api/portfolio";
import {
  classifyUpstream,
  UPSTREAM_OK,
  type UpstreamState,
} from "@lib/investor-api/upstream-state";

export interface PortfolioResponse {
  portfolio: PortfolioView | null;
  upstream: UpstreamState;
}

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx): Promise<PortfolioResponse> => {
    if (!ctx.auth) {
      return {
        portfolio: null,
        upstream: { state: "error", reason: "unauthenticated" },
      };
    }
    try {
      const client = investorApiClientFor(ctx.auth);
      const accountId = await resolveAccountScope(client, ctx.auth);
      const portfolio = await getPortfolio(client, accountId);
      return { portfolio, upstream: UPSTREAM_OK };
    } catch (err) {
      return { portfolio: null, upstream: classifyUpstream(err) };
    }
  },
});
