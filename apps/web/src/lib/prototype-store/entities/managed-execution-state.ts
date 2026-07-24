/**
 * Managed Execution State — runtime status machine.
 *
 * Distinct from ExecutionPolicy (the durable approved object). This state
 * answers: under the current execution policy version, what is automation
 * doing *right now*?
 *
 * State machine:
 *   inactive        → no policy / not activated
 *   setup_incomplete → policy exists but a prerequisite went stale
 *                     (broker disconnected, disclosure superseded, etc.)
 *   active          → automation running per policy
 *   paused_by_user  → investor paused; only investor can resume
 *   paused_by_system → upstream control halted; investor cannot resume
 *                     until the upstream condition clears
 *   review_required → exception present; managed execution gated until
 *                     the investor resolves
 */
import { makePrototypeMeta, type PrototypeMeta } from "../store";
import { resolveKvStore } from "../../store";

export type ManagedExecutionStatus =
  | "inactive"
  | "setup_incomplete"
  | "active"
  | "paused_by_user"
  | "paused_by_system"
  | "review_required";

export interface ManagedExecutionState {
  accountId: string;
  executionPolicyVersion: number | null;
  status: ManagedExecutionStatus;
  reasonCode?: string;
  lastChangedAt: string;
  lastChangedBy: "user" | "system";
  meta: PrototypeMeta;
}

// Routed through the S3 factory. The state machine here is what the
// pause/resume UI reads on every render — durable backing keeps the
// projection consistent across redeploys.
const states = resolveKvStore<ManagedExecutionState>(
  "managed-execution-state",
  "managed-execution-states",
);

export async function getManagedExecutionState(
  accountId: string,
): Promise<ManagedExecutionState | null> {
  return states.get(accountId);
}

export async function setManagedExecutionState(args: {
  accountId: string;
  executionPolicyVersion: number | null;
  status: ManagedExecutionStatus;
  reasonCode?: string;
  changedBy: "user" | "system";
  correlationId: string;
}): Promise<ManagedExecutionState> {
  const stored: ManagedExecutionState = {
    accountId: args.accountId,
    executionPolicyVersion: args.executionPolicyVersion,
    status: args.status,
    ...(args.reasonCode ? { reasonCode: args.reasonCode } : {}),
    lastChangedAt: new Date().toISOString(),
    lastChangedBy: args.changedBy,
    meta: makePrototypeMeta(args.correlationId),
  };
  await states.put(args.accountId, stored);
  return stored;
}
