/**
 * Admin-portal-proxy: memberships endpoint (S4).
 *
 * A membership binds an investor account to a strategy template. Reads
 * are scoped to the caller's account (upstream enforces via
 * x-investor-account-id; the BFF route forwards).
 *
 * Redaction follows the same pattern as templates.ts: strict Zod on the
 * wire shape with admin-only fields declared as z.unknown().optional()
 * and stripped in the transform.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "manual_rebalance",
] as const;

export const wireMembershipSchema = z
  .object({
    id: z.string(),
    account_id: z.string(),
    template_id: z.string(),
    template_version: z.string(),
    status: z.enum(["active", "paused", "pending", "left"]),
    joined_at: z.string(),
    left_at: z.string().optional(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    manual_rebalance: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ memberships: z.array(wireMembershipSchema) })
  .strict();

export interface InvestorMembership {
  id: string;
  accountId: string;
  templateId: string;
  templateVersion: string;
  status: "active" | "paused" | "pending" | "left";
  joinedAt: string;
  leftAt?: string;
}

export function project(
  wire: z.infer<typeof wireMembershipSchema>,
): InvestorMembership {
  const out: InvestorMembership = {
    id: wire.id,
    accountId: wire.account_id,
    templateId: wire.template_id,
    templateVersion: wire.template_version,
    status: wire.status,
    joinedAt: wire.joined_at,
  };
  if (wire.left_at !== undefined) out.leftAt = wire.left_at;
  return out;
}

export async function fetchMemberships(args: {
  accountId: string;
  correlationId: string;
}): Promise<InvestorMembership[]> {
  const res = await proxyRequest({
    path: "/api/v1/memberships",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    query: { account_id: args.accountId },
  });
  if (!res.ok) {
    throw new Error(
      `memberships upstream returned ${String(res.status)} (path=/api/v1/memberships)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.memberships.map(project);
}
