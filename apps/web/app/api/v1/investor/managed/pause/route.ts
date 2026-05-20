/**
 * POST /api/v1/investor/managed/pause
 *
 * Investor-initiated pause of managed execution. Only mutates
 * ManagedExecutionState — the ExecutionPolicy version is unchanged.
 */
import { z } from "zod";
import { bffMutate } from "@lib/bff/handler";
import {
  getManagedExecutionState,
  setManagedExecutionState,
} from "@lib/prototype-store";

const pauseBody = z.object({
  reason: z.string().max(280).optional(),
});

type PauseBody = z.infer<typeof pauseBody>;

export const POST = bffMutate<PauseBody>({
  action: "pauseManaged",
  source: "prototype-bff",
  upstreamGap: "G-006",
  parse: (body) => pauseBody.parse(body ?? {}),
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
    if (!current || current.status !== "active") {
      return {
        data: { ok: false, reason: "not_active" },
        outcome: "rejected" as const,
        reasonCode: "not_active",
        status: 412,
      };
    }
    const next = await setManagedExecutionState({
      accountId,
      executionPolicyVersion: current.executionPolicyVersion,
      status: "paused_by_user",
      ...(ctx.input.reason ? { reasonCode: ctx.input.reason } : {}),
      changedBy: "user",
      correlationId: ctx.correlationId,
    });
    return {
      data: next,
      references: [`managed-execution-state:${accountId}`],
    };
  },
});
