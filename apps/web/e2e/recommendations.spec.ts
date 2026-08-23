import { test, expect, type Page } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";

// The recommendation detail hook (`useRecommendation`) targets
// `/v1/recommendations/{id}`, which is upstream-owned and not provided by
// the BFF prototype-store today. Mock it for E2E so the SEC-boundary
// assertions can run against a populated detail page rather than the
// "Loading…" placeholder.
async function mockRecommendationDetail(
  page: Page,
  args: { id: string; symbol: string; action: "buy" | "sell" | "neutral" },
) {
  await page.route(`**/v1/recommendations/${args.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recommendation_id: args.id,
        symbol: args.symbol,
        action: args.action,
        confidence: 0.75,
        rationale: "E2E test fixture.",
        generated_at: new Date().toISOString(),
      }),
    }),
  );
}

test.describe("Recommendations — Signal user", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
  });

  test("list renders seeded recommendations", async ({ page }) => {
    await page.goto("/us/app/recommendations");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("recommendations-list")).toBeVisible();
    await expect(page.getByTestId("recommendation-card").first()).toBeVisible();
  });

  test("detail page renders without any per-trade Accept / Approve affordance", async ({
    page,
  }) => {
    // The signal seed names the projection `rec-signal-aapl` (see
    // global-setup.ts seedUser).
    await mockRecommendationDetail(page, {
      id: "rec-signal-aapl",
      symbol: "AAPL",
      action: "buy",
    });
    await page.goto("/us/app/recommendations");
    await expect(page.getByTestId("recommendations-list")).toBeVisible();
    const reviewLink = page
      .getByTestId("signal-review-action")
      .first()
      .locator("xpath=ancestor::a");
    await reviewLink.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // SEC 203A-2(e) §A: NO per-trade Accept / Approve / Submit affordance
    // may render on the recommendation detail page. The tripwire enforces
    // this at source level; the E2E enforces it at render level. If any of
    // these names appear, a regression has bypassed the tripwire and the
    // SEC boundary.
    for (const forbidden of [
      /accept (recommendation|trade)/i,
      /approve (for execution|trade|rebalance)/i,
      /approve.*execution/i,
      /accept and execute/i,
      /submit trade/i,
      /staff approval/i,
      /founder review/i,
    ]) {
      await expect(page.getByRole("button", { name: forbidden })).toHaveCount(
        0,
      );
    }
  });
});

test.describe("Recommendations — Managed-tier user sees the Signal product", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.managed.eligibilityCookie));
  });

  test("no Managed banner, upgrade CTA, badge, or Managed action branch renders — even with a historical managed mode in the store", async ({
    page,
  }) => {
    // C2a correction: the September artifact is Signal-only as a PRODUCT.
    // This user's prototype store carries mode: "managed" from historical
    // seeding, and the UI must present Signal behaviour regardless — stored
    // mode no longer drives presentation.
    await page.goto("/us/app/recommendations");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("recommendations-list")).toBeVisible();
    for (const id of [
      "managed-banner",
      "signal-upgrade-cta",
      "recommendations-mode-badge",
      "managed-status-row",
      "managed-review-action",
      "managed-exception-cta",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByText("Activate ReFi Managed")).toHaveCount(0);
    await expect(page.getByText("ReFi Managed is active")).toHaveCount(0);
  });

  test("detail page renders Signal UI with no per-trade or Managed execution affordance", async ({
    page,
  }) => {
    await mockRecommendationDetail(page, {
      id: "rec-managed-aapl",
      symbol: "AAPL",
      action: "buy",
    });
    await page.goto("/us/app/recommendations/rec-managed-aapl");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("recommendation-detail-mode")).toHaveCount(0);
    await expect(page.getByText(/managed execution active/i)).toHaveCount(0);
    for (const forbidden of [
      /accept (recommendation|trade)/i,
      /approve (for execution|trade|rebalance)/i,
      /approve.*execution/i,
      /accept and execute/i,
      /submit trade/i,
      /staff approval/i,
      /founder review/i,
    ]) {
      await expect(page.getByRole("button", { name: forbidden })).toHaveCount(
        0,
      );
    }
  });
});
