/**
 * POST /api/v1/investor/managed/resume
 *
 * Resumes user-initiated pauses only. `paused_by_system` must clear upstream
 * first; `review_required` and `setup_incomplete` are likewise non-resumable
 * from this route.
 */
import { bffMutate } from "@lib/bff/handler";
import {
  getManagedExecutionState,
  setManagedExecutionState,
} from "@lib/prototype-store";

export const POST = bffMutate<undefined>({
  action: "resumeManaged",
  source: "prototype-bff",
  upstreamGap: "G-006",
  apply: async (ctx) => {
    const accountId = ctx.auth.accountId;
    if (!accountId) {
      return {
        data: { ok: false, reason: "account_not_linked" },
        outcome: "blocked" as const,
        reasonCode: "account_not_linked",
        status: 412,
      };
    }
    const current = await getManagedExecutionState(accountId);
    if (!current) {
      return {
        data: { ok: false, reason: "no_state" },
        outcome: "rejected" as const,
        reasonCode: "no_state",
        status: 412,
      };
    }
    if (current.status === "paused_by_system") {
      return {
        data: { ok: false, reason: "system_pause_must_clear_upstream" },
        outcome: "blocked" as const,
        reasonCode: "system_pause_must_clear_upstream",
        status: 412,
      };
    }
    if (current.status === "review_required") {
      return {
        data: { ok: false, reason: "resolve_exceptions_first" },
        outcome: "blocked" as const,
        reasonCode: "resolve_exceptions_first",
        status: 412,
      };
    }
    if (current.status === "setup_incomplete") {
      return {
        data: { ok: false, reason: "complete_setup_first" },
        outcome: "blocked" as const,
        reasonCode: "complete_setup_first",
        status: 412,
      };
    }
    if (current.status !== "paused_by_user") {
      return {
        data: { ok: false, reason: "not_paused" },
        outcome: "rejected" as const,
        reasonCode: "not_paused",
        status: 412,
      };
    }
    const next = await setManagedExecutionState({
      accountId,
      executionPolicyVersion: current.executionPolicyVersion,
      status: "active",
      changedBy: "user",
      correlationId: ctx.correlationId,
    });
    return {
      data: next,
      references: [`managed-execution-state:${accountId}`],
    };
  },
});
