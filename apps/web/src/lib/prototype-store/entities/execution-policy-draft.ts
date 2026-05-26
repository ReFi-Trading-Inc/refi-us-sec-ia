/**
 * Execution Policy Draft — investor's working copy of the next policy.
 *
 * Distinct from ExecutionPolicy (the signed, versioned, durable artifact).
 * The draft has no hashes, no signature evidence, no version pin. It is a
 * mutable working buffer the investor edits in the Automation Center
 * (Surface 2). Promoting a draft to a real ExecutionPolicy version only
 * happens via Surface 3 activation, which adds the signing evidence and
 * appends a new version.
 *
 * Single draft per account: latest write wins.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type { DecimalString } from "../../sec203a/decimal";

export type StaleBrokerDataDuration =
  | "PT5M"
  | "PT15M"
  | "PT30M"
  | "PT1H"
  | "PT4H";

export type StaleProfileDuration = "P30D" | "P60D" | "P90D" | "P180D" | "P365D";

export interface ExecutionPolicyDraft {
  accountId: string;

  // Strategy + scope.
  strategyId: string;
  accountScope: string;
  assetUniverse: string[];
  restrictedSectors: string[];

  // Numeric guardrails. USD as DecimalString; percentages as basis points
  // (integers); durations as preset ISO-8601 enums. No FLOAT64 anywhere.
  maxSingleOrderUsd: DecimalString;
  maxPositionSizeBps: number;
  minimumCashReserveBps: number;
  dailyOrderLimit: number;
  dailyLossPauseBps: number;
  drawdownPauseBps: number;
  maxOpenOrders: number;

  // Stale-data pauses.
  staleBrokerDataPauseAfter: StaleBrokerDataDuration;
  staleProfilePauseAfter: StaleProfileDuration;

  // Prerequisite pause toggles.
  pauseOnDisclosureSuperseded: boolean;
  pauseOnProfileSuperseded: boolean;

  updatedAt: string;
  meta: PrototypeMeta;
}

const drafts = kvStore<ExecutionPolicyDraft>("execution-policy-drafts");

/**
 * Default draft used when no draft exists yet for an account. Defaults match
 * memory/handoff_phase2_surface2.md so behavior is reproducible across
 * sessions.
 */
export function defaultExecutionPolicyDraft(
  accountId: string,
  correlationId: string,
): ExecutionPolicyDraft {
  return {
    accountId,
    strategyId: "core-balanced",
    accountScope: "primary",
    assetUniverse: ["US_LARGE_CAP_EQUITY"],
    restrictedSectors: [],
    maxSingleOrderUsd: "1000.00" as DecimalString,
    maxPositionSizeBps: 1000,
    minimumCashReserveBps: 500,
    dailyOrderLimit: 5,
    dailyLossPauseBps: 300,
    drawdownPauseBps: 1000,
    maxOpenOrders: 5,
    staleBrokerDataPauseAfter: "PT15M",
    staleProfilePauseAfter: "P90D",
    pauseOnDisclosureSuperseded: true,
    pauseOnProfileSuperseded: true,
    updatedAt: new Date().toISOString(),
    meta: makePrototypeMeta(correlationId),
  };
}

export async function getExecutionPolicyDraft(
  accountId: string,
): Promise<ExecutionPolicyDraft | null> {
  return drafts.get(accountId);
}

export async function saveExecutionPolicyDraft(args: {
  draft: Omit<ExecutionPolicyDraft, "updatedAt" | "meta">;
  correlationId: string;
}): Promise<ExecutionPolicyDraft> {
  const stored: ExecutionPolicyDraft = {
    ...args.draft,
    updatedAt: new Date().toISOString(),
    meta: makePrototypeMeta(args.correlationId),
  };
  await drafts.put(args.draft.accountId, stored);
  return stored;
}
