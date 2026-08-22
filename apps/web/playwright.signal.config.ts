import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { E2E_SESSION_JWT_SECRET } from "./e2e/session";

/**
 * Signal-stage smoke lane.
 *
 * The main config runs the legacy suite at REFI_RELEASE_STAGE=managed_paper,
 * because that suite still contains Managed-era specs. This lane boots the SAME
 * production build at REFI_RELEASE_STAGE=signal — the actual September stage —
 * and asserts only the stage-independent launch invariants.
 *
 * It reuses the build rather than making one: REFI_RELEASE_STAGE is server-only
 * and never inlined into the bundle, so one `next build` serves both stages.
 * Run `pnpm e2e` first (which builds), then `pnpm e2e:signal`.
 *
 * SCOPE, stated plainly: this is a boot-and-posture smoke lane, NOT the
 * structural no-execution proof. It cannot be that yet — the release gate is
 * asserted on main (contract-assertions.ts:666) but never invoked by bffMutate,
 * so "a Managed mutation is refused at signal stage" is not a true statement
 * about main and cannot honestly be asserted here. Workstream C lands the
 * enforcement and owns that proof.
 */
const PROTOTYPE_STORE_DIR = resolve(__dirname, ".refi-prototype-store-e2e");
process.env["REFI_PROTOTYPE_STORE_DIR"] = PROTOTYPE_STORE_DIR;

// Same port as the main lane, deliberately. NEXT_PUBLIC_* values are inlined at
// BUILD time, so a build made for :3000 keeps calling :3000 no matter what the
// runtime env says — on any other port the client's own fetches become
// cross-origin and are refused by `connect-src 'self'`. The lanes run
// sequentially, so the port is free.
const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /signal-smoke\.spec\.ts/,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 1,
  workers: 1,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `start` only — the build is expected to exist from the main lane.
    command: "pnpm --filter @refi/web start",
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      NEXT_PUBLIC_REFI_ENV: "prod",
      NEXT_PUBLIC_API_BASE_URL: `http://localhost:${String(PORT)}`,
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "test",
      NEXT_PUBLIC_POSTHOG_KEY: "test",
      NEXT_PUBLIC_SENTRY_DSN: "https://test@o0.ingest.sentry.io/0",
      SESSION_SECRET: "playwright-test-session-secret-minimum-32-chars",
      IP_HASH_SECRET: "playwright-test-ip-hash-secret-minimum-32-chars",
      ELIGIBILITY_JWT_SECRET: "playwright-test-jwt-secret-minimum-32-chars!",
      SESSION_JWT_SECRET: E2E_SESSION_JWT_SECRET,
      REFI_DATA_ADAPTER: "mock",
      REFI_ENV: "prod",
      NEXT_PUBLIC_REFI_DATA_ADAPTER: "live",
      REFI_PROTOTYPE_STORE_DIR: PROTOTYPE_STORE_DIR,
      // The September stage. This is the whole point of the lane.
      REFI_RELEASE_STAGE: "signal",
      ALPHA_HANDOFF_PUBLIC_KEY_JWK: JSON.stringify({
        kty: "EC",
        crv: "P-256",
        x: "e2e-x",
        y: "e2e-y",
      }),
      ALPHA_HANDOFF_ISSUER: "refi-alpha",
      ALPHA_HANDOFF_AUDIENCE: "refi-us-sec-ia",
    },
  },
});
