/**
 * Orders domain — typed surface for Daniel's `Orders` table + the lifecycle
 * state machine that governs valid status transitions.
 *
 * Source of truth (refinity-main-main-1, local clone @ 3c1084f):
 *   - DDL: docs/authoritative/spanner_ddl_all.txt line 380-418
 *   - Status enum + terminal set: apps/common/trade_lifecycle/states.py:3-34
 *   - Transition graph: apps/common/trade_lifecycle/transitions.py:13-50
 *   - Reason codes: apps/common/trade_lifecycle/constants.py:35-72
 *   - Side enum: apps/account-intent-builder/src/domain/models.py:15-21
 *
 * SEC posture (17 CFR 275.204-2 Books & Records):
 *   Orders are the per-leg evidence of "what the firm actually did on behalf
 *   of this account." Every order traces back to an AccountIntent (intent_id),
 *   which in turn ties to the investor's signed standing authorization
 *   (Execution Policy). Investor-facing wire shape REQUIRES intentId, even
 *   though Daniel's DDL permits null for backend-internal recovery flows —
 *   recovery orders are operator-only and never reach the investor surface.
 *
 * Two Daniel-side details that shape this module:
 *
 *   1. Orders has no correlation_id column. Daniel's correlation spine lives
 *      on OrderIdMap/OrderEvents/BrokerOrderAttempts. The investor-facing
 *      stored wrapper carries a BFF-only `bffCorrelationId` (declared in
 *      the entity file) to support correlation-id lookup without
 *      introducing a fake wire field.
 *
 *   2. Daniel stores limit_price/stop_price/filled_qty/avg_fill_price as
 *      FLOAT64 (precision-risky for audit). qty is NUMERIC (precision-safe).
 *      The wire posture is to deserialize ALL monetary/quantity fields as
 *      DecimalString — never round-trip through JS number.
 *
 * Hard constraints (enforced by this module + contract assertions):
 *   - status is one of 23 closed values; no REVIEW/DENY partition.
 *   - terminal status → cannot transition back to non-terminal (validated
 *     against the live transition graph below).
 *   - intentId, accountId, and bffCorrelationId required at the
 *     investor-facing wire boundary.
 *   - Frontend NEVER submits, places, executes, or otherwise creates an
 *     order. Trade Manager / Exec Gateway are the sole writers. The
 *     prototype-store entity exists for fixture seeding and dual-read only.
 */
import { z } from "zod";
import {
  decimalStringRefiner,
  decimalStringMessage,
  type DecimalString,
} from "./decimal";

// ─── Status enum ────────────────────────────────────────────────────────────

/**
 * Non-terminal order statuses per states.py:3-34. An order in any of these
 * states may still transition to another state (active or terminal).
 */
export const NON_TERMINAL_ORDER_STATUSES = [
  "planned",
  "pending_submit",
  "blocked_by_conflict",
  "blocked_dependency",
  "submit_started",
  "submitted",
  "acknowledged",
  "working",
  "partial_fill",
  "cancel_requested",
  "cancel_acknowledged",
  "amend_requested",
  "replace_requested",
  "unknown",
  "reconciliation_pending",
  "escalated",
] as const;

/**
 * Terminal order statuses per states.py:3-34. An order in a terminal state
 * MUST NOT transition back to any non-terminal state. Daniel's transitions
 * graph permits broker-truth overrides between certain terminal states only;
 * the investor-facing wire posture treats terminal as absolutely terminal.
 */
export const TERMINAL_ORDER_STATUSES = [
  "filled",
  "partially_filled_terminal",
  "canceled",
  "expired",
  "rejected",
  "failed",
  "reconciled_terminal",
] as const;

export const ORDER_STATUSES = [
  ...NON_TERMINAL_ORDER_STATUSES,
  ...TERMINAL_ORDER_STATUSES,
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type TerminalOrderStatus = (typeof TERMINAL_ORDER_STATUSES)[number];

export const orderStatusSchema = z.enum(ORDER_STATUSES);

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

export function isTerminalOrderStatus(
  value: OrderStatus,
): value is TerminalOrderStatus {
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * Status values the BFF must reject — would re-introduce a REVIEW/DENY
 * partition Daniel's lifecycle does not have (parallels Risk + Intent posture).
 */
export type ForbiddenOrderStatus =
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

type _StatusForbiddenDisjoint = ForbiddenOrderStatus & OrderStatus;
type _Assert<T extends never> = T;
type _StatusCheck = _Assert<_StatusForbiddenDisjoint>;

// ─── Transition graph (from apps/common/trade_lifecycle/transitions.py) ────

/**
 * Allowed transitions per transitions.py:13-50. Map of from-status to the
 * set of statuses it may transition to. Terminal statuses have NO outgoing
 * transitions in this map — broker-truth overrides between terminal states
 * are not modeled here because they are not an investor-facing path.
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  planned: [
    "pending_submit",
    "blocked_by_conflict",
    "blocked_dependency",
    "failed",
    "escalated",
  ],
  pending_submit: [
    "submit_started",
    "blocked_by_conflict",
    "blocked_dependency",
    "failed",
    "escalated",
  ],
  blocked_by_conflict: [
    "pending_submit",
    "failed",
    "escalated",
    "reconciliation_pending",
  ],
  blocked_dependency: ["pending_submit", "failed", "escalated"],
  submit_started: [
    "submitted",
    "acknowledged",
    "working",
    "rejected",
    "unknown",
    "failed",
    "escalated",
  ],
  submitted: [
    "acknowledged",
    "working",
    "partial_fill",
    "filled",
    "rejected",
    "expired",
    "canceled",
    "unknown",
    "reconciliation_pending",
  ],
  acknowledged: [
    "working",
    "partial_fill",
    "filled",
    "rejected",
    "expired",
    "canceled",
    "unknown",
    "reconciliation_pending",
    "cancel_requested",
  ],
  working: [
    "partial_fill",
    "filled",
    "cancel_requested",
    "expired",
    "canceled",
    "unknown",
    "reconciliation_pending",
    "amend_requested",
    "replace_requested",
    "escalated",
  ],
  partial_fill: [
    "filled",
    "cancel_requested",
    "partially_filled_terminal",
    "expired",
    "unknown",
    "reconciliation_pending",
    "amend_requested",
    "replace_requested",
    "escalated",
  ],
  cancel_requested: [
    "cancel_acknowledged",
    "canceled",
    "partially_filled_terminal",
    "working",
    "partial_fill",
    "unknown",
    "reconciliation_pending",
    "escalated",
  ],
  cancel_acknowledged: [
    "canceled",
    "partially_filled_terminal",
    "working",
    "partial_fill",
    "unknown",
    "reconciliation_pending",
    "escalated",
  ],
  amend_requested: [
    "working",
    "partial_fill",
    "filled",
    "canceled",
    "expired",
    "rejected",
    "unknown",
    "reconciliation_pending",
    "escalated",
  ],
  replace_requested: [
    "working",
    "partial_fill",
    "filled",
    "canceled",
    "expired",
    "rejected",
    "unknown",
    "reconciliation_pending",
    "escalated",
  ],
  unknown: [
    "acknowledged",
    "working",
    "partial_fill",
    "filled",
    "canceled",
    "expired",
    "rejected",
    "failed",
    "reconciliation_pending",
    "escalated",
  ],
  reconciliation_pending: [
    "acknowledged",
    "working",
    "partial_fill",
    "filled",
    "canceled",
    "expired",
    "rejected",
    "failed",
    "escalated",
  ],
  escalated: [
    "acknowledged",
    "working",
    "partial_fill",
    "filled",
    "canceled",
    "expired",
    "rejected",
    "failed",
    "reconciliation_pending",
  ],
  // Terminal states — no outgoing transitions on the investor surface.
  filled: [],
  partially_filled_terminal: [],
  canceled: [],
  expired: [],
  rejected: [],
  failed: [],
  reconciled_terminal: [],
};

/**
 * Validate a proposed status transition. Returns false when:
 *   - `from` is already terminal, OR
 *   - `to` is not in the allowed-from-`from` set.
 */
export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (isTerminalOrderStatus(from)) return false;
  return (ORDER_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

// ─── Side / order_type / TIF / source enums ─────────────────────────────────

/**
 * Order sides per models.py:15-21 (same string values as AccountIntentLegSide
 * but declared independently so the assertion proves Order alignment without
 * coupling).
 */
export const ORDER_SIDES = [
  "buy",
  "sell",
  "sell_short",
  "buy_to_cover",
] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];
export const orderSideSchema = z.enum(ORDER_SIDES);

/**
 * Order types. Inferred from exec-gateway usage (no exhaustive Python enum
 * was found in the clone). Defaults to "market" per dtos.py.
 */
export const ORDER_TYPES = ["market", "limit", "stop", "stop_limit"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const orderTypeSchema = z.enum(ORDER_TYPES);

/**
 * Time-in-force values. Inferred from exec-gateway usage (default "day").
 */
export const ORDER_TIFS = ["day", "gtc", "ioc", "fok"] as const;
export type OrderTif = (typeof ORDER_TIFS)[number];
export const orderTifSchema = z.enum(ORDER_TIFS);

/**
 * Service ids permitted in `lifecycle_status_source`. Observed in
 * trade-manager pipeline.py.
 */
export const LIFECYCLE_STATUS_SOURCES = [
  "trade-manager",
  "reconciler",
] as const;
export type LifecycleStatusSource = (typeof LIFECYCLE_STATUS_SOURCES)[number];
export const lifecycleStatusSourceSchema = z.enum(LIFECYCLE_STATUS_SOURCES);

/**
 * Reconciliation sub-state observed on Orders rows specifically. The broader
 * run-level reconciliation state machine is separate.
 */
export const ORDER_RECONCILIATION_STATUSES = ["pending", "repaired"] as const;
export type OrderReconciliationStatus =
  (typeof ORDER_RECONCILIATION_STATUSES)[number];
export const orderReconciliationStatusSchema = z.enum(
  ORDER_RECONCILIATION_STATUSES,
);

// ─── Known terminal reason codes (constants.py:35-72) ───────────────────────

/**
 * Spot-check set of `terminal_reason_code` values Daniel uses. STRING(128)
 * in DDL — Daniel may add more — so the Zod schema permits any non-empty
 * string. This constant exists for documentation + contract assertions
 * that prove the known set parses cleanly.
 */
export const KNOWN_TERMINAL_REASON_CODES = [
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
  "broker_truth_repair",
] as const;

// ─── Order wire shape ───────────────────────────────────────────────────────

const decimalString = z
  .string()
  .refine(decimalStringRefiner, { message: decimalStringMessage("value") });
const decimal = decimalString as unknown as z.ZodType<DecimalString>;

/**
 * Investor-facing wire shape of a Daniel `Orders` row.
 *
 * Divergences from Daniel DDL (intentional, documented):
 *   - `intentId` is REQUIRED here (Daniel permits null in recovery flows;
 *     recovery flows are operator-only and never reach the investor surface).
 *   - Monetary/quantity FLOAT64 columns are typed as DecimalString to
 *     preserve precision through the BFF boundary.
 *   - `correlation_id` is intentionally NOT a wire field — Daniel doesn't
 *     have one on Orders. The investor entity wraps with a BFF-only
 *     `bffCorrelationId`.
 */
export interface Order {
  orderId: string;
  clientOrderId?: string;
  accountId: string;
  intentId: string;
  asset: string;
  side: OrderSide;
  qty: DecimalString;
  tif: OrderTif;
  status: OrderStatus;
  venue?: string;
  submittedAt: string;
  updatedAt: string;
  planId?: string;
  orderType: OrderType;
  limitPrice?: DecimalString;
  stopPrice?: DecimalString;
  splitIdx?: number;
  filledQty?: DecimalString;
  avgFillPrice?: DecimalString;
  meta?: string;
  dependsOnClientOrderId?: string;
  lastErrorReason?: string;
  brokerName?: string;
  currentAttemptId?: string;
  lastLifecycleEventId?: string;
  brokerAckAt?: string;
  /**
   * Set IFF `isTerminalOrderStatus(status) === true`. Cross-field invariant
   * enforced by the schema.
   */
  terminalAt?: string;
  terminalReasonCode?: string;
  lifecycleStatusSource?: LifecycleStatusSource;
  lifecycleStatusUpdatedAt?: string;
  reconciliationStatus?: OrderReconciliationStatus;
  reconciliationRunId?: string;
  lastDiscrepancyId?: string;
}

export const orderSchema: z.ZodType<Order> = z
  .object({
    orderId: z.string().min(1),
    clientOrderId: z.string().min(1).optional(),
    accountId: z.string().min(1),
    intentId: z.string().min(1),
    asset: z.string().min(1),
    side: orderSideSchema,
    qty: decimal,
    tif: orderTifSchema,
    status: orderStatusSchema,
    venue: z.string().min(1).optional(),
    submittedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    planId: z.string().min(1).optional(),
    orderType: orderTypeSchema,
    limitPrice: decimal.optional(),
    stopPrice: decimal.optional(),
    splitIdx: z.number().int().nonnegative().optional(),
    filledQty: decimal.optional(),
    avgFillPrice: decimal.optional(),
    meta: z.string().optional(),
    dependsOnClientOrderId: z.string().min(1).optional(),
    lastErrorReason: z.string().optional(),
    brokerName: z.string().min(1).optional(),
    currentAttemptId: z.string().min(1).optional(),
    lastLifecycleEventId: z.string().min(1).optional(),
    brokerAckAt: z.iso.datetime().optional(),
    terminalAt: z.iso.datetime().optional(),
    terminalReasonCode: z.string().min(1).max(128).optional(),
    lifecycleStatusSource: lifecycleStatusSourceSchema.optional(),
    lifecycleStatusUpdatedAt: z.iso.datetime().optional(),
    reconciliationStatus: orderReconciliationStatusSchema.optional(),
    reconciliationRunId: z.string().min(1).optional(),
    lastDiscrepancyId: z.string().min(1).optional(),
  })
  .refine(
    (o) =>
      isTerminalOrderStatus(o.status)
        ? o.terminalAt !== undefined && o.terminalReasonCode !== undefined
        : true,
    {
      message:
        "Terminal status requires both terminalAt and terminalReasonCode.",
      path: ["terminalAt"],
    },
  )
  .refine(
    (o) =>
      !isTerminalOrderStatus(o.status)
        ? o.terminalAt === undefined && o.terminalReasonCode === undefined
        : true,
    {
      message:
        "terminalAt and terminalReasonCode are only valid in a terminal status.",
      path: ["terminalAt"],
    },
  );
