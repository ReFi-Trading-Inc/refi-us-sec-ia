import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

// Surface 2 — Automation Center / Execution Policy Builder.
// Draft-only: saving a draft must not activate Managed mode, must not call
// /activate, must not submit broker orders, and must not present any
// per-trade Accept / Approve control. Stable testid-only assertions.

test.setTimeout(120_000);

async function seedCookies(
  context: BrowserContext,
  eligibilityValue: string,
): Promise<void> {
  await context.addCookies([
    {
      name: "us_eligibility_v1",
      value: eligibilityValue,
      domain: "localhost",
      path: "/",
    },
    {
      name: "us_session_v1",
      value: "e2e-placeholder-session-token",
      domain: "localhost",
      path: "/",
    },
  ]);
}

test.describe("Automation Center — Signal user", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
  });

  test("Signal user sees draft builder, Signal badge, and no Managed active controls", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const root = page.getByTestId("automation-center-page");
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute("data-mode", "signal", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("automation-mode-badge")).toHaveAttribute(
      "data-mode",
      "signal",
    );
    await expect(page.getByTestId("automation-draft-builder")).toBeVisible();
    // No active-Managed banner for a Signal user.
    await expect(
      page.getByTestId("automation-draft-active-banner"),
    ).toHaveCount(0);
    // Surface 3 controls must not appear here.
    await expect(page.getByTestId("automation-activate-button")).toHaveCount(0);
  });
});

test.describe("Automation Center — Managed user", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.managed.eligibilityCookie);
  });

  test("Managed user sees active policy, Managed Execution State, draft builder, and banner", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("automation-center-page")).toHaveAttribute(
      "data-mode",
      "managed",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("automation-active-policy")).toBeVisible();
    await expect(
      page.getByTestId("automation-active-policy-version"),
    ).toHaveText("1", { timeout: 30_000 });
    await expect(page.getByTestId("automation-mes-badge")).toHaveAttribute(
      "data-status",
      "active",
    );
    await expect(
      page.getByTestId("automation-draft-active-banner"),
    ).toBeVisible();
    await expect(page.getByTestId("automation-draft-builder")).toBeVisible();
  });

  test("Saving a valid draft persists through the BFF", async ({ page }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const builder = page.getByTestId("automation-draft-builder");
    await expect(builder).toBeVisible();
    // Wait for the draft to hydrate the form.
    await expect(page.getByTestId("draft-strategyId")).toBeVisible({
      timeout: 30_000,
    });

    const drift = page.getByTestId("draft-driftThreshold");
    await drift.fill("0.08");
    const minOrder = page.getByTestId("draft-minOrder");
    await minOrder.fill("50.00");

    await page.getByTestId("automation-save-draft").click();
    await expect(page.getByTestId("automation-save-success")).toBeVisible({
      timeout: 15_000,
    });

    // Managed Execution State must not flip; active policy version must not change.
    await expect(page.getByTestId("automation-mes-badge")).toHaveAttribute(
      "data-status",
      "active",
    );
    await expect(
      page.getByTestId("automation-active-policy-version"),
    ).toHaveText("1");
  });

  test("Invalid preference values block save and surface field-level errors", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("draft-strategyId")).toBeVisible({
      timeout: 30_000,
    });

    // 0.9 is outside the 0.001..0.25 drift-threshold range.
    await page.getByTestId("draft-driftThreshold").fill("0.9");
    await page.getByTestId("automation-save-draft").click();
    await expect(page.getByTestId("automation-save-error")).toBeVisible();
    await expect(page.getByTestId("automation-save-success")).toHaveCount(0);
  });

  test("Capital-allocation and risk-limit controls are not editable", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("draft-strategyId")).toBeVisible({
      timeout: 30_000,
    });

    // Daniel 2026-07-28: RiskLimits, template risk settings, and capital
    // allocation are backend-owned and read-only to the investor.
    for (const removed of [
      "draft-maxSingleOrderUsd",
      "draft-maxPositionSizeBps",
      "draft-minimumCashReserveBps",
      "draft-dailyOrderLimit",
      "draft-dailyLossPauseBps",
      "draft-drawdownPauseBps",
      "draft-maxOpenOrders",
    ]) {
      await expect(page.getByTestId(removed)).toHaveCount(0);
    }

    // They are explained as backend-owned rather than silently dropped.
    await expect(page.getByTestId("backend-owned-limits")).toBeVisible();
  });

  test("No forbidden per-trade Accept or Approve controls anywhere on the page", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("automation-center-page")).toBeVisible();

    // Per-trade controls / Surface 3 activation buttons must not be present.
    for (const id of [
      "signal-place-order-button",
      "signal-order-entry",
      "signal-manual-panel",
      "automation-activate-button",
      "investor-accept",
      "accept-trade-button",
      "approve-trade-button",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }

    // Copy-level guard: forbidden labels must not appear anywhere on this
    // page. Casing-insensitive substring check via Playwright text matchers.
    for (const phrase of [
      "Accept Recommendation",
      "Approve Trade",
      "Accept and Execute",
      "Approve for Execution",
      "accept_trade",
    ]) {
      await expect(page.getByText(phrase, { exact: false })).toHaveCount(0);
    }
  });
});
