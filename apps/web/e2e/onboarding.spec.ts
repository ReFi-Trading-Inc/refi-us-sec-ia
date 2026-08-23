import { test, expect, type Page } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";

const SIGNAL_COOKIE = E2E_USERS.signal.eligibilityCookie;

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
    await page.context().addCookies(await e2eAuthCookies(SIGNAL_COOKIE));
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
    // Zod rejects with the apiKeyIdFormat message and the Input surfaces it
    // inline. The copy no longer mentions AK — live keys are not an accepted
    // format to describe, only one to refuse by name elsewhere.
    await expect(page.getByText(/start with PK/i)).toBeVisible();
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

  test("a live Alpaca key is refused and never submitted", async ({ page }) => {
    // Signal must never hold a credential capable of placing, cancelling, or
    // modifying an order. A raw live key carries whatever authority Alpaca
    // granted it, regardless of what this frontend does with it, so the
    // September artifact refuses live credentials outright rather than
    // defaulting to paper and leaving the path reachable.
    //
    // Asserted at the network layer, not just the UI: a validation message
    // that still let the request through would be worthless.
    let submitted = 0;
    await page.route("**/v1/brokers/connect/keys", (route) => {
      submitted += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/us/onboarding/broker");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page
      .getByRole("button", { name: /connect/i })
      .first()
      .click();
    // AK-prefixed key: a live Alpaca credential.
    await page.getByLabel(/api key id/i).fill("AKABCDEFGHIJ12345678");
    await page
      .getByLabel(/api secret key|secret key/i)
      .fill("abcdefghij1234567890abcdefghij1234567890");
    await page.getByRole("button", { name: /connect alpaca/i }).click();

    await expect(page.getByText(/live Alpaca key/i)).toBeVisible();
    expect(submitted, "live credentials reached the network").toBe(0);
    await expect(
      page.getByText("Alpaca connected", { exact: true }),
    ).toHaveCount(0);
  });

  test("the broker surface teaches paper-only and never live trading", async ({
    page,
  }) => {
    // The form refusing a live key is not enough on its own: copy that still
    // explains how to enable trading permissions, or links the live dashboard,
    // teaches the investor to do the exact thing the boundary forbids — and
    // this is the surface that used to say ReFi would "submit eligible orders
    // on your behalf once you activate managed execution".
    await page.goto("/us/onboarding/broker");
    await page
      .getByRole("button", { name: /connect/i })
      .first()
      .click();
    await expect(page.getByText(/paper trading only/i)).toBeVisible();

    await expect(page.getByRole("radio", { name: /live/i })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /live dashboard/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/trading enabled/i)).toHaveCount(0);
    await expect(page.getByText(/submit .*orders on your behalf/i)).toHaveCount(
      0,
    );
    await expect(page.getByText(/managed execution/i)).toHaveCount(0);
    // NOT asserted: the absence of the words "live trading". The paper-only
    // notice has to say it does not accept live trading credentials — refusal
    // language is the opposite of instruction, and banning the phrase outright
    // would delete the sentence doing the work.
  });
});

test.describe("Advisory profile", () => {
  // Replaces the prior "Risk assessment" describe, which targeted a
  // non-existent `/us/onboarding/risk` route. Risk tolerance is one field
  // inside the advisory profile (the surface mounted at
  // `/us/onboarding/profile`).
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(await e2eAuthCookies(SIGNAL_COOKIE));
  });

  test("renders advisory profile with risk tolerance field", async ({
    page,
  }) => {
    await page.goto("/us/onboarding/profile");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/risk tolerance/i)).toBeVisible();
  });
});
