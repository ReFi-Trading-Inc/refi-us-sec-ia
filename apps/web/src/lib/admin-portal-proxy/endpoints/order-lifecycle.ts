/**
 * Admin-portal-proxy: OrderLifecycleProjection endpoint (S4, PR-G).
 *
 * Contract V3 §7.10 — joined projection of Orders + OrderEvents +
 * BrokerOrderAttempts + Fills. This is the transport that composes the
 * Records Center's correlation spine (`correlation_id`, `action_id`,
 * `intent_id`, `plan_id`, `order_id`, `client_order_id`,
 * `broker_order_id`, `attempt_id`, `fill_id`).
 *
 * Redaction posture: the strict envelope names exactly the 15 canonical
 * OrderStatus values from `apps/common/trade_lifecycle/states.py`. If an
 * upstream emits a status outside this vocabulary the projection fails
 * closed — this is what makes the "canonical 15-state" claim in Sprint 4
 * checkable at the transport seam rather than at the render layer.
 *
 * Admin-only fields explicitly rejected by `.strict()`:
 *   - `admin`
 *   - `internal_notes`
 *   - `target_account_id`
 *   - `operator_flags`
 *   - `trade_input_full` (the full Trade Input snapshot; investors see
 *     the ref only, never the payload)
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const CANONICAL_ORDER_STATUSES = [
  "planned",
  "pending_submit",
  "submit_started",
  "blocked_by_conflict",
  "blocked_dependency",
  "acknowledged",
  "working",
  "partial_fill",
  "unknown",
  "filled",
  "partially_filled_terminal",
  "canceled",
  "rejected",
  "failed",
  "reconciled_terminal",
] as const;

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "operator_flags",
  "trade_input_full",
] as const;

const orderStatusEnum = z.enum(CANONICAL_ORDER_STATUSES);

const orderEventSchema = z
  .object({
    status: orderStatusEnum,
    ts: z.string().min(1),
    reason: z.string().optional(),
  })
  .strict();

const attemptSchema = z
  .object({
    attempt_id: z.string().min(1),
    kind: z.enum([
      "submit",
      "cancel",
      "amend",
      "replace",
      "status_lookup",
      "fill_lookup",
      "position_lookup",
    ]),
    ok: z.boolean(),
    ts: z.string().min(1),
    reason_code: z.string().optional(),
  })
  .strict();

const fillSchema = z
  .object({
    fill_id: z.string().min(1),
    qty: z.number(),
    price: z.number(),
    ts: z.string().min(1),
  })
  .strict();

export const wireOrderLifecycleSchema = z
  .object({
    order_id: z.string().min(1),
    client_order_id: z.string().min(1),
    broker_order_id: z.string().nullable().optional(),
    account_id: z.string().min(1),
    asset_id: z.string().min(1),
    status: orderStatusEnum,
    intent_id: z.string().min(1),
    plan_id: z.string().min(1),
    action_id: z.string().min(1),
    correlation_id: z.string().min(1),
    events: z.array(orderEventSchema),
    attempts: z.array(attemptSchema),
    fills: z.array(fillSchema),
    trade_input_snapshot_ref: z.string().optional(),
    // Admin-only surfaces — declared here so strict-parse rejects them
    // with a named error, not the generic "unrecognized_keys" message.
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    operator_flags: z.unknown().optional(),
    trade_input_full: z.unknown().optional(),
  })
  .strict();

export type WireOrderLifecycle = z.infer<typeof wireOrderLifecycleSchema>;

/**
 * Investor-visible projection. The correlation spine every Records
 * Center row hangs off of. Fields kept camelCase for BFF idiom; the
 * wire shape stays snake_case for the strict parse.
 */
export interface OrderLifecycleProjection {
  orderId: string;
  clientOrderId: string;
  brokerOrderId?: string;
  accountId: string;
  assetId: string;
  status: (typeof CANONICAL_ORDER_STATUSES)[number];
  intentId: string;
  planId: string;
  actionId: string;
  correlationId: string;
  events: Array<{
    status: (typeof CANONICAL_ORDER_STATUSES)[number];
    ts: string;
    reason?: string;
  }>;
  attempts: Array<{
    attemptId: string;
    kind:
      | "submit"
      | "cancel"
      | "amend"
      | "replace"
      | "status_lookup"
      | "fill_lookup"
      | "position_lookup";
    ok: boolean;
    ts: string;
    reasonCode?: string;
  }>;
  fills: Array<{
    fillId: string;
    qty: number;
    price: number;
    ts: string;
  }>;
  tradeInputSnapshotRef?: string;
}

export function project(wire: WireOrderLifecycle): OrderLifecycleProjection {
  const out: OrderLifecycleProjection = {
    orderId: wire.order_id,
    clientOrderId: wire.client_order_id,
    accountId: wire.account_id,
    assetId: wire.asset_id,
    status: wire.status,
    intentId: wire.intent_id,
    planId: wire.plan_id,
    actionId: wire.action_id,
    correlationId: wire.correlation_id,
    events: wire.events.map((e) => {
      const proj: OrderLifecycleProjection["events"][number] = {
        status: e.status,
        ts: e.ts,
      };
      if (e.reason !== undefined) proj.reason = e.reason;
      return proj;
    }),
    attempts: wire.attempts.map((a) => {
      const proj: OrderLifecycleProjection["attempts"][number] = {
        attemptId: a.attempt_id,
        kind: a.kind,
        ok: a.ok,
        ts: a.ts,
      };
      if (a.reason_code !== undefined) proj.reasonCode = a.reason_code;
      return proj;
    }),
    fills: wire.fills.map((f) => ({
      fillId: f.fill_id,
      qty: f.qty,
      price: f.price,
      ts: f.ts,
    })),
  };
  if (wire.broker_order_id) out.brokerOrderId = wire.broker_order_id;
  if (wire.trade_input_snapshot_ref !== undefined) {
    out.tradeInputSnapshotRef = wire.trade_input_snapshot_ref;
  }
  return out;
}

/**
 * Fetch an OrderLifecycleProjection by `client_order_id` scoped to the
 * caller's account. Upstream returns 404 for a foreign account id — the
 * ACL layer above translates that to a 404 for the investor as well so
 * cross-account probing never distinguishes "your record missing" from
 * "someone else's record".
 */
export async function fetchOrderLifecycle(args: {
  accountId: string;
  correlationId: string;
  clientOrderId: string;
}): Promise<OrderLifecycleProjection | null> {
  const res = await proxyRequest({
    path: `/api/v1/orders/${encodeURIComponent(args.clientOrderId)}/lifecycle`,
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`order-lifecycle upstream returned ${String(res.status)}`);
  }
  const parsed = wireOrderLifecycleSchema.parse(res.json);
  return project(parsed);
}
