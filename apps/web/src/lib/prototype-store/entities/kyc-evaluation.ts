/**
 * ReFi KYC evaluation record — the durable, provider-neutral state behind a
 * user's identity-verification journey (mandate §8, §12, §13, §19).
 *
 * One record per authenticated user (`authId`). It carries the ReFi
 * lifecycle state, the evidence record, DocV step-up bookkeeping and the
 * provider correlation id — never applicant PII, never documents, never raw
 * provider payloads. Two side tables make provider callbacks safe:
 *
 *   evaluation index   providerEvaluationId → authId   (webhook correlation;
 *                      an unknown evaluation never creates a user)
 *   webhook events     event id → outcome              (exactly-once effect)
 *
 * Terminal states never regress: a stale REVIEW cannot overwrite a final
 * ACCEPT; a final REJECT never silently becomes VERIFIED — a conflicting
 * final decision is recorded as a CONFLICT for compliance follow-up and the
 * state is left unchanged.
 */
import { resolveKvStore } from "../../store";
import { makePrototypeMeta, type PrototypeMeta } from "../store";
import {
  TERMINAL_KYC_STATES,
  type KycLifecycleState,
} from "../../kyc/provider";
import {
  deriveComponentStatuses,
  emptyEvidence,
  type KycDecisionProvenance,
  type KycEvidenceRecord,
  type KycProviderDecision,
} from "../../kyc/evidence";

export interface KycEvaluationEvent {
  state: KycLifecycleState;
  at: string;
  correlationId: string;
  provenance: KycDecisionProvenance | "user" | "system";
  /** Machine detail (ids, reason codes). Never PII. */
  detail?: Record<string, string | number | boolean>;
}

export interface KycEvaluationRecord {
  authId: string;
  /** Opaque ReFi reference (`refi-kyc-…`). Never the provider id. */
  referenceId: string;
  state: KycLifecycleState;
  startedAt: string | null;
  updatedAt: string;
  history: KycEvaluationEvent[];
  evidence: KycEvidenceRecord;
  /**
   * Local idempotency for evaluation creation: the key of the submission
   * that is in flight or last completed. A retry carrying the same key never
   * creates a second provider evaluation.
   */
  submission: {
    key: string;
    phase: "submitting" | "answered" | "failed";
    at: string;
    /** The customer-defined request id sent to the provider for this submission. */
    providerRequestId?: string;
  } | null;
  docv: {
    /** Provider DocV transaction token — needed by the browser SDK for THIS user only. */
    transactionToken: string;
    issuedAt: string;
    launchedAt: string | null;
    captureCompletedAt: string | null;
  } | null;
  lastProviderError: {
    kind: string;
    retryable: boolean;
    at: string;
  } | null;
  /** Set when a conflicting final decision arrived after a terminal state. */
  conflict: {
    providerDecision: KycProviderDecision;
    eventId: string;
    at: string;
  } | null;
  meta: PrototypeMeta;
}

export interface KycWebhookEventRecord {
  eventId: string;
  providerEvaluationId: string;
  providerDecision: KycProviderDecision | null;
  receivedAt: string;
  outcome:
    | "applied"
    | "duplicate_event"
    | "unknown_evaluation"
    | "evaluation_mismatch"
    | "idempotent_same_result"
    | "conflict_flagged"
    | "stale_ignored"
    | "ignored_event_type";
  /** Provider event type as delivered (audit). */
  eventType?: string;
}

const HISTORY_LIMIT = 64;
const records = () =>
  resolveKvStore<KycEvaluationRecord>("kyc-evaluation", "kyc-evaluations");
const evalIndex = () =>
  resolveKvStore<{ authId: string; at: string }>(
    "kyc-evaluation",
    "kyc-evaluation-index",
  );
const webhookEvents = () =>
  resolveKvStore<KycWebhookEventRecord>(
    "kyc-webhook-event",
    "kyc-webhook-events",
  );

const nowIso = () => new Date().toISOString();

export function freshKycEvaluation(
  authId: string,
  provider: string,
  correlationId = "kyc",
): KycEvaluationRecord {
  const at = nowIso();
  const referenceId = `refi-kyc-${crypto.randomUUID()}`;
  return {
    authId,
    referenceId,
    state: "not_started",
    startedAt: null,
    updatedAt: at,
    history: [
      { state: "not_started", at, correlationId, provenance: "system" },
    ],
    evidence: { ...emptyEvidence(provider, "not_started"), referenceId },
    submission: null,
    docv: null,
    lastProviderError: null,
    conflict: null,
    meta: makePrototypeMeta(correlationId),
  };
}

export async function getKycEvaluation(
  authId: string,
): Promise<KycEvaluationRecord | null> {
  return records().get(authId);
}

export async function putKycEvaluation(
  record: KycEvaluationRecord,
): Promise<void> {
  await records().put(record.authId, record);
  if (record.evidence.providerEvaluationId) {
    const existing = await evalIndex().get(
      record.evidence.providerEvaluationId,
    );
    if (existing && existing.authId !== record.authId) {
      throw new Error(
        "kyc evaluation index: provider evaluation already belongs to another user",
      );
    }
    if (!existing) {
      await evalIndex().put(record.evidence.providerEvaluationId, {
        authId: record.authId,
        at: nowIso(),
      });
    }
  }
}

export async function findAuthIdByProviderEvaluation(
  providerEvaluationId: string,
): Promise<string | null> {
  return (await evalIndex().get(providerEvaluationId))?.authId ?? null;
}

export function transition(
  record: KycEvaluationRecord,
  state: KycLifecycleState,
  correlationId: string,
  provenance: KycEvaluationEvent["provenance"],
  detail?: KycEvaluationEvent["detail"],
): KycEvaluationRecord {
  const at = nowIso();
  return {
    ...record,
    state,
    startedAt: record.startedAt ?? (state === "not_started" ? null : at),
    updatedAt: at,
    history: [
      ...record.history,
      { state, at, correlationId, provenance, ...(detail ? { detail } : {}) },
    ].slice(-HISTORY_LIMIT),
    evidence: { ...record.evidence, refiState: state },
    meta: makePrototypeMeta(correlationId),
  };
}

// ─── Webhook application (exactly-once, no regression, no reassignment) ─────

export interface WebhookApplication {
  outcome: KycWebhookEventRecord["outcome"];
  record: KycEvaluationRecord | null;
}

/**
 * Apply a FINAL provider decision delivered by webhook. `eventId` is the
 * provider's event id; `providerEvaluationId` is the evaluation it concerns.
 * The caller has already authenticated the webhook (or refused it).
 */
export async function applyFinalProviderDecision(args: {
  eventId: string;
  /** The provider's echo of OUR request id (`data.id`); must match the record. */
  providerRequestId: string;
  providerEvaluationId: string;
  providerDecision: KycProviderDecision;
  mapped: { refiState: KycLifecycleState; final: boolean };
  correlationId: string;
}): Promise<WebhookApplication> {
  const receivedAt = nowIso();
  const seen = await webhookEvents().get(args.eventId);
  if (seen) return { outcome: "duplicate_event", record: null };

  const note = async (
    outcome: KycWebhookEventRecord["outcome"],
    record: KycEvaluationRecord | null,
  ): Promise<WebhookApplication> => {
    await webhookEvents().put(args.eventId, {
      eventId: args.eventId,
      providerEvaluationId: args.providerEvaluationId,
      providerDecision: args.providerDecision,
      receivedAt,
      outcome,
    });
    return { outcome, record };
  };

  const authId = await findAuthIdByProviderEvaluation(
    args.providerEvaluationId,
  );
  if (authId === null) return note("unknown_evaluation", null);
  const record = await records().get(authId);
  if (
    !record ||
    record.evidence.providerEvaluationId !== args.providerEvaluationId ||
    record.evidence.providerRequestId !== args.providerRequestId
  ) {
    return note("evaluation_mismatch", null);
  }

  if (TERMINAL_KYC_STATES.has(record.state)) {
    const sameResult =
      (record.state === "passed" && args.providerDecision === "accept") ||
      (record.state === "failed" && args.providerDecision === "reject");
    if (sameResult) {
      const next = {
        ...record,
        evidence: {
          ...record.evidence,
          providerReferenceIds: [
            ...record.evidence.providerReferenceIds,
            args.eventId,
          ],
        },
      };
      await records().put(authId, next);
      return note("idempotent_same_result", next);
    }
    if (args.providerDecision === "review") {
      // Stale interim state after a final decision: ignored, never a regression.
      return note("stale_ignored", record);
    }
    const next: KycEvaluationRecord = {
      ...record,
      conflict: {
        providerDecision: args.providerDecision,
        eventId: args.eventId,
        at: receivedAt,
      },
      evidence: {
        ...record.evidence,
        providerReferenceIds: [
          ...record.evidence.providerReferenceIds,
          args.eventId,
        ],
      },
      meta: makePrototypeMeta(args.correlationId),
    };
    await records().put(authId, next);
    return note("conflict_flagged", next);
  }

  const docvOccurred = record.docv !== null;
  let next = transition(
    record,
    args.mapped.refiState,
    args.correlationId,
    "provider_webhook",
    { eventId: args.eventId, providerDecision: args.providerDecision },
  );
  next = {
    ...next,
    docv:
      next.docv && docvOccurred
        ? {
            ...next.docv,
            captureCompletedAt: next.docv.captureCompletedAt ?? receivedAt,
          }
        : next.docv,
    evidence: {
      ...next.evidence,
      providerDecision: args.providerDecision,
      providerDecisionFinal: args.mapped.final,
      completedAt: args.mapped.final ? receivedAt : null,
      providerReferenceIds: [
        ...next.evidence.providerReferenceIds,
        args.eventId,
      ],
      decisionProvenance: "provider_webhook",
      ...deriveComponentStatuses({
        providerDecision: args.providerDecision,
        final: args.mapped.final,
        docvOccurred,
      }),
    },
  };
  await records().put(authId, next);
  return note("applied", next);
}

/** Audit a delivery that is not acted on (paused / failed / case events). Idempotent on event id. */
export async function noteIgnoredWebhookEvent(args: {
  eventId: string;
  eventType: string;
  providerEvaluationId: string;
}): Promise<"recorded" | "duplicate_event"> {
  const seen = await webhookEvents().get(args.eventId);
  if (seen) return "duplicate_event";
  await webhookEvents().put(args.eventId, {
    eventId: args.eventId,
    providerEvaluationId: args.providerEvaluationId,
    providerDecision: null,
    receivedAt: nowIso(),
    outcome: "ignored_event_type",
    eventType: args.eventType,
  });
  return "recorded";
}

export async function getWebhookEvent(
  eventId: string,
): Promise<KycWebhookEventRecord | null> {
  return webhookEvents().get(eventId);
}

/** TEST ONLY: drop a provider-evaluation index entry regardless of record state. */
export async function clearEvaluationIndexForTests(
  providerEvaluationId: string,
): Promise<void> {
  await evalIndex().delete(providerEvaluationId);
}

/** TEST ONLY: forget a user's record (and its index entry). */
export async function resetKycEvaluationForTests(
  authId: string,
): Promise<void> {
  const r = await records().get(authId);
  if (r?.evidence.providerEvaluationId) {
    await evalIndex().delete(r.evidence.providerEvaluationId);
  }
  await records().delete(authId);
}
