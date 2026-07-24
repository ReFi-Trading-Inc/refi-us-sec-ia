/**
 * Admin-portal-proxy: account-flow endpoint (S4).
 *
 * Onboarding/lifecycle flow projection for the caller's account. Reads
 * the auth-bound accountId only; ACL surface is closed by construction.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "operator_flags",
] as const;

export const wireFlowSchema = z
  .object({
    account_id: z.string(),
    stage: z.string(),
    completed_steps: z.array(z.string()),
    blocked_reason: z.string().optional(),
    last_updated_at: z.string(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    operator_flags: z.unknown().optional(),
  })
  .strict();

export interface InvestorAccountFlow {
  accountId: string;
  stage: string;
  completedSteps: string[];
  blockedReason?: string;
  lastUpdatedAt: string;
}

export function project(
  wire: z.infer<typeof wireFlowSchema>,
): InvestorAccountFlow {
  const out: InvestorAccountFlow = {
    accountId: wire.account_id,
    stage: wire.stage,
    completedSteps: wire.completed_steps,
    lastUpdatedAt: wire.last_updated_at,
  };
  if (wire.blocked_reason !== undefined)
    out.blockedReason = wire.blocked_reason;
  return out;
}

export async function fetchAccountFlow(args: {
  accountId: string;
  correlationId: string;
}): Promise<InvestorAccountFlow> {
  const res = await proxyRequest({
    path: `/api/v1/accounts/${encodeURIComponent(args.accountId)}/flow`,
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
  });
  if (!res.ok) {
    throw new Error(
      `account-flow upstream returned ${String(res.status)} (path=/api/v1/accounts/.../flow)`,
    );
  }
  const parsed = wireFlowSchema.parse(res.json);
  return project(parsed);
}
