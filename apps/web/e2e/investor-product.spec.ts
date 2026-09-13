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
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";

/** Every string the fixture adapter can emit. None may appear on prod. */
const FIXTURE_MARKERS = [
  "FIXTURE-ACCOUNT-0001",
  "fixture-connection-0001",
  "fixture-strategy-core",
  "fixture-consent-receipt-0001",
  "ReFi Core Alpha",
  "Simulated data",
];

/**
 * Route authority.
 *
 * `/us/product/*` sits under `AuthProvider`, but that provider only PROJECTS
 * session status — it gates nothing. Without an explicit gate the surfaces
 * would render investor state, and an identity-verification claim, to a
 * viewer nobody has identified.
 */
test.describe("anonymous visitors", () => {
  test("the brokerage route shows no investor or KYC state", async ({
    page,
  }) => {
    await page.goto("/us/product/brokerage");

    // Either the sign-in-required state or the completed redirect to /us.
    await expect
      .poll(async () =>
        new URL(page.url()).pathname === "/us"
          ? "redirected"
          : await page.getByTestId("product-sign-in-required").count(),
      )
      .not.toBe(0);

    const body = (await page.locator("body").innerText()).toLowerCase();
    // No investor state, and above all no identity-verification claim.
    expect(body).not.toContain("identity verification");
    expect(body).not.toContain("fixture-account-0001");
    await expect(page.getByTestId("connection-panel")).toHaveCount(0);
    await expect(page.getByTestId("connect-paper")).toHaveCount(0);
    await expect(page.getByTestId("unavailable-kyc-verified")).toHaveCount(0);
  });

  test("the subscription route shows no investor or KYC state", async ({
    page,
  }) => {
    await page.goto("/us/product/subscription");
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("identity verification");
    await expect(page.getByTestId("subscription-surface")).toHaveCount(0);
    await expect(page.getByTestId("confirm-subscription")).toHaveCount(0);
    await expect(page.getByTestId("unavailable-kyc-verified")).toHaveCount(0);
  });
});

test.describe("authenticated, no transport adapter bound", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
  });

  test("reports the outage WITHOUT claiming identity verification succeeded", async ({
    page,
  }) => {
    await page.goto("/us/product/brokerage");
    await expect(page.getByTestId("backend-unavailable")).toBeVisible();

    // The KYC-unknown branch: the service that would report verification is
    // the one that is down, so the copy says what is actually known.
    await expect(page.getByTestId("unavailable-kyc-unknown")).toBeVisible();
    await expect(page.getByTestId("unavailable-kyc-verified")).toHaveCount(0);

    const body = await page.locator("body").innerText();
    expect(body).toContain("have not been changed");
    // A backend outage must not manufacture a verification or admission claim.
    expect(body).not.toContain("identity verification is complete");
    expect(body.toLowerCase()).not.toContain("admitted");
    expect(body.toLowerCase()).not.toContain("rejected");
  });

  test("the subscription surface makes no KYC claim either", async ({
    page,
  }) => {
    await page.goto("/us/product/subscription");
    await expect(page.getByTestId("backend-unavailable")).toBeVisible();
    await expect(page.getByTestId("unavailable-kyc-unknown")).toBeVisible();
    await expect(page.getByTestId("unavailable-kyc-verified")).toHaveCount(0);
  });
});

test.describe("investor product on the production tier", () => {
  test.beforeEach(async ({ page }) => {
    // Signed in: these assertions are about the ADAPTER failing closed, which
    // is only reachable past the route gate.
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
  });

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

    // It must not read as a rejection or as an undone verification...
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("rejected");
    expect(body).not.toContain("denied");
    // ...and equally must not CLAIM verification succeeded. With no transport
    // adapter there is no authoritative `kycVerified`, so the honest copy is
    // that nothing the investor already completed has changed.
    expect(body).toContain("have not been changed");
    expect(body).not.toContain("identity verification is complete");

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
  await page
    .context()
    .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/us/product/brokerage");
  await expect(page.getByTestId("backend-unavailable")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("06-backend-unavailable.png"),
    fullPage: true,
  });
});
