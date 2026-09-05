/**
 * GET /api/v1/investor/recommendations/[id]/legs?cursor=
 *
 * One contract page of constituent legs (`listAccountRecommendationLegs`),
 * continuing from an opaque cursor the browser received from a previous page.
 * The cursor is forwarded exactly; a malformed cursor fails closed. This is
 * how the product pages through a large recommendation without the BFF ever
 * fetching an unbounded set. Read-only; `executable` is informational.
 */
import { bffRead } from "@lib/bff/handler";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import { resolveAccountScope } from "@lib/investor-api/account-scope";
import { validateCursor } from "@lib/investor-api/pagination";
import {
  listRecommendationLegsPage,
  type RecommendationLegsPageView,
} from "@lib/investor-api/recommendations";
import {
  classifyUpstream,
  UPSTREAM_OK,
  type UpstreamState,
} from "@lib/investor-api/upstream-state";

export interface RecommendationLegsResponse {
  legs: RecommendationLegsPageView | null;
  upstream: UpstreamState;
}

function idFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("recommendations");
  const id = parts[i + 1];
  if (id === undefined || id.length === 0 || id.length > 128) return null;
  return decodeURIComponent(id);
}

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx): Promise<RecommendationLegsResponse> => {
    if (!ctx.auth) {
      return {
        legs: null,
        upstream: { state: "error", reason: "unauthenticated" },
      };
    }
    const id = idFromUrl(ctx.req.url);
    if (id === null) {
      return { legs: null, upstream: { state: "error", reason: "invalid_id" } };
    }
    try {
      const cursor = validateCursor(
        new URL(ctx.req.url).searchParams.get("cursor"),
      );
      const client = investorApiClientFor(ctx.auth);
      const accountId = await resolveAccountScope(client, ctx.auth);
      const legs = await listRecommendationLegsPage(
        client,
        accountId,
        id,
        cursor,
      );
      return { legs, upstream: UPSTREAM_OK };
    } catch (err) {
      return { legs: null, upstream: classifyUpstream(err) };
    }
  },
});
