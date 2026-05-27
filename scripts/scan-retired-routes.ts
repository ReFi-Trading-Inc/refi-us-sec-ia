#!/usr/bin/env tsx
/**
 * Retired-route + retired-action scanner (Sprint A discipline rule).
 *
 * Per `refi-build-docs/spec-current/12-daniel-2026-05-20-guidance.md §2.2`
 * rule 6 + the discipline charter:
 *
 *   "Managed users activate Execution Policy once. Per-recommendation
 *    approval belongs only in Exception Review."
 *
 * Forbidden in any path under apps/web/ or packages/ except handlers that
 * stay alive for back-compat under explicit `// allow-retired-route: ...`
 * opt-out comments.
 *
 * Exit 0 = clean. Exit 1 = violations found.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

// Patterns whose presence in code = a regression of the tier reframe.
// Each pattern is paired with the canonical replacement so the error message
// tells the dev where to go.
const RETIRED: Array<{
  pattern: RegExp;
  label: string;
  replacement: string;
}> = [
  {
    pattern: /["']\/orders\/preview["']/g,
    label: "/orders/preview endpoint",
    replacement:
      "Removed under the tier reframe — investors do not preview/submit per-rec. " +
      "Use compliance verdict from /api/v1/risk-snapshots/{intent_id} instead.",
  },
  {
    pattern: /useOrderPreview\b/g,
    label: "useOrderPreview hook",
    replacement: "Removed — see /orders/preview note.",
  },
  {
    pattern: /useSubmitOrder\b/g,
    label: "useSubmitOrder hook (raw investor POST /orders)",
    replacement:
      "Removed — investors do not place raw orders. Managed mode auto-executes " +
      "approved AccountIntents; Exception Review approves outside-policy intents.",
  },
  {
    pattern: /usePatchRecommendation\b/g,
    label: "usePatchRecommendation hook (accept/reject/request_review)",
    replacement:
      "Removed — per-rec PATCH actions are forbidden. Use " +
      "useActivateExecutionPolicy (one-time per policy version) or " +
      "useApproveException / useRejectException (per-exception, only Managed).",
  },
  {
    pattern: /\baction:\s*["'](accept|reject|request_review)["']/g,
    label: "Recommendation PATCH action",
    replacement:
      "Removed — see usePatchRecommendation note. Use execution-policy or exception flows.",
  },
  {
    pattern: /\bapproveAction\b/g,
    label: "approveAction copy key on recommendation detail",
    replacement:
      "Removed — no Approve button on recommendation detail. See exception flow.",
  },
  {
    pattern: /\brejectAction\b/g,
    label: "rejectAction copy key on recommendation detail",
    replacement: "Removed — no Reject button on recommendation detail.",
  },
  {
    pattern: /\brequestReviewAction\b/g,
    label: "requestReviewAction copy key on recommendation detail",
    replacement:
      "Removed — system routes exceptions; investor does not request review.",
  },
];

// Roots to scan. Skip generated files, node_modules, build outputs, and the
// scanner itself.
const SCAN_ROOTS = ["apps/web/app", "apps/web/src", "packages"];
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
]);
const IGNORE_FILES = new Set([
  // The scanner's own pattern source is allowed to contain the strings.
  "scripts/scan-retired-routes.ts",
  // The generated codegen file mirrors refi-api.yaml verbatim.
  "packages/api-clients/src/generated/api.gen.ts",
  // ── Legacy bridge files — retired in Sprint C (P2.5R-04) ──────────────
  // These exist solely as transitional MSW handlers + hooks. They must NOT
  // be referenced from any new code. The whole-file exemption is intentional
  // because the scanner-per-line opt-out would clutter every legacy line and
  // these files are scheduled for outright removal. NEW retired-route refs
  // in OTHER files are still caught.
  "packages/api-clients/src/hooks/orders.ts",
  "packages/api-clients/src/hooks/recommendations.ts",
  "packages/api-clients/src/mocks/handlers.orders.ts",
  "packages/api-clients/src/mocks/handlers.recommendations.ts",
  "packages/api-clients/src/mocks/__tests__/handlers.contract.test.ts",
  // index.ts re-exports legacy hooks until P2.5R-04 removes them — the
  // exemption lets the file edit normally without per-line opt-outs.
  "packages/api-clients/src/index.ts",
  // The discipline test asserts the retired patterns ARE NOT present in
  // application code — it must reference the patterns itself to do so.
  "packages/api-clients/src/mocks/__tests__/discipline.test.ts",
]);

interface Violation {
  file: string;
  line: number;
  text: string;
  label: string;
  replacement: string;
}

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function hasOptOut(line: string, label: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes("allow-retired-route") &&
    lower.includes(label.toLowerCase().split(" ")[0]!)
  );
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}

function scanFile(filePath: string): Violation[] {
  const rel = relative(REPO_ROOT, filePath);
  if (IGNORE_FILES.has(rel)) return [];
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const v: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip pure-comment lines — references to removed identifiers in
    // explanatory comments (e.g., "approveAction removed in P2.5R-19")
    // are documentation, not code references. Inline comments after code
    // (e.g., `foo(); // approveAction was here`) still get scanned.
    if (isCommentLine(line)) continue;
    for (const r of RETIRED) {
      r.pattern.lastIndex = 0;
      if (r.pattern.test(line) && !hasOptOut(line, r.label)) {
        v.push({
          file: rel,
          line: i + 1,
          text: line.trim().slice(0, 160),
          label: r.label,
          replacement: r.replacement,
        });
      }
    }
  }
  return v;
}

const allFiles: string[] = [];
for (const root of SCAN_ROOTS) {
  walk(join(REPO_ROOT, root), allFiles);
}

const violations: Violation[] = [];
for (const f of allFiles) violations.push(...scanFile(f));

if (violations.length === 0) {
  console.log(`scan-retired-routes: ✓ ${allFiles.length} file(s) clean`);
  process.exit(0);
}

console.error("");
console.error("scan-retired-routes: violations found");
console.error("");
const byFile = new Map<string, Violation[]>();
for (const v of violations) {
  const arr = byFile.get(v.file) ?? [];
  arr.push(v);
  byFile.set(v.file, arr);
}
for (const [file, vs] of byFile) {
  console.error(`  ${file}`);
  for (const v of vs) {
    console.error(`    line ${v.line}: ✗ ${v.label}`);
    console.error(`      ${v.text}`);
    console.error(`      → ${v.replacement}`);
  }
  console.error("");
}
console.error(
  `scan-retired-routes: ${violations.length} violation(s) in ${byFile.size} file(s)`,
);
console.error(
  `\n  Opt-out (per line): // allow-retired-route: "<label>" reason: "..."`,
);
process.exit(1);
