/**
 * GET /api/v1/investor/profile/reactivation
 *
 * Read-only eligibility view for the Profile re-confirmation surface
 * (Surface 6). Returns whether the investor's advisory profile is stale
 * relative to the active ExecutionPolicy, and whether the change between
 * the pinned version and the latest snapshot is material (a new snapshot
 * exists) versus aging-only (same snapshot, but the system has held
 * automation for a staleness reason).
 *
 * Profile re-confirmation is an eligibility event, not a recommendation
 * acceptance event. No receipt is emitted from this read-only route.
 */
import { bffRead } from "@lib/bff/handler";
import {
  getLatestExecutionPolicy,
  getLatestProfileConfirmation,
  getLatestProfileSnapshot,
  getManagedExecutionState,
  listProfileSnapshots,
} from "@lib/prototype-store";

const STALE_PROFILE_REASON_PREFIX = "stale_profile";

export type ProfileReactivationBlockerReason =
  | "stale_profile_aging"
  | "stale_profile_changed"
  | null;

export interface ProfileReactivationView {
  activePolicyVersion: number | null;
  pinnedProfileVersion: number | null;
  latestProfileVersion: number | null;
  lastConfirmedVersion: number | null;
  lastConfirmedAt: string | null;
  staleProfile: boolean;
  materialChange: boolean;
  changedFields: string[];
  blockerReason: ProfileReactivationBlockerReason;
  managedExecutionStatus: string | null;
  managedExecutionReasonCode: string | null;
}

function diffProfileFields(
  pinnedSnapshot: { [k: string]: unknown } | null,
  latestSnapshot: { [k: string]: unknown } | null,
): string[] {
  if (!pinnedSnapshot || !latestSnapshot) return [];
  const tracked = [
    "goal",
    "horizon",
    "incomeBand",
    "liquidityNeed",
    "riskTolerance",
    "experience",
    "accountPurpose",
    "restrictions",
  ];
  return tracked.filter(
    (k) => (pinnedSnapshot[k] ?? "") !== (latestSnapshot[k] ?? ""),
  );
}

export const GET = bffRead<ProfileReactivationView>({
  source: "prototype-bff",
  upstreamGap: ["G-003", "G-006"],
  fetch: async (ctx) => {
    const empty: ProfileReactivationView = {
      activePolicyVersion: null,
      pinnedProfileVersion: null,
      latestProfileVersion: null,
      lastConfirmedVersion: null,
      lastConfirmedAt: null,
      staleProfile: false,
      materialChange: false,
      changedFields: [],
      blockerReason: null,
      managedExecutionStatus: null,
      managedExecutionReasonCode: null,
    };
    if (!("auth" in ctx) || !ctx.auth || !ctx.auth.accountId) return empty;
    const accountId = ctx.auth.accountId;

    const [policy, latestSnapshot, allSnapshots, mes, lastConfirmation] =
      await Promise.all([
        getLatestExecutionPolicy(accountId),
        getLatestProfileSnapshot(accountId),
        listProfileSnapshots(accountId),
        getManagedExecutionState(accountId),
        getLatestProfileConfirmation(accountId),
      ]);

    if (!policy || !latestSnapshot) {
      return {
        ...empty,
        activePolicyVersion: policy?.policyVersion ?? null,
        latestProfileVersion: latestSnapshot?.profileVersion ?? null,
        managedExecutionStatus: mes?.status ?? null,
        managedExecutionReasonCode: mes?.reasonCode ?? null,
      };
    }

    const pinnedSnapshot =
      allSnapshots.find(
        (s) => s.profileVersion === policy.advisoryProfileVersion,
      ) ?? null;
    const materialChange =
      latestSnapshot.profileVersion > policy.advisoryProfileVersion;
    const changedFields = materialChange
      ? diffProfileFields(
          pinnedSnapshot as unknown as Record<string, unknown> | null,
          latestSnapshot as unknown as Record<string, unknown>,
        )
      : [];

    const staleByMes =
      mes?.status === "paused_by_system" &&
      (mes.reasonCode?.startsWith(STALE_PROFILE_REASON_PREFIX) ?? false);
    // For the prototype, the only staleness signal is the MES reason code.
    // A background ageing job would set this in production.
    const staleProfile = staleByMes || materialChange;
    const blockerReason: ProfileReactivationBlockerReason = !staleProfile
      ? null
      : materialChange
        ? "stale_profile_changed"
        : "stale_profile_aging";

    return {
      activePolicyVersion: policy.policyVersion,
      pinnedProfileVersion: policy.advisoryProfileVersion,
      latestProfileVersion: latestSnapshot.profileVersion,
      lastConfirmedVersion: lastConfirmation?.profileVersion ?? null,
      lastConfirmedAt: lastConfirmation?.confirmedAt ?? null,
      staleProfile,
      materialChange,
      changedFields,
      blockerReason,
      managedExecutionStatus: mes?.status ?? null,
      managedExecutionReasonCode: mes?.reasonCode ?? null,
    };
  },
});
