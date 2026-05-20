/**
 * GET /api/v1/investor/recommendations
 *
 * Lists software-generated recommendations for the current account.
 * Managed-mode investors see informational items (no per-trade authorization
 * controls). Signal-mode investors may save/dismiss.
 */
import { bffRead } from "@lib/bff/handler";
import { listRecommendations, getSubscriptionMode } from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-001",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) {
      return { items: [], mode: null as null | string };
    }
    const [items, mode] = await Promise.all([
      listRecommendations(ctx.auth.accountId),
      getSubscriptionMode(ctx.auth.accountId),
    ]);
    return { items, mode: mode?.mode ?? null };
  },
});
