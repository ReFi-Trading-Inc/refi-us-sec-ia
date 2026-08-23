/**
 * GET  /api/v1/investor/subscription-mode — current mode (signal | managed | null).
 * GET only since C2a — see the note above the removed POST.
 */
import { bffRead } from "@lib/bff/handler";
import { getSubscriptionMode } from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-006",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) return null;
    return getSubscriptionMode(ctx.auth.accountId);
  },
});

/*
 * POST (selectMode) was structurally removed in C2a: the September artifact
 * has one user-facing product mode, so switching an account to "managed" is
 * capability expansion with no investor surface. The domain concept and the
 * selectMode taxonomy entry remain (audit history and the C1a-1 policy
 * classification still name it); only the investor-reachable write is gone.
 * A POST here now answers 405 from the framework — absence, not a 403 gate.
 */
