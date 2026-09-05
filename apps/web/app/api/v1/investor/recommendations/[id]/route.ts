/**
 * GET /api/v1/investor/recommendations/[id]
 *
 * One recommendation with its FIRST page of constituent legs, read through
 * the frozen v1.1.0-alpha.2 client (`getAccountRecommendation` +
 * `listAccountRecommendationLegs`). C1b-2 row 19. Further legs are paged by
 * the browser through `/api/v1/investor/recommendations/[id]/legs?cursor=`
 * with the contract's opaque cursor — never fetched unbounded here.
 *
 * Does NOT emit a record access log — recommendations are projections, not
 * records. Read-only; `executionEligible`/`executable` are informational.
 */
import { bffRead } from "@lib/bff/handler";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import { resolveAccountScope } from "@lib/investor-api/account-scope";
import {
  getRecommendationDetail,
  type RecommendationDetailView,
} from "@lib/investor-api/recommendations";
import {
  classifyUpstream,
  UPSTREAM_OK,
  type UpstreamState,
} from "@lib/investor-api/upstream-state";

export interface RecommendationDetailResponse {
  detail: RecommendationDetailView | null;
  upstream: UpstreamState;
}

export function recommendationIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("recommendations");
  const id = parts[i + 1];
  if (id === undefined || id.length === 0 || id.length > 128) return null;
  return decodeURIComponent(id);
}

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx): Promise<RecommendationDetailResponse> => {
    if (!ctx.auth) {
      return {
        detail: null,
        upstream: { state: "error", reason: "unauthenticated" },
      };
    }
    const id = recommendationIdFromUrl(ctx.req.url);
    if (id === null) {
      return {
        detail: null,
        upstream: { state: "error", reason: "invalid_id" },
      };
    }
    try {
      const client = investorApiClientFor(ctx.auth);
      const accountId = await resolveAccountScope(client, ctx.auth);
      const detail = await getRecommendationDetail(client, accountId, id);
      return { detail, upstream: UPSTREAM_OK };
    } catch (err) {
      return { detail: null, upstream: classifyUpstream(err) };
    }
  },
});
