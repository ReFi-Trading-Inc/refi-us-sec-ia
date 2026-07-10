#!/usr/bin/env tsx
/**
 * Investor-boundary tripwire.
 *
 * Fails CI if the investor app (apps/web) gains any of the following:
 *   1. References to Daniel's admin-portal endpoints or admin command paths.
 *   2. Forbidden investor action identifiers (per docs/investor-action-taxonomy.md).
 *   3. User-facing labels that imply per-trade investor approval or operator
 *      action (e.g. "Accept Recommendation", "Approve Trade", "Manual Rebalance").
 *   4. Route files mounted under /admin or /api/admin within the investor app.
 *
 * This is the enforcement leg of docs/admin-investor-boundary.md. See also
 * docs/sec203a-product-boundary.md.
 *
 * Per-line opt-out:
 *   // allow-investor-boundary: "<pattern>" reason: "<one-liner>"
 *
 * Allowlisted files (these define the boundary, so they may name the forbidden
 * things): scripts/tripwire-investor-boundary.ts, packages/config/blocked-terms.ts,
 * apps/web/src/lib/sec203a/actions.ts, docs/**.
 *
 * Run: pnpm tripwire
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");

// ─── Patterns ────────────────────────────────────────────────────────────────

/** Admin endpoint substrings — the investor app must never reference these. */
const ADMIN_ENDPOINT_PATTERNS: ReadonlyArray<string> = [
  "admin-portal",
  "/admin-actions",
  "/operations/force-inference",
  "/operations/force-training",
  "/operations/force-data-load",
  "/operations/cancel-order",
  "/operations/rollback",
  "/operations/trigger-rebalance",
  "/internal/launch-init",
  "/internal/launch-ss",
  "/internal/publish-inference-catchup",
  "/internal/rollback",
  "/internal/populate-returns",
  "/interventions",
  "/trading-controls/",
  "/pricing-rules/relax-all",
  "/asset-initializer",
  "template.admin",
];

/**
 * Forbidden investor action identifiers (camelCase function/const names).
 * Word-boundary match.
 */
const FORBIDDEN_ACTION_IDS: ReadonlyArray<string> = [
  "acceptRecommendation",
  "approveTrade",
  "approveRebalance",
  "adminRebalance",
  "manualTradeSubmit",
  "manualRebalance",
  "forceInference",
  "forceTraining",
  "forceDataLoad",
  "cancelOrder",
  "configWrite",
  "controlsWrite",
  "accountInitialize",
  "staffReviewAdvice",
  "founderApproveRecommendation",
  "editRecommendation",
  "triggerRebalance",
  // Phase 2 surface 1: block per-trade Accept components/actions. No
  // per-trade Accept is permitted in Managed mode; these names capture
  // variants we have seen drift in across the codebase.
  "AcceptButton",
  "accept_trade",
  "investor-accept",
];

/**
 * Forbidden user-facing labels (case-insensitive substring match).
 * These should never appear in JSX text, button labels, or copy.
 */
const FORBIDDEN_LABELS: ReadonlyArray<string> = [
  "accept recommendation",
  "accept trade",
  "approve trade",
  "approve rebalance",
  "approve recommendation",
  "manual rebalance",
  "manual trade",
  "force inference",
  "force training",
  "force data load",
  "config write",
  "controls write",
  "account initialize",
  "founder approval",
  "staff approval",
  "staff review",
  "operator approval",
  "operator review",
  // Phase 2 surface 1: explicit per-trade Accept-and-execute phrases.
  "approve for execution",
  "accept and execute",
  // Phase 2 surface 7: legacy backend resolution names must not surface in
  // any user-facing context. The mapping in
  // packages/api-clients/src/hooks/exceptions.ts uses the per-line
  // `allow-investor-boundary` opt-out comments so the alias remains visible
  // to maintainers but invisible to investors.
  "approve_exception",
  "reject_exception",
  "approve exception",
  "execute exception",
  "override guardrail",
  "override risk",
  "investor accept",
];

// ─── Scan targets ────────────────────────────────────────────────────────────

/**
 * Directories whose contents are scanned. Anything outside these is ignored
 * (intentional — Daniel's repo, node_modules, dist, etc. are not in scope).
 */
const SCAN_ROOTS: ReadonlyArray<string> = ["apps/web"];

/**
 * Files & directories whose contents are exempted (boundary-enforcing files
 * may legitimately name the forbidden things).
 */
const ALLOWED_PATHS: ReadonlyArray<string> = [
  "scripts/tripwire-investor-boundary.ts",
  "packages/config/blocked-terms.ts",
  "apps/web/src/lib/sec203a/actions.ts",
  // Feature flags that gate the admin-portal-proxy layer (Sprint 1+). Naming
  // the upstream in flag identifiers is the point of the module; the app
  // never renders these names to users.
  "apps/web/src/lib/feature-flags/",
  // Route manifest declares every /api route including proxy endpoints; the
  // scanner runs against JSON files with route paths that mention
  // admin-portal by design.
  "apps/web/route-manifest.json",
  "docs/",
  // Tests may name forbidden things in negative assertions.
  "/__tests__/",
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "coverage",
  ".refi-prototype-store",
  "playwright-report",
  "test-results",
]);

// ─── Violation type ──────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  kind: "endpoint" | "action-id" | "label" | "route-path";
  pattern: string;
  text: string;
}

// ─── Walker ──────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (
      stat.isFile() &&
      (full.endsWith(".ts") ||
        full.endsWith(".tsx") ||
        full.endsWith(".js") ||
        full.endsWith(".jsx") ||
        full.endsWith(".md"))
    ) {
      out.push(full);
    }
  }
  return out;
}

function isAllowed(relPath: string): boolean {
  return ALLOWED_PATHS.some((p) => relPath.includes(p));
}

const ALLOW_LINE = /\/\/\s*allow-investor-boundary:\s*"([^"]+)"/;

function lineAllows(line: string, pattern: string): boolean {
  const match = line.match(ALLOW_LINE);
  if (!match || !match[1]) return false;
  return match[1] === pattern;
}

// ─── Scanners ────────────────────────────────────────────────────────────────

function scanFile(absPath: string): Violation[] {
  const relPath = relative(REPO_ROOT, absPath);
  if (isAllowed(relPath)) return [];
  const violations: Violation[] = [];
  const content = readFileSync(absPath, "utf8");
  const lines = content.split("\n");

  // 1. Route-path checks. Any file mounted under one of these path
  //    segments is a structural violation — even an empty file means a route
  //    is reachable.
  const forbiddenRouteSegments: ReadonlyArray<{ seg: string; reason: string }> =
    [
      { seg: "apps/web/app/admin/", reason: "/admin route in investor app" },
      {
        seg: "apps/web/app/api/admin/",
        reason: "/api/admin route in investor app",
      },
      {
        seg: "apps/web/app/api/v1/investor/recommendations/[id]/accept/",
        reason: "per-trade /accept route forbidden",
      },
      {
        seg: "apps/web/app/api/v1/investor/recommendations/[id]/approve/",
        reason: "per-trade /approve route forbidden",
      },
      {
        seg: "apps/web/app/api/v1/investor/exceptions/[id]/approve/",
        reason: "/approve on exceptions superseded by /resolve",
      },
      {
        seg: "apps/web/app/api/v1/investor/managed-policy/",
        reason: "managed-policy renamed to execution-policy + /managed/* state",
      },
      {
        seg: "apps/web/app/api/v1/investor/mode/",
        reason: "mode route renamed to /subscription-mode",
      },
    ];
  for (const { seg, reason } of forbiddenRouteSegments) {
    if (relPath.startsWith(seg)) {
      violations.push({
        file: relPath,
        line: 0,
        kind: "route-path",
        pattern: seg,
        text: reason,
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // 2. Admin endpoint substrings.
    for (const pattern of ADMIN_ENDPOINT_PATTERNS) {
      if (line.includes(pattern) && !lineAllows(line, pattern)) {
        violations.push({
          file: relPath,
          line: i + 1,
          kind: "endpoint",
          pattern,
          text: line.trim().slice(0, 160),
        });
      }
    }

    // 3. Forbidden action identifiers (word-boundary).
    for (const id of FORBIDDEN_ACTION_IDS) {
      const re = new RegExp(`(^|[^\\w$])${id}([^\\w$]|$)`);
      if (re.test(line) && !lineAllows(line, id)) {
        violations.push({
          file: relPath,
          line: i + 1,
          kind: "action-id",
          pattern: id,
          text: line.trim().slice(0, 160),
        });
      }
    }

    // 4. Forbidden user-facing labels (case-insensitive substring).
    const lower = line.toLowerCase();
    for (const label of FORBIDDEN_LABELS) {
      if (lower.includes(label) && !lineAllows(line, label)) {
        violations.push({
          file: relPath,
          line: i + 1,
          kind: "label",
          pattern: label,
          text: line.trim().slice(0, 160),
        });
      }
    }
  }

  return violations;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): number {
  const allFiles: string[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    walk(abs, allFiles);
  }

  const violations: Violation[] = [];
  for (const f of allFiles) {
    violations.push(...scanFile(f));
  }

  if (violations.length === 0) {
    console.log(
      `tripwire: 0 violations across ${allFiles.length} scanned files.`,
    );
    return 0;
  }

  console.error(
    `\ntripwire: ${violations.length} investor-boundary violation(s) — CI will fail.\n`,
  );
  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
  }
  for (const [file, vs] of byFile) {
    console.error(`  ${file}`);
    for (const v of vs) {
      const loc = v.line > 0 ? `:${v.line}` : "";
      console.error(`    ${loc} [${v.kind}] ${v.pattern}`);
      if (v.line > 0) console.error(`        ${v.text}`);
    }
  }
  console.error(
    `\nSee docs/admin-investor-boundary.md for the full rule set.\n` +
      `Per-line opt-out: // allow-investor-boundary: "<pattern>" reason: "<why>"\n`,
  );
  return 1;
}

process.exit(main());
