/**
 * Investor product (P1) — PRODUCTION tier behaviour.
 *
 * This lane runs at `REFI_ENV=prod`. Daniel's transport adapter does not exist
 * yet, so the only two correct outcomes are (a) the explicit, retryable
 * `backend_connection_unavailable` product state, or (b) nothing at all. What
 * must NEVER happen is the fixture adapter filling the gap: that is the
 * failure mode where a real investor is shown deterministic fake account
 * state on a production domain.
 *
 * These assertions are the browser-level leg of the fail-closed proof; the
 * unit leg lives in
 * packages/api-clients/src/__tests__/investor-product-adapter.test.ts.
 */
import { test, expect } from "@playwright/test";

/** Every string the fixture adapter can emit. None may appear on prod. */
const FIXTURE_MARKERS = [
  "FIXTURE-ACCOUNT-0001",
  "fixture-connection-0001",
  "fixture-strategy-core",
  "fixture-consent-receipt-0001",
  "ReFi Core Alpha",
  "Simulated data",
];

test.describe("investor product on the production tier", () => {
  test("the brokerage surface fails closed to the unavailable state, never to fixtures", async ({
    page,
  }) => {
    await page.goto("/us/product/brokerage");

    // The explicit product state, not a generic 500 and not a crash.
    const unavailable = page.getByTestId("backend-unavailable");
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toHaveAttribute(
      "data-code",
      "BACKEND_CONNECTION_UNAVAILABLE",
    );

    // Retryable, and it offers the retry rather than a dead end.
    await expect(page.getByTestId("retry")).toBeVisible();

    // It must not read as a rejection or as an undone verification.
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("rejected");
    expect(body).not.toContain("denied");
    expect(body).toContain("identity verification is complete");

    // No connect form: there is nothing to connect to.
    await expect(page.getByTestId("connect-paper")).toHaveCount(0);
    await expect(page.getByTestId("api-secret-key")).toHaveCount(0);
  });

  test("no fixture data reaches a production page", async ({ page }) => {
    for (const path of ["/us/product/brokerage", "/us/product/subscription"]) {
      await page.goto(path);
      const html = await page.content();
      for (const marker of FIXTURE_MARKERS) {
        expect(
          html,
          `${path} must not contain fixture marker "${marker}"`,
        ).not.toContain(marker);
      }
    }
  });

  test("the subscription surface also fails closed", async ({ page }) => {
    await page.goto("/us/product/subscription");
    await expect(page.getByTestId("backend-unavailable")).toBeVisible();
    // No confirm affordance can exist without a backend.
    await expect(page.getByTestId("confirm-subscription")).toHaveCount(0);
  });

  test("browser storage holds nothing on these surfaces", async ({ page }) => {
    await page.goto("/us/product/brokerage");
    const storage = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
    }));
    // No credential, and no adapter state cached client-side.
    expect(storage.local.toLowerCase()).not.toContain("secret");
    expect(storage.local.toLowerCase()).not.toContain("api_key");
    expect(storage.session.toLowerCase()).not.toContain("secret");
    expect(storage.session.toLowerCase()).not.toContain("api_key");
  });
});

/**
 * Rendered capture of the production fail-closed state.
 *
 * The demo lane captures the walkable journey; this is the one state that only
 * exists when no adapter is bound, so it can only be photographed here.
 * Generated on demand — the image is a build artifact under test-results/ and
 * is deliberately not committed.
 */
test("capture the backend-unavailable state", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/us/product/brokerage");
  await expect(page.getByTestId("backend-unavailable")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("06-backend-unavailable.png"),
    fullPage: true,
  });
});
