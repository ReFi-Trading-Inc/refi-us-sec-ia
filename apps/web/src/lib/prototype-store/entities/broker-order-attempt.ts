/**
 * BrokerOrderAttempt prototype-store entity.
 *
 * Daniel's BrokerOrderAttempts table uses INSERT-then-UPDATE: a row is
 * created with status="started" and outcome fields null, then mutated once
 * when the broker call completes. This mirror preserves that contract with
 * two and only two write paths:
 *
 *   - appendBrokerAttempt(): initial insert (immutable identity + request
 *     fields). Rejects duplicate attempt_id.
 *   - completeBrokerAttempt(): single-shot outcome update. Rejects:
 *       - attempt_id not found
 *       - attempt already completed (status !== "started")
 *       - outcome status not in OUTCOME_BROKER_ATTEMPT_STATUSES
 *     Sets status + response/error fields + completion timestamps + retry
 *     bookkeeping. Does NOT touch any immutable identity field.
 *
 * Frontend MUST NEVER call either function in production. Writers are
 * Trade Manager / Exec Gateway broker drivers. This entity is for fixture
 * seeding and dual-read.
 *
 * Lookups expose the index axes from Daniel's 7 BrokerOrderAttempts
 * indexes that matter to investor-side audit: by order, by correlation,
 * by retry chain (parent_attempt_id).
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type {
  BrokerOrderAttempt,
  BrokerAttemptOutcomeStatus,
} from "../../sec203a/broker-order-attempts";
import { OUTCOME_BROKER_ATTEMPT_STATUSES } from "../../sec203a/broker-order-attempts";

export interface StoredBrokerOrderAttempt extends BrokerOrderAttempt {
  bffMeta: PrototypeMeta;
}

const attempts = kvStore<StoredBrokerOrderAttempt>("broker-order-attempts");

// ─── Lookups ────────────────────────────────────────────────────────────────

export async function getBrokerAttempt(
  attemptId: string,
): Promise<StoredBrokerOrderAttempt | null> {
  return attempts.get(attemptId);
}

export async function listBrokerAttemptsForOrder(
  orderId: string,
): Promise<StoredBrokerOrderAttempt[]> {
  const all = await attempts.list();
  return all
    .map((e) => e.value)
    .filter((a) => a.orderId === orderId)
    .sort((a, b) => b.localStartedAt.localeCompare(a.localStartedAt));
}

export async function listBrokerAttemptsForCorrelation(
  correlationId: string,
): Promise<StoredBrokerOrderAttempt[]> {
  const all = await attempts.list();
  return all
    .map((e) => e.value)
    .filter((a) => a.correlationId === correlationId)
    .sort((a, b) => a.localStartedAt.localeCompare(b.localStartedAt));
}

/**
 * Returns the full retry chain (root + retries) for a given root attempt
 * id, ordered by attempt_seq ascending. The root attempt has
 * parent_attempt_id === undefined and its own attemptId === rootAttemptId.
 */
export async function listBrokerAttemptRetryChain(
  rootAttemptId: string,
): Promise<StoredBrokerOrderAttempt[]> {
  const all = await attempts.list();
  return all
    .map((e) => e.value)
    .filter(
      (a) =>
        a.attemptId === rootAttemptId || a.parentAttemptId === rootAttemptId,
    )
    .sort((a, b) => a.attemptSeq - b.attemptSeq);
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Initial insert. The attempt MUST have status="started"; any other status
 * is rejected (use completeBrokerAttempt() for outcome). Throws on
 * duplicate attempt_id.
 */
export async function appendBrokerAttempt(args: {
  attempt: BrokerOrderAttempt;
}): Promise<StoredBrokerOrderAttempt> {
  if (args.attempt.status !== "started") {
    throw new Error(
      `appendBrokerAttempt requires status="started", got "${args.attempt.status}" — use completeBrokerAttempt for outcome`,
    );
  }
  if (
    args.attempt.localCompletedAt !== undefined ||
    args.attempt.responsePayloadRaw !== undefined ||
    args.attempt.responsePayloadNormalized !== undefined ||
    args.attempt.httpStatus !== undefined ||
    args.attempt.errorType !== undefined
  ) {
    throw new Error(
      `appendBrokerAttempt: completion fields (localCompletedAt / response* / httpStatus / errorType) must be undefined at append time`,
    );
  }
  const stored: StoredBrokerOrderAttempt = {
    ...args.attempt,
    bffMeta: makePrototypeMeta(
      args.attempt.correlationId ?? args.attempt.attemptId,
    ),
  };
  const ok = await attempts.putIfAbsent(args.attempt.attemptId, stored);
  if (!ok) {
    throw new Error(
      `broker attempt ${args.attempt.attemptId} already exists — initial insert only`,
    );
  }
  return stored;
}

export interface BrokerAttemptCompletion {
  attemptId: string;
  status: BrokerAttemptOutcomeStatus;
  localCompletedAt: string;
  brokerAckAt?: string;
  nextRetryNotBefore?: string;
  httpStatus?: number;
  brokerCode?: string;
  brokerMessage?: string;
  errorType?: string;
  errorMessage?: string;
  retryable?: boolean;
  responsePayloadRaw?: Record<string, unknown>;
  responsePayloadNormalized?: Record<string, unknown>;
  rawResponseHash?: string;
}

/**
 * Single-shot completion. Validates:
 *   - attempt exists
 *   - attempt is still in status="started"
 *   - outcome status is in OUTCOME_BROKER_ATTEMPT_STATUSES (i.e. not "started")
 * Then mutates ONLY the outcome-side fields. Identity / request fields are
 * preserved byte-for-byte.
 */
export async function completeBrokerAttempt(
  args: BrokerAttemptCompletion,
): Promise<StoredBrokerOrderAttempt> {
  const current = await attempts.get(args.attemptId);
  if (!current) {
    throw new Error(`broker attempt ${args.attemptId} not found`);
  }
  if (current.status !== "started") {
    throw new Error(
      `broker attempt ${args.attemptId} already completed (status=${current.status}); double-completion rejected`,
    );
  }
  if (
    !(OUTCOME_BROKER_ATTEMPT_STATUSES as readonly string[]).includes(
      args.status,
    )
  ) {
    throw new Error(
      `completion status "${args.status}" is not in OUTCOME_BROKER_ATTEMPT_STATUSES`,
    );
  }
  const next: StoredBrokerOrderAttempt = {
    ...current,
    status: args.status,
    localCompletedAt: args.localCompletedAt,
    ...(args.brokerAckAt ? { brokerAckAt: args.brokerAckAt } : {}),
    ...(args.nextRetryNotBefore
      ? { nextRetryNotBefore: args.nextRetryNotBefore }
      : {}),
    ...(args.httpStatus !== undefined ? { httpStatus: args.httpStatus } : {}),
    ...(args.brokerCode ? { brokerCode: args.brokerCode } : {}),
    ...(args.brokerMessage ? { brokerMessage: args.brokerMessage } : {}),
    ...(args.errorType ? { errorType: args.errorType } : {}),
    ...(args.errorMessage ? { errorMessage: args.errorMessage } : {}),
    ...(args.retryable !== undefined ? { retryable: args.retryable } : {}),
    ...(args.responsePayloadRaw
      ? { responsePayloadRaw: args.responsePayloadRaw }
      : {}),
    ...(args.responsePayloadNormalized
      ? { responsePayloadNormalized: args.responsePayloadNormalized }
      : {}),
    ...(args.rawResponseHash ? { rawResponseHash: args.rawResponseHash } : {}),
  };
  await attempts.put(args.attemptId, next);
  return next;
}
