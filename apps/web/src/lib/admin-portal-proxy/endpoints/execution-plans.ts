/**
 * Admin-portal-proxy: execution-plans endpoint (S4).
 *
 * ExecutionPlan projection — the concretization of an approved intent into
 * broker-submittable orders. Scoped to the caller's account.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "operator_flags",
  "debug_only",
] as const;

export const wireExecutionPlanSchema = z
  .object({
    plan_id: z.string(),
    intent_id: z.string(),
    account_id: z.string(),
    status: z.enum([
      "planned",
      "pending_submit",
      "waiting_on_cancels",
      "blocked_by_conflict",
      "in_flight",
      "reconciled",
      "terminal_failed",
    ]),
    planned_at: z.string(),
    terminal_at: z.string().optional(),
    order_ids: z.array(z.string()).optional(),
    correlation_id: z.string().optional(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    operator_flags: z.unknown().optional(),
    debug_only: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ plans: z.array(wireExecutionPlanSchema) })
  .strict();

export interface InvestorExecutionPlan {
  planId: string;
  intentId: string;
  accountId: string;
  status:
    | "planned"
    | "pending_submit"
    | "waiting_on_cancels"
    | "blocked_by_conflict"
    | "in_flight"
    | "reconciled"
    | "terminal_failed";
  plannedAt: string;
  terminalAt?: string;
  orderIds?: string[];
  correlationId?: string;
}

export function project(
  wire: z.infer<typeof wireExecutionPlanSchema>,
): InvestorExecutionPlan {
  const out: InvestorExecutionPlan = {
    planId: wire.plan_id,
    intentId: wire.intent_id,
    accountId: wire.account_id,
    status: wire.status,
    plannedAt: wire.planned_at,
  };
  if (wire.terminal_at !== undefined) out.terminalAt = wire.terminal_at;
  if (wire.order_ids !== undefined) out.orderIds = wire.order_ids;
  if (wire.correlation_id !== undefined)
    out.correlationId = wire.correlation_id;
  return out;
}

export async function fetchExecutionPlans(args: {
  accountId: string;
  correlationId: string;
  intentId?: string;
}): Promise<InvestorExecutionPlan[]> {
  const query: Record<string, string> = { account_id: args.accountId };
  if (args.intentId) query["intent_id"] = args.intentId;
  const res = await proxyRequest({
    path: "/api/v1/execution-plans",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    query,
  });
  if (!res.ok) {
    throw new Error(
      `execution-plans upstream returned ${String(res.status)} (path=/api/v1/execution-plans)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.plans.map(project);
}
