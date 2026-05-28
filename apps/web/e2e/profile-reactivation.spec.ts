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

// Surface 6 — Profile reactivation.
// When the active ExecutionPolicy's pinned advisory profile version is stale
// (aging or materially changed), the investor must re-confirm before Managed
// automation continues. Re-confirmation is an eligibility event — never a
// recommendation acceptance, broker submission, or policy mutation.

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

// Several tests mutate the prototype store for the user under test. Serial
// keeps the assertions deterministic against the shared store.
test.describe.configure({ mode: "serial" });

test.describe("Profile reactivation — aging-only stale profile", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.staleProfilePaused.eligibilityCookie);
  });

  test("Automation Center shows the blocked banner + Review profile CTA", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const banner = page.getByTestId("profile-react-blocked-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toHaveAttribute("data-blocker", "stale_profile_aging");
    const cta = page.getByTestId("profile-react-cta");
    await expect(cta).toHaveAttribute(
      "href",
      "/us/app/settings/automation/profile",
    );
  });

  test("Review page shows pinned, latest, and last-confirmed versions; reconfirm clears stale_profile and preserves policy version", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/profile", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("profile-react-page")).toBeVisible();
    await expect(page.getByTestId("profile-react-latest-version")).toHaveText(
      "1",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("profile-react-pinned-version")).toHaveText(
      "1",
    );
    await expect(
      page.getByTestId("profile-react-last-confirmed-version"),
    ).toHaveText("—");

    const beforeStatus = await page.request.get("/api/v1/investor/status", {
      headers: { "x-correlation-id": "e2e-profile-before-status" },
    });
    const beforeBody = (await beforeStatus.json()) as BffJsonBody;
    const policyVersionBefore = beforeBody.data
      .executionPolicyVersion as number;

    await page.getByTestId("profile-react-ack-checkbox").check();
    await page.getByTestId("profile-react-submit").click();
    // The successful reconfirm either keeps the aging panel briefly with a
    // confirmation line, or — once the eligibility query refetches — flips
    // the page to the "Up to date" panel. Either is a successful end state.
    await expect(
      page
        .getByTestId("profile-react-confirmation")
        .or(page.getByTestId("profile-react-current")),
    ).toBeVisible({ timeout: 15_000 });

    // Active policy version is preserved by a reconfirmation.
    const afterStatus = await page.request.get("/api/v1/investor/status", {
      headers: { "x-correlation-id": "e2e-profile-after-status" },
    });
    const afterBody = (await afterStatus.json()) as BffJsonBody;
    expect(afterBody.data.executionPolicyVersion).toBe(policyVersionBefore);

    // MES restored to active under the same policy version.
    expect(afterBody.data.managedExecutionState?.status).toBe("active");

    // Automation Center no longer surfaces the profile blocked banner.
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("profile-react-blocked-banner")).toHaveCount(
      0,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("managed-controls-banner")).toHaveAttribute(
      "data-status",
      "active",
    );
  });

  test("/managed/resume fails closed while a stale-profile system pause exists", async ({
    page,
    context,
  }) => {
    // Use a freshly seeded paused user (the previous test resumed the one
    // shared with this describe). The stale-profile-with-disclosure user
    // exists exactly for this — its reasonCode also starts with
    // stale_profile so the resume guard fires the same way.
    await seedCookies(
      context,
      E2E_USERS.staleProfileWithDisclosure.eligibilityCookie,
    );
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const direct = await page.request.post("/api/v1/investor/managed/resume", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "e2e-stale-profile-resume",
      },
      data: {},
    });
    expect(direct.status()).toBe(412);
    const body = (await direct.json()) as BffJsonBody;
    expect(body.data.reason).toBe("system_pause_must_clear_upstream");
  });
});

test.describe("Profile reactivation — material change routes to policy review", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(
      context,
      E2E_USERS.staleProfileMaterial.eligibilityCookie,
    );
  });

  test("Review page surfaces material-change panel + activation route, does not show aging panel", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/profile", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("profile-react-page")).toHaveAttribute(
      "data-blocker",
      "stale_profile_changed",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("profile-react-page")).toHaveAttribute(
      "data-material-change",
      "true",
    );
    await expect(
      page.getByTestId("profile-react-material-change"),
    ).toBeVisible();
    await expect(page.getByTestId("profile-react-aging")).toHaveCount(0);
    const route = page.getByTestId("profile-react-route-to-activation");
    await expect(route).toHaveAttribute(
      "href",
      "/us/app/settings/automation/activate",
    );
    await expect(
      page.getByTestId("profile-react-changed-fields"),
    ).toContainText("riskTolerance");
  });

  test("Direct reconfirm POST rejects material change with material_change_requires_policy_review and does NOT restore MES", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/profile", {
      waitUntil: "domcontentloaded",
    });
    const res = await page.request.post("/api/v1/investor/profile/reconfirm", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "e2e-profile-material-reconfirm",
      },
      data: { profileVersion: 2, acknowledgeUnchanged: true },
    });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as BffJsonBody;
    expect(body.data.ok).toBe(false);
    expect(body.data.reason).toBe("material_change_requires_policy_review");

    const status = await page.request.get("/api/v1/investor/status", {
      headers: { "x-correlation-id": "e2e-profile-material-status" },
    });
    const statusBody = (await status.json()) as BffJsonBody;
    expect(statusBody.data.managedExecutionState?.status).toBe(
      "paused_by_system",
    );
  });
});

test.describe("Profile reactivation — remaining blockers", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(
      context,
      E2E_USERS.staleProfileWithDisclosure.eligibilityCookie,
    );
  });

  test("Reconfirm records the durable confirmation but leaves MES paused while a stale disclosure remains", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation/profile", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("profile-react-aging")).toBeVisible({
      timeout: 30_000,
    });

    const res = await page.request.post("/api/v1/investor/profile/reconfirm", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "e2e-profile-with-disc",
      },
      data: { profileVersion: 1, acknowledgeUnchanged: true },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as BffJsonBody;
    expect(body.data.ok).toBe(true);
    expect(body.data.reasonCodeCleared).toBeNull();
    expect(body.data.managedExecutionStatusAfter).toBe("paused_by_system");

    // The disclosure-reack banner should still be the active blocker on the
    // Automation Center.
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByTestId("disclosure-reack-blocked-banner"),
    ).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("Profile reactivation — Signal boundary + forbidden language", () => {
  test("Signal user sees no Managed profile reactivation controls anywhere", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("profile-react-blocked-banner")).toHaveCount(
      0,
    );
    await page.goto("/us/app/settings/automation/profile", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("profile-react-page")).toHaveAttribute(
      "data-mode",
      "signal",
      { timeout: 30_000 },
    );
    await expect(
      page.getByTestId("profile-react-not-applicable"),
    ).toBeVisible();
  });

  test("No per-trade Accept or admin language appears on the profile reactivation flow", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.staleProfilePaused.eligibilityCookie);
    for (const path of [
      "/us/app/settings/automation",
      "/us/app/settings/automation/profile",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      for (const id of [
        "signal-place-order-button",
        "signal-order-entry",
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
});

test.describe("Profile reactivation — direct API fail-closed cases", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.staleProfilePaused.eligibilityCookie);
  });

  test("Missing version → 400 bad_request", async ({ page }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const res = await page.request.post("/api/v1/investor/profile/reconfirm", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "e2e-profile-missing-version",
      },
      data: { acknowledgeUnchanged: true },
    });
    expect(res.status()).toBe(400);
  });

  test("Mismatched profile version → 409 profile_version_mismatch", async ({
    page,
  }) => {
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const res = await page.request.post("/api/v1/investor/profile/reconfirm", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "e2e-profile-mismatch",
      },
      data: { profileVersion: 9999, acknowledgeUnchanged: true },
    });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as BffJsonBody;
    expect(body.data.reason).toBe("profile_version_mismatch");
  });

  test("Signal user (no active policy) → 412 no_active_policy", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto("/us/app/settings/automation", {
      waitUntil: "domcontentloaded",
    });
    const res = await page.request.post("/api/v1/investor/profile/reconfirm", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "e2e-profile-no-policy",
      },
      data: { profileVersion: 1, acknowledgeUnchanged: true },
    });
    expect(res.status()).toBe(412);
    const body = (await res.json()) as BffJsonBody;
    // Signal user has no profile-snapshot seeded either, so no_profile fires
    // first — either is a legitimate fail-closed outcome.
    expect(["no_profile", "no_active_policy"]).toContain(body.data.reason);
  });
});
