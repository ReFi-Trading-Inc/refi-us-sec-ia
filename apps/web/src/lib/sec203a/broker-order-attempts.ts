/**
 * BrokerOrderAttempts domain — typed surface for Daniel's
 * `BrokerOrderAttempts` table. Every broker-bound call (submit, cancel,
 * status lookup, fill lookup, position lookup, reconciliation) writes one
 * row of evidence: what the firm sent, what the broker returned, and how
 * it was classified.
 *
 * Source of truth (GitLab refinity_dev/refinity-main @ 9f9dfc9):
 *   - DDL: docs/authoritative/spanner_ddl_all.txt:2783-2833 (+ 7 indexes)
 *   - ATTEMPT_TYPES enum: apps/common/trade_lifecycle/states.py:63-74
 *   - BROKER_ATTEMPT_STATUSES enum: apps/common/trade_lifecycle/states.py:50-61
 *   - Writer + UPDATE-after-INSERT pattern: apps/trade-manager/src/pipeline.py
 *     (insert: line 552 status="started"; complete: line 596
 *     _complete_broker_attempt())
 *   - Retry-chain semantics: apps/trade-manager/src/pipeline.py:3530-3560
 *   - Redaction policy: apps/common/trade_lifecycle/payloads.py:11-32
 *
 * SEC posture (17 CFR 275.204-2 Books & Records):
 *   BrokerOrderAttempts is the per-call evidence — what was sent to the
 *   broker and what came back. Combined with OrderEvents (the lifecycle
 *   log), it lets the firm reconstruct any order's path through broker
 *   APIs, including retries and ambiguous outcomes (status=unknown).
 *
 * Mutability contract — NOT pure append-only:
 *   Daniel's writer inserts a row with status="started" and outcome fields
 *   null, then UPDATEs the same row when the broker call completes. The
 *   investor-facing mirror preserves this: appendBrokerAttempt() creates
 *   the initial row; completeBrokerAttempt() applies a single outcome
 *   update. No other mutation path is exposed.
 *
 * Immutable fields (set at append, never changed):
 *   attempt_id, order_id, plan_id, intent_id, account_id, client_order_id,
 *   attempt_type, attempt_seq, parent_attempt_id, broker_name, asset,
 *   endpoint_action, http_method, request_payload_internal,
 *   request_payload_broker, request_headers_redacted,
 *   credential_context_redacted, raw_request_hash, local_started_at,
 *   idempotency_key, correlation_id
 *
 * Mutable on completion (single-shot via completeBrokerAttempt):
 *   status, response_payload_raw, response_payload_normalized,
 *   http_status, broker_code, broker_message, error_type, error_message,
 *   retryable, local_completed_at, broker_ack_at, next_retry_not_before,
 *   raw_response_hash
 *
 * Sensitive-data note:
 *   Daniel's writer redacts secret-bearing keys (authorization, api_key,
 *   token, etc. — full list in payloads.py:11-32) BEFORE persistence. The
 *   investor-facing schema assumes incoming payloads are already redacted;
 *   it does NOT attempt to re-redact. If unredacted secrets reach this
 *   layer, that's a backend writer bug, not a frontend concern.
 */
import { z } from "zod";

// ─── attempt_type enum (states.py:63-74) ────────────────────────────────────

export const ATTEMPT_TYPES = [
  "submit",
  "cancel",
  "amend",
  "replace",
  "status_lookup",
  "fill_lookup",
  "position_lookup",
  "reconcile",
] as const;

export type AttemptType = (typeof ATTEMPT_TYPES)[number];

export const attemptTypeSchema = z.enum(ATTEMPT_TYPES);

export function isAttemptType(value: unknown): value is AttemptType {
  return (
    typeof value === "string" &&
    (ATTEMPT_TYPES as readonly string[]).includes(value)
  );
}

// ─── broker_attempt_status enum (states.py:50-61) ───────────────────────────

/**
 * Initial status when the row is inserted by the writer. Only `started`
 * is allowed at append time; any other status must come through
 * completeBrokerAttempt().
 */
export const INITIAL_BROKER_ATTEMPT_STATUS = "started" as const;

/**
 * Outcome statuses set by the broker call. NOT including "started" — that
 * is only valid pre-completion.
 */
export const OUTCOME_BROKER_ATTEMPT_STATUSES = [
  "acknowledged",
  "rejected",
  "timeout",
  "error",
  "unknown",
  "recovered",
  "terminal",
] as const;

/**
 * Complete attempt-status enum (8 values). Distinct from Orders.status —
 * these describe the attempt call itself, not the order's lifecycle.
 */
export const BROKER_ATTEMPT_STATUSES = [
  INITIAL_BROKER_ATTEMPT_STATUS,
  ...OUTCOME_BROKER_ATTEMPT_STATUSES,
] as const;

export type BrokerAttemptStatus = (typeof BROKER_ATTEMPT_STATUSES)[number];
export type BrokerAttemptOutcomeStatus =
  (typeof OUTCOME_BROKER_ATTEMPT_STATUSES)[number];

export const brokerAttemptStatusSchema = z.enum(BROKER_ATTEMPT_STATUSES);
export const brokerAttemptOutcomeStatusSchema = z.enum(
  OUTCOME_BROKER_ATTEMPT_STATUSES,
);

export function isBrokerAttemptStatus(
  value: unknown,
): value is BrokerAttemptStatus {
  return (
    typeof value === "string" &&
    (BROKER_ATTEMPT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Forbidden status values — would re-introduce REVIEW/DENY semantics that
 * the broker-attempt lifecycle does not have.
 */
export type ForbiddenBrokerAttemptStatus =
  | "needs_review"
  | "review"
  | "deny"
  | "denied"
  | "flag"
  | "flagged"
  | "pending"
  | "hold"
  | "manual_review"
  | "approved";

type _StatusForbiddenDisjoint = ForbiddenBrokerAttemptStatus &
  BrokerAttemptStatus;
type _Assert<T extends never> = T;
type _StatusCheck = _Assert<_StatusForbiddenDisjoint>;

// ─── http_method enum (observed in pipeline.py) ────────────────────────────

export const ATTEMPT_HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "SDK",
  "DRY_RUN",
  "UNSUPPORTED",
] as const;

export type AttemptHttpMethod = (typeof ATTEMPT_HTTP_METHODS)[number];

export const attemptHttpMethodSchema = z.enum(ATTEMPT_HTTP_METHODS);

// ─── Hash constraints ──────────────────────────────────────────────────────

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const sha256HexSchema = z.string().regex(SHA256_HEX_RE, {
  message: "must be 64-char lowercase hex (SHA-256)",
});

// ─── Sensitive-key sentinel set (payloads.py:11-32) ────────────────────────

/**
 * Key substrings whose values must be redacted by Daniel's writer before
 * persistence. Exported here for documentation + the contract assertion
 * that proves NO known secret-key field is accidentally introduced as a
 * required field on the wire schema.
 */
export const KNOWN_SECRET_KEY_PARTS = [
  "authorization",
  "api_key",
  "apikey",
  "api-secret",
  "api_secret",
  "secret",
  "passphrase",
  "password",
  "oauth",
  "token",
  "access_token",
  "refresh_token",
  "snaptrade_secret",
  "cookie",
  "set_cookie",
] as const;

// ─── BrokerOrderAttempt wire shape ─────────────────────────────────────────

/**
 * Mirrors Daniel's `BrokerOrderAttempts` row. Nullability matches the DDL
 * exactly. Identity (`attempt_id`) is required; most foreign keys are
 * nullable (an attempt may exist before all identities are pinned, e.g.
 * recovery flows).
 *
 * Note on `order_id` nullability: DDL permits null because some attempts
 * (e.g. `position_lookup`) are not tied to a specific order. The
 * investor-facing surface does not see those attempts — the entity layer
 * filters/scopes accordingly. The wire schema accepts the Daniel shape
 * (nullable) so we can read backend rows without re-validation failures.
 */
export interface BrokerOrderAttempt {
  attemptId: string;
  orderId?: string;
  planId?: string;
  intentId?: string;
  accountId?: string;
  clientOrderId?: string;
  brokerOrderId?: string;
  brokerName?: string;
  asset?: string;

  attemptType: AttemptType;
  attemptSeq: number;
  parentAttemptId?: string;
  status: BrokerAttemptStatus;

  endpointAction?: string;
  httpMethod?: AttemptHttpMethod;

  // Payloads are JSON; redacted by writer before persist (payloads.py).
  requestPayloadInternal?: Record<string, unknown>;
  requestPayloadBroker?: Record<string, unknown>;
  requestHeadersRedacted?: Record<string, unknown>;
  responsePayloadRaw?: Record<string, unknown>;
  responsePayloadNormalized?: Record<string, unknown>;

  httpStatus?: number;
  brokerCode?: string;
  brokerMessage?: string;
  errorType?: string;
  errorMessage?: string;
  retryable?: boolean;

  localStartedAt: string;
  localCompletedAt?: string;
  brokerAckAt?: string;
  nextRetryNotBefore?: string;

  idempotencyKey?: string;
  correlationId?: string;
  credentialContextRedacted?: Record<string, unknown>;

  rawRequestHash?: string;
  rawResponseHash?: string;

  createdAt?: string;
  updatedAt?: string;
}

const jsonObject = z.record(z.string(), z.unknown());

export const brokerOrderAttemptSchema: z.ZodType<BrokerOrderAttempt> = z
  .object({
    attemptId: z.string().min(1),
    orderId: z.string().min(1).optional(),
    planId: z.string().min(1).optional(),
    intentId: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    clientOrderId: z.string().min(1).optional(),
    brokerOrderId: z.string().min(1).optional(),
    brokerName: z.string().min(1).optional(),
    asset: z.string().min(1).optional(),

    attemptType: attemptTypeSchema,
    attemptSeq: z.number().int().positive(),
    parentAttemptId: z.string().min(1).optional(),
    status: brokerAttemptStatusSchema,

    endpointAction: z.string().min(1).optional(),
    httpMethod: attemptHttpMethodSchema.optional(),

    requestPayloadInternal: jsonObject.optional(),
    requestPayloadBroker: jsonObject.optional(),
    requestHeadersRedacted: jsonObject.optional(),
    responsePayloadRaw: jsonObject.optional(),
    responsePayloadNormalized: jsonObject.optional(),

    httpStatus: z.number().int().nonnegative().optional(),
    brokerCode: z.string().min(1).optional(),
    brokerMessage: z.string().optional(),
    errorType: z.string().min(1).optional(),
    errorMessage: z.string().optional(),
    retryable: z.boolean().optional(),

    localStartedAt: z.iso.datetime(),
    localCompletedAt: z.iso.datetime().optional(),
    brokerAckAt: z.iso.datetime().optional(),
    nextRetryNotBefore: z.iso.datetime().optional(),

    idempotencyKey: z.string().min(1).optional(),
    correlationId: z.string().min(1).optional(),
    credentialContextRedacted: jsonObject.optional(),

    rawRequestHash: sha256HexSchema.optional(),
    rawResponseHash: sha256HexSchema.optional(),

    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
  })
  .refine(
    (a) =>
      a.status === "started"
        ? a.localCompletedAt === undefined && a.responsePayloadRaw === undefined
        : true,
    {
      message:
        "status='started' must not have localCompletedAt or response payload — those are completion-only fields.",
      path: ["status"],
    },
  )
  .refine(
    (a) => (a.attemptSeq === 1 ? a.parentAttemptId === undefined : true),
    {
      message:
        "attempt_seq=1 must not carry a parent_attempt_id (first attempt has no parent).",
      path: ["parentAttemptId"],
    },
  )
  .refine((a) => (a.attemptSeq > 1 ? a.parentAttemptId !== undefined : true), {
    message:
      "attempt_seq>1 must carry a parent_attempt_id (retries chain to the root attempt).",
    path: ["parentAttemptId"],
  });
