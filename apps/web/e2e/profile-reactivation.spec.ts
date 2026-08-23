import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { postSameOrigin } from "./api";

interface BffJsonBody {
  data: {
    ok?: boolean;
    reason?: string;
    executionPolicyVersion?: number | null;
    managedExecutionState?: { status: string };
    managedExecutionStatusAfter?: string | null;
    reasonCodeCleared?: string | null;
    [key: string]: unknown;
  };
  receipt?: { action?: string };
  [key: string]: unknown;
}

// Surface 6 — Profile reactivation, relocated by C2a from
// /us/app/settings/automation/profile to /us/app/profile. The Automation
// Center was structurally removed with the Managed execution surfaces; the
// advisory-profile obligation is Signal remediation and lives in the normal
// Signal IA. The SERVER contracts (profile/reactivation, profile/reconfirm)
// are unchanged — assertions that used to read Managed state off the
// Automation Center page now read the same facts from /api/v1/investor/status,
// which remains a Signal read.
//
// Structurally REMOVED coverage (deliberate, not lost):
//   - "Automation Center shows the blocked banner" — page no longer exists;
//     its 404 is proven in c2a-structure.spec.ts.
//   - "/managed/resume fails closed" — the route no longer exists; 404 proven
//     in c2a-structure.spec.ts. Refusal tests convert to absence proofs.

const PROFILE = "/us/app/profile";

test.setTimeout(180_000);

async function seedCookies(
  context: BrowserContext,
  eligibilityValue: string,
): Promise<void> {
  await context.addCookies(await e2eAuthCookies(eligibilityValue));
}

test.describe.configure({ mode: "serial" });

test.describe("Profile reactivation — aging-only stale profile", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.staleProfilePaused.eligibilityCookie);
  });

  test("Review page shows pinned, latest, and last-confirmed versions; reconfirm clears stale_profile and preserves policy version", async ({
    page,
  }) => {
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
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
    await expect(
      page
        .getByTestId("profile-react-confirmation")
        .or(page.getByTestId("profile-react-current")),
    ).toBeVisible({ timeout: 15_000 });

    // Active policy version is preserved and MES is restored to active —
    // read from /status, the retained Signal view of the same server facts
    // the Automation Center used to render.
    const afterStatus = await page.request.get("/api/v1/investor/status", {
      headers: { "x-correlation-id": "e2e-profile-after-status" },
    });
    const afterBody = (await afterStatus.json()) as BffJsonBody;
    expect(afterBody.data.executionPolicyVersion).toBe(policyVersionBefore);
    expect(afterBody.data.managedExecutionState?.status).toBe("active");
  });
});

test.describe("Profile reactivation — material change requires policy review", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(
      context,
      E2E_USERS.staleProfileMaterial.eligibilityCookie,
    );
  });

  test("Review page surfaces the material-change panel with the policy-review note, not an activation link", async ({
    page,
  }) => {
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
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
    // C2a: the Managed activation flow is structurally absent, so the panel
    // states that policy review is unavailable and points at support — it
    // must NOT link into a deleted activation surface.
    await expect(
      page.getByTestId("profile-react-policy-review-note"),
    ).toBeVisible();
    await expect(
      page.getByTestId("profile-react-route-to-activation"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("profile-react-changed-fields"),
    ).toContainText("riskTolerance");
  });

  test("Direct reconfirm POST rejects material change with material_change_requires_policy_review and does NOT restore MES", async ({
    page,
  }) => {
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
    const res = await postSameOrigin(
      page,
      "/api/v1/investor/profile/reconfirm",
      {
        headers: { "x-correlation-id": "e2e-profile-material-reconfirm" },
        data: { profileVersion: 2, acknowledgeUnchanged: true },
      },
    );
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
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("profile-react-aging")).toBeVisible({
      timeout: 30_000,
    });

    const res = await postSameOrigin(
      page,
      "/api/v1/investor/profile/reconfirm",
      {
        headers: { "x-correlation-id": "e2e-profile-with-disc" },
        data: { profileVersion: 1, acknowledgeUnchanged: true },
      },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as BffJsonBody;
    expect(body.data.ok).toBe(true);
    expect(body.data.reasonCodeCleared).toBeNull();
    expect(body.data.managedExecutionStatusAfter).toBe("paused_by_system");
  });
});

test.describe("Profile reactivation — Signal boundary + forbidden language", () => {
  test("Signal user sees no Managed profile reactivation controls anywhere", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("profile-react-page")).toHaveAttribute(
      "data-mode",
      "signal",
      { timeout: 30_000 },
    );
    await expect(
      page.getByTestId("profile-react-not-applicable"),
    ).toBeVisible();
    // C2a: the not-applicable panel routes home, never into an Automation
    // surface (which no longer exists).
    await expect(page.getByTestId("profile-react-back-home")).toHaveAttribute(
      "href",
      "/us/app/home",
    );
  });

  test("No per-trade Accept or admin language appears on the profile reactivation flow", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.staleProfilePaused.eligibilityCookie);
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
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
  });
});

test.describe("Profile reactivation — direct API fail-closed cases", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.staleProfilePaused.eligibilityCookie);
  });

  test("Missing version → 400 bad_request", async ({ page }) => {
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
    const res = await postSameOrigin(
      page,
      "/api/v1/investor/profile/reconfirm",
      {
        headers: { "x-correlation-id": "e2e-profile-missing-version" },
        data: { acknowledgeUnchanged: true },
      },
    );
    expect(res.status()).toBe(400);
  });

  test("Mismatched profile version → 409 profile_version_mismatch", async ({
    page,
  }) => {
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
    const res = await postSameOrigin(
      page,
      "/api/v1/investor/profile/reconfirm",
      {
        headers: { "x-correlation-id": "e2e-profile-mismatch" },
        data: { profileVersion: 9999, acknowledgeUnchanged: true },
      },
    );
    expect(res.status()).toBe(409);
    const body = (await res.json()) as BffJsonBody;
    expect(body.data.reason).toBe("profile_version_mismatch");
  });

  test("Signal user (no active policy) → 412 no_active_policy", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
    const res = await postSameOrigin(
      page,
      "/api/v1/investor/profile/reconfirm",
      {
        headers: { "x-correlation-id": "e2e-profile-no-policy" },
        data: { profileVersion: 1, acknowledgeUnchanged: true },
      },
    );
    expect(res.status()).toBe(412);
    const body = (await res.json()) as BffJsonBody;
    // Signal user has no profile-snapshot seeded either, so no_profile fires
    // first — either is a legitimate fail-closed outcome.
    expect(["no_profile", "no_active_policy"]).toContain(body.data.reason);
  });
});
