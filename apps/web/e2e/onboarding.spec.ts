import { test, expect, type Page } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

const SIGNAL_COOKIE = E2E_USERS.signal.eligibilityCookie;

const authCookies = [
  {
    name: "us_eligibility_v1",
    value: SIGNAL_COOKIE,
    domain: "localhost",
    path: "/",
  },
  {
    name: "us_session_v1",
    value: SIGNAL_COOKIE,
    domain: "localhost",
    path: "/",
  },
];

// The investor BFF does not currently expose `/v1/brokers/*` routes; the
// broker registry + connection + key-submission paths are upstream-owned
// (per docs/phase2-5-gap-register-v2-against-gitlab.md GAP-EX-003). For E2E,
// mock the wire shapes the page already consumes via `useBrokerSupported`,
// `useBrokerConnection`, and `useBrokerConnectApiKey`.
async function mockBrokerRoutes(page: Page) {
  await page.route("**/v1/brokers/supported", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "alpaca",
          name: "Alpaca",
          supported: true,
          regions: ["US"],
        },
      ]),
    }),
  );
  await page.route("**/v1/brokers/connection", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(null),
    }),
  );
  await page.route("**/v1/brokers/connect/keys", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        broker_id: "alpaca",
        connection_id: "conn-e2e",
        status: "connected",
      }),
    }),
  );
}

test.describe("Broker onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(authCookies);
    await mockBrokerRoutes(page);
  });

  test("renders Alpaca broker card", async ({ page }) => {
    await page.goto("/us/onboarding/broker");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Alpaca", { exact: true })).toBeVisible();
  });

  test("connect button reveals API key form", async ({ page }) => {
    await page.goto("/us/onboarding/broker");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page
      .getByRole("button", { name: /connect/i })
      .first()
      .click();
    await expect(page.getByLabel(/api key id/i)).toBeVisible();
    await expect(page.getByLabel(/api secret key|secret key/i)).toBeVisible();
  });

  test("invalid key format shows validation error", async ({ page }) => {
    await page.goto("/us/onboarding/broker");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page
      .getByRole("button", { name: /connect/i })
      .first()
      .click();
    await page.getByLabel(/api key id/i).fill("INVALID_KEY");
    await page.getByRole("button", { name: /connect alpaca/i }).click();
    // Zod schema rejects with the apiKeyIdFormat error message; the Input
    // surfaces it inline. Match the canonical "PK" / "AK" prefix copy.
    await expect(page.getByText(/PK.*AK|starts with/i)).toBeVisible();
  });

  test("valid paper key submits successfully", async ({ page }) => {
    await page.goto("/us/onboarding/broker");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page
      .getByRole("button", { name: /connect/i })
      .first()
      .click();
    await page
      .getByLabel(/api key id/i)
      .fill("PKABCDEFGHIJ1234567890".slice(0, 20));
    await page
      .getByLabel(/api secret key|secret key/i)
      .fill("abcdefghij1234567890abcdefghij1234567890");
    await page.getByRole("button", { name: /connect alpaca/i }).click();
    // Success state renders a StatusBanner whose `title` prop is "Alpaca
    // connected". StatusBanner does not promote `title` to a heading, so
    // anchor on the exact title text.
    await expect(
      page.getByText("Alpaca connected", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Advisory profile", () => {
  // Replaces the prior "Risk assessment" describe, which targeted a
  // non-existent `/us/onboarding/risk` route. Risk tolerance is one field
  // inside the advisory profile (the surface mounted at
  // `/us/onboarding/profile`).
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(authCookies);
  });

  test("renders advisory profile with risk tolerance field", async ({
    page,
  }) => {
    await page.goto("/us/onboarding/profile");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/risk tolerance/i)).toBeVisible();
  });
});
