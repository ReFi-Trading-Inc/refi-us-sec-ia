import { test, expect, type Page } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

// Seeded cookie value drives the BFF dev-fallback to a real authId with a
// matching auth-session-link, so /api/v1/investor/recommendations resolves
// to the seeded RecommendationProjection rows (see global-setup.ts).
function cookiesFor(cookieValue: string) {
  return [
    {
      name: "us_eligibility_v1",
      value: cookieValue,
      domain: "localhost",
      path: "/",
    },
    {
      name: "us_session_v1",
      value: cookieValue,
      domain: "localhost",
      path: "/",
    },
  ];
}

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
      .addCookies(cookiesFor(E2E_USERS.signal.eligibilityCookie));
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
    await expect(page.getByTestId("recommendation-detail-mode")).toBeVisible();

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

test.describe("Recommendations — Managed user", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(cookiesFor(E2E_USERS.managed.eligibilityCookie));
  });

  test("list renders managed banner and review-required CTA when blocked", async ({
    page,
  }) => {
    await page.goto("/us/app/recommendations");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("managed-banner")).toBeVisible();
    // The managed seed includes one `blocked` projection (rec-managed-msft);
    // its card surfaces the `managed-exception-cta` link to Exception Review.
    await expect(
      page.getByTestId("managed-exception-cta").first(),
    ).toBeVisible();
  });

  test("Managed detail page exposes no per-trade affordance — only review / exception link", async ({
    page,
  }) => {
    // The managed seed names the first projection `rec-managed-aapl`.
    await mockRecommendationDetail(page, {
      id: "rec-managed-aapl",
      symbol: "AAPL",
      action: "buy",
    });
    await mockRecommendationDetail(page, {
      id: "rec-managed-msft",
      symbol: "MSFT",
      action: "sell",
    });
    await page.goto("/us/app/recommendations");
    await expect(page.getByTestId("recommendations-list")).toBeVisible();
    const managedReviewLink = page
      .getByTestId("managed-review-action")
      .first()
      .locator("xpath=ancestor::a");
    await managedReviewLink.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // SEC 203A-2(e) §A: Managed mode is auto-executed under an active
    // ExecutionPolicy; per-trade investor Accept is forbidden in both modes
    // but especially load-bearing for Managed. Assert absence.
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
