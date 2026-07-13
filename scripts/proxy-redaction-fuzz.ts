#!/usr/bin/env tsx
/**
 * Admin-portal-proxy redaction fuzz (S4a).
 *
 * For every endpoint module in apps/web/src/lib/admin-portal-proxy/
 * endpoints/*:
 *
 *   1. Build a minimal-valid wire payload the module's schema will accept.
 *   2. Inject the module's declared admin fields with sentinel values.
 *   3. Parse + project. Assert no admin sentinel survives in the output.
 *   4. Inject a truly-unknown random field. Assert strict-parse rejects it
 *      (S4a "unknown upstream fields fail closed").
 *
 * Runs as a tsx script — matches the tripwire + contract-assertions pattern.
 * Extends the pnpm test suite via the root package.json.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Endpoint modules pull config/env at import time. Safe placeholders keep
// the boot from tripping the schema.
process.env["REFI_ENV"] ??= "dev";
process.env["NEXT_PUBLIC_REFI_ENV"] ??= "dev";
process.env["REFI_TRUSTED_ORIGINS"] ??= "http://localhost:3000";
process.env["SESSION_JWT_ISSUER"] ??= "refi-us-sec-ia";
process.env["SESSION_JWT_AUDIENCE"] ??= "refi-us-sec-ia-bff";
process.env["ADMIN_PORTAL_BASE_URL"] ??= "http://localhost:4000";
process.env["ADMIN_PORTAL_SERVICE_TOKEN"] ??=
  "prototype-only-upstream-service-token-32+chars";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "apps", "web");

interface EndpointCase {
  name: string;
  base: Record<string, unknown>;
  adminFields: readonly string[];
  parseAndProject: (raw: unknown) => unknown;
}

async function loadCases(): Promise<EndpointCase[]> {
  const load = async (rel: string): Promise<unknown> =>
    import(resolve(APP_ROOT, "src/lib/admin-portal-proxy/endpoints", rel));

  const templates = (await load("templates.ts")) as {
    wireTemplateSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const memberships = (await load("memberships.ts")) as {
    wireMembershipSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const rules = (await load("rules.ts")) as {
    wireRuleSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const accounts = (await load("accounts.ts")) as {
    wireAccountSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const accountFlow = (await load("account-flow.ts")) as {
    wireFlowSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const riskLimits = (await load("risk-limits.ts")) as {
    wireLimitsSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const intents = (await load("intents.ts")) as {
    wireIntentSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const riskDecisions = (await load("risk-decisions.ts")) as {
    wireDecisionSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const executionPlans = (await load("execution-plans.ts")) as {
    wireExecutionPlanSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const orders = (await load("orders.ts")) as {
    wireOrderSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const ordersBlocked = (await load("orders-blocked.ts")) as {
    wireBlockedOrderSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const brokerInteractions = (await load("broker-interactions.ts")) as {
    wireBrokerInteractionSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const reconciliation = (await load("reconciliation.ts")) as {
    wireReconciliationRunSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const tradingControls = (await load("trading-controls.ts")) as {
    wireTradingControlsSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };
  const orderLifecycle = (await load("order-lifecycle.ts")) as {
    wireOrderLifecycleSchema: import("zod").ZodTypeAny;
    project: (w: unknown) => unknown;
    WIRE_ADMIN_FIELDS: readonly string[];
  };

  const mk = (
    name: string,
    schema: import("zod").ZodTypeAny,
    project: (w: unknown) => unknown,
    admin: readonly string[],
    base: Record<string, unknown>,
  ): EndpointCase => ({
    name,
    base,
    adminFields: admin,
    parseAndProject: (raw) => project(schema.parse(raw)),
  });

  return [
    mk(
      "templates",
      templates.wireTemplateSchema,
      templates.project,
      templates.WIRE_ADMIN_FIELDS,
      {
        id: "tpl_1",
        version: "v1",
        name: "Test",
        methodology: "TRANSPARENT_RULES",
        disclosure_id: "disc_1",
      },
    ),
    mk(
      "memberships",
      memberships.wireMembershipSchema,
      memberships.project,
      memberships.WIRE_ADMIN_FIELDS,
      {
        id: "mem_1",
        account_id: "acct_1",
        template_id: "tpl_1",
        template_version: "v1",
        status: "active",
        joined_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk("rules", rules.wireRuleSchema, rules.project, rules.WIRE_ADMIN_FIELDS, {
      id: "rule_1",
      template_id: "tpl_1",
      template_version: "v1",
      name: "R1",
      methodology: "TRANSPARENT_RULES",
    }),
    mk(
      "accounts",
      accounts.wireAccountSchema,
      accounts.project,
      accounts.WIRE_ADMIN_FIELDS,
      {
        id: "acct_1",
        subscription_mode: "signal",
        broker_connected: false,
        created_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "account-flow",
      accountFlow.wireFlowSchema,
      accountFlow.project,
      accountFlow.WIRE_ADMIN_FIELDS,
      {
        account_id: "acct_1",
        stage: "eligibility",
        completed_steps: [],
        last_updated_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "risk-limits",
      riskLimits.wireLimitsSchema,
      riskLimits.project,
      riskLimits.WIRE_ADMIN_FIELDS,
      {
        account_id: "acct_1",
        max_drawdown_pct: 0.2,
        max_position_size_pct: 0.1,
        max_leverage: 1,
        currency: "USD",
        effective_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "intents",
      intents.wireIntentSchema,
      intents.project,
      intents.WIRE_ADMIN_FIELDS,
      {
        intent_id: "int_1",
        intent_kind: "rebalance",
        account_id: "acct_1",
        ts: "2025-01-01T00:00:00Z",
        status: "pending",
      },
    ),
    mk(
      "risk-decisions",
      riskDecisions.wireDecisionSchema,
      riskDecisions.project,
      riskDecisions.WIRE_ADMIN_FIELDS,
      {
        id: "rd_1",
        intent_id: "int_1",
        account_id: "acct_1",
        decision: "approved",
        decided_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "execution-plans",
      executionPlans.wireExecutionPlanSchema,
      executionPlans.project,
      executionPlans.WIRE_ADMIN_FIELDS,
      {
        plan_id: "plan_1",
        intent_id: "int_1",
        account_id: "acct_1",
        status: "planned",
        planned_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "orders",
      orders.wireOrderSchema,
      orders.project,
      orders.WIRE_ADMIN_FIELDS,
      {
        order_id: "ord_1",
        account_id: "acct_1",
        symbol: "AAPL",
        side: "buy",
        qty: "10",
        status: "new",
        submitted_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "orders-blocked",
      ordersBlocked.wireBlockedOrderSchema,
      ordersBlocked.project,
      ordersBlocked.WIRE_ADMIN_FIELDS,
      {
        id: "blk_1",
        account_id: "acct_1",
        symbol: "AAPL",
        side: "buy",
        qty: "10",
        block_reason: "risk_limit_exceeded",
        blocked_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "broker-interactions",
      brokerInteractions.wireBrokerInteractionSchema,
      brokerInteractions.project,
      brokerInteractions.WIRE_ADMIN_FIELDS,
      {
        id: "bi_1",
        account_id: "acct_1",
        broker: "alpaca",
        action: "submit_order",
        at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "reconciliation",
      reconciliation.wireReconciliationRunSchema,
      reconciliation.project,
      reconciliation.WIRE_ADMIN_FIELDS,
      {
        id: "rec_1",
        account_id: "acct_1",
        started_at: "2025-01-01T00:00:00Z",
        status: "completed",
        discrepancy_count: 0,
      },
    ),
    mk(
      "trading-controls",
      tradingControls.wireTradingControlsSchema,
      tradingControls.project,
      tradingControls.WIRE_ADMIN_FIELDS,
      {
        account_id: "acct_1",
        autopilot_active: true,
        reduce_only: false,
        halted: false,
        last_changed_at: "2025-01-01T00:00:00Z",
      },
    ),
    mk(
      "order-lifecycle",
      orderLifecycle.wireOrderLifecycleSchema,
      orderLifecycle.project,
      orderLifecycle.WIRE_ADMIN_FIELDS,
      {
        order_id: "ord_1",
        client_order_id: "cli_1",
        account_id: "acct_1",
        asset_id: "AAPL",
        status: "acknowledged",
        intent_id: "int_1",
        plan_id: "pln_1",
        action_id: "act_1",
        correlation_id: "cor_1",
        events: [],
        attempts: [],
        fills: [],
      },
    ),
  ];
}

// ─── Fuzz utilities ──────────────────────────────────────────────────────────

const SENTINEL = "__ADMIN_SENTINEL__";

function randomFieldName(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz_";
  let s = "";
  for (let i = 0; i < 8 + Math.floor(Math.random() * 6); i++) {
    s += chars[Math.floor(Math.random() * chars.length)] as string;
  }
  return s;
}

function containsSentinel(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.includes(SENTINEL);
  if (Array.isArray(v)) return v.some(containsSentinel);
  if (typeof v === "object") return Object.values(v).some(containsSentinel);
  return false;
}

function outputHasKeys(output: unknown, keys: readonly string[]): string[] {
  const found = new Set<string>();
  const walk = (v: unknown): void => {
    if (v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const el of v) walk(el);
      return;
    }
    for (const [k, val] of Object.entries(v)) {
      if (keys.includes(k)) found.add(k);
      walk(val);
    }
  };
  walk(output);
  return [...found];
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface Finding {
  case: string;
  kind: string;
  detail: string;
}

async function main(): Promise<void> {
  const cases = await loadCases();
  const findings: Finding[] = [];

  for (const c of cases) {
    // Sanity: base parses.
    let baseOut: unknown;
    try {
      baseOut = c.parseAndProject(c.base);
    } catch (err) {
      findings.push({
        case: c.name,
        kind: "base_did_not_parse",
        detail: (err as Error).message,
      });
      continue;
    }
    if (containsSentinel(baseOut)) {
      findings.push({
        case: c.name,
        kind: "sentinel_in_base_output",
        detail: "base output already contains the sentinel string",
      });
    }

    // Inject each admin field with the sentinel; assert none survives.
    for (const field of c.adminFields) {
      const inj = { ...c.base, [field]: SENTINEL };
      let out: unknown;
      try {
        out = c.parseAndProject(inj);
      } catch (err) {
        findings.push({
          case: c.name,
          kind: "strict_rejected_known_admin_field",
          detail: `field=${field} err=${(err as Error).message}`,
        });
        continue;
      }
      if (containsSentinel(out)) {
        findings.push({
          case: c.name,
          kind: "admin_sentinel_leaked",
          detail: `field=${field}`,
        });
      }
      const survivingKeys = outputHasKeys(out, [field]);
      if (survivingKeys.length > 0) {
        findings.push({
          case: c.name,
          kind: "admin_key_survived",
          detail: `key=${survivingKeys.join(",")}`,
        });
      }
    }

    // Inject all admin fields at once — combinations that a chained
    // strip could miss.
    const bigInj = { ...c.base };
    for (const f of c.adminFields) bigInj[f] = SENTINEL;
    try {
      const out = c.parseAndProject(bigInj);
      if (containsSentinel(out)) {
        findings.push({
          case: c.name,
          kind: "admin_sentinel_leaked_combo",
          detail: "all admin fields injected simultaneously",
        });
      }
    } catch (err) {
      findings.push({
        case: c.name,
        kind: "strict_rejected_admin_combo",
        detail: (err as Error).message,
      });
    }

    // Unknown random field must trip strict-parse (S4a).
    for (let i = 0; i < 8; i++) {
      const name = randomFieldName();
      if (c.adminFields.includes(name)) continue; // vanishingly unlikely
      const inj = { ...c.base, [name]: "unexpected" };
      let threw = false;
      try {
        c.parseAndProject(inj);
      } catch {
        threw = true;
      }
      if (!threw) {
        findings.push({
          case: c.name,
          kind: "unknown_field_passed_strict",
          detail: `field=${name}`,
        });
      }
    }
  }

  if (findings.length > 0) {
    console.error(
      `\nproxy-redaction-fuzz FAILED: ${String(findings.length)} finding(s)\n`,
    );
    for (const f of findings) {
      console.error(`  [${f.case}] ${f.kind}: ${f.detail}`);
    }
    process.exit(1);
  }

  console.log(
    `proxy-redaction-fuzz: OK (${String(cases.length)} endpoint modules; admin fields never survive projection; unknown fields trip strict-parse)`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
