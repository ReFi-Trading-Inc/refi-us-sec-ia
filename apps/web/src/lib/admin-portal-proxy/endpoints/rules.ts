/**
 * Admin-portal-proxy: rules endpoint (S4).
 *
 * Template rules are the "how" of a template. Investor-visible for
 * transparency (methodology + description); admin overrides and
 * per-account rule adjustments are stripped.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

const wireRuleSchema = z
  .object({
    id: z.string(),
    template_id: z.string(),
    template_version: z.string(),
    name: z.string(),
    description: z.string().optional(),
    methodology: z.string(),
    // Admin-only
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    debug_only: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
  })
  .strict();

const wireResponseSchema = z
  .object({ rules: z.array(wireRuleSchema) })
  .strict();

export interface InvestorRule {
  id: string;
  templateId: string;
  templateVersion: string;
  name: string;
  description?: string;
  methodology: string;
}

function project(wire: z.infer<typeof wireRuleSchema>): InvestorRule {
  const out: InvestorRule = {
    id: wire.id,
    templateId: wire.template_id,
    templateVersion: wire.template_version,
    name: wire.name,
    methodology: wire.methodology,
  };
  if (wire.description !== undefined) out.description = wire.description;
  return out;
}

export async function fetchRules(args: {
  accountId: string;
  correlationId: string;
  templateId?: string;
}): Promise<InvestorRule[]> {
  const query: Record<string, string> = {};
  if (args.templateId) query["template_id"] = args.templateId;
  const res = await proxyRequest({
    path: "/api/v1/rules",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
    ...(Object.keys(query).length > 0 ? { query } : {}),
  });
  if (!res.ok) {
    throw new Error(
      `rules upstream returned ${String(res.status)} (path=/api/v1/rules)`,
    );
  }
  const parsed = wireResponseSchema.parse(res.json);
  return parsed.rules.map(project);
}
