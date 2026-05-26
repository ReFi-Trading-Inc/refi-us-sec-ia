/**
 * GET /api/v1/investor/managed/state
 *
 * Returns the live ManagedExecutionState for the authenticated investor.
 * This is the runtime status machine (active/paused/...), not the
 * ExecutionPolicy. See memory/contract_execution_policy.md.
 */
import { bffRead } from "@lib/bff/handler";
import { getManagedExecutionState } from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-006",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth || !ctx.auth.accountId) return null;
    return getManagedExecutionState(ctx.auth.accountId);
  },
});
