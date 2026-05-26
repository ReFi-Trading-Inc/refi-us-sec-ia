import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

// Surface 3 — Managed Execution Activation.
// Activation is the ONLY path that promotes a saved draft into a signed,
// versioned ExecutionPolicy. The spec proves: (a) every precondition gates the
// activate button, (b) a green-checklist activation flips ManagedExecutionState
// to active, (c) no per-trade Accept or broker-order control appears anywhere
// on this surface.

test.setTimeout(180_000);

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

test.describe("Managed activation — ready user (all prereqs green)", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.ready.eligibilityCookie);
  });

  test("activates Managed, flips MES to active, and shows v1 active policy in Automation Center", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/activate", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("activate-page")).toBeVisible();

    // Every checklist row should land on data-status="ok" once data hydrates.
    for (const id of [
      "checklist-draft",
      "checklist-profile",
      "checklist-broker",
      "checklist-disclosures",
    ]) {
      await expect(page.getByTestId(id)).toHaveAttribute("data-status", "ok", {
        timeout: 30_000,
      });
    }

    await page.getByTestId("ack-advisory-agreement").check();
    await page.getByTestId("ack-confirm-activation").check();

    const activateBtn = page.getByTestId("activate-managed-button");
    await expect(activateBtn).toBeEnabled();
    await activateBtn.click();

    // Activation completes by routing back to the Automation Center.
    await page.waitForURL(/\/us\/app\/settings\/automation$/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("automation-center-page")).toBeVisible();

    // Post-activation: page now reports Managed mode + active MES + policy v1.
    await expect(page.getByTestId("automation-center-page")).toHaveAttribute(
      "data-mode",
      "managed",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("automation-mes-badge")).toHaveAttribute(
      "data-status",
      "active",
    );
    await expect(
      page.getByTestId("automation-active-policy-version"),
    ).toHaveText("1");
  });

  test("activation surface exposes no per-trade Accept or broker-order control", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/activate", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("activate-page")).toBeVisible();

    for (const id of [
      "signal-place-order-button",
      "signal-order-entry",
      "signal-manual-panel",
      "investor-accept",
      "accept-trade-button",
      "approve-trade-button",
      "approve-recommendation-button",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    for (const phrase of [
      "Accept Recommendation",
      "Approve Trade",
      "Accept and Execute",
      "Approve for Execution",
      "Manual Rebalance",
      "accept_trade",
    ]) {
      await expect(page.getByText(phrase, { exact: false })).toHaveCount(0);
    }
  });
});

test.describe("Managed activation — blocked checklist (signal user)", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
  });

  test("activation blocked when draft is missing", async ({ page }) => {
    await page.goto("/us/app/settings/automation/activate", {
      waitUntil: "domcontentloaded",
    });
    // Signal user has no draft seeded; the GET draft route returns a default
    // placeholder, but it has not been persisted. The BFF refuses activation
    // unless the draft is actually stored — and the UI checklist surfaces
    // blocked status for the prerequisites that ARE missing for this user.
    // Either way: the Activate button must stay disabled.
    await expect(page.getByTestId("activate-managed-button")).toBeDisabled({
      timeout: 30_000,
    });
    await expect(page.getByTestId("activate-prereq-warning")).toBeVisible();
  });

  test("activation blocked when brokerage connection missing", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/activate", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("checklist-broker")).toHaveAttribute(
      "data-status",
      "blocked",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("activate-managed-button")).toBeDisabled();
  });

  test("activation blocked when profile / disclosures missing", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/activate", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("checklist-profile")).toHaveAttribute(
      "data-status",
      "blocked",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("checklist-disclosures")).toHaveAttribute(
      "data-status",
      "blocked",
    );
    await expect(page.getByTestId("activate-managed-button")).toBeDisabled();
  });
});
