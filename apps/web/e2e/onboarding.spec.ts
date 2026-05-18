import { test, expect } from "@playwright/test";

const authCookies = [
  {
    name: "us_eligibility_v1",
    value: "mock-eligibility-token",
    domain: "localhost",
    path: "/us",
  },
  {
    name: "us_session_v1",
    value: "mock-session-token",
    domain: "localhost",
    path: "/us",
  },
];

test.describe("Broker onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(authCookies);
  });

  test("renders Alpaca broker card", async ({ page }) => {
    await page.goto("/us/onboarding/broker");
    await expect(page.getByText("Alpaca")).toBeVisible();
  });

  test("connect button reveals API key form", async ({ page }) => {
    await page.goto("/us/onboarding/broker");
    await page
      .getByRole("button", { name: /connect/i })
      .first()
      .click();
    await expect(page.getByLabel(/api key id/i)).toBeVisible();
    await expect(page.getByLabel(/secret key/i)).toBeVisible();
  });

  test("invalid key format shows validation error", async ({ page }) => {
    await page.goto("/us/onboarding/broker");
    await page
      .getByRole("button", { name: /connect/i })
      .first()
      .click();
    await page.getByLabel(/api key id/i).fill("INVALID_KEY");
    await page
      .getByRole("button", { name: /save|submit|connect alpaca/i })
      .click();
    await expect(page.getByText(/invalid|format|PK|AK/i)).toBeVisible();
  });

  test("valid paper key submits successfully", async ({ page }) => {
    await page.goto("/us/onboarding/broker");
    await page
      .getByRole("button", { name: /connect/i })
      .first()
      .click();
    await page
      .getByLabel(/api key id/i)
      .fill("PKABCDEFGHIJ1234567890".slice(0, 20));
    // Fill a valid 40-char secret
    await page
      .getByLabel(/secret key/i)
      .fill("abcdefghij1234567890abcdefghij1234567890");
    await page
      .getByRole("button", { name: /save|submit|connect alpaca/i })
      .click();
    // MSW mock returns success; page shows connected state
    await expect(page.getByText(/connected|success/i)).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("Risk assessment", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(authCookies);
  });

  test("renders risk questions", async ({ page }) => {
    await page.goto("/us/onboarding/risk");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // At least one question should be visible
    await expect(page.locator("fieldset, [role=group]").first()).toBeVisible();
  });
});
