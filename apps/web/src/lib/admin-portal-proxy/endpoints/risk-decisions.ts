/**
 * Admin-portal-proxy: risk-decisions endpoint (S4).
 *
 * The risk engine's per-intent verdict (approved / rejected / blocked).
 * Scoped to the caller's account. Investor-visible so users can see why a
 * decision was blocked; internal risk-model debug output is stripped.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

const wireDecisionSchema = z
  .object({
    id: z.string(),
    intent_id: z.string(),
    account_id: z.string(),
    decision: z.enum(["approved", "rejected", "blocked"]),
    reason_code: z.string().optional(),
    reason_message: z.string().optional(),
    decided_at: z.string(),
    snapshot_hash: z.string().optional(),
    // Admin-only
    admin: z.unknown().optional(),
    admin_notes: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    model_debug: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ decisions: z.array(wireDecisionSchema) })
  .strict();

export interface InvestorRiskDecision {
  id: string;
  intentId: string;
  accountId: string;
  decision: "approved" | "rejected" | "blocked";
  reasonCode?: string;
  reasonMessage?: string;
  decidedAt: string;
  snapshotHash?: string;
}

function project(
  wire: z.infer<typeof wireDecisionSchema>,
): InvestorRiskDecision {
  const out: InvestorRiskDecision = {
    id: wire.id,
    intentId: wire.intent_id,
    accountId: wire.account_id,
    decision: wire.decision,
    decidedAt: wire.decided_at,
  };
  if (wire.reason_code !== undefined) out.reasonCode = wire.reason_code;
  if (wire.reason_message !== undefined)
    out.reasonMessage = wire.reason_message;
  if (wire.snapshot_hash !== undefined) out.snapshotHash = wire.snapshot_hash;
  return out;
}

export async function fetchRiskDecisions(args: {
  accountId: string;
  correlationId: string;
  intentId?: string;
}): Promise<InvestorRiskDecision[]> {
  const query: Record<string, string> = { account_id: args.accountId };
  if (args.intentId) query["intent_id"] = args.intentId;
  const res = await proxyRequest({
    path: "/api/v1/risk-decisions",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    query,
  });
  if (!res.ok) {
    throw new Error(
      `risk-decisions upstream returned ${String(res.status)} (path=/api/v1/risk-decisions)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.decisions.map(project);
}
