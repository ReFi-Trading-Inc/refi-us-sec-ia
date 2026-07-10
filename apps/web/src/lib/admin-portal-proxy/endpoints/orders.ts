/**
 * Admin-portal-proxy: orders endpoint (S4).
 *
 * Order projection. Scoped to the caller's account. Investor-visible so
 * users can see broker-order status; admin-only routing metadata is stripped.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "operator_flags",
  "manual_rebalance",
] as const;

export const wireOrderSchema = z
  .object({
    order_id: z.string(),
    client_order_id: z.string().optional(),
    broker_order_id: z.string().optional(),
    plan_id: z.string().optional(),
    account_id: z.string(),
    symbol: z.string(),
    side: z.enum(["buy", "sell"]),
    qty: z.string(),
    limit_price: z.string().optional(),
    status: z.string(),
    submitted_at: z.string(),
    filled_at: z.string().optional(),
    correlation_id: z.string().optional(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    operator_flags: z.unknown().optional(),
    manual_rebalance: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ orders: z.array(wireOrderSchema) })
  .strict();

export interface InvestorOrder {
  orderId: string;
  clientOrderId?: string;
  brokerOrderId?: string;
  planId?: string;
  accountId: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  limitPrice?: string;
  status: string;
  submittedAt: string;
  filledAt?: string;
  correlationId?: string;
}

export function project(wire: z.infer<typeof wireOrderSchema>): InvestorOrder {
  const out: InvestorOrder = {
    orderId: wire.order_id,
    accountId: wire.account_id,
    symbol: wire.symbol,
    side: wire.side,
    qty: wire.qty,
    status: wire.status,
    submittedAt: wire.submitted_at,
  };
  if (wire.client_order_id !== undefined)
    out.clientOrderId = wire.client_order_id;
  if (wire.broker_order_id !== undefined)
    out.brokerOrderId = wire.broker_order_id;
  if (wire.plan_id !== undefined) out.planId = wire.plan_id;
  if (wire.limit_price !== undefined) out.limitPrice = wire.limit_price;
  if (wire.filled_at !== undefined) out.filledAt = wire.filled_at;
  if (wire.correlation_id !== undefined)
    out.correlationId = wire.correlation_id;
  return out;
}

export async function fetchOrders(args: {
  accountId: string;
  correlationId: string;
  planId?: string;
  limit?: number;
}): Promise<InvestorOrder[]> {
  const query: Record<string, string | number> = { account_id: args.accountId };
  if (args.planId) query["plan_id"] = args.planId;
  if (args.limit !== undefined) query["limit"] = args.limit;
  const res = await proxyRequest({
    path: "/api/v1/orders",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    query,
  });
  if (!res.ok) {
    throw new Error(
      `orders upstream returned ${String(res.status)} (path=/api/v1/orders)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.orders.map(project);
}
