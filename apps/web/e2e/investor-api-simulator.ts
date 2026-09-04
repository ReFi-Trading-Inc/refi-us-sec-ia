/**
 * Daniel's deterministic v1.1.0-alpha.2 loopback simulator for E2E.
 *
 * The BFF's Investor API upstream in E2E is `tools/conformance.py serve` from
 * the vendored package (byte-identical, hash-verified by #70). Started once by
 * global-setup, stopped by its teardown. Playwright's webServer points the
 * production build at `SIMULATOR_ORIGIN` through `REFI_INVESTOR_API_BASE_URL`
 * and `REFI_IDENTITY_CCID_BASE_URL` with the simulator's fixture credentials.
 *
 * Requires Python ≥ 3.11 (CI pins it via actions/setup-python). Locally set
 * REFI_PYTHON_BIN if `python3.11` is not on PATH. This is simulator evidence,
 * not connected refinity-dev evidence.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const SIMULATOR_PORT = 8765;
export const SIMULATOR_ORIGIN = `http://127.0.0.1:${String(SIMULATOR_PORT)}`;

// CJS: Playwright transpiles this file where import.meta is illegal.
const PACKAGE_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "api-clients",
  "contracts",
  "investor-api",
  "v1.1.0-alpha.2",
);
const TOOL = resolve(PACKAGE_DIR, "tools", "conformance.py");

export function findPython(): string {
  const candidates = [
    process.env["REFI_PYTHON_BIN"],
    "python3.13",
    "python3.12",
    "python3.11",
    "python3",
    "python",
  ].filter((c): c is string => Boolean(c));
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status !== 0) continue;
    const m = /Python (\d+)\.(\d+)/.exec(`${r.stdout}${r.stderr}`);
    if (!m) continue;
    if (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 11)) {
      return bin;
    }
  }
  throw new Error(
    "Python >= 3.11 is required to run Daniel's v1.1.0-alpha.2 simulator for " +
      "E2E. CI pins it with actions/setup-python; locally set REFI_PYTHON_BIN.",
  );
}

async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(`${SIMULATOR_ORIGIN}/.well-known/jwks.json`);
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Start the simulator unless one is already answering on the port (the
 * signal-stage config re-runs global-setup against the same machine).
 * Returns a stop function.
 */
export async function startInvestorApiSimulator(): Promise<() => void> {
  if (!existsSync(TOOL)) {
    throw new Error(`vendored simulator not found at ${TOOL}`);
  }
  if (await isUp()) return () => undefined;
  const python = findPython();
  const proc: ChildProcess = spawn(
    python,
    [
      TOOL,
      "serve",
      "--bundle-root",
      PACKAGE_DIR,
      "--host",
      "127.0.0.1",
      "--port",
      String(SIMULATOR_PORT),
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isUp()) {
      return () => {
        proc.kill("SIGTERM");
      };
    }
    if (proc.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  proc.kill("SIGTERM");
  throw new Error(
    `Daniel's simulator did not answer on ${SIMULATOR_ORIGIN}: ${stderr.slice(-500)}`,
  );
}
