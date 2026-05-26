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

// The two idempotency tests both write ExecutionPolicy versions against the
// same dedicated account; running them in parallel can race on the
// `appendExecutionPolicy` putIfAbsent guard. Serial keeps them deterministic.
test.describe.configure({ mode: "serial" });
test.describe("Managed activation — idempotency", () => {
  test("Idempotency-Key header replay returns idempotentReplay:true and does not create a new policy version", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.idempotency.eligibilityCookie);
    // Warm cookies through a normal page navigation so the BFF dev-fallback
    // resolves the auth context the same way it does for UI requests.
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });

    // Use a unique agreement version so the derived key cannot collide with
    // the UI activation test that runs in parallel against the same account.
    const headers = {
      "content-type": "application/json",
      "x-correlation-id": "e2e-idempotency-1",
      "idempotency-key": `e2e-activate-key-${Date.now()}-${Math.random()}`,
    };
    const body = {
      acknowledgedDisclosures: [{ docId: "form-adv-2a", version: "v2026-01" }],
      advisoryAgreementVersion: "advisory-agreement-header-test",
      clientAttestation: true,
      deviceFingerprint: "e2e-device-stable",
    };

    const first = await page.request.post(
      "/api/v1/investor/execution-policy/activate",
      { headers, data: body },
    );
    expect(first.status()).toBe(201);
    const firstJson = await first.json();
    expect(firstJson.data.idempotentReplay).toBe(false);
    const firstVersion = firstJson.data.policy.policyVersion;
    expect(typeof firstVersion).toBe("number");

    const second = await page.request.post(
      "/api/v1/investor/execution-policy/activate",
      { headers, data: body },
    );
    expect(second.status()).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.data.idempotentReplay).toBe(true);
    expect(secondJson.data.subscriptionModeFlipped).toBe(false);
    expect(secondJson.data.policy.policyVersion).toBe(firstVersion);
  });

  test("Derived-key replay (no header) on second activation attempt returns idempotentReplay:true", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.idempotency.eligibilityCookie);
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });

    // No Idempotency-Key header → server derives the key from accountId +
    // draft.updatedAt + ack set + agreementVersion. Same inputs = same key.
    // Unique agreement version isolates from the UI activation test that
    // also runs against the ready user in parallel.
    const headers = {
      "content-type": "application/json",
      "x-correlation-id": "e2e-idempotency-derived-1",
    };
    const body = {
      acknowledgedDisclosures: [{ docId: "form-adv-2a", version: "v2026-01" }],
      advisoryAgreementVersion: "advisory-agreement-derived-test",
      clientAttestation: true,
      deviceFingerprint: "e2e-device-stable",
    };

    const first = await page.request.post(
      "/api/v1/investor/execution-policy/activate",
      { headers, data: body },
    );
    expect(first.status()).toBe(201);
    const firstJson = await first.json();
    const firstVersion = firstJson.data.policy.policyVersion;
    expect(firstJson.data.idempotentReplay).toBe(false);

    // Even a different deviceFingerprint must still collapse to the same
    // key — device is intentionally NOT in the derivation.
    const second = await page.request.post(
      "/api/v1/investor/execution-policy/activate",
      {
        headers: {
          ...headers,
          "x-correlation-id": "e2e-idempotency-derived-2",
        },
        data: { ...body, deviceFingerprint: "e2e-device-rotated" },
      },
    );
    expect(second.status()).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.data.idempotentReplay).toBe(true);
    expect(secondJson.data.policy.policyVersion).toBe(firstVersion);
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
