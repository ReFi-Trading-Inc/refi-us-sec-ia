/**
 * OrderEvents domain — typed surface for Daniel's `OrderEvents` table. Every
 * lifecycle state change, broker observation, reconciliation step, and
 * operator intervention writes an append-only OrderEvent row. The full event
 * log IS the audit trail.
 *
 * Source of truth (GitLab refinity_dev/refinity-main @ 9f9dfc9):
 *   - DDL: docs/authoritative/spanner_ddl_all.txt:294-334
 *   - event_type set: apps/common/trade_lifecycle/constants.py:3-32 (27 values)
 *   - reason_code set: apps/common/trade_lifecycle/constants.py:34-72 (35 values)
 *   - source_service writers: apps/common/trade_lifecycle/transitions.py:52-54
 *     (BROKER_TRUTH_SOURCES) + trade-manager + exec-gateway
 *   - Transition + transition_valid semantics:
 *     apps/common/trade_lifecycle/transitions.py + apps/trade-manager/src/pipeline.py
 *
 * SEC posture (17 CFR 275.204-2 Books & Records):
 *   OrderEvents is the per-event immutable evidence log. No service may
 *   mutate Orders.status without an accompanying OrderEvent (per Daniel
 *   trade_lifecycle_contract.md:464). The append-only ledger preserves
 *   evidence of invalid transitions, duplicates, and rejected requests —
 *   never erased; classified by reason_code.
 *
 * Hard constraints:
 *   - PK is composite (order_id, occurred_at, event_id) in Daniel; this
 *     frontend mirror uses event_id (UUIDv4) as the primary key for
 *     duplicate detection.
 *   - Daniel's row is strictly append-only. Frontend entity refuses to
 *     mutate after append.
 *   - Frontend MUST NEVER append OrderEvents in production. Trade Manager,
 *     Exec Gateway, reconciler, broker webhooks/pollers, and operator tools
 *     are the writers. This entity exists for fixture seeding and dual-read.
 *   - Imports from sec203a/orders.ts (OrderStatus enum) so the from_status
 *     / to_status values stay aligned with the Orders domain by reference,
 *     not by string-literal redeclaration.
 */
import { z } from "zod";
import { ORDER_STATUSES, orderStatusSchema, type OrderStatus } from "./orders";

// ─── event_type enum (constants.py:3-32) ────────────────────────────────────

export const ORDER_EVENT_TYPES = [
  "order_planned",
  "submit_queued",
  "submit_started",
  "submit_acknowledged",
  "submit_rejected",
  "submit_timeout",
  "submit_unknown",
  "broker_status_observed",
  "order_working",
  "fill_observed",
  "partial_fill_observed",
  "order_filled",
  "cancel_requested",
  "cancel_acknowledged",
  "cancel_rejected",
  "order_canceled",
  "order_expired",
  "amend_requested",
  "replace_requested",
  "reconciliation_started",
  "reconciliation_discrepancy",
  "reconciliation_repaired",
  "reconciliation_escalated",
  "operator_intervention",
  "transition_rejected",
  "ignored_duplicate",
  "stale_event_ignored",
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export const orderEventTypeSchema = z.enum(ORDER_EVENT_TYPES);

export function isOrderEventType(value: unknown): value is OrderEventType {
  return (
    typeof value === "string" &&
    (ORDER_EVENT_TYPES as readonly string[]).includes(value)
  );
}

// ─── reason_code enum (constants.py:34-72) ─────────────────────────────────

export const ORDER_EVENT_REASON_CODES = [
  "submit_requested",
  "broker_acknowledged",
  "broker_rejected",
  "broker_timeout",
  "broker_transport_error",
  "broker_rate_limited",
  "broker_unavailable",
  "position_unavailable",
  "payload_validation_failed",
  "credential_missing",
  "credential_invalid",
  "credential_revoked",
  "duplicate_event",
  "stale_event",
  "invalid_transition",
  "transition_allowed",
  "unknown_current_status",
  "unknown_requested_status",
  "out_of_order_broker_truth",
  "late_terminal_truth",
  "missing_broker_order_id",
  "missing_fill_evidence",
  "operator_escalation",
  "unknown_submit_recovery",
  "unknown_submit_not_found_at_broker",
  "missing_internal_fill",
  "missing_broker_fill",
  "position_mismatch",
  "status_mismatch",
  "control_halt_global",
  "control_halt_account",
  "control_halt_broker",
  "control_halt_asset",
  "control_reduce_only",
  "control_degraded",
] as const;

export type OrderEventReasonCode = (typeof ORDER_EVENT_REASON_CODES)[number];

export const orderEventReasonCodeSchema = z.enum(ORDER_EVENT_REASON_CODES);

// ─── source_service enum (transitions.py:52-54 + writer services) ──────────

/**
 * Writers permitted on OrderEvents.source_service. The BROKER_TRUTH_SOURCES
 * subset is the set of services whose events can override terminal-state
 * decisions per transitions.py:115-128. trade-manager and exec-gateway are
 * the non-broker writers.
 */
export const ORDER_EVENT_SOURCE_SERVICES = [
  "trade-manager",
  "exec-gateway",
  "broker_webhook",
  "broker_poller",
  "poller",
  "reconciler",
  "admin",
  "admin_intervention",
] as const;

export type OrderEventSourceService =
  (typeof ORDER_EVENT_SOURCE_SERVICES)[number];

export const orderEventSourceServiceSchema = z.enum(
  ORDER_EVENT_SOURCE_SERVICES,
);

// ─── Hash + version constraints ─────────────────────────────────────────────

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const rawHashSchema = z.string().regex(SHA256_HEX_RE, {
  message: "raw_hash must be 64-char lowercase hex (SHA-256).",
});

// ─── OrderEvent wire shape ──────────────────────────────────────────────────

/**
 * Mirrors Daniel's `OrderEvents` row. Field nullability matches the DDL
 * exactly (most fields are nullable; the composite PK columns are not).
 *
 * Notes on intentional shape choices:
 *   - `fromStatus` / `toStatus` typed as the same OrderStatus union from
 *     sec203a/orders.ts, with `null` permitted (initial event has no
 *     prior status; ignored/duplicate events have no new status).
 *   - `raw` is `Record<string, unknown>` because Daniel stores it as JSON
 *     with no fixed shape; we refuse to invent a shape.
 *   - `correlationId` is OPTIONAL matching Daniel ("best effort, may be
 *     null early in lifecycle" per trade-manager/src/pipeline.py).
 *   - `transitionValid` is `boolean | null` — false records evidence of an
 *     attempted-but-rejected transition that was logged but did not
 *     mutate Orders.status.
 */
export interface OrderEvent {
  // Composite PK
  orderId: string;
  occurredAt: string;
  eventId: string;

  // Classification
  eventType: OrderEventType;
  sourceService: OrderEventSourceService;
  sourceChannel?: string;

  // State transition
  status?: OrderStatus;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  transitionValid?: boolean;

  // Causation
  reasonCode?: OrderEventReasonCode;
  reasonMessage?: string;

  // Linked identities (nullable in Daniel)
  accountId?: string;
  intentId?: string;
  planId?: string;
  clientOrderId?: string;
  brokerOrderId?: string;
  asset?: string;
  venueId?: string;
  correlationId?: string;
  attemptId?: string;
  fillId?: string;
  reconciliationRunId?: string;

  // Timestamps
  receivedAt?: string;
  brokerEventTs?: string;
  localEventTs?: string;
  createdAt?: string;

  // Dedup + integrity
  idempotencyKey?: string;
  raw?: Record<string, unknown>;
  rawHash?: string;
  schemaVersion?: string;
}

export const orderEventSchema: z.ZodType<OrderEvent> = z.object({
  orderId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  eventId: z.string().min(1),

  eventType: orderEventTypeSchema,
  sourceService: orderEventSourceServiceSchema,
  sourceChannel: z.string().min(1).max(64).optional(),

  status: orderStatusSchema.optional(),
  fromStatus: orderStatusSchema.optional(),
  toStatus: orderStatusSchema.optional(),
  transitionValid: z.boolean().optional(),

  reasonCode: orderEventReasonCodeSchema.optional(),
  reasonMessage: z.string().optional(),

  accountId: z.string().min(1).optional(),
  intentId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
  clientOrderId: z.string().min(1).optional(),
  brokerOrderId: z.string().min(1).optional(),
  asset: z.string().min(1).optional(),
  venueId: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  attemptId: z.string().min(1).optional(),
  fillId: z.string().min(1).optional(),
  reconciliationRunId: z.string().min(1).optional(),

  receivedAt: z.iso.datetime().optional(),
  brokerEventTs: z.iso.datetime().optional(),
  localEventTs: z.iso.datetime().optional(),
  createdAt: z.iso.datetime().optional(),

  idempotencyKey: z.string().min(1).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  rawHash: rawHashSchema.optional(),
  schemaVersion: z.string().min(1).max(16).optional(),
});

// Re-export OrderStatus enum check so callers can validate from_status/to_status
// against the canonical 23-value Daniel set without importing two modules.
export { ORDER_STATUSES };
