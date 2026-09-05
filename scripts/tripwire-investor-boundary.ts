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
 *   5. Client-side recommendation-freshness threshold constants (freshness is
 *      backend-owned — Daniel 2026-08-17).
 *
 * This is the enforcement leg of docs/admin-investor-boundary.md. See also
 * docs/sec203a-product-boundary.md.
 *
 * Per-line opt-out:
 *   // allow-investor-boundary: "<pattern>" reason: "<one-liner>"
 *
 * Allowlisted files (these define the boundary, so they may name the forbidden
 * things): scripts/tripwire-investor-boundary.ts, packages/config/blocked-terms.ts,
 * apps/web/src/lib/sec203a/actions.ts, apps/web/src/lib/sec203a/admin-verbs.ts,
 * docs/**.
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

/**
 * Client-side freshness threshold identifiers — forbidden outright.
 *
 * Daniel 2026-08-17 (docs/phase2-7-daniel-contract-mechanics-resolution.md §3):
 * freshness "will be backend-owned and may vary by strategy/source and market
 * schedule. Please do not make the provisional two-hour and 24-hour thresholds
 * contract constants."
 *
 * The frontend displays `freshness_status` / `fresh_until` / `expires_at` from
 * the projection; it never computes staleness from a clock comparison. Any
 * constant of this shape is a reintroduction of the dead Phase 2.5 thresholds.
 *
 * Word-boundary match, same as FORBIDDEN_ACTION_IDS. Case-insensitive variants
 * are covered by listing both spellings.
 */
/**
 * Identifiers retired from the Signal artifact.
 *
 * Distinct from FORBIDDEN_ACTION_IDS, which lists things forbidden by policy.
 * These were legitimate, are now removed, and their reappearance is a
 * regression rather than a policy breach — so the message points at what
 * replaced them instead of at a rule.
 *
 * `/orders` and `/v1/brokers/orders` are deliberately NOT here. Both are GET
 * read models, and banning a route because its name contains "orders" would
 * confuse observation with authority. The Signal boundary is the absence of
 * order SUBMISSION, cancellation, and executable intent — not the absence of
 * order history.
 */
const RETIRED_SIGNAL_IDS: ReadonlyArray<{ id: string; note: string }> = [
  {
    id: "useSubmitOrder",
    note: "removed 2026-07-30 — investors never place raw orders",
  },
  {
    id: "useCancelOrder",
    note: "removed 2026-07-30 — cancellation crosses broker ownership boundaries",
  },
  {
    id: "useOrderPreview",
    note: "removed 2026-08-22 — browser-direct POST /orders/preview, execution-era per-trade model",
  },
  {
    id: "CompliancePreview",
    note: "removed 2026-08-22 — unmounted renderSubmit(canSubmit) component; Signal has no per-trade approval",
  },
  {
    id: "/orders/preview",
    note: "removed 2026-08-22 — see useOrderPreview",
  },
];

/**
 * Retired security-architecture identifiers (CS-02, 2026-08-25).
 *
 * The double-submit CSRF layer was half-implemented — cookie issued on
 * /us/app/* navigation, validator written, but nothing ever echoed or checked
 * the token — so it was REMOVED rather than wired in. The implemented CSRF
 * control for cookie-authenticated mutations is the fail-closed same-origin
 * check in bffMutate (src/lib/bff/origin.ts), pinned by contract assertions.
 * These identifiers reappearing in runtime source means the dead layer is
 * silently returning without a reviewed CSRF architecture decision — fail CI.
 * (Docs and tests are allowlisted; comment lines are skipped by the scanner.)
 */
const RETIRED_CSRF_IDS: ReadonlyArray<{ id: string; note: string }> = [
  {
    id: "csrf_v1",
    note: "removed 2026-08-25 (CS-02) — double-submit cookie was never validated; same-origin check in bffMutate is the CSRF control",
  },
  {
    id: "x-csrf-token",
    note: "removed 2026-08-25 (CS-02) — no client ever sent this header; reintroduction requires a reviewed CSRF architecture",
  },
  {
    id: "validateCsrfToken",
    note: "removed 2026-08-25 (CS-02) — validator had zero callers",
  },
  {
    id: "setCsrfCookie",
    note: "removed 2026-08-25 (CS-02) — issuance helper for the dead layer",
  },
];

const ALL_RETIRED_IDS: ReadonlyArray<{ id: string; note: string }> = [
  ...RETIRED_SIGNAL_IDS,
  ...RETIRED_CSRF_IDS,
];

/**
 * Browser-direct execution guard (C2b).
 *
 * The C0 capability audit's §0 finding was that ~25 legacy `apiFetch` calls
 * bypass every server in this repository, so no BFF route deletion can prove
 * the browser cannot reach an execution endpoint. This is the mechanical half
 * of that proof: no `apiFetch` call may target a path with an execution
 * segment. The runtime half is the signal-lane absence proofs
 * (apps/web/e2e/signal-authority.spec.ts).
 *
 * Segment-exact by design. `/v1/brokers/orders` and a bare `/orders` read
 * model are NOT flagged — the C0 correction (§4b) is explicit that banning a
 * route because its name contains "orders" confuses observation with
 * authority. The boundary is submission, cancellation, and executable intent.
 * `preview` is flagged only directly under an `orders` segment (the retired
 * per-trade compliance preview), not as a general word.
 */
const EXECUTION_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  "submit",
  "cancel",
  "execute",
  "execution",
  "executions",
  "execution-policy",
  "intent",
  "intents",
  "account-intents",
  "trade",
  "trades",
  "rebalance",
  "liquidate",
]);

/**
 * Match every apiFetch call's first argument across the WHOLE file content
 * (not per line — a multi-line call must not slip through). Template-literal
 * interpolations are normalized to a plain segment so `/v1/orders/${id}/cancel`
 * still yields a "cancel" segment.
 */
const API_FETCH_ARG_RE =
  /apiFetch\s*(?:<[^>()]*>)?\s*\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g;

function executionSegmentIn(rawArg: string): string | null {
  const path = rawArg.slice(1, -1).replace(/\$\{[^}]*\}/g, "X");
  const segments = path.split("/").filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const seg = (segments[i] ?? "").toLowerCase();
    if (EXECUTION_PATH_SEGMENTS.has(seg)) return seg;
    if (seg === "preview" && (segments[i - 1] ?? "").toLowerCase() === "orders")
      return "orders/preview";
  }
  return null;
}

/** Executable proof the guard catches what it claims — and only that. */
const EXECUTION_MUST_MATCH: ReadonlyArray<string> = [
  'apiFetch<Order>("/v1/orders/submit", { method: "POST" })',
  "apiFetch(`/v1/orders/${id}/cancel`, { method: 'POST' })",
  'apiFetch<Preview>("/orders/preview")',
  'apiFetch("/v1/account-intents", { method: "POST", body })',
  'apiFetch<Execution[]>("/v1/executions")',
  'apiFetch("/v1/managed/rebalance", { method: "POST" })',
  "await apiFetch(\n  '/v1/positions/liquidate',\n  { method: 'POST' },\n)",
  'apiFetch("/v1/execution-policy", { method: "PUT" })',
];

const EXECUTION_BENIGN_CONTROLS: ReadonlyArray<string> = [
  'apiFetch<Order[]>("/v1/brokers/orders")',
  "apiFetch<Recommendation>(`/v1/recommendations/${id}`)",
  'apiFetch<AccountActivationResponse>("/v1/account/activate", { method: "POST" })',
  'apiFetch<BrokerConnectKeyResponse>("/v1/brokers/connect/keys", { method: "POST" })',
  'apiFetch<BrokerConnection | null>("/v1/brokers/connection")',
  'apiFetch<ActivityEvent[]>("/v1/activity")',
];

function scanExecutionEndpoints(content: string): Array<{
  index: number;
  pattern: string;
  text: string;
}> {
  const hits: Array<{ index: number; pattern: string; text: string }> = [];
  for (const m of content.matchAll(API_FETCH_ARG_RE)) {
    const arg = m[1] ?? "";
    const seg = executionSegmentIn(arg);
    if (seg !== null) {
      hits.push({
        index: m.index,
        pattern: seg,
        text: m[0].replace(/\s+/g, " ").slice(0, 160),
      });
    }
  }
  return hits;
}

function selfTestExecutionGuard(): string[] {
  const failures: string[] = [];
  for (const call of EXECUTION_MUST_MATCH) {
    if (scanExecutionEndpoints(call).length === 0) {
      failures.push(
        `must be REFUSED but was not detected: ${call.replace(/\s+/g, " ")}`,
      );
    }
  }
  for (const call of EXECUTION_BENIGN_CONTROLS) {
    const hits = scanExecutionEndpoints(call);
    if (hits.length > 0) {
      failures.push(
        `must be ALLOWED but matched segment "${hits[0]?.pattern ?? ""}": ${call}`,
      );
    }
  }
  return failures;
}

const FORBIDDEN_FRESHNESS_STEMS: ReadonlyArray<string> = [
  // SCREAMING_SNAKE spellings.
  "FRESH_THRESHOLD",
  "STALE_THRESHOLD",
  "FRESHNESS_THRESHOLD",
  "STALE_AFTER",
  "FRESH_WINDOW",
  "RECOMMENDATION_TTL",
  // camelCase spellings.
  "freshThreshold",
  "staleThreshold",
  "freshnessThreshold",
  "staleAfter",
  "freshWindow",
  "recommendationTtl",
];

/**
 * Match a prohibited freshness stem.
 *
 * ASYMMETRIC BY DESIGN. The left side keeps a full identifier boundary so a
 * stem never matches mid-word. The right side is open, because the units
 * suffix is exactly where these constants acquire their real names —
 * STALE_THRESHOLD_HOURS and FRESH_THRESHOLD_HOURS are the two most natural
 * spellings for the dead Phase 2.5 thresholds, and a symmetric \b…\b rule
 * misses both (`_` is a word character, so there is no boundary after
 * "THRESHOLD"). Enumerating every unit suffix is a losing game; anchoring the
 * stem is not.
 *
 * The stems are deliberately narrow. They are threshold/window/TTL nouns, not
 * the words "fresh" or "stale" — the backend-owned projection fields
 * (`freshness_status`, `fresh_until`, `expires_at`) must keep flowing through
 * this code untouched. The FRESHNESS_BENIGN_CONTROLS below hold that line.
 */
function matchFreshnessStem(line: string): string | null {
  for (const stem of FORBIDDEN_FRESHNESS_STEMS) {
    const re = new RegExp(`(^|[^\\w$])${stem}[\\w$]*`);
    if (re.test(line) && !lineAllows(line, stem)) return stem;
  }
  return null;
}

/**
 * Executable proof that the rule above catches what it claims to. Ships with
 * the rule so a future checkout carries the invariant, not just the intent.
 */
const FRESHNESS_MUST_MATCH: ReadonlyArray<string> = [
  "export const STALE_THRESHOLD = 2;",
  "export const STALE_THRESHOLD_HOURS = 2;",
  "export const STALE_THRESHOLD_SECONDS = 7200;",
  "export const FRESH_THRESHOLD_HOURS = 2;",
  "export const STALE_AFTER_HOURS = 24;",
  "export const FRESH_WINDOW_HOURS = 2;",
  "export const RECOMMENDATION_TTL_HOURS = 24;",
  "const staleThresholdHours = 2;",
  "const freshThresholdMinutes = 120;",
];

/**
 * The other half of the guard: a rule that flags these has degenerated into
 * grepping for "fresh"/"stale" and would block the backend-owned envelope the
 * frontend is required to display.
 */
const FRESHNESS_BENIGN_CONTROLS: ReadonlyArray<string> = [
  "  fresh_until: z.string().datetime(),",
  "  freshness_status: freshnessStatusSchema,",
  "  expires_at: z.string().datetime().optional(),",
  'export const FRESHNESS_STATUSES = ["fresh", "stale", "expired"] as const;',
  "// Recommendations may be stale; the backend decides, never the client.",
  '  const isStale = projection.freshness?.freshness_status === "stale";',
];

function selfTestFreshnessRule(): string[] {
  const failures: string[] = [];
  for (const line of FRESHNESS_MUST_MATCH) {
    if (matchFreshnessStem(line) === null) {
      failures.push(`must be REFUSED but was not detected: ${line}`);
    }
  }
  for (const line of FRESHNESS_BENIGN_CONTROLS) {
    const hit = matchFreshnessStem(line);
    if (hit !== null) {
      failures.push(`must be ALLOWED but matched stem "${hit}": ${line}`);
    }
  }
  return failures;
}

// ─── Scan targets ────────────────────────────────────────────────────────────

/**
 * Directories whose contents are scanned. Anything outside these is ignored
 * (intentional — Daniel's repo, node_modules, dist, etc. are not in scope).
 *
 * `packages/api-clients` was added 2026-07-30. It had been out of scope, which
 * is how an exported `useCancelOrder` survived there despite `cancelOrder`
 * being a forbidden identifier — the investor app was clean, but the client
 * package it imports from was never checked. The typed investor-api client
 * lands in packages/, so this is where the boundary now needs enforcing.
 */
const SCAN_ROOTS: ReadonlyArray<string> = ["apps/web", "packages/api-clients"];

/**
 * Files & directories whose contents are exempted (boundary-enforcing files
 * may legitimately name the forbidden things).
 */
const ALLOWED_PATHS: ReadonlyArray<string> = [
  "scripts/tripwire-investor-boundary.ts",
  "packages/config/blocked-terms.ts",
  "apps/web/src/lib/sec203a/actions.ts",
  "apps/web/src/lib/sec203a/admin-verbs.ts",
  // The release-stage capability policy must name the Managed resolution
  // categories in order to DENY them at the signal stage — the same rationale
  // as actions.ts naming forbidden actions to keep them out of everywhere else.
  "apps/web/src/lib/sec203a/release-policy.ts",
  "apps/web/src/lib/sec203a/account-prefs.ts",
  // The single documented home of the legacy UI→backend resolution alias
  // mapping. Same rationale as actions.ts / admin-verbs.ts: it must name the
  // forbidden spellings in order to keep them out of the UI layer.
  "packages/api-clients/src/hooks/exceptions.ts",
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
  // Rebuilt from openapi/refi-api.yaml on every build; the spec is the file
  // that must stay clean, and scanning the output only duplicates its findings.
  "generated",
]);

// ─── Violation type ──────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  kind:
    | "endpoint"
    | "action-id"
    | "label"
    | "route-path"
    | "freshness-threshold"
    | "retired-signal-id"
    | "execution-endpoint";
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

    // 3a2. Retired Signal identifiers.
    //
    // Comment lines are skipped, and that is the point: the note explaining why
    // an identifier was retired must name it, so a scanner that reads prose
    // flags its own documentation and pressures the next person to delete the
    // explanation. A commented-out call is not a reachable capability.
    const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
    for (const { id, note } of isComment ? [] : ALL_RETIRED_IDS) {
      const re = id.startsWith("/")
        ? new RegExp(id.replace(/[/]/g, "\\/"))
        : new RegExp(`(^|[^\\w$])${id}([^\\w$]|$)`);
      if (re.test(line) && !lineAllows(line, id)) {
        violations.push({
          file: relPath,
          line: i + 1,
          kind: "retired-signal-id",
          pattern: `${id} (${note})`,
          text: line.trim().slice(0, 160),
        });
      }
    }

    // 3b. Client-side freshness thresholds (left-anchored stem).
    const freshnessStem = matchFreshnessStem(line);
    if (freshnessStem !== null) {
      violations.push({
        file: relPath,
        line: i + 1,
        kind: "freshness-threshold",
        pattern: freshnessStem,
        text: line.trim().slice(0, 160),
      });
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

  // 5. Browser-direct execution guard (whole-content pass — a multi-line
  //    apiFetch call must not slip through a per-line scan).
  for (const hit of scanExecutionEndpoints(content)) {
    const lineNo = content.slice(0, hit.index).split("\n").length;
    const line = lines[lineNo - 1] ?? "";
    if (lineAllows(line, hit.pattern)) continue;
    violations.push({
      file: relPath,
      line: lineNo,
      kind: "execution-endpoint",
      pattern: hit.pattern,
      text: hit.text,
    });
  }

  return violations;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): number {
  // Each self-proving rule demonstrates itself before it is trusted to police
  // anything.
  const selfTestFailures = [
    ...selfTestFreshnessRule().map((f) => `[freshness] ${f}`),
    ...selfTestExecutionGuard().map((f) => `[execution] ${f}`),
  ];
  if (selfTestFailures.length > 0) {
    console.error(
      `\ntripwire: rule SELF-TEST FAILED ` +
        `(${selfTestFailures.length}) — a guard does not enforce what it claims.\n`,
    );
    for (const f of selfTestFailures) console.error(`    ${f}`);
    console.error("");
    return 1;
  }

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
