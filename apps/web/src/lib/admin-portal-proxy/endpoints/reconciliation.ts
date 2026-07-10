/**
 * Admin-portal-proxy: reconciliation endpoint (S4).
 *
 * Reconciliation runs — the periodic delta between the platform's own
 * order/fill projection and the broker's authoritative record. Scoped to
 * the caller's account.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "operator_flags",
  "debug_delta",
] as const;

export const wireReconciliationRunSchema = z
  .object({
    id: z.string(),
    account_id: z.string(),
    started_at: z.string(),
    completed_at: z.string().optional(),
    status: z.enum(["running", "completed", "failed"]),
    discrepancy_count: z.number(),
    discrepancy_summary: z.string().optional(),
    correlation_id: z.string().optional(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    operator_flags: z.unknown().optional(),
    debug_delta: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ runs: z.array(wireReconciliationRunSchema) })
  .strict();

export interface InvestorReconciliationRun {
  id: string;
  accountId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  discrepancyCount: number;
  discrepancySummary?: string;
  correlationId?: string;
}

export function project(
  wire: z.infer<typeof wireReconciliationRunSchema>,
): InvestorReconciliationRun {
  const out: InvestorReconciliationRun = {
    id: wire.id,
    accountId: wire.account_id,
    startedAt: wire.started_at,
    status: wire.status,
    discrepancyCount: wire.discrepancy_count,
  };
  if (wire.completed_at !== undefined) out.completedAt = wire.completed_at;
  if (wire.discrepancy_summary !== undefined)
    out.discrepancySummary = wire.discrepancy_summary;
  if (wire.correlation_id !== undefined)
    out.correlationId = wire.correlation_id;
  return out;
}

export async function fetchReconciliationRuns(args: {
  accountId: string;
  correlationId: string;
  limit?: number;
}): Promise<InvestorReconciliationRun[]> {
  const query: Record<string, string | number> = { account_id: args.accountId };
  if (args.limit !== undefined) query["limit"] = args.limit;
  const res = await proxyRequest({
    path: "/api/v1/reconciliation-runs",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    query,
  });
  if (!res.ok) {
    throw new Error(
      `reconciliation upstream returned ${String(res.status)} (path=/api/v1/reconciliation-runs)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.runs.map(project);
}
