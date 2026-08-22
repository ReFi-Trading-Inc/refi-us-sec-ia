import { test, expect } from "@playwright/test";
import { selectOptionHydrated } from "./hydration";

test.describe("Eligibility flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/us/eligibility");
    // Next.js dev server compiles routes on-demand; under parallel-worker
    // load, the first navigation can land before the eligibility route is
    // compiled and the page returns a transient 404. Wait for the H1 to
    // confirm the page itself is rendered before any field interaction.
    //
    // This confirms paint, NOT hydration — the markup is server-rendered and
    // present before React mounts. Tests that interact with a control must
    // additionally gate on hydration (see ./hydration).
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("renders eligibility form", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/state of residence/i)).toBeVisible();
    await expect(page.getByLabel(/date of birth/i)).toBeVisible();
  });

  test("eligible CA resident proceeds to auth", async ({ page }) => {
    // First stateful interaction on the page — gate it on hydration so the
    // selection is not discarded by a late React mount. Once this holds the
    // tree is hydrated, so the remaining fields need no wrapper.
    await selectOptionHydrated(page.getByLabel(/state of residence/i), "CA");
    await page.getByLabel(/date of birth/i).fill("1990-01-01");
    // The "Are you a US person or US tax resident?" group is a radio group;
    // selecting "Yes" satisfies the schema's `isUsPerson: "yes"`.
    await page.getByRole("radio", { name: "Yes" }).check();
    await page.getByRole("button", { name: /check eligibility/i }).click();
    // The page renders an in-page result card with a "Continue" CTA link;
    // navigation happens only when the user clicks the CTA. The CTA is no
    // longer wallet-specific: onboarding is email-first and must not require
    // a wallet (Daniel 2026-07-28).
    const cta = page.getByRole("link", { name: /^continue$/i });
    // Explicit timeout: the result card renders after submit, and Next.js dev
    // compiles the route on demand, so the default 5s can lose the race.
    await expect(cta).toBeVisible({ timeout: 30_000 });
    await cta.click();
    await expect(page).toHaveURL(/\/us\/auth\/connect/);
  });

  test("NY resident sees waitlist message", async ({ page }) => {
    await selectOptionHydrated(page.getByLabel(/state of residence/i), "NY");
    await page.getByLabel(/date of birth/i).fill("1990-01-01");
    await page.getByRole("radio", { name: "Yes" }).check();
    await page.getByRole("button", { name: /check eligibility/i }).click();
    // Waitlist result renders a Badge ("Waitlist") plus a heading ("Coming
    // soon to your state"). The aria-label on the badge is stable.
    await expect(
      page.getByLabel(/eligibility result: waitlist/i),
    ).toBeVisible();
  });

  test("under-18 applicant sees age error", async ({ page }) => {
    const underageYear = new Date().getFullYear() - 16;
    await selectOptionHydrated(page.getByLabel(/state of residence/i), "CA");
    await page
      .getByLabel(/date of birth/i)
      .fill(`${String(underageYear)}-01-01`);
    await page.getByRole("radio", { name: "Yes" }).check();
    await page.getByRole("button", { name: /check eligibility/i }).click();
    // Client-side schema rejects underage and surfaces the inline DOB error
    // before any network call; the form does not transition to a result card.
    await expect(page.getByText(/at least 18 years old/i)).toBeVisible();
  });
});
