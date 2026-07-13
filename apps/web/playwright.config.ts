import { defineConfig, devices } from "@playwright/test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Pinned prototype-store path so the e2e seeder (global-setup) and the dev
// webServer subprocess agree on a single store location, distinct from local
// dev's default.
const PROTOTYPE_STORE_DIR = resolve(__dirname, ".refi-prototype-store-e2e");
process.env["REFI_PROTOTYPE_STORE_DIR"] = PROTOTYPE_STORE_DIR;

export default defineConfig({
  testDir: "./e2e",
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
    command: "pnpm --filter @refi/web dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_REFI_ENV: "dev",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:3000",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "test",
      NEXT_PUBLIC_POSTHOG_KEY: "test",
      NEXT_PUBLIC_SENTRY_DSN: "https://test@o0.ingest.sentry.io/0",
      SESSION_SECRET: "playwright-test-session-secret-minimum-32-chars",
      IP_HASH_SECRET: "playwright-test-ip-hash-secret-minimum-32-chars",
      ELIGIBILITY_JWT_SECRET: "playwright-test-jwt-secret-minimum-32-chars!",
      REFI_DATA_ADAPTER: "mock",
      REFI_ENV: "dev",
      // S2 CSRF: the e2e host is localhost:3000, and Playwright's browser
      // fires mutations with that Origin. 127.0.0.1 is included so direct
      // APIRequestContext tests may target either loopback form.
      REFI_TRUSTED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
      // S1 iss/aud pinning. These are documented, non-secret constants;
      // the future mint site (auth-siwe / D8 magic-link) must produce
      // tokens declaring exactly these values.
      SESSION_JWT_ISSUER: "refi-us-sec-ia",
      SESSION_JWT_AUDIENCE: "refi-us-sec-ia-bff",
      // Disable browser MSW in e2e. Surface 1 only needs the BFF route, and
      // service-worker registration in headless Chromium is the slowest part
      // of dev-mode boot, which makes the mswReady gate flake.
      NEXT_PUBLIC_REFI_DATA_ADAPTER: "live",
      REFI_PROTOTYPE_STORE_DIR: PROTOTYPE_STORE_DIR,
      // Sprint 3 PR-F: flip the Account Controls Center flags on for E2E
      // so the account-prefs happy-path + concurrency + material-change
      // gate specs can exercise the route. Prod default remains "off".
      FLAG_ACCOUNT_CONTROLS_CENTER: "on",
      FLAG_ACCOUNT_PREFS_PATCH: "on",
    },
  },
});
