/**
 * Admin-portal-proxy: trading-controls endpoint (S4).
 *
 * TradingControlStates — the account-scoped kill-switches and controls
 * (autopilot pause, reduce_only, halt) that the upstream risk engine and
 * the investor's own actions manipulate. Scoped to the caller's account.
 *
 * The tripwire blocks the admin-side write namespace for this domain;
 * this proxy is READ-ONLY on the state projection, so it doesn't
 * conflict with the boundary rules.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "operator_flags",
] as const;

export const wireTradingControlsSchema = z
  .object({
    account_id: z.string(),
    autopilot_active: z.boolean(),
    reduce_only: z.boolean(),
    halted: z.boolean(),
    halt_reason: z.string().optional(),
    paused_by: z.enum(["user", "system"]).optional(),
    last_changed_at: z.string(),
    last_changed_reason: z.string().optional(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    operator_flags: z.unknown().optional(),
  })
  .strict();

export interface InvestorTradingControls {
  accountId: string;
  autopilotActive: boolean;
  reduceOnly: boolean;
  halted: boolean;
  haltReason?: string;
  pausedBy?: "user" | "system";
  lastChangedAt: string;
  lastChangedReason?: string;
}

export function project(
  wire: z.infer<typeof wireTradingControlsSchema>,
): InvestorTradingControls {
  const out: InvestorTradingControls = {
    accountId: wire.account_id,
    autopilotActive: wire.autopilot_active,
    reduceOnly: wire.reduce_only,
    halted: wire.halted,
    lastChangedAt: wire.last_changed_at,
  };
  if (wire.halt_reason !== undefined) out.haltReason = wire.halt_reason;
  if (wire.paused_by !== undefined) out.pausedBy = wire.paused_by;
  if (wire.last_changed_reason !== undefined)
    out.lastChangedReason = wire.last_changed_reason;
  return out;
}

export async function fetchTradingControls(args: {
  accountId: string;
  correlationId: string;
}): Promise<InvestorTradingControls> {
  const res = await proxyRequest({
    path: `/api/v1/accounts/${encodeURIComponent(args.accountId)}/trading-controls-state`,
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
  });
  if (!res.ok) {
    throw new Error(
      `trading-controls upstream returned ${String(res.status)} (path=/api/v1/accounts/.../trading-controls-state)`,
    );
  }
  const parsed = wireTradingControlsSchema.parse(res.json);
  return project(parsed);
}
