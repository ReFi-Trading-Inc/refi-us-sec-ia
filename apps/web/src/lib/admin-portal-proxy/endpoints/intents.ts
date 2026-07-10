/**
 * Admin-portal-proxy: intents endpoint (S4).
 *
 * AccountIntent projection — the Contract V3 concept closest to what the
 * UI calls a "recommendation". Scoped to the caller's account.
 *
 * Leg-level detail is intentionally excluded from the strict projection
 * here; the investor-visible view is a summary. The full leg vector lives
 * behind the records-center lineage endpoint (PR-G, Sprint 4).
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "legs",
  "notional_summary",
  "equity_estimate",
] as const;

export const wireIntentSchema = z
  .object({
    intent_id: z.string(),
    action_id: z.string().optional(),
    intent_kind: z.string(),
    template_id: z.string().optional(),
    template_version: z.string().optional(),
    account_id: z.string(),
    ts: z.string(),
    base_currency: z.string().optional(),
    status: z.string(),
    blocked_reason: z.string().optional(),
    legs_hash: z.string().optional(),
    correlation_id: z.string().optional(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    // Leg-level detail proxied via records-center lineage, not here
    legs: z.unknown().optional(),
    notional_summary: z.unknown().optional(),
    equity_estimate: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ intents: z.array(wireIntentSchema) })
  .strict();

export interface InvestorIntent {
  intentId: string;
  actionId?: string;
  intentKind: string;
  templateId?: string;
  templateVersion?: string;
  accountId: string;
  ts: string;
  baseCurrency?: string;
  status: string;
  blockedReason?: string;
  legsHash?: string;
  correlationId?: string;
}

export function project(
  wire: z.infer<typeof wireIntentSchema>,
): InvestorIntent {
  const out: InvestorIntent = {
    intentId: wire.intent_id,
    intentKind: wire.intent_kind,
    accountId: wire.account_id,
    ts: wire.ts,
    status: wire.status,
  };
  if (wire.action_id !== undefined) out.actionId = wire.action_id;
  if (wire.template_id !== undefined) out.templateId = wire.template_id;
  if (wire.template_version !== undefined)
    out.templateVersion = wire.template_version;
  if (wire.base_currency !== undefined) out.baseCurrency = wire.base_currency;
  if (wire.blocked_reason !== undefined)
    out.blockedReason = wire.blocked_reason;
  if (wire.legs_hash !== undefined) out.legsHash = wire.legs_hash;
  if (wire.correlation_id !== undefined)
    out.correlationId = wire.correlation_id;
  return out;
}

export async function fetchIntents(args: {
  accountId: string;
  correlationId: string;
  limit?: number;
}): Promise<InvestorIntent[]> {
  const query: Record<string, string | number> = { account_id: args.accountId };
  if (args.limit !== undefined) query["limit"] = args.limit;
  const res = await proxyRequest({
    path: "/api/v1/intents",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    query,
  });
  if (!res.ok) {
    throw new Error(
      `intents upstream returned ${String(res.status)} (path=/api/v1/intents)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.intents.map(project);
}
