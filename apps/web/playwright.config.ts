import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { E2E_SESSION_JWT_SECRET } from "./e2e/session";

// This package is CJS since #34 dropped type:module, so Playwright transpiles
// this config to CJS where import.meta is illegal — use CJS __dirname instead.

// Pinned prototype-store path so the e2e seeder (global-setup) and the dev
// webServer subprocess agree on a single store location, distinct from local
// dev's default.
const PROTOTYPE_STORE_DIR = resolve(__dirname, ".refi-prototype-store-e2e");
process.env["REFI_PROTOTYPE_STORE_DIR"] = PROTOTYPE_STORE_DIR;

export default defineConfig({
  testDir: "./e2e",
  // The signal-stage lane (playwright.signal.config.ts) owns signal-smoke:
  // since C1a-1 its assertions are STAGE-SPECIFIC — they prove capability
  // refusals that must fire at REFI_RELEASE_STAGE=signal and correctly do NOT
  // fire at managed_paper, which is what this lane runs. While the smoke lane
  // was stage-independent this separation was implicit; now it is enforced.
  testIgnore: /(signal-(smoke|authority)|demo-tier)\.spec\.ts/,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 1,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"] ? "github" : "html",
  use: {
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // PRODUCTION ARTIFACT, not `next dev`.
    //
    // The suite's authority comes from testing what actually ships. Dev mode
    // compiles routes on demand and skips static prerendering, so an entire
    // class of defect is invisible to it — #40 shipped production with every
    // script blocked by CSP (no hydration; the eligibility form silently fell
    // back to a native GET submit) while a green dev-mode suite reported
    // nothing. `next build` + `next start` is the only configuration in which
    // that failure is reachable by a test.
    //
    // Set PLAYWRIGHT_SKIP_BUILD=1 to re-run against an existing build while
    // iterating locally; CI never sets it.
    command: process.env["PLAYWRIGHT_SKIP_BUILD"]
      ? "pnpm --filter @refi/web start"
      : "pnpm --filter @refi/web build && pnpm --filter @refi/web start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    // Generous: the command now includes a full production build.
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_REFI_ENV: "prod",
      // C1b-2: the BFF's Investor API upstream is Daniel's loopback simulator
      // (started by e2e/global-setup.ts) with its fixture credentials. This is
      // simulator evidence, never a connected refinity-dev journey.
      REFI_INVESTOR_API_BASE_URL: "http://127.0.0.1:8765",
      REFI_IDENTITY_CCID_BASE_URL: "http://127.0.0.1:8765",
      REFI_INVESTOR_API_CREDENTIAL_MODE: "simulator-fixture",
      REFI_INVESTOR_API_ASSERTION_MODE: "simulator-fixture",
      // Frontend-owned identity verification: the deterministic MOCK adapter
      // with its server-side test control (never on a production tier).
      REFI_KYC_PROVIDER: "mock",
      REFI_KYC_MOCK_CONTROLS: "1",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:3000",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "test",
      NEXT_PUBLIC_POSTHOG_KEY: "test",
      NEXT_PUBLIC_SENTRY_DSN: "https://test@o0.ingest.sentry.io/0",
      SESSION_SECRET: "playwright-test-session-secret-minimum-32-chars",
      IP_HASH_SECRET: "playwright-test-ip-hash-secret-minimum-32-chars",
      ELIGIBILITY_JWT_SECRET: "playwright-test-jwt-secret-minimum-32-chars!",
      // Session-cookie signing secret, shared explicitly with the token helper
      // in ./e2e/session.ts so the server verifies exactly what the fixtures
      // sign. Set here rather than relying on the application's non-prod
      // PROTOTYPE_DEFAULTS fallback: that coupling is implicit and would break
      // silently if the default ever changed.
      SESSION_JWT_SECRET: E2E_SESSION_JWT_SECRET,
      REFI_DATA_ADAPTER: "mock",
      REFI_ENV: "prod",
      // Disable browser MSW in e2e. Surface 1 only needs the BFF route, and
      // service-worker registration in headless Chromium is the slowest part
      // of dev-mode boot, which makes the mswReady gate flake.
      NEXT_PUBLIC_REFI_DATA_ADAPTER: "live",
      REFI_PROTOTYPE_STORE_DIR: PROTOTYPE_STORE_DIR,
      // The default release stage is "signal", which refuses pause/resume with
      // 403 (Daniel 2026-08-17 §6). Several specs cover Managed pause/resume
      // behaviour, so the e2e server runs at the Managed-paper stage. The
      // refusal itself is covered by contract assertions rather than here —
      // if this line is ever removed, those Managed specs fail loudly rather
      // than silently testing a surface that is switched off.
      REFI_RELEASE_STAGE: "managed_paper",
      // Single-process local server: the per-process assertion signing key is
      // safe here and must be opted into explicitly.
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
