#!/usr/bin/env tsx
/**
 * OpenAPI → generated-types drift guard (Sprint A discipline rule).
 *
 * Regenerates `packages/api-clients/src/generated/api.gen.ts` to a temp
 * file and compares against the checked-in file. Exit 1 on any diff.
 *
 * Source of truth: `packages/api-clients/openapi/refi-api.yaml`.
 * Generated file: `packages/api-clients/src/generated/api.gen.ts` —
 * never hand-edited.
 *
 * Per `refi-build-docs/spec-current/12-daniel-2026-05-20-guidance.md §2`:
 *   "Generated files are never manually edited. All API type changes start
 *    in refi-api.yaml. Then run pnpm -F @refi/api-clients generate."
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, "..");
const PKG = join(REPO_ROOT, "packages/api-clients");
const YAML = join(PKG, "openapi/refi-api.yaml");
const CHECKED_IN = join(PKG, "src/generated/api.gen.ts");
const CANDIDATE = "/tmp/refi-api-drift-candidate.ts";

if (!existsSync(YAML)) {
  console.error(`drift: refi-api.yaml not found at ${YAML}`);
  process.exit(1);
}
if (!existsSync(CHECKED_IN)) {
  console.error(
    `drift: checked-in api.gen.ts missing — run pnpm -F @refi/api-clients generate`,
  );
  process.exit(1);
}

const bin = join(PKG, "node_modules/.bin/openapi-typescript");
const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
try {
  execSync(`${q(bin)} ${q(YAML)} -o ${q(CANDIDATE)}`, { stdio: "pipe" });
} catch (err) {
  console.error("drift: openapi-typescript failed");
  console.error((err as Error).message);
  process.exit(1);
}

const checkedIn = readFileSync(CHECKED_IN, "utf-8");
const candidate = readFileSync(CANDIDATE, "utf-8");
unlinkSync(CANDIDATE);

if (checkedIn === candidate) {
  console.log("drift: ✓ api.gen.ts matches refi-api.yaml");
  process.exit(0);
}

console.error("");
console.error("drift: ✗ api.gen.ts is OUT OF SYNC with refi-api.yaml");
console.error("");
console.error("  Run:  pnpm -F @refi/api-clients generate");
console.error("  Then commit the regenerated src/generated/api.gen.ts");
console.error("");
console.error(`  Checked in:  ${checkedIn.length} chars`);
console.error(`  Generated :  ${candidate.length} chars`);
console.error("");
process.exit(1);
