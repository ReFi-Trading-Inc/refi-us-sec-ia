/**
 * Execution Policy — the investor-approved, durable, versioned policy object.
 *
 * This is the SEC 203A-2(e) product fulcrum: the artifact the investor
 * signs at activation. Each version is immutable; updates produce a new
 * version. The activation receipt references the specific version.
 *
 * Distinct from ManagedExecutionState (the runtime status machine — see
 * managed-execution-state.ts).
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

  // Investor-set thresholds (decimal strings, never JS numbers).
  driftThreshold?: DecimalString;
  rebalanceFrequency?: string;
  maxOrderSize?: DecimalString;
  maxTurnover?: DecimalString;

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
