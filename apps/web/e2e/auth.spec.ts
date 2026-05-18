import { test, expect } from "@playwright/test";

test.describe("SIWE auth", () => {
  test("connect page renders wallet button", async ({ page }) => {
    // Set the eligibility cookie so middleware doesn't redirect.
    await page.context().addCookies([
      {
        name: "us_eligibility_v1",
        value: "mock-eligibility-token",
        domain: "localhost",
        path: "/us",
      },
    ]);
    await page.goto("/us/auth/connect");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect wallet/i }),
    ).toBeVisible();
  });

  test("shows SIWE copy on the connect page", async ({ page }) => {
    await page.context().addCookies([
      {
        name: "us_eligibility_v1",
        value: "mock-eligibility-token",
        domain: "localhost",
        path: "/us",
      },
    ]);
    await page.goto("/us/auth/connect");
    await expect(
      page.getByText(/ethereum wallet|sign in|wallet/i),
    ).toBeVisible();
  });
});
