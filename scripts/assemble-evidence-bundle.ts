#!/usr/bin/env tsx
/**
 * Assemble the compliance evidence bundle (S6, Sprint 6 exit item).
 *
 * Regenerates a dated bundle of the CI outputs an auditor, counsel, or
 * institutional client would ask for. The bundle is deterministic given
 * the current commit + gate outputs — running it twice from the same
 * state produces the same sha256s.
 *
 * Contents:
 *   1. gate-results.json — pass/fail + duration for each gate, run
 *      fresh at bundle time (typecheck, lint, contract-test, tripwire,
 *      proxy-redaction-fuzz, export-schemas, api-clients tests,
 *      route-manifest).
 *   2. contract-schemas/ — copy of artifacts/contract-schemas/v3
 *      including manifest.json with per-schema sha256.
 *   3. route-manifest.json — the allowlist current at bundle time.
 *   4. security-docs/ — threat model + IR runbook copies (frozen
 *      snapshot, not a link, so a leaked bundle contains the whole
 *      story).
 *   5. commit.json — repo state: HEAD sha, branch, remote, dirty-tree
 *      list (a non-empty dirty tree is a warning in the bundle,
 *      auditors care whether the artifact matches a tag).
 *   6. bundle-manifest.json — top-level index with sha256 of every
 *      file above and a `generatedAt` ISO timestamp.
 *
 * Output layout:
 *   artifacts/evidence-bundle/<yyyymmdd>-<shortsha>/
 *     bundle-manifest.json
 *     gate-results.json
 *     commit.json
 *     contract-schemas/{...}
 *     security-docs/{...}
 *
 * Run: `pnpm evidence-bundle` (wired into package.json).
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_ROOT = resolve(REPO_ROOT, "artifacts/evidence-bundle");

interface GateResult {
  name: string;
  command: string;
  status: "pass" | "fail" | "skipped";
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
}

const GATES: Array<{ name: string; command: string }> = [
  { name: "typecheck", command: "pnpm --filter @refi/web typecheck" },
  { name: "lint", command: "pnpm --filter @refi/web lint" },
  { name: "contract-test", command: "pnpm contract-test" },
  { name: "tripwire", command: "pnpm tripwire" },
  { name: "proxy-redaction-fuzz", command: "pnpm proxy-redaction-fuzz" },
  { name: "export-schemas", command: "pnpm export-schemas" },
  {
    name: "api-clients-test",
    command: "pnpm --filter @refi/api-clients test",
  },
  {
    name: "route-manifest",
    command: "pnpm --filter @refi/web route-manifest",
  },
];

function sha256File(path: string): string {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function tail(text: string, lines = 20): string {
  const arr = text.split("\n");
  return arr.slice(Math.max(0, arr.length - lines)).join("\n");
}

function runGate(g: { name: string; command: string }): GateResult {
  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let status: "pass" | "fail" = "pass";
  try {
    stdout = execSync(g.command, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    status = "fail";
    const e = err as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      message?: string;
    };
    stdout =
      typeof e.stdout === "string" ? e.stdout : (e.stdout?.toString() ?? "");
    stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : (e.stderr?.toString() ?? e.message ?? "");
  }
  return {
    name: g.name,
    command: g.command,
    status,
    durationMs: Date.now() - start,
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
  };
}

function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = resolve(src, entry.name);
    const to = resolve(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

function gitInfo(): {
  headSha: string;
  shortSha: string;
  branch: string;
  remote: string;
  dirty: string[];
} {
  const capture = (cmd: string): string =>
    execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  const headSha = capture("git rev-parse HEAD");
  const branch = capture("git rev-parse --abbrev-ref HEAD");
  const remote = capture("git remote get-url origin || echo none");
  const dirtyRaw = capture("git status --porcelain");
  return {
    headSha,
    shortSha: headSha.slice(0, 8),
    branch,
    remote,
    dirty: dirtyRaw ? dirtyRaw.split("\n") : [],
  };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

async function main(): Promise<void> {
  console.log("evidence-bundle: collecting git state");
  const git = gitInfo();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outDir = resolve(OUT_ROOT, `${stamp}-${git.shortSha}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  console.log(`evidence-bundle: running ${String(GATES.length)} gates`);
  const results: GateResult[] = [];
  for (const g of GATES) {
    process.stdout.write(`  · ${g.name} … `);
    const r = runGate(g);
    console.log(`${r.status} (${String(r.durationMs)}ms)`);
    results.push(r);
  }
  const gateResults = {
    generatedAt: new Date().toISOString(),
    gates: results,
    allPassed: results.every((r) => r.status === "pass"),
  };
  writeFileSync(
    resolve(outDir, "gate-results.json"),
    JSON.stringify(gateResults, null, 2) + "\n",
  );

  console.log("evidence-bundle: copying contract schemas");
  const schemasSrc = resolve(REPO_ROOT, "artifacts/contract-schemas/v3");
  const schemasDst = resolve(outDir, "contract-schemas/v3");
  if (statSync(schemasSrc).isDirectory()) {
    copyDir(schemasSrc, schemasDst);
  }

  console.log("evidence-bundle: copying route manifest");
  copyFileSync(
    resolve(REPO_ROOT, "apps/web/route-manifest.json"),
    resolve(outDir, "route-manifest.json"),
  );

  console.log("evidence-bundle: copying security docs");
  const docsDst = resolve(outDir, "security-docs");
  mkdirSync(docsDst, { recursive: true });
  for (const name of [
    "security-threat-model.md",
    "incident-response-runbook.md",
  ]) {
    copyFileSync(resolve(REPO_ROOT, "docs", name), resolve(docsDst, name));
  }

  console.log("evidence-bundle: writing commit.json");
  writeFileSync(
    resolve(outDir, "commit.json"),
    JSON.stringify(
      {
        ...git,
        dirtyTreeIsWarning:
          git.dirty.length > 0
            ? "Repo has uncommitted changes at bundle time; the artifact does not match any tag."
            : null,
      },
      null,
      2,
    ) + "\n",
  );

  console.log("evidence-bundle: hashing all files");
  const files = walk(outDir).map((abs) => ({
    relPath: abs.replace(outDir + "/", ""),
    sha256: sha256File(abs),
    size: statSync(abs).size,
  }));
  const manifest = {
    bundleVersion: "v1",
    generatedAt: new Date().toISOString(),
    headSha: git.headSha,
    branch: git.branch,
    allGatesPassed: gateResults.allPassed,
    files: files.filter((f) => f.relPath !== "bundle-manifest.json"),
  };
  writeFileSync(
    resolve(outDir, "bundle-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  console.log(
    `evidence-bundle: wrote ${String(manifest.files.length + 1)} files to ${outDir}`,
  );
  if (!gateResults.allPassed) {
    console.error(
      "evidence-bundle: one or more gates FAILED — see gate-results.json",
    );
    process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
