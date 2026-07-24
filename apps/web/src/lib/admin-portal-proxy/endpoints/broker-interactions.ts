/**
 * Admin-portal-proxy: broker-interactions endpoint (S4).
 *
 * Record of BFF ↔ broker gateway interactions on behalf of the caller —
 * order submissions, cancels, status polls, reconciliation reads. Scoped to
 * the caller's account. Investor-visible so users can audit their own
 * broker traffic; internal debug counters and admin metadata stripped.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "operator_flags",
  "debug_metrics",
] as const;

export const wireBrokerInteractionSchema = z
  .object({
    id: z.string(),
    account_id: z.string(),
    broker: z.string(),
    action: z.string(),
    order_id: z.string().optional(),
    at: z.string(),
    latency_ms: z.number().optional(),
    status_code: z.number().optional(),
    error_code: z.string().optional(),
    correlation_id: z.string().optional(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    operator_flags: z.unknown().optional(),
    debug_metrics: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ interactions: z.array(wireBrokerInteractionSchema) })
  .strict();

export interface InvestorBrokerInteraction {
  id: string;
  accountId: string;
  broker: string;
  action: string;
  orderId?: string;
  at: string;
  latencyMs?: number;
  statusCode?: number;
  errorCode?: string;
  correlationId?: string;
}

export function project(
  wire: z.infer<typeof wireBrokerInteractionSchema>,
): InvestorBrokerInteraction {
  const out: InvestorBrokerInteraction = {
    id: wire.id,
    accountId: wire.account_id,
    broker: wire.broker,
    action: wire.action,
    at: wire.at,
  };
  if (wire.order_id !== undefined) out.orderId = wire.order_id;
  if (wire.latency_ms !== undefined) out.latencyMs = wire.latency_ms;
  if (wire.status_code !== undefined) out.statusCode = wire.status_code;
  if (wire.error_code !== undefined) out.errorCode = wire.error_code;
  if (wire.correlation_id !== undefined)
    out.correlationId = wire.correlation_id;
  return out;
}

export async function fetchBrokerInteractions(args: {
  accountId: string;
  correlationId: string;
  limit?: number;
}): Promise<InvestorBrokerInteraction[]> {
  const query: Record<string, string | number> = { account_id: args.accountId };
  if (args.limit !== undefined) query["limit"] = args.limit;
  const res = await proxyRequest({
    path: "/api/v1/broker-interactions",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    query,
  });
  if (!res.ok) {
    throw new Error(
      `broker-interactions upstream returned ${String(res.status)} (path=/api/v1/broker-interactions)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.interactions.map(project);
}
