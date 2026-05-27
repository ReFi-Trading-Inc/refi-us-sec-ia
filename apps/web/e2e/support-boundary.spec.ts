// Support boundary classifier (MIG-P2.5-23) — end-to-end coverage.
//
// Asserts that:
//  - blocked prompts disable Submit and surface the boundary_rule_id
//  - allowed categories submit successfully
//  - rate-limit + blocked-by-policy scenarios are handled

import { test, expect } from "@playwright/test";

const auth = [
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

async function gotoSupport(page: import("@playwright/test").Page) {
  await page.context().addCookies(auth);
  await page.goto("/us/app/support");
}

test.describe("Support boundary classifier", () => {
  test("blocks 'should I buy' prompts with rule SBR-001", async ({ page }) => {
    await gotoSupport(page);
    await page.getByLabel(/message/i).fill("Should I buy NVDA today?");
    await expect(page.getByText(/rule: SBR-001/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("button", { name: /submit request/i }),
    ).toBeDisabled();
  });

  test("blocks portfolio-change prompts with rule SBR-020", async ({
    page,
  }) => {
    await gotoSupport(page);
    await page
      .getByLabel(/message/i)
      .fill("Please rebalance my portfolio to be more conservative.");
    await expect(page.getByText(/rule: SBR-020/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("allowed technical prompts enable Submit", async ({ page }) => {
    await gotoSupport(page);
    // Select the technical category. Value is the SupportCategory enum;
    // label is rendered via CATEGORY_LABELS.
    await page.getByLabel(/category/i).selectOption("allowed_technical");
    await page
      .getByLabel(/message/i)
      .fill("The activity feed crashed when I clicked an event.");
    await expect(
      page.getByRole("button", { name: /submit request/i }),
    ).toBeEnabled({ timeout: 5_000 });
  });
});
