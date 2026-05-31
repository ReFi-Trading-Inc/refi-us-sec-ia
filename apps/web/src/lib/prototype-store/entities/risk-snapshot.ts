/**
 * RiskSnapshot — immutable evidence of the risk gate's decision for a single
 * account intent. Mirror of Daniel's `RiskSnapshots` table (PK: intent_id).
 *
 * Compliance posture: this is the per-decision evidence required under
 * 17 CFR 275.204-2. Once written, a snapshot may NEVER be mutated; a second
 * write with the same intentId is rejected.
 *
 * Daniel's row carries `assessed_at` with allow_commit_timestamp; the
 * frontend mirror generates its own `assessedAt` if the caller doesn't
 * supply one.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type { RiskSnapshot } from "../../sec203a/risk";

export interface StoredRiskSnapshot extends RiskSnapshot {
  meta: PrototypeMeta;
}

const snapshots = kvStore<StoredRiskSnapshot>("risk-snapshots");

export async function getRiskSnapshot(
  intentId: string,
): Promise<StoredRiskSnapshot | null> {
  return snapshots.get(intentId);
}

export async function listRiskSnapshotsForAccount(
  accountId: string,
): Promise<StoredRiskSnapshot[]> {
  const all = await snapshots.list();
  return all
    .map((e) => e.value)
    .filter((s) => s.accountId === accountId)
    .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt));
}

export async function appendRiskSnapshot(args: {
  snapshot: RiskSnapshot;
}): Promise<StoredRiskSnapshot> {
  const stored: StoredRiskSnapshot = {
    ...args.snapshot,
    meta: makePrototypeMeta(args.snapshot.correlationId),
  };
  const ok = await snapshots.putIfAbsent(args.snapshot.intentId, stored);
  if (!ok) {
    throw new Error(
      `risk snapshot for intent ${args.snapshot.intentId} already exists — snapshots are immutable per intent_id`,
    );
  }
  return stored;
}
