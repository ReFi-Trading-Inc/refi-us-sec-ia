import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

// Dev-mode Next compilation per route on first hit can take 20–60s. The
// mode-aware strip and recommendation list both go through SSR so the
// elements are present at DOMContentLoaded; toHaveAttribute will retry until
// the client-side query resolves.
test.setTimeout(120_000);

// Stable test-id selectors only. Do not match on legal / compliance copy here.

async function seedCookies(
  context: BrowserContext,
  eligibilityValue: string,
): Promise<void> {
  // path "/" so server-side routes under /api/v1/* receive the cookies.
  // The proxy middleware gates /us/app/* on the session cookie's presence;
  // its value is opaque to the proxy and falls through to the BFF dev-fallback,
  // which keys off the eligibility cookie.
  await context.addCookies([
    {
      name: "us_eligibility_v1",
      value: eligibilityValue,
      domain: "localhost",
      path: "/",
    },
  ]);
}

test.describe("Signal mode happy path", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
  });

  test("home shows Signal mode and recommendations show Signal affordances", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const strip = page.getByTestId("mode-status-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute("data-mode", "signal", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("mode-status-strip-badge")).toHaveAttribute(
      "data-mode",
      "signal",
    );

    await page.goto("/us/app/recommendations", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("recommendations-page")).toHaveAttribute(
      "data-mode",
      "signal",
      { timeout: 30_000 },
    );
    await expect(
      page.getByTestId("recommendations-mode-badge"),
    ).toHaveAttribute("data-mode", "signal");

    // Signal-specific elements present.
    await expect(page.getByTestId("signal-upgrade-cta")).toBeVisible();
    const card = page.getByTestId("recommendation-card").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-mode", "signal");

    // All four Signal action affordances are present on the card.
    await expect(card.getByTestId("signal-review-action")).toBeVisible();
    await expect(card.getByTestId("signal-save-action")).toBeVisible();
    await expect(card.getByTestId("signal-dismiss-action")).toBeVisible();
    await expect(card.getByTestId("signal-act-manually-action")).toBeVisible();

    // No Managed banner, no per-trade Accept anywhere.
    await expect(page.getByTestId("managed-banner")).toHaveCount(0);
    await expect(page.getByTestId("managed-status-row")).toHaveCount(0);
    await expect(page.getByTestId("managed-exception-cta")).toHaveCount(0);
  });
});

test.describe("Managed mode boundary path", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.managed.eligibilityCookie);
  });

  test("home shows Managed mode; recommendations show no per-trade Accept and route review-required items to Exception Review", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const strip = page.getByTestId("mode-status-strip");
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute("data-mode", "managed", {
      timeout: 30_000,
    });

    await page.goto("/us/app/recommendations", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("recommendations-page")).toHaveAttribute(
      "data-mode",
      "managed",
      { timeout: 30_000 },
    );
    await expect(
      page.getByTestId("recommendations-mode-badge"),
    ).toHaveAttribute("data-mode", "managed");
    await expect(page.getByTestId("managed-banner")).toBeVisible();

    // No Signal upgrade CTA, no Signal action affordances anywhere on the
    // page — these are the boundary violations the page must avoid.
    await expect(page.getByTestId("signal-upgrade-cta")).toHaveCount(0);
    await expect(page.getByTestId("signal-act-manually-action")).toHaveCount(0);
    await expect(page.getByTestId("signal-save-action")).toHaveCount(0);
    await expect(page.getByTestId("signal-dismiss-action")).toHaveCount(0);

    // Every recommendation card carries Managed posture wiring.
    const cards = page.getByTestId("recommendation-card");
    await expect(cards.first()).toHaveAttribute("data-mode", "managed");
    await expect(
      cards.first().getByTestId("managed-status-label"),
    ).toBeVisible();

    // At least one card surfaces the Exception Review CTA for review-required
    // items (the seeded "blocked" projection).
    const reviewRequiredCard = page
      .locator(
        '[data-testid="recommendation-card"][data-review-required="true"]',
      )
      .first();
    await expect(reviewRequiredCard).toBeVisible();
    const cta = reviewRequiredCard.getByTestId("managed-exception-cta");
    await expect(cta).toBeVisible();
    // CTA wraps a Link to /us/app/exceptions. Navigate directly to assert the
    // placeholder route resolves; click-bubbling through Button→Link is
    // separately covered by Next.js Link tests.
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/us\/app\/exceptions$/);
    await expect(page.getByTestId("exceptions-page")).toBeVisible();

    // Detail page boundary check: regardless of whether the recommendation
    // data resolves (the detail endpoint is MSW-backed in dev, and live MSW
    // is disabled for e2e), the page must never render any order-submit or
    // per-trade execution control — neither in Managed (boundary) nor in
    // Signal (which is informational only). The signal-manual-panel is the
    // only Signal-side affordance and is read-only.
    await page.goto("/us/app/recommendations/rec-managed-msft", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("signal-order-entry")).toHaveCount(0);
    await expect(page.getByTestId("signal-place-order-button")).toHaveCount(0);
    await expect(page.getByTestId("signal-manual-panel")).toHaveCount(0);
  });
});
