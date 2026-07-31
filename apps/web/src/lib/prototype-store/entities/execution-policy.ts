/**
 * Execution Policy — BFF-owned signed investor-authorization artifact.
 *
 * What this is:
 *   - A BFF-owned, durable, append-only ledger of the signed standing
 *     authorization the investor produces at Managed-mode activation.
 *   - The SEC 203A-2(e) product fulcrum: it captures the disclosure
 *     versions, advisory-profile version, advisory-agreement version,
 *     and signed evidence (timestamp, IP hash, device fingerprint hash)
 *     in effect at the moment of activation.
 *   - `policyId` and `policyVersion` are BFF-assigned identifiers for this
 *     BFF-owned artifact. They are NOT mirrors of any Daniel backend field.
 *
 * What this is NOT:
 *   - NOT a Daniel backend object. `refinity-main` has no `ExecutionPolicy`
 *     table; Daniel's execution path runs on `AccountPrefs`, `AccountConsents`,
 *     `UserConsents`, `RiskLimits`, `TradingControlStates`, `AccountIntents`,
 *     `RiskSnapshots`, `ExecutionPlans`, `Orders`, `OrderEvents`, and
 *     downstream lifecycle evidence.
 *   - NOT an `exec-gateway` policy contract. Do not pass this artifact (or
 *     its `policyId` / `policyVersion`) downstream as a backend trust input.
 *   - NOT a broker-driver `ExecutionPolicy`. The broker submission path is
 *     backend-owned; the investor product reads order lifecycle state through
 *     `investor-api` projections, never through the Admin Portal (rejected as
 *     the investor boundary, Daniel 2026-07-28).
 *   - NOT `ManagedExecutionState` (see managed-execution-state.ts), which
 *     answers "under the current authorization, what is automation doing
 *     right now?"
 *
 * Why it stays as `ExecutionPolicy` for now:
 *   - Six shipped E2E specs treat `policyVersion` bumps as the audit-trail
 *     contract for disclosure re-acknowledgement, profile reactivation,
 *     managed pause/resume, activation, and exception review.
 *   - Phase 2.6 PR-C is a type/fixture realignment, not a behavior change.
 *   - PR-D (AccountPrefs History Contract + canonical backend-aligned writer
 *     path) is the appropriate place to consider a rename to
 *     `InvestorSignedPolicy` / `ManagedAuthorizationArtifact`. The rename
 *     itself is optional — the doc-comment above is the contract.
 *
 * See:
 *   - docs/phase2-6-signal-to-investor-product-contract-v3.md §4 (removals
 *     vs preserved-as-BFF-owned)
 *   - memory: contract_execution_policy.md (Execution Policy vs Managed
 *     Execution State separation)
 *
 * All thresholds carry as DecimalString to avoid float precision loss; the
 * BFF refuses non-decimal-string inputs at the boundary.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type { DecimalString } from "../../sec203a/decimal";

export interface ExecutionPolicy {
  accountId: string;
  policyId: string;
  policyVersion: number;

  // Strategy + scope.
  strategyId: string;
  accountScope: string;
  assetUniverse: string[];

  // Investor-set preferences (decimal strings, never JS numbers). These mirror
  // the four investor-editable backend `AccountPrefs` fields and nothing more —
  // see apps/web/src/lib/sec203a/account-prefs.ts. `maxOrderSize` and
  // `maxTurnover` were removed on 2026-07-30: they are backend `RiskLimits`
  // concerns, read-only to the investor.
  driftThreshold?: DecimalString;
  minOrder?: DecimalString;
  excludedAssets?: string[];
  fractionalEnabled?: boolean;
  rebalanceFrequency?: string;

  // Guardrails + restrictions (hashes preserved for audit).
  riskGuardrailHash: string;
  restrictionsHash: string;
  pauseRules: string[];
  notificationPreferences: string[];

  // Provenance / cross-version pins.
  advisoryProfileVersion: number;
  disclosureVersions: Array<{ docId: string; version: string }>;
  advisoryAgreementVersion: string;

  // Authorization evidence.
  signedAt: string;
  signedByAuthId: string;
  signedIpHash: string;
  signedDeviceFingerprintHash: string;
  correlationId: string;

  meta: PrototypeMeta;
}

const policies = kvStore<ExecutionPolicy>("execution-policies");

function policyKey(accountId: string, version: number): string {
  return `${accountId}__v${String(version).padStart(6, "0")}`;
}

export async function listExecutionPolicies(
  accountId: string,
): Promise<ExecutionPolicy[]> {
  const all = await policies.list(`${accountId}__`);
  return all
    .map((e) => e.value)
    .sort((a, b) => a.policyVersion - b.policyVersion);
}

export async function getLatestExecutionPolicy(
  accountId: string,
): Promise<ExecutionPolicy | null> {
  const list = await listExecutionPolicies(accountId);
  return list.length === 0 ? null : (list[list.length - 1] ?? null);
}

export async function getExecutionPolicy(
  accountId: string,
  version: number,
): Promise<ExecutionPolicy | null> {
  return policies.get(policyKey(accountId, version));
}

export async function appendExecutionPolicy(args: {
  policy: Omit<ExecutionPolicy, "policyVersion" | "policyId" | "meta">;
}): Promise<ExecutionPolicy> {
  const existing = await listExecutionPolicies(args.policy.accountId);
  const last = existing[existing.length - 1];
  const nextVersion = last ? last.policyVersion + 1 : 1;
  const stored: ExecutionPolicy = {
    ...args.policy,
    policyVersion: nextVersion,
    policyId: `${args.policy.accountId}-policy-v${String(nextVersion)}`,
    meta: makePrototypeMeta(args.policy.correlationId),
  };
  const ok = await policies.putIfAbsent(
    policyKey(args.policy.accountId, nextVersion),
    stored,
  );
  if (!ok) {
    throw new Error(
      `execution policy ${args.policy.accountId}/v${String(nextVersion)} already exists`,
    );
  }
  return stored;
}
