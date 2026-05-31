/**
 * Order prototype-store entity.
 *
 * Mirrors Daniel's `Orders` row (PK: order_id). Daniel's Orders is a
 * mutate-in-place row whose `status` advances through the lifecycle. This
 * entity preserves that model with two SEC-compliance guards:
 *
 *   1. Terminal immutability — once `status` is terminal, subsequent
 *      transitionOrder() calls are rejected. Daniel permits broker-truth
 *      overrides between terminal states; the investor surface does not
 *      need that path and refuses to expose it.
 *   2. Transition validation — every transition goes through
 *      canTransitionOrderStatus() which mirrors the live transition graph
 *      from apps/common/trade_lifecycle/transitions.py.
 *
 * Frontend MUST NEVER create orders in production. Trade Manager and Exec
 * Gateway are the sole writers. This entity exists for fixture seeding and
 * dual-read; no investor BFF route accepts a write derived from investor
 * input. The module exports no submit/place/execute helpers (asserted
 * negatively in contract test).
 *
 * Daniel's Orders table has no `correlation_id` column. The investor-facing
 * stored wrapper carries a BFF-only `bffCorrelationId` (required) to support
 * correlation-id lookup without inventing a Daniel wire field.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import {
  canTransitionOrderStatus,
  isTerminalOrderStatus,
  type Order,
  type OrderStatus,
} from "../../sec203a/orders";

/**
 * Stored shape = Daniel wire shape + BFF metadata. The inner Daniel fields
 * are unmodified; BFF additions are explicitly named.
 */
export interface StoredOrder extends Order {
  /**
   * Standard prototype-store metadata. Named `bffMeta` (not `meta`) because
   * Daniel's `Orders.meta` is an unrelated STRING(MAX) blob; collision would
   * mask the Daniel field.
   */
  bffMeta: PrototypeMeta;
  /**
   * BFF-only correlation key. NOT in Daniel's DDL. Canonical correlation
   * spine lives on OrderIdMap.correlation_id / OrderEvents.correlation_id;
   * this field exists only to support lookups on the investor-facing
   * prototype store.
   */
  bffCorrelationId: string;
}

const orders = kvStore<StoredOrder>("orders");

// ─── Lookups ────────────────────────────────────────────────────────────────

export async function getOrder(orderId: string): Promise<StoredOrder | null> {
  return orders.get(orderId);
}

export async function listOrdersByAccount(
  accountId: string,
): Promise<StoredOrder[]> {
  const all = await orders.list();
  return all
    .map((e) => e.value)
    .filter((o) => o.accountId === accountId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listOrdersByIntent(
  intentId: string,
): Promise<StoredOrder[]> {
  const all = await orders.list();
  return all
    .map((e) => e.value)
    .filter((o) => o.intentId === intentId)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export async function listOrdersByCorrelation(
  bffCorrelationId: string,
): Promise<StoredOrder[]> {
  const all = await orders.list();
  return all
    .map((e) => e.value)
    .filter((o) => o.bffCorrelationId === bffCorrelationId)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

// ─── Writes (initial put + validated transition only) ───────────────────────

/**
 * Create the initial Orders row. Rejects if `order.orderId` already exists.
 * No mutation path other than transitionOrder() (no patch, no replace).
 */
export async function appendOrder(args: {
  order: Order;
  bffCorrelationId: string;
}): Promise<StoredOrder> {
  const stored: StoredOrder = {
    ...args.order,
    bffMeta: makePrototypeMeta(args.bffCorrelationId),
    bffCorrelationId: args.bffCorrelationId,
  };
  const ok = await orders.putIfAbsent(args.order.orderId, stored);
  if (!ok) {
    throw new Error(
      `order ${args.order.orderId} already exists — initial creation only`,
    );
  }
  return stored;
}

/**
 * Validated status transition. Throws if:
 *   - the order does not exist;
 *   - the current status does not match the supplied `expectedFromStatus`
 *     (optimistic-concurrency guard);
 *   - the transition is not permitted by canTransitionOrderStatus();
 *   - the order is already terminal (terminal → anything is rejected by
 *     canTransitionOrderStatus, included here for explicit error message).
 *
 * Terminal-state requirements (terminalAt + terminalReasonCode) must be
 * supplied by the caller when `toStatus` is terminal.
 */
export async function transitionOrder(args: {
  orderId: string;
  expectedFromStatus: OrderStatus;
  toStatus: OrderStatus;
  updatedAt: string;
  terminalAt?: string;
  terminalReasonCode?: string;
  lifecycleStatusSource?: "trade-manager" | "reconciler";
  lifecycleStatusUpdatedAt?: string;
  lastErrorReason?: string;
}): Promise<StoredOrder> {
  const current = await orders.get(args.orderId);
  if (!current) {
    throw new Error(`order ${args.orderId} not found`);
  }
  if (current.status !== args.expectedFromStatus) {
    throw new Error(
      `order ${args.orderId} status is ${current.status}, expected ${args.expectedFromStatus}`,
    );
  }
  if (isTerminalOrderStatus(current.status)) {
    throw new Error(
      `order ${args.orderId} is terminal (${current.status}); no further transitions accepted`,
    );
  }
  if (!canTransitionOrderStatus(current.status, args.toStatus)) {
    throw new Error(
      `transition ${current.status} → ${args.toStatus} not permitted by Daniel transitions graph`,
    );
  }
  const isTerminal = isTerminalOrderStatus(args.toStatus);
  if (isTerminal && (!args.terminalAt || !args.terminalReasonCode)) {
    throw new Error(
      `terminal transition to ${args.toStatus} requires terminalAt + terminalReasonCode`,
    );
  }
  const next: StoredOrder = {
    ...current,
    status: args.toStatus,
    updatedAt: args.updatedAt,
    ...(args.terminalAt ? { terminalAt: args.terminalAt } : {}),
    ...(args.terminalReasonCode
      ? { terminalReasonCode: args.terminalReasonCode }
      : {}),
    ...(args.lifecycleStatusSource
      ? { lifecycleStatusSource: args.lifecycleStatusSource }
      : {}),
    ...(args.lifecycleStatusUpdatedAt
      ? { lifecycleStatusUpdatedAt: args.lifecycleStatusUpdatedAt }
      : {}),
    ...(args.lastErrorReason ? { lastErrorReason: args.lastErrorReason } : {}),
  };
  await orders.put(args.orderId, next);
  return next;
}
