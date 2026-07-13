#!/usr/bin/env tsx
/**
 * Contract V3 JSON Schema export — feeds Daniel's D7 GitLab CI job.
 *
 * Every wire schema on the admin-portal-proxy transport is a `.strict()`
 * Zod object describing exactly what the BFF accepts from upstream. This
 * script serialises each of them to a JSON Schema file under
 * `artifacts/contract-schemas/v3/` and emits a manifest with a sha256 per
 * schema and a per-artifact version stamp.
 *
 * Daniel's pipeline validates outbound Admin Portal responses against
 * these schemas — from that day forward, breaking the contract turns his
 * pipeline red without a human in the loop. Bidirectional enforcement
 * (Sprint 2 exit item + Sprint 5 D7 activation).
 *
 * Run: `pnpm export-schemas` (wired into package.json).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// zod is a runtime dependency of apps/web, not of the repo root. Resolve
// through apps/web's node_modules so this script does not require a
// duplicate root-level install.
const requireFromApp = createRequire(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "apps",
    "web",
    "package.json",
  ),
);
const { z } = requireFromApp("zod") as typeof import("zod");

// Endpoint modules pull config/env at import time.
process.env["REFI_ENV"] ??= "dev";
process.env["NEXT_PUBLIC_REFI_ENV"] ??= "dev";
process.env["REFI_TRUSTED_ORIGINS"] ??= "http://localhost:3000";
process.env["SESSION_JWT_ISSUER"] ??= "refi-us-sec-ia";
process.env["SESSION_JWT_AUDIENCE"] ??= "refi-us-sec-ia-bff";
process.env["ADMIN_PORTAL_BASE_URL"] ??= "http://localhost:4000";
process.env["ADMIN_PORTAL_SERVICE_TOKEN"] ??=
  "prototype-only-upstream-service-token-32+chars";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(REPO_ROOT, "artifacts/contract-schemas/v3");
const APP_ENDPOINTS = resolve(
  REPO_ROOT,
  "apps/web/src/lib/admin-portal-proxy/endpoints",
);

interface SchemaSpec {
  /** Kebab-case identifier used in the output filename. */
  name: string;
  /** Endpoint module filename, relative to APP_ENDPOINTS. */
  module: string;
  /** Named Zod export from the module. */
  export: string;
  /** Contract V3 section reference. */
  section: string;
}

const SPECS: readonly SchemaSpec[] = [
  {
    name: "templates",
    module: "templates.ts",
    export: "wireTemplateSchema",
    section: "§4",
  },
  {
    name: "memberships",
    module: "memberships.ts",
    export: "wireMembershipSchema",
    section: "§4",
  },
  {
    name: "rules",
    module: "rules.ts",
    export: "wireRuleSchema",
    section: "§4",
  },
  {
    name: "accounts",
    module: "accounts.ts",
    export: "wireAccountSchema",
    section: "§5",
  },
  {
    name: "account-flow",
    module: "account-flow.ts",
    export: "wireFlowSchema",
    section: "§5",
  },
  {
    name: "risk-limits",
    module: "risk-limits.ts",
    export: "wireLimitsSchema",
    section: "§7",
  },
  {
    name: "intents",
    module: "intents.ts",
    export: "wireIntentSchema",
    section: "§4a",
  },
  {
    name: "risk-decisions",
    module: "risk-decisions.ts",
    export: "wireDecisionSchema",
    section: "§7",
  },
  {
    name: "execution-plans",
    module: "execution-plans.ts",
    export: "wireExecutionPlanSchema",
    section: "§8",
  },
  {
    name: "orders",
    module: "orders.ts",
    export: "wireOrderSchema",
    section: "§9",
  },
  {
    name: "orders-blocked",
    module: "orders-blocked.ts",
    export: "wireBlockedOrderSchema",
    section: "§9",
  },
  {
    name: "broker-interactions",
    module: "broker-interactions.ts",
    export: "wireBrokerInteractionSchema",
    section: "§10",
  },
  {
    name: "reconciliation",
    module: "reconciliation.ts",
    export: "wireReconciliationRunSchema",
    section: "§11",
  },
  {
    name: "trading-controls",
    module: "trading-controls.ts",
    export: "wireTradingControlsSchema",
    section: "§7.4",
  },
  {
    name: "stream-event",
    module: "stream.ts",
    export: "wireStreamEventSchema",
    section: "§12 (SSE)",
  },
  {
    name: "order-lifecycle",
    module: "order-lifecycle.ts",
    export: "wireOrderLifecycleSchema",
    section: "§7.10",
  },
];

async function loadZodExport(spec: SchemaSpec): Promise<z.ZodTypeAny> {
  const mod = (await import(resolve(APP_ENDPOINTS, spec.module))) as Record<
    string,
    unknown
  >;
  const exp = mod[spec.export];
  if (!exp) {
    throw new Error(
      `export-schemas: ${spec.module} does not export ${spec.export}`,
    );
  }
  return exp as z.ZodTypeAny;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function main(): Promise<void> {
  // Clean output directory so removed schemas do not linger.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const version = `v3.${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const manifest: {
    contract: string;
    version: string;
    generatedAt: string;
    schemas: Array<{
      name: string;
      section: string;
      file: string;
      sha256: string;
    }>;
  } = {
    contract:
      "refi-us-sec-ia Contract V3 (admin-portal-proxy wire projections)",
    version,
    generatedAt: new Date().toISOString(),
    schemas: [],
  };

  for (const spec of SPECS) {
    const zodSchema = await loadZodExport(spec);
    const jsonSchema = z.toJSONSchema(zodSchema, {
      // The upstream contract does not include $refs across schemas, so
      // inline all references to keep the artifact self-contained per file.
      reused: "inline",
    });
    const filename = `${spec.name}.schema.json`;
    const filepath = resolve(OUT_DIR, filename);
    // Enrich with contract metadata so consumers can identify the schema
    // without external context; sha256 covers only the JSON Schema body
    // so metadata drift does not force a re-review.
    const body = JSON.stringify(jsonSchema, null, 2);
    const enriched = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `https://refi.trading/contract/v3/${spec.name}.schema.json`,
      title: spec.name,
      "x-refi-contract": {
        contract: "Contract V3",
        section: spec.section,
        wireExport: spec.export,
        module: `apps/web/src/lib/admin-portal-proxy/endpoints/${spec.module}`,
        version,
      },
      ...(jsonSchema as Record<string, unknown>),
    };
    writeFileSync(filepath, JSON.stringify(enriched, null, 2) + "\n", "utf8");
    manifest.schemas.push({
      name: spec.name,
      section: spec.section,
      file: filename,
      sha256: sha256(body),
    });
  }

  writeFileSync(
    resolve(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  // Guardrail: fail loud if the schema count doesn't match the endpoint
  // module count — otherwise a new endpoint could ship without a JSON
  // Schema and Daniel's D7 job would miss it.
  const endpointFiles = readdirSync(APP_ENDPOINTS).filter((f) =>
    f.endsWith(".ts"),
  );
  if (endpointFiles.length !== SPECS.length) {
    throw new Error(
      `export-schemas: ${String(endpointFiles.length)} endpoint modules but ` +
        `${String(SPECS.length)} schema specs. Add the new module to SPECS or ` +
        `mark it out-of-contract.`,
    );
  }

  console.log(
    `export-schemas: wrote ${String(manifest.schemas.length)} schemas + manifest to ${OUT_DIR}`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
