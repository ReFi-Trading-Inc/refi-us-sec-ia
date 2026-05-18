import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
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
    reuseExistingServer: !process.env.CI,
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
    },
  },
});
