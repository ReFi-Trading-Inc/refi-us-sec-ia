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
      // Enable browser MSW for e2e. Phase 2.5 replacement coverage
      // (compliance-fail-closed-structural / compliance-verdict-visibility /
      // persona-switch-stable) exercises persona-aware MSW handlers for
      // recommendation detail, BrokerStatusBanner data, and disclosure-card
      // counts. Phase 2 BFF-routed specs continue to pass because Next.js
      // server routes are not intercepted by MSW (the worker runs only in
      // the browser).
      NEXT_PUBLIC_REFI_DATA_ADAPTER: "mock",
      REFI_PROTOTYPE_STORE_DIR: PROTOTYPE_STORE_DIR,
    },
  },
});
