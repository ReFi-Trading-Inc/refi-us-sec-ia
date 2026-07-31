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

test.describe("Wallet linking", () => {
  test("connect page renders wallet button", async ({ page }) => {
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    await page.goto("/us/auth/connect");
    // Wait for H1 before further assertions — Next.js dev compiles routes
    // on-demand and the first parallel navigation can hit a transient 404.
    await expect(
      page.getByRole("heading", { level: 1, name: /link a wallet/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect wallet/i }),
    ).toBeVisible();
  });

  test("presents wallet linking as optional, not as the login", async ({
    page,
  }) => {
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    await page.goto("/us/auth/connect");
    await expect(
      page.getByRole("heading", { level: 1, name: /link a wallet/i }),
    ).toBeVisible();
    // Anchor to the unique body sentence on the connect card.
    await expect(page.getByText(/linking a wallet is optional/i)).toBeVisible();

    // Daniel 2026-07-28: onboarding is email-first and must not require a
    // wallet; a wallet address is a linked identifier, never the account id.
    // The page must not claim otherwise.
    await expect(
      page.getByText(/uses your Ethereum wallet as your login/i),
    ).toHaveCount(0);
    await expect(
      page.getByText(/your wallet address is your account/i),
    ).toHaveCount(0);
  });
});
