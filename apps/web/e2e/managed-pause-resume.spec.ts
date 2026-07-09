import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

interface BffJsonBody {
  data: {
    ok?: boolean;
    reason?: string;
    idempotentReplay?: boolean;
    subscriptionModeFlipped?: boolean;
    policy?: { policyVersion: number };
    executionPolicyVersion?: number | null;
    managedExecutionState?: { status: string };
    managedExecutionStatusBefore?: string | null;
    managedExecutionStatusAfter?: string | null;
    reasonCodeCleared?: string | null;
    [key: string]: unknown;
  };
  receipt?: { action?: string };
  [key: string]: unknown;
}

// Surface 4 — Managed pause/resume.
// The investor controls automated execution self-service. Pause/Resume mutate
// ManagedExecutionState only; never the ExecutionPolicy version, never a
// broker order, never a per-trade Accept. paused_by_system is read-only from
// this surface — the upstream condition must clear before automation resumes.

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
  ]);
}

test.describe("Managed pause/resume — active user", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.pausableActive.eligibilityCookie);
  });

  test("active Managed user can pause; banner flips to paused_by_user", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const controls = page.getByTestId("managed-controls");
    await expect(controls).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("managed-controls-banner")).toHaveAttribute(
      "data-status",
      "active",
      { timeout: 30_000 },
    );

    const pauseBtn = page.getByTestId("managed-pause-button");
    await expect(pauseBtn).toBeVisible();
    await expect(page.getByTestId("managed-resume-button")).toHaveCount(0);
    await pauseBtn.click();

    await expect(page.getByTestId("managed-controls-banner")).toHaveAttribute(
      "data-status",
      "paused_by_user",
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("managed-resume-button")).toBeVisible();
    await expect(page.getByTestId("managed-pause-button")).toHaveCount(0);
    // Active execution policy version is unchanged by a pause.
    await expect(
      page.getByTestId("automation-active-policy-version"),
    ).toHaveText("1");
  });
});

test.describe("Managed pause/resume — paused_by_user", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.resumablePaused.eligibilityCookie);
  });

  test("paused_by_user Managed user can resume; banner flips back to active", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("managed-controls-banner")).toHaveAttribute(
      "data-status",
      "paused_by_user",
      { timeout: 30_000 },
    );

    const resumeBtn = page.getByTestId("managed-resume-button");
    await expect(resumeBtn).toBeVisible();
    await expect(page.getByTestId("managed-pause-button")).toHaveCount(0);
    await resumeBtn.click();

    await expect(page.getByTestId("managed-controls-banner")).toHaveAttribute(
      "data-status",
      "active",
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("managed-pause-button")).toBeVisible();
    await expect(
      page.getByTestId("automation-active-policy-version"),
    ).toHaveText("1");
  });
});

test.describe("Managed pause/resume — paused_by_system (read-only)", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.systemPaused.eligibilityCookie);
  });

  test("paused_by_system is visible but offers no Pause or Resume button; reason code shown", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const banner = page.getByTestId("managed-controls-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toHaveAttribute("data-status", "paused_by_system");

    await expect(page.getByTestId("managed-pause-button")).toHaveCount(0);
    await expect(page.getByTestId("managed-resume-button")).toHaveCount(0);
    await expect(
      page.getByTestId("managed-controls-readonly-note"),
    ).toBeVisible();
    await expect(
      page.getByTestId("managed-controls-reason-code"),
    ).toContainText("broker_disconnected");

    // Even if a malicious client POSTs the resume endpoint directly, the
    // BFF must reject with status_must_clear_upstream and the banner stays
    // paused_by_system.
    const direct = await page.request.post("/api/v1/investor/managed/resume", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "e2e-sys-paused-resume",
      },
      data: {},
    });
    expect(direct.status()).toBe(412);
    const body = (await direct.json()) as BffJsonBody;
    // bffMutate emits a 412 with the blocked-outcome envelope (data.ok=false,
    // data.reason carries the reason code). Receipt is still recorded.
    expect(body.data.ok).toBe(false);
    expect(body.data.reason).toBe("system_pause_must_clear_upstream");
    expect(body.receipt?.action).toBe("resumeManaged");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("managed-controls-banner")).toHaveAttribute(
      "data-status",
      "paused_by_system",
      { timeout: 30_000 },
    );
  });
});

test.describe("Managed pause/resume — boundary", () => {
  test("Signal users see no managed pause/resume controls at all", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("automation-center-page")).toHaveAttribute(
      "data-mode",
      "signal",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("managed-controls")).toHaveCount(0);
    await expect(page.getByTestId("managed-pause-button")).toHaveCount(0);
    await expect(page.getByTestId("managed-resume-button")).toHaveCount(0);
  });

  test("no per-trade Accept or broker submission control appears on the pause/resume surface", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.pausableActive.eligibilityCookie);
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("managed-controls")).toBeVisible({
      timeout: 30_000,
    });

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
