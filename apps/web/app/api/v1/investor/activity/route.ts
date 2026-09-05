/**
 * GET /api/v1/investor/activity
 *
 * Investor-visible account records, read through the frozen v1.1.0-alpha.2
 * client (`listAccountRecords`). C1b-2 row 20. Account scope is re-authorized
 * server-side; the browser supplies nothing.
 *
 * The full 16-variant `AccountRecord` union is validated by the frozen client.
 * The Signal projection then EXCLUDES the five execution-chain variants
 * (account_intent, risk_decision, execution_plan, order, fill) whose rendering
 * is parked behind D-LAUNCH-06 — see `@lib/investor-api/account-records`.
 * Read-only; no narrative is fabricated.
 */
import { bffRead } from "@lib/bff/handler";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import { resolveAccountScope } from "@lib/investor-api/account-scope";
import {
  listSignalActivity,
  type ActivityRecordView,
} from "@lib/investor-api/account-records";
import {
  classifyUpstream,
  UPSTREAM_OK,
  type UpstreamState,
} from "@lib/investor-api/upstream-state";

export interface ActivityListView {
  items: ActivityRecordView[];
  /** Records validated but withheld from Signal rendering (D-LAUNCH-06). */
  excludedCount: number;
  truncated: boolean;
  upstream: UpstreamState;
}

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx): Promise<ActivityListView> => {
    if (!ctx.auth) {
      return {
        items: [],
        excludedCount: 0,
        truncated: false,
        upstream: { state: "error", reason: "unauthenticated" },
      };
    }
    try {
      const client = investorApiClientFor(ctx.auth);
      const accountId = await resolveAccountScope(client, ctx.auth);
      const result = await listSignalActivity(client, accountId);
      return { ...result, upstream: UPSTREAM_OK };
    } catch (err) {
      return {
        items: [],
        excludedCount: 0,
        truncated: false,
        upstream: classifyUpstream(err),
      };
    }
  },
});
