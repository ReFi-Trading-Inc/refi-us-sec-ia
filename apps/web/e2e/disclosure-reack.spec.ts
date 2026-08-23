import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { postSameOrigin } from "./api";

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

// Surface 5 — Disclosure re-acknowledgement, relocated by C2a from
// /us/app/settings/automation/disclosures to /us/app/documents/reacknowledge.
// Server contracts unchanged; Managed-state assertions moved to /status.
// Structurally REMOVED coverage (deliberate): the Automation Center banner
// test (page deleted; 404 proven in c2a-structure.spec.ts) and the
// /managed/resume fail-closed test (route deleted; 404 proven there too).
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
  await context.addCookies(await e2eAuthCookies(eligibilityValue));
}

// Each top-level test mutates the user's disclosure-ack state. Serial mode
// keeps assertions deterministic against the shared prototype store.
test.describe.configure({ mode: "serial" });

test.describe("Disclosure re-acknowledgement — Managed user with stale disclosure", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.staleDisclosure.eligibilityCookie);
  });

  test("Review page lists the stale disclosure with previous and current versions", async ({
    page,
  }) => {
    await page.goto("/us/app/documents/reacknowledge", {
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
    await page.goto("/us/app/documents/reacknowledge", {
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
  });
});

test.describe("Disclosure re-acknowledgement — paused_by_system clears on ack", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(
      context,
      E2E_USERS.staleDisclosurePaused.eligibilityCookie,
    );
  });

  test("Re-acknowledgement clears stale_disclosure and restores active execution", async ({
    page,
  }) => {
    await page.goto("/us/app/documents/reacknowledge", {
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

    // MES reports `active` again — read from /status, the retained Signal
    // view of the fact the Automation Center used to render.
    const status = await page.request.get("/api/v1/investor/status", {
      headers: { "x-correlation-id": "e2e-reack-restored-status" },
    });
    const statusBody = (await status.json()) as BffJsonBody;
    expect(statusBody.data.managedExecutionState?.status).toBe("active");
  });
});

test.describe("Disclosure re-acknowledgement — Signal boundary", () => {
  test("Signal user sees no Managed disclosure re-ack controls anywhere", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("disclosure-reack-blocked-banner"),
    ).toHaveCount(0);
    await page.goto("/us/app/documents/reacknowledge", {
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
    for (const path of ["/us/app/documents/reacknowledge"]) {
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
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });

    // Missing version
    const missing = await postSameOrigin(
      page,
      "/api/v1/investor/disclosures/reacknowledge",
      {
        headers: { "x-correlation-id": "e2e-reack-missing" },
        data: { docId: "form-adv-2a" },
      },
    );
    expect(missing.status()).toBe(400);

    // Document not in the active policy
    const notInPolicy = await postSameOrigin(
      page,
      "/api/v1/investor/disclosures/reacknowledge",
      {
        headers: { "x-correlation-id": "e2e-reack-not-in-policy" },
        data: { docId: "form-crs", version: "v2026-06" },
      },
    );
    expect(notInPolicy.status()).toBe(409);
    const notInPolicyBody = (await notInPolicy.json()) as BffJsonBody;
    expect(notInPolicyBody.data.reason).toBe("disclosure_not_in_active_policy");

    // Submitting the SAME version that is already pinned in the policy
    const sameAsActive = await postSameOrigin(
      page,
      "/api/v1/investor/disclosures/reacknowledge",
      {
        headers: { "x-correlation-id": "e2e-reack-same-version" },
        data: { docId: "form-adv-2a", version: "v2026-01" },
      },
    );
    expect(sameAsActive.status()).toBe(409);
    const sameAsActiveBody = (await sameAsActive.json()) as BffJsonBody;
    expect(sameAsActiveBody.data.reason).toBe("version_matches_active_policy");

    // Unknown version
    const unknown = await postSameOrigin(
      page,
      "/api/v1/investor/disclosures/reacknowledge",
      {
        headers: { "x-correlation-id": "e2e-reack-unknown-version" },
        data: { docId: "form-adv-2a", version: "v9999-99" },
      },
    );
    expect(unknown.status()).toBe(404);
    const unknownBody = (await unknown.json()) as BffJsonBody;
    expect(unknownBody.data.reason).toBe("document_not_found");
  });
});
