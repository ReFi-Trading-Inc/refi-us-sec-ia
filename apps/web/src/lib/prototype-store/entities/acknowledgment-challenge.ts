/**
 * Durable acknowledgment challenge (alpha.3 `AcknowledgmentContinuation`).
 *
 * When the backend answers a preference mutation or a brokerage disconnect
 * with `409 ACKNOWLEDGMENT_REQUIRED`, the frontend RETAINS the complete
 * validated continuation together with the exact intended mutation, so the
 * later confirmation is bound to precisely what the backend required and to
 * precisely what the investor asked for. The first challenge answer is never
 * a completed mutation.
 *
 * States: challenged → consented (consent recorded for the required
 * disclosure tuple) → confirmed (backend applied/accepted the confirmation);
 * `failed` is terminal. Keyed by (account, continuation_ref).
 */
import type { AcknowledgmentContinuation } from "@refi/api-clients/investor-api";
import { resolveKvStore } from "../../store";
import { makePrototypeMeta, type PrototypeMeta } from "../store";

export type ChallengeKind = "preference" | "disconnect";
export type ChallengeState =
  "challenged" | "consented" | "confirmed" | "failed";

export interface PreferenceIntent {
  kind: "preference";
  expectedVersion: number;
  patch: Record<string, unknown>;
}
export interface DisconnectIntent {
  kind: "disconnect";
  connectionId: string;
}

export interface AcknowledgmentChallengeRecord {
  accountId: string;
  continuationRef: string;
  kind: ChallengeKind;
  continuation: AcknowledgmentContinuation;
  intent: PreferenceIntent | DisconnectIntent;
  /** Idempotency-Key of the INITIAL request (never reused for confirmation). */
  initialKey: string;
  /** Idempotency-Key of the confirmation (new key; reused only for lost-response recovery). */
  confirmKey?: string;
  consentReceiptId?: string;
  state: ChallengeState;
  history: Array<{
    state: ChallengeState;
    at: string;
    correlationId: string;
    detail?: Record<string, string | number | boolean>;
  }>;
  meta: PrototypeMeta;
}

const NEXT: Record<ChallengeState, readonly ChallengeState[]> = {
  challenged: ["consented", "failed"],
  consented: ["confirmed", "failed"],
  confirmed: [],
  failed: [],
};

export class ChallengeTransitionError extends Error {
  constructor(
    readonly from: ChallengeState,
    readonly to: ChallengeState,
  ) {
    super(`acknowledgment challenge: illegal transition ${from} → ${to}`);
    this.name = "ChallengeTransitionError";
  }
}

const store = () =>
  resolveKvStore<AcknowledgmentChallengeRecord>(
    "acknowledgment-challenge",
    "acknowledgment-challenges",
  );
const key = (accountId: string, ref: string) => `${accountId}__${ref}`;

export async function getAcknowledgmentChallenge(
  accountId: string,
  continuationRef: string,
) {
  return store().get(key(accountId, continuationRef));
}

export async function openAcknowledgmentChallenge(args: {
  accountId: string;
  kind: ChallengeKind;
  continuation: AcknowledgmentContinuation;
  intent: PreferenceIntent | DisconnectIntent;
  initialKey: string;
  correlationId: string;
}): Promise<AcknowledgmentChallengeRecord> {
  const k = key(args.accountId, args.continuation.continuation_ref);
  const existing = await store().get(k);
  if (existing) return existing;
  const now = new Date().toISOString();
  const record: AcknowledgmentChallengeRecord = {
    accountId: args.accountId,
    continuationRef: args.continuation.continuation_ref,
    kind: args.kind,
    continuation: args.continuation,
    intent: args.intent,
    initialKey: args.initialKey,
    state: "challenged",
    history: [
      { state: "challenged", at: now, correlationId: args.correlationId },
    ],
    meta: makePrototypeMeta(args.correlationId),
  };
  const created = await store().putIfAbsent(k, record);
  if (created) return record;
  const raced = await store().get(k);
  if (!raced) throw new Error("challenge create/read race");
  return raced;
}

export async function advanceAcknowledgmentChallenge(args: {
  accountId: string;
  continuationRef: string;
  to: ChallengeState;
  correlationId: string;
  detail?: Record<string, string | number | boolean>;
  patch?: Partial<
    Pick<AcknowledgmentChallengeRecord, "confirmKey" | "consentReceiptId">
  >;
}): Promise<AcknowledgmentChallengeRecord> {
  const k = key(args.accountId, args.continuationRef);
  const current = await store().get(k);
  if (!current) throw new Error("challenge not open");
  if (!NEXT[current.state].includes(args.to)) {
    throw new ChallengeTransitionError(current.state, args.to);
  }
  const next: AcknowledgmentChallengeRecord = {
    ...current,
    ...args.patch,
    state: args.to,
    history: [
      ...current.history,
      {
        state: args.to,
        at: new Date().toISOString(),
        correlationId: args.correlationId,
        ...(args.detail ? { detail: args.detail } : {}),
      },
    ],
  };
  await store().put(k, next);
  return next;
}

/** Record the confirmation key on a `consented` record without changing state. */
export async function setConfirmKey(
  accountId: string,
  continuationRef: string,
  confirmKey: string,
) {
  const k = key(accountId, continuationRef);
  const current = await store().get(k);
  if (!current) throw new Error("challenge not open");
  if (current.confirmKey && current.confirmKey !== confirmKey) {
    throw new Error("confirmation key already fixed for this challenge");
  }
  const next = { ...current, confirmKey };
  await store().put(k, next);
  return next;
}
