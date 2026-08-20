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
 *
 * ─── Investor-editable field set (Daniel 2026-07-28) ───────────────────────
 *
 * The editable numeric guardrails are EXACTLY the four backend
 * `AccountPrefs` fields Daniel approved:
 *
 *   drift_threshold | min_order | excluded_assets | fractional_enabled
 *
 * `RiskLimits`, template risk settings, broker state, and operator/system
 * controls are READ-ONLY to the investor, and the frontend must not offer a
 * capital-allocation percentage control — it is not a current `AccountPrefs`
 * capability. See docs/phase2-7-daniel-direction-resolution.md §4.
 *
 * Removed 2026-07-30 for that reason (previously editable here):
 *   maxPositionSizeBps, minimumCashReserveBps  — capital allocation
 *   maxSingleOrderUsd, dailyOrderLimit, dailyLossPauseBps,
 *   drawdownPauseBps, maxOpenOrders            — risk limits
 *
 * Those seven had no backend `AccountPrefs` equivalent, so persisting them
 * would have made the frontend the system of record for guardrails the
 * backend actually enforces — precisely the outcome Daniel's "the frontend's
 * interim history should not become the long-term system of record" warns
 * against. The stale-data pause toggles below are retained: they govern when
 * the BFF stops acting, not how much capital moves or what risk is accepted.
 *
 * Values are carried in the same units the backend `AccountPrefs` uses:
 * `driftThreshold` and `minOrder` as DecimalString (never float),
 * `excludedAssets` as opaque asset ids, `fractionalEnabled` as a boolean.
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

  // Investor-editable AccountPrefs mirror — exactly four fields. No FLOAT64
  // anywhere; money and thresholds carry as DecimalString.
  /** `drift_threshold` — rebalance trigger band, as a decimal fraction. */
  driftThreshold: DecimalString;
  /** `min_order` — minimum order notional (USD). */
  minOrder: DecimalString;
  /** `excluded_assets` — opaque asset ids the investor will not hold. */
  excludedAssets: string[];
  /** `fractional_enabled` — whether fractional quantities are permitted. */
  fractionalEnabled: boolean;

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
    driftThreshold: "0.05" as DecimalString,
    minOrder: "25.00" as DecimalString,
    excludedAssets: [],
    fractionalEnabled: false,
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
