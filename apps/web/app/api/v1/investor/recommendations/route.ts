/**
 * GET /api/v1/investor/recommendations
 *
 * Signal recommendation summaries for the authenticated investor, read
 * through the frozen v1.1.0-alpha.2 Investor API client
 * (`listAccountRecommendations`). C1b-2 row 19. The browser never calls the
 * Investor API and never supplies an account id: the account scope is
 * re-authorized server-side against `listAccounts` on every request.
 *
 * Read-only. Fails closed with an explicit upstream state — never an invented
 * empty success, never a fabricated recommendation. `executionEligible` is
 * backend information, not a control (D-LAUNCH-06).
 */
import { bffRead } from "@lib/bff/handler";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import { resolveAccountScope } from "@lib/investor-api/account-scope";
import {
  listRecommendations,
  type RecommendationSummaryView,
} from "@lib/investor-api/recommendations";
import {
  classifyUpstream,
  UPSTREAM_OK,
  type UpstreamState,
} from "@lib/investor-api/upstream-state";

export interface RecommendationsListView {
  items: RecommendationSummaryView[];
  /** True when the bounded page cap stopped the read before the upstream did. */
  truncated: boolean;
  upstream: UpstreamState;
}

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx): Promise<RecommendationsListView> => {
    if (!ctx.auth) {
      return {
        items: [],
        truncated: false,
        upstream: { state: "error", reason: "unauthenticated" },
      };
    }
    try {
      const client = investorApiClientFor(ctx.auth);
      const accountId = await resolveAccountScope(client, ctx.auth);
      const { items, truncated } = await listRecommendations(client, accountId);
      return { items, truncated, upstream: UPSTREAM_OK };
    } catch (err) {
      return { items: [], truncated: false, upstream: classifyUpstream(err) };
    }
  },
});
