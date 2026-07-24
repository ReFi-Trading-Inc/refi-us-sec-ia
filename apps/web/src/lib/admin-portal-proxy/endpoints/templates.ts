/**
 * Admin-portal-proxy: templates endpoint (S4).
 *
 * Investor-visible view of the strategy template registry. Templates are
 * global (not per-account), so ACL enforcement here is limited to forwarding
 * x-investor-account-id upstream for audit; there is no per-account scoping
 * check because every investor sees the same list.
 *
 * Redaction (S4a): the upstream response is parsed by a strict Zod schema
 * that declares every field we know about (visible + admin) and rejects
 * any unknown one. Admin-declared fields are then stripped from the
 * transform output so they never reach the client bundle. An upstream
 * change that adds a NEW field fails closed at strict-parse — the proxy
 * refuses to guess whether the new field is investor-safe.
 *
 * Flag: FLAG_ADMIN_PROXY_TEMPLATES. Route ships dark; operators flip on
 * once D2 ratifies the route and D5 sample payloads land.
 */
import { z } from "zod";
import { proxyRequest } from "../client";

// ─── Wire schema ─────────────────────────────────────────────────────────────

// z.unknown().optional() lets known admin fields pass strict-parse without
// bleeding through the output. Unknown-shape fields still reject: a new
// admin surface added upstream trips strict before it ever reaches here.
export const WIRE_ADMIN_FIELDS = [
  "admin",
  "internal_notes",
  "target_account_id",
  "manual_rebalance",
] as const;

export const wireTemplateSchema = z
  .object({
    // Investor-visible fields
    id: z.string(),
    version: z.string(),
    name: z.string(),
    methodology: z.string(),
    description: z.string().optional(),
    disclosure_id: z.string(),
    // Admin-only fields declared so strict passes, then stripped below.
    admin: z.unknown().optional(),
    internal_notes: z.unknown().optional(),
    target_account_id: z.unknown().optional(),
    manual_rebalance: z.unknown().optional(),
  })
  .strict();

const wireTemplatesResponseSchema = z
  .object({
    templates: z.array(wireTemplateSchema),
  })
  .strict();

// ─── Investor-visible projection ─────────────────────────────────────────────

export interface InvestorTemplate {
  id: string;
  version: string;
  name: string;
  methodology: string;
  description?: string;
  disclosureId: string;
}

export function project(
  wire: z.infer<typeof wireTemplateSchema>,
): InvestorTemplate {
  const out: InvestorTemplate = {
    id: wire.id,
    version: wire.version,
    name: wire.name,
    methodology: wire.methodology,
    disclosureId: wire.disclosure_id,
  };
  if (wire.description !== undefined) out.description = wire.description;
  return out;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export interface FetchTemplatesArgs {
  accountId: string;
  correlationId: string;
}

export async function fetchTemplates(
  args: FetchTemplatesArgs,
): Promise<InvestorTemplate[]> {
  const res = await proxyRequest({
    path: "/api/v1/templates",
    method: "GET",
    accountId: args.accountId,
    correlationId: args.correlationId,
  });

  if (!res.ok) {
    // Preserve upstream status class in the caller's exception. The BFF
    // route translates this into a shaped bffError; here we just fail.
    throw new Error(
      `templates upstream returned ${String(res.status)} (path=/api/v1/templates)`,
    );
  }

  const parsed = wireTemplatesResponseSchema.parse(res.json);
  return parsed.templates.map(project);
}
