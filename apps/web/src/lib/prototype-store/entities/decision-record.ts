/**
 * DecisionRecord — investor-readable projection of Daniel's advisory chain
 * (AccountIntents + RiskSnapshots + ExecutionPlans + Orders + Fills +
 * AuditEvents).
 *
 * Carries the version pins that prove SEC Rule 203A-2(e) compliance:
 *   advisory profile version + execution policy version + disclosure versions
 *   + advisory agreement version + model artifact version.
 *
 * Today: `prototype-bff` source. When the backend chain wires, source flips
 * to `backend` and we dual-read for one release per the migration plan in
 * docs/bff-prototype-state-contract.md.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export interface DecisionRecord {
  accountId: string;
  recordId: string;

  // Version pins (the SEC 203A-2(e) provenance set).
  advisoryProfileVersion: number;
  executionPolicyVersion?: number;
  prefsVersion?: number;
  disclosureVersions: Array<{ docId: string; version: string }>;
  advisoryAgreementVersion?: string;
  modelArtifactVersion?: string;
  strategyId?: string;
  riskGuardrailHash?: string;
  restrictionsHash?: string;

  // Backend chain ids (filled when projected from real lifecycle).
  intentId?: string;
  riskSnapshotId?: string;
  planId?: string;
  orderIds: string[];
  fillIds: string[];
  auditEventIds: string[];

  // Investor-readable summary.
  decisionSummary: string;
  deliveryChannel: "platform";
  deliveredAt: string;

  meta: PrototypeMeta;
}

const records = kvStore<DecisionRecord>("decision-records");

function recordKey(accountId: string, recordId: string): string {
  return `${accountId}__${recordId}`;
}

export async function getDecisionRecord(
  accountId: string,
  recordId: string,
): Promise<DecisionRecord | null> {
  return records.get(recordKey(accountId, recordId));
}

export async function listDecisionRecords(
  accountId: string,
): Promise<DecisionRecord[]> {
  const all = await records.list(`${accountId}__`);
  return all
    .map((e) => e.value)
    .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
}

export async function appendDecisionRecord(args: {
  record: Omit<DecisionRecord, "meta">;
  correlationId: string;
}): Promise<DecisionRecord> {
  const stored: DecisionRecord = {
    ...args.record,
    meta: makePrototypeMeta(args.correlationId),
  };
  const ok = await records.putIfAbsent(
    recordKey(args.record.accountId, args.record.recordId),
    stored,
  );
  if (!ok) {
    throw new Error(
      `decision record ${args.record.accountId}/${args.record.recordId} already exists`,
    );
  }
  return stored;
}
