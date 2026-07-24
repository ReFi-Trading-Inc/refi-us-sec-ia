/**
 * Admin-portal-proxy: orders-blocked endpoint (S4).
 *
 * Orders the risk engine or broker gateway blocked before submission.
 * Investor-visible so users can see WHY an order was blocked, but internal
 * risk-model detail is stripped.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "model_debug",
] as const;

export const wireBlockedOrderSchema = z
  .object({
    id: z.string(),
    order_id: z.string().optional(),
    plan_id: z.string().optional(),
    account_id: z.string(),
    symbol: z.string(),
    side: z.enum(["buy", "sell"]),
    qty: z.string(),
    block_reason: z.string(),
    reason_code: z.string().optional(),
    blocked_at: z.string(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    model_debug: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ blocked: z.array(wireBlockedOrderSchema) })
  .strict();

export interface InvestorBlockedOrder {
  id: string;
  orderId?: string;
  planId?: string;
  accountId: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  blockReason: string;
  reasonCode?: string;
  blockedAt: string;
}

export function project(
  wire: z.infer<typeof wireBlockedOrderSchema>,
): InvestorBlockedOrder {
  const out: InvestorBlockedOrder = {
    id: wire.id,
    accountId: wire.account_id,
    symbol: wire.symbol,
    side: wire.side,
    qty: wire.qty,
    blockReason: wire.block_reason,
    blockedAt: wire.blocked_at,
  };
  if (wire.order_id !== undefined) out.orderId = wire.order_id;
  if (wire.plan_id !== undefined) out.planId = wire.plan_id;
  if (wire.reason_code !== undefined) out.reasonCode = wire.reason_code;
  return out;
}

export async function fetchOrdersBlocked(args: {
  accountId: string;
  correlationId: string;
}): Promise<InvestorBlockedOrder[]> {
  const res = await proxyRequest({
    path: "/api/v1/orders-blocked",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    query: { account_id: args.accountId },
  });
  if (!res.ok) {
    throw new Error(
      `orders-blocked upstream returned ${String(res.status)} (path=/api/v1/orders-blocked)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.blocked.map(project);
}
