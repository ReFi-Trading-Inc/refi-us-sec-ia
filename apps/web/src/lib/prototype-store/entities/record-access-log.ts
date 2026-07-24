/**
 * RecordAccessLog — append-only log of investor read/view/export events.
 *
 * Separate from InvestorActionReceipt by design (see
 * memory/contract_receipt_vs_access_log.md): view/download/export are
 * accesses, not state-changing actions. Mixing them muddies the audit story.
 *
 * Emitted by:
 *   - GET /api/v1/investor/records/[id]
 *   - GET /api/v1/investor/evidence/*
 *   - Future record download/export endpoints.
 */
import { resolveAppendOnlyStore } from "../../store";
import type { RecordAccessAction } from "../../sec203a/actions";

export interface RecordAccessEvent {
  accessId: string;
  action: RecordAccessAction;
  authId: string;
  accountId?: string;
  correlationId: string;
  recordRef: string;
  ipHash?: string;
  userAgentHash?: string;
  emittedAt: string;
  source: "prototype-bff";
}

// Routed through the S3 factory. Rule 204-2 book-and-record post-ADV;
// durable backing (Firestore, S3 follow-up) is what survives redeploys.
const log = resolveAppendOnlyStore<RecordAccessEvent>(
  "record-access-log",
  "record-access-log",
);

export async function appendRecordAccess(args: {
  action: RecordAccessAction;
  authId: string;
  accountId?: string;
  correlationId: string;
  recordRef: string;
  ipHash?: string;
  userAgentHash?: string;
}): Promise<RecordAccessEvent> {
  const event: RecordAccessEvent = {
    accessId: crypto.randomUUID(),
    action: args.action,
    authId: args.authId,
    ...(args.accountId ? { accountId: args.accountId } : {}),
    correlationId: args.correlationId,
    recordRef: args.recordRef,
    ...(args.ipHash ? { ipHash: args.ipHash } : {}),
    ...(args.userAgentHash ? { userAgentHash: args.userAgentHash } : {}),
    emittedAt: new Date().toISOString(),
    source: "prototype-bff",
  };
  await log.append(event);
  return event;
}

export async function listRecordAccesses(args: {
  authId?: string;
  accountId?: string;
  limit?: number;
}): Promise<RecordAccessEvent[]> {
  const all = await log.list((e) => {
    if (args.authId && e.authId !== args.authId) return false;
    if (args.accountId && e.accountId !== args.accountId) return false;
    return true;
  });
  const sorted = all.sort((a, b) => b.emittedAt.localeCompare(a.emittedAt));
  return args.limit ? sorted.slice(0, args.limit) : sorted;
}
