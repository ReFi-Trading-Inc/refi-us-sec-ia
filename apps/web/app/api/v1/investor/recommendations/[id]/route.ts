/**
 * GET /api/v1/investor/recommendations/[id]
 *
 * Single recommendation projection. Does NOT emit a record access log —
 * recommendations are projections of the advisory chain, not records.
 * Decision Records (the SEC evidence artifacts) live under /records.
 */
import { bffRead } from "@lib/bff/handler";
import { getRecommendation } from "@lib/prototype-store";

function idFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("recommendations");
  return i >= 0 && parts[i + 1] ? parts[i + 1]! : null;
}

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-001",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) return null;
    const id = idFromUrl(ctx.req.url);
    if (!id) return null;
    return getRecommendation(ctx.auth.accountId, id);
  },
});
