import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

// Eligibility-only: the SIWE connect page is reached after the eligibility
// gate but before a real session exists. Using the seeded `signal` user value
// makes the BFF dev-fallback derive a consistent authId, so the AuthProvider
// resolves the unauthenticated state cleanly instead of looping.
const ELIGIBILITY_COOKIE_ONLY = [
  {
    name: "us_eligibility_v1",
    value: E2E_USERS.signal.eligibilityCookie,
    domain: "localhost",
    path: "/",
  },
];

test.describe("SIWE auth", () => {
  test("connect page renders wallet button", async ({ page }) => {
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    await page.goto("/us/auth/connect");
    // Wait for H1 before further assertions — Next.js dev compiles routes
    // on-demand and the first parallel navigation can hit a transient 404.
    await expect(
      page.getByRole("heading", { level: 1, name: /verify your identity/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect wallet/i }),
    ).toBeVisible();
  });

  test("shows SIWE copy on the connect page", async ({ page }) => {
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    await page.goto("/us/auth/connect");
    await expect(
      page.getByRole("heading", { level: 1, name: /verify your identity/i }),
    ).toBeVisible();
    // Anchor to the unique body sentence on the connect card. The earlier
    // regex `/ethereum wallet|sign in|wallet/i` resolved to both the
    // "Connect your wallet to continue" heading and this paragraph and
    // tripped strict-mode.
    await expect(
      page.getByText(/uses your Ethereum wallet as your login/i),
    ).toBeVisible();
  });
});
