import { test, expect } from "@playwright/test";

test.describe("Eligibility flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/us/eligibility");
  });

  test("renders eligibility form", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/state/i)).toBeVisible();
    await expect(page.getByLabel(/date of birth/i)).toBeVisible();
  });

  test("eligible CA resident proceeds to auth", async ({ page }) => {
    await page.getByLabel(/state/i).selectOption("CA");
    await page.getByLabel(/date of birth/i).fill("1990-01-01");
    await page.getByRole("checkbox", { name: /us person/i }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/us\/auth\/connect/);
  });

  test("NY resident sees waitlist message", async ({ page }) => {
    await page.getByLabel(/state/i).selectOption("NY");
    await page.getByLabel(/date of birth/i).fill("1990-01-01");
    await page.getByRole("checkbox", { name: /us person/i }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/waitlist|not yet available/i)).toBeVisible();
  });

  test("under-18 applicant sees age error", async ({ page }) => {
    const underageYear = new Date().getFullYear() - 16;
    await page.getByLabel(/state/i).selectOption("CA");
    await page.getByLabel(/date of birth/i).fill(`${underageYear}-01-01`);
    await page.getByRole("checkbox", { name: /us person/i }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/18|age|minor/i)).toBeVisible();
  });
});
