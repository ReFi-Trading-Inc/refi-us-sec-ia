/**
 * GET /api/v1/investor/activity/[id]
 *
 * One investor-visible account record through the frozen v1.1.0-alpha.2
 * client (`getAccountRecord`). C1b-2 row 20. Execution-chain record types are
 * not visible in Signal (D-LAUNCH-06) and answer exactly like an absent record.
 */
import { bffRead } from "@lib/bff/handler";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import { resolveAccountScope } from "@lib/investor-api/account-scope";
import {
  getSignalActivityRecord,
  type ActivityRecordView,
} from "@lib/investor-api/account-records";
import {
  classifyUpstream,
  UPSTREAM_OK,
  type UpstreamState,
} from "@lib/investor-api/upstream-state";

export interface ActivityRecordResponse {
  item: ActivityRecordView | null;
  upstream: UpstreamState;
}

function idFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("activity");
  const id = parts[i + 1];
  if (i < 0 || id === undefined || id.length === 0 || id.length > 128) {
    return null;
  }
  return decodeURIComponent(id);
}

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx): Promise<ActivityRecordResponse> => {
    if (!ctx.auth) {
      return {
        item: null,
        upstream: { state: "error", reason: "unauthenticated" },
      };
    }
    const id = idFromUrl(ctx.req.url);
    if (id === null) {
      return { item: null, upstream: { state: "error", reason: "invalid_id" } };
    }
    try {
      const client = investorApiClientFor(ctx.auth);
      const accountId = await resolveAccountScope(client, ctx.auth);
      const item = await getSignalActivityRecord(client, accountId, id);
      return { item, upstream: UPSTREAM_OK };
    } catch (err) {
      return { item: null, upstream: classifyUpstream(err) };
    }
  },
});
