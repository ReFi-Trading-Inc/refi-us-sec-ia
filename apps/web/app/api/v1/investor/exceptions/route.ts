/**
 * GET /api/v1/investor/exceptions
 *
 * Lists exceptions for the investor account, with the most recent resolution
 * (if any) joined onto each row so the Exception Review surface can split
 * Open / Resolved / Dismissed without a second round-trip.
 *
 * Exception resolution is the only per-decision investor touchpoint in
 * Managed mode; resolution lives at /exceptions/[id]/resolve and is strictly
 * limited to the ExceptionResolution category set.
 */
import { bffRead } from "@lib/bff/handler";
import {
  listExceptionResolutions,
  listExceptionReviews,
  type ExceptionReview,
} from "@lib/prototype-store";
import type { ExceptionResolution } from "@lib/sec203a/actions";

interface ExceptionListItem extends ExceptionReview {
  lastResolution: ExceptionResolution | null;
  lastResolvedAt: string | null;
}

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-008",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) {
      return {
        items: [] as ExceptionListItem[],
        notice: "Exception feed is available in preview.",
      };
    }
    const [items, resolutions] = await Promise.all([
      listExceptionReviews(ctx.auth.accountId),
      listExceptionResolutions(ctx.auth.accountId),
    ]);
    // Most recent resolution per exception (resolutions are append-only).
    const latestByException = new Map<
      string,
      { resolution: ExceptionResolution; signedAt: string }
    >();
    for (const r of resolutions) {
      const existing = latestByException.get(r.exceptionId);
      if (!existing || r.signedAt.localeCompare(existing.signedAt) > 0) {
        latestByException.set(r.exceptionId, {
          resolution: r.resolution,
          signedAt: r.signedAt,
        });
      }
    }
    const joined: ExceptionListItem[] = items.map((it) => {
      const last = latestByException.get(it.exceptionId);
      return {
        ...it,
        lastResolution: last?.resolution ?? null,
        lastResolvedAt: last?.signedAt ?? null,
      };
    });
    return {
      items: joined,
      notice:
        items.length === 0
          ? "No exceptions require your attention."
          : undefined,
    };
  },
});
