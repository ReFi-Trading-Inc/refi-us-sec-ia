#!/usr/bin/env tsx
/**
 * SEC-sensitive copy scanner for /us content files.
 *
 * Scans apps/web/app/us/_content/*.ts for:
 *   1. Blocked terms (exact match, case-insensitive)
 *   2. Legacy Bolt terms that must be replaced
 *   3. Bracketed placeholder strings in non-dev builds
 *
 * Exit 0 = clean. Exit 1 = violations found (blocks CI).
 *
 * Opt-out on a line: // allow-blocked-term: "term" reason: "..."
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { blockedTerms, legacyTerms } =
  await import("../packages/config/blocked-terms.js").catch(() =>
    import("../packages/config/blocked-terms.ts" as string).then((m) => m),
  );

const CONTENT_DIR = join(__dirname, "../apps/web/app/us/_content");
const IS_CI = process.env["CI"] === "true";
const ALLOW_PLACEHOLDERS = process.env["ALLOW_PLACEHOLDERS"] === "true";

// ─── Violation type ───────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  text: string;
  kind: "blocked" | "legacy" | "placeholder";
  term: string;
  suggestion?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function walkDir(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function hasOptOut(line: string, term: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes("allow-blocked-term") && lower.includes(term.toLowerCase())
  );
}

/**
 * Placeholder opt-out scan. Looks for `allow-placeholder` on the same line
 * OR the immediately preceding line, with a `reason:` clause to force the
 * author to justify each exception. Same-line is preferred for short
 * literals; previous-line is for placeholders inside multi-line strings.
 */
function hasPlaceholderOptOut(line: string, prev: string | undefined): boolean {
  const matches = (s: string) =>
    s.toLowerCase().includes("allow-placeholder") &&
    s.toLowerCase().includes("reason:");
  return matches(line) || (prev !== undefined && matches(prev));
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNumber = i + 1;

    // 1. Blocked terms
    for (const term of blockedTerms) {
      if (line.toLowerCase().includes(term.toLowerCase())) {
        if (!hasOptOut(line, term)) {
          violations.push({
            file: filePath,
            line: lineNumber,
            text: line.trim(),
            kind: "blocked",
            term,
          });
        }
      }
    }

    // 2. Legacy Bolt terms
    for (const [legacy, replacement] of Object.entries(legacyTerms)) {
      if (line.includes(legacy)) {
        if (!hasOptOut(line, legacy)) {
          violations.push({
            file: filePath,
            line: lineNumber,
            text: line.trim(),
            kind: "legacy",
            term: legacy,
            suggestion: replacement,
          });
        }
      }
    }

    // 3. Bracketed placeholders — only fail in CI unless explicitly allowed.
    // Matches [Uppercase words with spaces/dashes] — human-written placeholders.
    // Does NOT match TypeScript [number]/[string], array literals ['foo'], or empty [].
    const PLACEHOLDER_RE = /\[[A-Z][a-zA-Z\s—–-]{4,}\]/g;
    if ((IS_CI || !ALLOW_PLACEHOLDERS) && PLACEHOLDER_RE.test(line)) {
      const trimmed = line.trim();
      const prev = i > 0 ? lines[i - 1] : undefined;
      if (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !hasPlaceholderOptOut(line, prev)
      ) {
        violations.push({
          file: filePath,
          line: lineNumber,
          text: trimmed,
          kind: "placeholder",
          term: (line.match(PLACEHOLDER_RE) ?? [])[0] ?? "[?]",
        });
      }
    }
  }

  return violations;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  let files: string[];
  try {
    files = walkDir(CONTENT_DIR);
  } catch {
    console.error(`scan-copy: content directory not found at ${CONTENT_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log("scan-copy: no content files found — nothing to scan");
    process.exit(0);
  }

  const allViolations: Violation[] = [];
  for (const file of files) {
    allViolations.push(...scanFile(file));
  }

  if (allViolations.length === 0) {
    console.log(`scan-copy: ✓ ${files.length} file(s) clean`);
    process.exit(0);
  }

  // Group by file for readable output
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const rel = relative(join(__dirname, ".."), v.file);
    const existing = byFile.get(rel) ?? [];
    existing.push(v);
    byFile.set(rel, existing);
  }

  console.error("\nscan-copy: violations found\n");

  for (const [file, violations] of byFile) {
    console.error(`  ${file}`);
    for (const v of violations) {
      const prefix =
        v.kind === "blocked"
          ? "  ✗ BLOCKED"
          : v.kind === "legacy"
            ? "  ✗ LEGACY"
            : "  ✗ PLACEHOLDER";
      const hint =
        v.kind === "legacy" && v.suggestion
          ? ` → use "${v.suggestion}"`
          : v.kind === "placeholder"
            ? " (replace with final copy or set ALLOW_PLACEHOLDERS=true for local dev)"
            : "";
      console.error(`    line ${v.line}: ${prefix} "${v.term}"${hint}`);
      console.error(`      ${v.text}`);
    }
    console.error("");
  }

  console.error(
    `scan-copy: ${allViolations.length} violation(s) in ${byFile.size} file(s)`,
  );
  process.exit(1);
}

main();
