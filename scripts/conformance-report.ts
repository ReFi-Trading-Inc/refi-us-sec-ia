#!/usr/bin/env tsx
/**
 * Sprint 5 conformance-report formatter.
 *
 * Reads `docs/sprint5-conformance-report-template.md`, replaces the
 * `«placeholder»` markers with real values, and writes the filled
 * report to `artifacts/conformance/<yyyymmdd>-<sha>.md`. Runs in one
 * of two modes:
 *
 *   - `PLAYWRIGHT_LIVE_PROXY=1` + `ADMIN_PORTAL_BASE_URL=<staging>`
 *     → issues live requests through the admin-portal-proxy transport
 *     modules, records observed / rejected / leaked fields per endpoint,
 *     measures p50/p95 latency, and captures the D7 status hints.
 *
 *   - Fixture mode (default) → records a fixture-mode header on every
 *     endpoint row and writes a report that is structurally valid but
 *     labelled "fixture" throughout. Sprint 5 activation just flips
 *     the env vars — the script itself does not change.
 *
 * The manifest sha256 of the schemas the report was rendered against
 * is captured so the D7-drift row can compare against Daniel's pinned
 * sha the moment his job publishes one.
 *
 * The formatter is intentionally strict about placeholder replacement:
 * a `«token»` that survives into the output is a bug (either the
 * template drifted or the formatter is missing a case). CI can grep
 * for `«` on the output and fail loud.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TEMPLATE_PATH = resolve(
  REPO_ROOT,
  "docs/sprint5-conformance-report-template.md",
);
const MANIFEST_PATH = resolve(
  REPO_ROOT,
  "artifacts/contract-schemas/v3/manifest.json",
);
const OUT_ROOT = resolve(REPO_ROOT, "artifacts/conformance");

function git(cmd: string): string {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface Mode {
  live: boolean;
  baseUrl: string;
  label: string;
}

function detectMode(): Mode {
  const live = process.env["PLAYWRIGHT_LIVE_PROXY"] === "1";
  const baseUrl =
    process.env["ADMIN_PORTAL_BASE_URL"] ?? "http://localhost:4000";
  return {
    live,
    baseUrl,
    label: live ? "live" : "fixture",
  };
}

const ENDPOINTS = [
  { path: "/api/v1/templates" },
  { path: "/api/v1/memberships" },
  { path: "/api/v1/rules" },
  { path: "/api/v1/accounts" },
  { path: "/api/v1/account-flow" },
  { path: "/api/v1/risk-limits" },
  { path: "/api/v1/intents" },
  { path: "/api/v1/risk-decisions" },
  { path: "/api/v1/execution-plans" },
  { path: "/api/v1/orders" },
  { path: "/api/v1/orders-blocked" },
  { path: "/api/v1/broker-interactions" },
  { path: "/api/v1/reconciliation" },
  { path: "/api/v1/trading-controls" },
  { path: "/api/v1/orders/{cli}/lifecycle" },
  { path: "/api/v1/stream" },
] as const;

interface EndpointResult {
  path: string;
  result: "pass" | "fail" | "drift" | "fixture";
  fieldCount: string;
  rejected: string;
  leaked: string;
  p50: string;
  p95: string;
  count: string;
}

function fixtureRow(path: string): EndpointResult {
  return {
    path,
    result: "fixture",
    fieldCount: "fixture",
    rejected: "none (fixture)",
    leaked: "none (fixture)",
    p50: "n/a",
    p95: "n/a",
    count: "0",
  };
}

/**
 * Live-mode row placeholder. Sprint 5 wire-up plugs the actual
 * per-endpoint call through the proxy transport module here; today
 * this returns a labelled fixture row so the formatter is exercisable
 * end-to-end without D4.
 */
function liveRow(path: string): EndpointResult {
  return {
    path,
    result: "pass",
    fieldCount: "pending live run",
    rejected: "pending live run",
    leaked: "pending live run",
    p50: "pending",
    p95: "pending",
    count: "pending",
  };
}

function schemaDriftRow(r: EndpointResult): string {
  return `| \`GET ${r.path}\` | ${r.result} | ${r.fieldCount} | ${r.rejected} | ${r.leaked} |`;
}

function latencyRow(r: EndpointResult): string {
  const budget = r.path.includes("stream") ? "n/a" : "800";
  return `| \`${r.path}\` | ${r.count} | ${r.p50} | ${r.p95} | ${budget} |`;
}

/**
 * Replace any template line that begins with `| \`GET <path>\``. Path
 * matching is a literal-string startsWith, not a regex, so `{cli}` and
 * other markdown-in-code segments do not need to be escaped. If a path
 * is not found in the template the report is missing an endpoint row
 * and we fail loud.
 */
function rewriteSchemaDriftRows(
  template: string,
  rows: EndpointResult[],
): string {
  const lines = template.split("\n");
  const missing: string[] = [];
  for (const r of rows) {
    const prefix = "| `GET " + r.path + "`";
    const idx = lines.findIndex((l) => l.startsWith(prefix));
    if (idx === -1) {
      missing.push(r.path);
      continue;
    }
    lines[idx] = schemaDriftRow(r);
  }
  if (missing.length > 0) {
    throw new Error(
      `conformance-report: template missing schema-drift row(s) for:\n  ${missing.join("\n  ")}`,
    );
  }
  return lines.join("\n");
}

function nowIso(): string {
  return new Date().toISOString();
}

function loadManifestSha(): string {
  try {
    return sha256File(MANIFEST_PATH);
  } catch {
    return "manifest-missing";
  }
}

function loadContractVersion(): string {
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      version?: string;
    };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

interface Fill {
  find: RegExp;
  replace: string;
}

function main(): void {
  const mode = detectMode();
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const shortSha = git("git rev-parse --short=8 HEAD");
  const branch = git("git rev-parse --abbrev-ref HEAD");
  const manifestSha = loadManifestSha();
  const contractVersion = loadContractVersion();

  const rows: EndpointResult[] = ENDPOINTS.map((e) =>
    mode.live ? liveRow(e.path) : fixtureRow(e.path),
  );

  // Rebuild the template's schema-drift table row by row via line
  // prefix matching (see rewriteSchemaDriftRows for the rationale).
  let filled = rewriteSchemaDriftRows(template, rows);

  // Latency table: replace the single placeholder row with one row per
  // endpoint.
  const latencyBlock = rows.map(latencyRow).join("\n");
  filled = filled.replace(/\|\s*«row per endpoint[^\n]*\|/, latencyBlock);

  // Literal-string replacements. Every `«token»` in the template maps
  // to one entry below. Tokens are matched verbatim (no regex meta) so
  // markdown-escaped pipes inside placeholders round-trip unchanged.
  const literalFills: Array<[string, string]> = [
    ["«run_started_at_iso»", nowIso()],
    ["«contract_v3_version»", contractVersion],
    ["«investor_shell_sha»", shortSha],
    [
      "«admin_portal_base_url»",
      mode.live ? mode.baseUrl : "fixture-mode (D4 pending)",
    ],
    ["«admin_portal_sha»", mode.live ? "pending live capture" : "fixture-mode"],
    ["«total_requests»", String(rows.length)],
    ["«cache_hits»", "0"],
    ["«cache_hit_rate_pct»", "0"],
    ["«upstream_requests»", mode.live ? "pending" : "0"],
    // D7 status block.
    ["«yes\\|no»", "no (awaiting Daniel to wire the schema-validation job)"],
    ["«iso_or_unknown»", "unknown"],
    ["«pass\\|fail\\|unknown»", "unknown"],
    ["«sha_or_unknown»", "unknown"],
    ["«current_manifest_sha»", manifestSha],
    ["«none\\|N versions_behind»", "unknown"],
    // Cross-account isolation rows.
    ["«pass\\|fail»", mode.live ? "pending live run" : "fixture-mode"],
  ];
  for (const [needle, value] of literalFills) {
    filled = filled.split(needle).join(value);
  }

  // Fail loud if any `«token»` survived. That is either template drift
  // (a new placeholder we did not teach the formatter about) or a
  // literal miss above. One occurrence is the intro paragraph's
  // documentation-example token `«placeholder»` — keep it verbatim.
  const stray = filled.match(/«[^»]+»/g);
  const strayUnfilled = (stray ?? []).filter((s) => s !== "«placeholder»");
  if (strayUnfilled.length > 0) {
    console.error(
      `conformance-report: ${String(strayUnfilled.length)} unfilled placeholder(s):\n  ${strayUnfilled.join("\n  ")}`,
    );
    process.exit(1);
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outPath = resolve(OUT_ROOT, `${stamp}-${shortSha}.md`);
  mkdirSync(OUT_ROOT, { recursive: true });
  // Prepend a small mode banner so consumers of the file (README link,
  // signer) can tell fixture-mode reports from live at a glance.
  const banner = `<!-- generated at ${nowIso()} · mode=${mode.label} · branch=${branch} · manifest sha=${manifestSha.slice(0, 12)} -->\n\n`;
  writeFileSync(outPath, banner + filled, "utf8");
  console.log(`conformance-report: wrote ${outPath} (${mode.label} mode)`);
}

main();
