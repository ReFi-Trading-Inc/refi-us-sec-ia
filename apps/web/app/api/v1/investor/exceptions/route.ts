/**
 * GET /api/v1/investor/exceptions
 *
 * Lists open exceptions for the investor account. Exception resolution is
 * the only per-decision investor touchpoint in Managed mode; resolution
 * lives at /exceptions/[id]/resolve and is strictly limited to the
 * ExceptionResolution category set.
 */
import { bffRead } from "@lib/bff/handler";
import { listExceptionReviews } from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-008",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) {
      return {
        items: [] as unknown[],
        notice: "Exception feed is available in preview.",
      };
    }
    const items = await listExceptionReviews(ctx.auth.accountId);
    return {
      items,
      notice:
        items.length === 0
          ? "No exceptions require your attention."
          : undefined,
    };
  },
});
