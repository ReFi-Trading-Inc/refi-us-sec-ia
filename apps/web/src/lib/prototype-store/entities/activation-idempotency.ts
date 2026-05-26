/**
 * Activation idempotency record.
 *
 * Maps an idempotency key (either an explicit `Idempotency-Key` header or a
 * deterministically derived key) to the resulting ExecutionPolicy version
 * that was already signed for that key. Replays return the stored result
 * without appending a new policy version or creating duplicate evidence.
 *
 * Scope: ActivateExecutionPolicy only. Other state-changing routes don't
 * need this — they're naturally idempotent (set-on-write) or operate on
 * already-versioned objects.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export interface ActivationIdempotencyRecord {
  idempotencyKey: string;
  accountId: string;
  policyId: string;
  policyVersion: number;
  completedAt: string;
  meta: PrototypeMeta;
}

const records = kvStore<ActivationIdempotencyRecord>("activation-idempotency");

export async function getActivationByIdempotencyKey(
  idempotencyKey: string,
): Promise<ActivationIdempotencyRecord | null> {
  return records.get(idempotencyKey);
}

export async function recordActivationIdempotency(args: {
  idempotencyKey: string;
  accountId: string;
  policyId: string;
  policyVersion: number;
  correlationId: string;
}): Promise<ActivationIdempotencyRecord> {
  const stored: ActivationIdempotencyRecord = {
    idempotencyKey: args.idempotencyKey,
    accountId: args.accountId,
    policyId: args.policyId,
    policyVersion: args.policyVersion,
    completedAt: new Date().toISOString(),
    meta: makePrototypeMeta(args.correlationId),
  };
  await records.put(args.idempotencyKey, stored);
  return stored;
}
