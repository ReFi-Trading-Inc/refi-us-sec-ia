/**
 * Admin-portal-proxy: accounts endpoint (S4).
 *
 * Investor-visible account projection. Reads the caller's own account
 * only; ACL enforcement in the route layer rejects mismatches.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "manual_rebalance",
  "operator_flags",
] as const;

export const wireAccountSchema = z
  .object({
    id: z.string(),
    subscription_mode: z.enum(["signal", "managed"]),
    broker_connected: z.boolean(),
    base_currency: z.string().optional(),
    created_at: z.string(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    manual_rebalance: z.unknown().optional(),
    operator_flags: z.unknown().optional(),
  })
  .strict();

export interface InvestorAccount {
  id: string;
  subscriptionMode: "signal" | "managed";
  brokerConnected: boolean;
  baseCurrency?: string;
  createdAt: string;
}

export function project(
  wire: z.infer<typeof wireAccountSchema>,
): InvestorAccount {
  const out: InvestorAccount = {
    id: wire.id,
    subscriptionMode: wire.subscription_mode,
    brokerConnected: wire.broker_connected,
    createdAt: wire.created_at,
  };
  if (wire.base_currency !== undefined) out.baseCurrency = wire.base_currency;
  return out;
}

export async function fetchAccount(args: {
  accountId: string;
  correlationId: string;
}): Promise<InvestorAccount> {
  const res = await proxyRequest({
    path: `/api/v1/accounts/${encodeURIComponent(args.accountId)}`,
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
  });
  if (!res.ok) {
    throw new Error(
      `account upstream returned ${String(res.status)} (path=/api/v1/accounts/${args.accountId})`,
    );
  }
  const parsed = wireAccountSchema.parse(res.json);
  return project(parsed);
}
