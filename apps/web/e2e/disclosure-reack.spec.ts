import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

interface BffJsonBody {
  data: {
    ok?: boolean;
    reason?: string;
    idempotentReplay?: boolean;
    subscriptionModeFlipped?: boolean;
    policy?: { policyVersion?: number };
    executionPolicyVersion?: number | null;
    managedExecutionState?: { status?: string };
    managedExecutionStatusBefore?: string | null;
    managedExecutionStatusAfter?: string | null;
    reasonCodeCleared?: string | null;
    [key: string]: unknown;
  };
  receipt?: { action?: string };
  [key: string]: unknown;
}

// Surface 5 — Disclosure re-acknowledgement.
// When a disclosure version pinned in the active ExecutionPolicy is
// superseded in the registry, the investor must re-acknowledge the new
// version before Managed automation continues. Re-acknowledgement records a
// durable ack but does not mint a new ExecutionPolicy version, and never
// implies any per-trade acceptance.

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

// Each top-level test mutates the user's disclosure-ack state. Serial mode
// keeps assertions deterministic against the shared prototype store.
test.describe.configure({ mode: "serial" });

test.describe("Disclosure re-acknowledgement — Managed user with stale disclosure", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.staleDisclosure.eligibilityCookie);
  });

  test("Automation Center shows the blocked banner and CTA when a disclosure is stale", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const banner = page.getByTestId("disclosure-reack-blocked-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    const cta = page.getByTestId("disclosure-reack-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute(
      "href",
      "/us/app/settings/automation/disclosures",
    );
  });

  test("Review page lists the stale disclosure with previous and current versions", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/disclosures", {
      waitUntil: "domcontentloaded",
    });
    const reackPage = page.getByTestId("reack-page");
    await expect(reackPage).toBeVisible();
    await expect(reackPage).toHaveAttribute("data-requires-reack", "true", {
      timeout: 30_000,
    });
    const row = page.getByTestId("reack-row-form-adv-2a");
    await expect(row).toBeVisible();
    await expect(page.getByTestId("reack-row-form-adv-2a-previous")).toHaveText(
      "v2026-01",
    );
    await expect(page.getByTestId("reack-row-form-adv-2a-current")).toHaveText(
      "v2026-06",
    );
  });

  test("Acknowledging the new version clears the stale-disclosure blocker but preserves the active policy version", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/disclosures", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("reack-row-form-adv-2a")).toBeVisible({
      timeout: 30_000,
    });

    const beforeStatus = await page.request.get("/api/v1/investor/status", {
      headers: { "x-correlation-id": "e2e-reack-before-status" },
    });
    const beforeBody = (await beforeStatus.json()) as BffJsonBody;
    const policyVersionBefore = beforeBody.data
      .executionPolicyVersion as number;
    expect(typeof policyVersionBefore).toBe("number");

    await page.getByTestId("reack-row-form-adv-2a-ack-checkbox").check();
    await page.getByTestId("reack-row-form-adv-2a-submit").click();
    await expect(
      page.getByTestId("reack-row-form-adv-2a-ack-confirmation"),
    ).toBeVisible({ timeout: 15_000 });

    // Active policy version unchanged by a re-acknowledgement.
    const afterStatus = await page.request.get("/api/v1/investor/status", {
      headers: { "x-correlation-id": "e2e-reack-after-status" },
    });
    const afterBody = (await afterStatus.json()) as BffJsonBody;
    expect(afterBody.data.executionPolicyVersion).toBe(policyVersionBefore);

    // Automation Center no longer surfaces the blocked banner.
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByTestId("disclosure-reack-blocked-banner"),
    ).toHaveCount(0, { timeout: 30_000 });
  });
});

test.describe("Disclosure re-acknowledgement — paused_by_system clears on ack", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(
      context,
      E2E_USERS.staleDisclosurePaused.eligibilityCookie,
    );
  });

  test("Direct resume call fails closed while a stale disclosure exists", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const direct = await page.request.post("/api/v1/investor/managed/resume", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "e2e-stale-paused-resume",
      },
      data: {},
    });
    expect(direct.status()).toBe(412);
    const body = (await direct.json()) as BffJsonBody;
    expect(body.data.ok).toBe(false);
    expect(body.data.reason).toBe("system_pause_must_clear_upstream");
  });

  test("Re-acknowledgement clears stale_disclosure and restores active execution", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/disclosures", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("reack-row-form-adv-2a")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("reack-row-form-adv-2a-ack-checkbox").check();
    await page.getByTestId("reack-row-form-adv-2a-submit").click();
    await expect(
      page.getByTestId("reack-row-form-adv-2a-ack-confirmation"),
    ).toBeVisible({ timeout: 15_000 });

    // Returning to the Automation Center, ManagedExecutionState should now
    // report `active` again (the BFF flipped it because the stale-disclosure
    // reason cleared) and the blocked banner is gone.
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("managed-controls-banner")).toHaveAttribute(
      "data-status",
      "active",
      { timeout: 30_000 },
    );
    await expect(
      page.getByTestId("disclosure-reack-blocked-banner"),
    ).toHaveCount(0);
  });
});

test.describe("Disclosure re-acknowledgement — Signal boundary", () => {
  test("Signal user sees no Managed disclosure re-ack controls anywhere", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByTestId("disclosure-reack-blocked-banner"),
    ).toHaveCount(0);
    await page.goto("/us/app/settings/automation/disclosures", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("reack-page")).toHaveAttribute(
      "data-mode",
      "signal",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("reack-not-applicable")).toBeVisible();
    await expect(page.getByTestId("reack-disclosure-list")).toHaveCount(0);
  });
});

test.describe("Disclosure re-acknowledgement — forbidden language and API guardrails", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.staleDisclosure.eligibilityCookie);
  });

  test("No per-trade Accept or admin language appears on the re-ack flow", async ({
    page,
  }) => {
    for (const path of [
      "/us/app/settings/automation",
      "/us/app/settings/automation/disclosures",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
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
        "admin action",
        "terminal reason",
        "staff review",
        "compliance adapter",
        "autopilot",
      ]) {
        await expect(page.getByText(phrase, { exact: false })).toHaveCount(0);
      }
    }
  });

  test("Direct API path fails closed on stale, missing, or mismatched ack payloads", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });

    // Missing version
    const missing = await page.request.post(
      "/api/v1/investor/disclosures/reacknowledge",
      {
        headers: {
          "content-type": "application/json",
          "x-correlation-id": "e2e-reack-missing",
        },
        data: { docId: "form-adv-2a" },
      },
    );
    expect(missing.status()).toBe(400);

    // Document not in the active policy
    const notInPolicy = await page.request.post(
      "/api/v1/investor/disclosures/reacknowledge",
      {
        headers: {
          "content-type": "application/json",
          "x-correlation-id": "e2e-reack-not-in-policy",
        },
        data: { docId: "form-crs", version: "v2026-06" },
      },
    );
    expect(notInPolicy.status()).toBe(409);
    const notInPolicyBody = (await notInPolicy.json()) as BffJsonBody;
    expect(notInPolicyBody.data.reason).toBe("disclosure_not_in_active_policy");

    // Submitting the SAME version that is already pinned in the policy
    const sameAsActive = await page.request.post(
      "/api/v1/investor/disclosures/reacknowledge",
      {
        headers: {
          "content-type": "application/json",
          "x-correlation-id": "e2e-reack-same-version",
        },
        data: { docId: "form-adv-2a", version: "v2026-01" },
      },
    );
    expect(sameAsActive.status()).toBe(409);
    const sameAsActiveBody = (await sameAsActive.json()) as BffJsonBody;
    expect(sameAsActiveBody.data.reason).toBe("version_matches_active_policy");

    // Unknown version
    const unknown = await page.request.post(
      "/api/v1/investor/disclosures/reacknowledge",
      {
        headers: {
          "content-type": "application/json",
          "x-correlation-id": "e2e-reack-unknown-version",
        },
        data: { docId: "form-adv-2a", version: "v9999-99" },
      },
    );
    expect(unknown.status()).toBe(404);
    const unknownBody = (await unknown.json()) as BffJsonBody;
    expect(unknownBody.data.reason).toBe("document_not_found");
  });
});
