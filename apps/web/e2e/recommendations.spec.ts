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

test.describe("Recommendations", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(authCookies);
  });

  test("list renders recommendations", async ({ page }) => {
    await page.goto("/us/app/recommendations");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // MSW returns Maya's recommendations; at least one card should appear.
    await expect(
      page
        .locator(
          "article, [data-testid=recommendation], .card, a[href*='/recommendations/']",
        )
        .first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("navigating to detail shows compliance preview", async ({ page }) => {
    await page.goto("/us/app/recommendations");
    const firstLink = page.locator("a[href*='/recommendations/']").first();
    await expect(firstLink).toBeVisible({ timeout: 5000 });
    await firstLink.click();
    await expect(page.getByText(/compliance|allow|deny|review/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("ALLOW verdict enables submit button (fail-closed check)", async ({
    page,
  }) => {
    await page.goto("/us/app/recommendations");
    const firstLink = page.locator("a[href*='/recommendations/']").first();
    await firstLink.click();
    // MSW returns ALLOW for qty <= 1000. Submit should be enabled.
    const submitBtn = page.getByRole("button", {
      name: /approve for execution/i,
    });
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await expect(submitBtn).toBeEnabled();
  });

  test("DENY verdict disables submit button (fail-closed)", async ({
    page,
  }) => {
    await page.goto("/us/app/recommendations");
    const firstLink = page.locator("a[href*='/recommendations/']").first();
    await firstLink.click();

    // Set qty > 1000 to trigger MSW DENY response.
    const qtyInput = page.getByLabel(/quantity/i);
    await expect(qtyInput).toBeVisible({ timeout: 5000 });
    await qtyInput.fill("1001");
    await qtyInput.dispatchEvent("change");

    // Wait for compliance preview to re-evaluate.
    await expect(page.getByText(/not approved|deny/i)).toBeVisible({
      timeout: 5000,
    });
    const submitBtn = page.getByRole("button", {
      name: /approve for execution/i,
    });
    await expect(submitBtn).toBeDisabled();
  });
});
