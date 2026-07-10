/**
 * Admin-portal-proxy: risk-limits endpoint (S4).
 *
 * Investor-visible risk limits for the caller's account. Scoped to the
 * auth-bound accountId; ACL surface closed by construction.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

const wireLimitsSchema = z
  .object({
    account_id: z.string(),
    max_drawdown_pct: z.number(),
    max_position_size_pct: z.number(),
    max_leverage: z.number(),
    currency: z.string(),
    effective_at: z.string(),
    // Admin-only
    admin: z.unknown().optional(),
    admin_override: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
  })
  .strict();

export interface InvestorRiskLimits {
  accountId: string;
  maxDrawdownPct: number;
  maxPositionSizePct: number;
  maxLeverage: number;
  currency: string;
  effectiveAt: string;
}

function project(wire: z.infer<typeof wireLimitsSchema>): InvestorRiskLimits {
  return {
    accountId: wire.account_id,
    maxDrawdownPct: wire.max_drawdown_pct,
    maxPositionSizePct: wire.max_position_size_pct,
    maxLeverage: wire.max_leverage,
    currency: wire.currency,
    effectiveAt: wire.effective_at,
  };
}

export async function fetchRiskLimits(args: {
  accountId: string;
  correlationId: string;
}): Promise<InvestorRiskLimits> {
  const res = await proxyRequest({
    path: `/api/v1/accounts/${encodeURIComponent(args.accountId)}/risk-limits`,
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
  });
  if (!res.ok) {
    throw new Error(
      `risk-limits upstream returned ${String(res.status)} (path=/api/v1/accounts/.../risk-limits)`,
    );
  }
  const parsed = wireLimitsSchema.parse(res.json);
  return project(parsed);
}
