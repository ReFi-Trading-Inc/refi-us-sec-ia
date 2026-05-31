/**
 * RiskLimits — append-per-version mirror of Daniel's `RiskLimits` table.
 *
 * Daniel's table is keyed by `account_id` and is single-row-per-account.
 * The frontend ledger is append-per-version: every advisor update produces
 * a new immutable version so Records center / disclosure surfaces can prove
 * "what limits applied at decision time T" against any historical decision.
 *
 * Investor-side semantics: READ ONLY. The investor never sets these.
 * Write is exposed for advisor/admin context (out of scope here) and for
 * fixture seeding.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type { RiskLimits } from "../../sec203a/risk";

export interface StoredRiskLimits extends RiskLimits {
  version: number;
  meta: PrototypeMeta;
}

const limits = kvStore<StoredRiskLimits>("risk-limits");

function limitsKey(accountId: string, version: number): string {
  return `${accountId}__v${String(version).padStart(6, "0")}`;
}

export async function listRiskLimits(
  accountId: string,
): Promise<StoredRiskLimits[]> {
  const all = await limits.list(`${accountId}__`);
  return all.map((e) => e.value).sort((a, b) => a.version - b.version);
}

export async function getLatestRiskLimits(
  accountId: string,
): Promise<StoredRiskLimits | null> {
  const list = await listRiskLimits(accountId);
  return list.length === 0 ? null : (list[list.length - 1] ?? null);
}

export async function getRiskLimitsVersion(
  accountId: string,
  version: number,
): Promise<StoredRiskLimits | null> {
  return limits.get(limitsKey(accountId, version));
}

export async function appendRiskLimits(args: {
  limits: RiskLimits;
  correlationId: string;
}): Promise<StoredRiskLimits> {
  const existing = await listRiskLimits(args.limits.accountId);
  const last = existing[existing.length - 1];
  const nextVersion = last ? last.version + 1 : 1;
  const stored: StoredRiskLimits = {
    ...args.limits,
    version: nextVersion,
    meta: makePrototypeMeta(args.correlationId),
  };
  const ok = await limits.putIfAbsent(
    limitsKey(args.limits.accountId, nextVersion),
    stored,
  );
  if (!ok) {
    throw new Error(
      `risk limits ${args.limits.accountId}/v${String(nextVersion)} already exists`,
    );
  }
  return stored;
}
