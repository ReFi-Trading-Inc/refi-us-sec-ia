import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { E2E_SESSION_JWT_SECRET } from "./e2e/session";

/**
 * Demo-tier lane.
 *
 * Boots the SAME production build at REFI_ENV=demo — the isolated
 * founder/investor walkthrough tier — and proves the demo persona sign-in
 * exists there and nowhere else (the main lane, at REFI_ENV=prod, proves the
 * 404s). Like the signal lane it reuses the build: REFI_ENV is server-only and
 * never inlined, so one `next build` serves every tier. Run `pnpm e2e` first.
 */
const PROTOTYPE_STORE_DIR = resolve(__dirname, ".refi-prototype-store-e2e");
process.env["REFI_PROTOTYPE_STORE_DIR"] = PROTOTYPE_STORE_DIR;
const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /demo-tier\.spec\.ts/,
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
    command: "pnpm --filter @refi/web start",
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      NEXT_PUBLIC_REFI_ENV: "prod",
      REFI_ENV: "demo",
      REFI_RELEASE_STAGE: "signal",
      // Explicit, like the signal lane: the build constant is prod, so no
      // PROTOTYPE_DEFAULTS apply and a local .env.local must not mask a gap.
      ELIGIBILITY_JWT_SECRET: "playwright-test-jwt-secret-minimum-32-chars!",
      IP_HASH_SECRET: "playwright-test-ip-hash-secret-minimum-32-chars",
      NEXT_PUBLIC_API_BASE_URL: `http://localhost:${String(PORT)}`,
      NEXT_PUBLIC_POSTHOG_KEY: "test",
      NEXT_PUBLIC_SENTRY_DSN: "https://test@o0.ingest.sentry.io/0",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "test",
      SESSION_SECRET: "playwright-test-session-secret-minimum-32-chars",
      SESSION_JWT_SECRET: E2E_SESSION_JWT_SECRET,
      REFI_DATA_ADAPTER: "mock",
      NEXT_PUBLIC_REFI_DATA_ADAPTER: "live",
      REFI_PROTOTYPE_STORE_DIR: PROTOTYPE_STORE_DIR,
      // Investor API upstream: Daniel's loopback simulator started by
      // global-setup, with fixture credentials. Simulator evidence only.
      REFI_INVESTOR_API_BASE_URL: "http://127.0.0.1:8765",
      REFI_IDENTITY_CCID_BASE_URL: "http://127.0.0.1:8765",
      REFI_INVESTOR_API_CREDENTIAL_MODE: "simulator-fixture",
      REFI_INVESTOR_API_ASSERTION_MODE: "simulator-fixture",
      REFI_KYC_PROVIDER: "mock",
      REFI_KYC_MOCK_CONTROLS: "1",
      // The alpha-claim route is live on the demo tier; the key is a
      // placeholder so every real token fails verification (invalid → 401).
      FLAG_ALPHA_CLAIM_ROUTE: "on",
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
