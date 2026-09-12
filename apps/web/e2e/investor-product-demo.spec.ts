/**
 * Investor product (P1) — the walkable journey, on the demo tier.
 *
 * This lane boots the SAME production artifact at `REFI_ENV=demo`, so the
 * adapter resolves to fixtures and the whole journey can be driven:
 *
 *   connect PAPER Alpaca → disclosure → allocation → consent → confirmation
 *
 * It also proves the two things that must hold while walking it: LIVE is
 * genuinely unreachable, and no credential is left anywhere in the browser.
 */
import { test, expect, type Page } from "@playwright/test";

// Shape-valid, low-entropy, built at runtime so secret scanners never mistake
// it for a real credential. Never a real Alpaca key.
const FIXTURE_KEY = `PK${"0".repeat(18)}`;
const FIXTURE_SECRET = "e2eFixtureSecret".padEnd(40, "0");

async function connectPaper(page: Page) {
  await page.getByTestId("connect-paper").click();
  await page.getByTestId("api-key-id").fill(FIXTURE_KEY);
  await page.getByTestId("api-secret-key").fill(FIXTURE_SECRET);
  await page.getByTestId("submit-connection").click();
  await expect(page.getByTestId("connection-status")).toHaveAttribute(
    "data-status",
    "connected",
  );
}

test.describe("investor product journey (demo tier)", () => {
  test("PAPER is obvious and LIVE cannot be activated", async ({ page }) => {
    await page.goto("/us/product/brokerage");

    // The environment is stated, not implied — and stated as PAPER.
    const envBadge = page.getByTestId("environment-badge").first();
    await expect(envBadge).toBeVisible();
    await expect(envBadge).toHaveAttribute("data-environment", "paper");
    await expect(envBadge).toHaveText("PAPER");

    // LIVE is VISIBLE (the investor can see the capability exists)...
    const live = page.getByTestId("environment-live");
    await expect(live).toBeVisible();
    // ...but genuinely disabled, not merely styled as such.
    await expect(live).toBeDisabled();

    // ...with a reason that is programmatically associated, not just nearby.
    const reasonId = await live.getAttribute("aria-describedby");
    expect(reasonId).toBe("live-unavailable-reason");
    await expect(page.getByTestId("live-unavailable-reason")).toContainText(
      "PAPER only",
    );

    // Clicking it cannot select it.
    await live.click({ force: true });
    await expect(live).not.toBeChecked();
    await expect(page.getByTestId("environment-paper")).toBeChecked();
  });

  test("connect → disclosure → allocation → consent → confirmation", async ({
    page,
  }) => {
    await page.goto("/us/product/brokerage");
    await connectPaper(page);

    // The connected account is shown.
    await expect(page.getByTestId("broker-account-id")).toHaveText(
      "FIXTURE-ACCOUNT-0001",
    );

    await page.getByTestId("continue-to-subscription").click();
    await expect(page.getByTestId("subscription-surface")).toBeVisible();

    // Disclosure is present BEFORE any acceptance affordance is satisfied.
    await expect(page.getByTestId("disclosure-body")).toContainText(
      "remain at the brokerage",
    );

    // Consent is required: confirm is disabled until both allocation and
    // consent are satisfied.
    const confirm = page.getByTestId("confirm-subscription");
    await expect(confirm).toBeDisabled();
    await expect(page.getByTestId("consent-required")).toBeVisible();

    // Allocation validation: out of range is refused at the input.
    await page.getByTestId("allocation-input").fill("99");
    await page.getByTestId("allocation-input").blur();
    // Scoped to the allocation panel: Next's route announcer is also
    // role="alert", so an unscoped query is ambiguous.
    await expect(
      page.getByTestId("allocation-panel").getByRole("alert"),
    ).toContainText("permitted range");
    await expect(confirm).toBeDisabled();

    // A valid allocation alone still does not unlock confirm — consent gates.
    await page.getByTestId("allocation-input").fill("25");
    await page.getByTestId("allocation-input").blur();
    await expect(confirm).toBeDisabled();

    await page.getByTestId("consent-checkbox").check();
    await expect(confirm).toBeEnabled();

    await confirm.click();

    // Confirmed, in PAPER, at the allocation chosen.
    await expect(page.getByTestId("subscription-confirmed")).toBeVisible();
    await expect(page.getByTestId("confirmed-allocation")).toContainText("25");
    await expect(page.getByTestId("environment-badge").first()).toHaveAttribute(
      "data-environment",
      "paper",
    );

    // The consent receipt records the exact tuple that was shown.
    const receipt = page.getByTestId("consent-receipt");
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText(
      "alpha_automated_investment_disclosure",
    );
  });

  test("no Alpaca credential is left anywhere in the browser", async ({
    page,
  }) => {
    await page.goto("/us/product/brokerage");
    await connectPaper(page);

    const leaked = await page.evaluate(
      ({ key, secret }) => {
        const haystacks: string[] = [
          JSON.stringify(window.localStorage),
          JSON.stringify(window.sessionStorage),
          document.documentElement.outerHTML,
          window.location.href,
        ];
        return haystacks.filter((h) => h.includes(key) || h.includes(secret));
      },
      { key: FIXTURE_KEY, secret: FIXTURE_SECRET },
    );
    expect(leaked).toEqual([]);

    // The secret field is a password input, so it is not read back by
    // assistive tech or captured in a plain-text DOM snapshot.
    await page.reload();
    const html = await page.content();
    expect(html).not.toContain(FIXTURE_SECRET);
  });

  test("disconnect then reconnect", async ({ page }) => {
    await page.goto("/us/product/brokerage");
    await connectPaper(page);

    await page.getByTestId("disconnect").click();
    await expect(page.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "disconnected",
    );

    // The account identifier is gone with the connection.
    await expect(page.getByTestId("broker-account-id")).toHaveCount(0);

    await connectPaper(page);
    await expect(page.getByTestId("broker-account-id")).toBeVisible();
  });
});
