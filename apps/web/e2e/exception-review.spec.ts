import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { postSameOrigin } from "./api";

// Surface 7 — Exception Review.
// Exception Review resolves eligibility blockers. It does not approve trades,
// override guardrails, submit broker orders, or expose the legacy backend
// resolution identifiers to the investor.

test.setTimeout(180_000);

async function seedCookies(
  context: BrowserContext,
  eligibilityValue: string,
): Promise<void> {
  await context.addCookies(await e2eAuthCookies(eligibilityValue));
}

// The resolution writes mutate the shared prototype store; keep deterministic.
test.describe.configure({ mode: "serial" });

test.describe("Exception Review — remediation queue (seeded exceptions user)", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.exceptionsUser.eligibilityCookie);
  });

  test("Queue renders four seeded exceptions and the explainer/boundary banner", async ({
    page,
  }) => {
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("exceptions-page")).toHaveAttribute(
      "data-mode",
      "signal",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("exceptions-explainer")).toBeVisible();
    await expect(page.getByTestId("exceptions-boundary-banner")).toBeVisible();
    for (const id of [
      "exc-profile-stale",
      "exc-disclosure-expired",
      "exc-broker-stale",
      "exc-out-of-policy",
    ]) {
      await expect(page.getByTestId(`exception-card-${id}`)).toBeVisible();
    }
  });

  test("Open card shows blocker kind, severity, why, required actions; uses no Accept/Approve/Execute wording", async ({
    page,
  }) => {
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    const card = page.getByTestId("exception-card-exc-out-of-policy");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toHaveAttribute("data-kind", "out_of_policy_intent");
    await expect(card).toHaveAttribute("data-status", "open");
    await expect(card).toHaveAttribute("data-severity", "blocked");
    await expect(
      page.getByTestId("exception-card-exc-out-of-policy-severity"),
    ).toHaveText("blocked");
    await expect(
      page.getByTestId("exception-card-exc-out-of-policy-why"),
    ).toBeVisible();
    await expect(
      page.getByTestId("exception-card-exc-out-of-policy-intent-ref"),
    ).toContainText("rec-managed-msft");

    for (const phrase of [
      "Accept Recommendation",
      "Approve Trade",
      "Approve Recommendation",
      "Accept and Execute",
      "Approve for Execution",
      "approve_exception",
      "reject_exception",
      "execute exception",
      "override guardrail",
      "override risk",
      "investor accept",
      "investor-accept",
    ]) {
      await expect(page.getByText(phrase, { exact: false })).toHaveCount(0);
    }
  });

  test("update_profile exception routes to the REAL advisory-profile editor (no inline mutation)", async ({
    page,
  }) => {
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    const route = page.getByTestId(
      "exception-card-exc-profile-stale-route-update_profile",
    );
    await expect(route).toBeVisible({ timeout: 30_000 });
    await expect(route).toHaveAttribute(
      "href",
      "/us/onboarding/investor-profile",
    );
    await route.click();
    await expect(page).toHaveURL(/\/us\/onboarding\/investor-profile$/);
  });

  test("acknowledge_disclosure exception routes to the REAL Documents surface", async ({
    page,
  }) => {
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    const route = page.getByTestId(
      "exception-card-exc-disclosure-expired-route-acknowledge_disclosure",
    );
    await expect(route).toBeVisible({ timeout: 30_000 });
    await expect(route).toHaveAttribute("href", "/us/app/documents");
  });

  test("reconnect_broker exception exposes a reconnect CTA and never renders an order-submit affordance", async ({
    page,
  }) => {
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    const route = page.getByTestId(
      "exception-card-exc-broker-stale-route-reconnect_broker",
    );
    await expect(route).toBeVisible({ timeout: 30_000 });
    for (const id of [
      "signal-place-order-button",
      "signal-order-entry",
      "managed-place-order-button",
      "order-submit-button",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("The out-of-policy exception offers NO investor operation, and Managed categories are schema-unrepresentable", async ({
    page,
  }) => {
    // C2a structural truth: an out-of-policy exception has no Signal
    // remediation, so the card is informational — no mutation button of any
    // kind renders on it — and a direct POST with a Managed-era category is
    // rejected at the request schema (400), not merely by the stage policy.
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("exception-card-exc-out-of-policy"),
    ).toBeVisible({ timeout: 30_000 });
    for (const res of [
      "pause_managed",
      "dismiss_exception",
      "resolve_exception",
    ]) {
      await expect(
        page.getByTestId(`exception-card-exc-out-of-policy-resolve-${res}`),
      ).toHaveCount(0);
    }

    const direct = await postSameOrigin(
      page,
      "/api/v1/investor/exceptions/exc-out-of-policy/resolve",
      {
        headers: { "x-correlation-id": "e2e-exc-managed-category" },
        data: { resolution: "pause_managed", clientAttestation: true },
      },
    );
    expect(direct.status()).toBe(400);
  });

  test("Remediated items remain OPEN — no closure path exists yet, and the suite says so", async ({
    page,
  }) => {
    // Closure truth (C2a correction): route CTAs take the investor to
    // remediation; nothing calls the resolve endpoint from this page, and the
    // remediation-completion contract that would observe a completed
    // remediation and close the exception is an open backend item (ledger).
    // A direct POST is a backend capability, not an implemented product flow —
    // so this suite no longer closes items to manufacture an empty queue.
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    for (const id of [
      "exception-card-exc-profile-stale",
      "exception-card-exc-disclosure-expired",
      "exception-card-exc-broker-stale",
      "exception-card-exc-out-of-policy",
    ]) {
      await expect(page.getByTestId(id)).toBeVisible({ timeout: 30_000 });
    }
  });
});

test.describe("Exception Review — Signal boundary + forbidden language", () => {
  test("The queue is USABLE by a Signal user — rendered, empty state, no gate", async ({
    page,
    context,
  }) => {
    // C2a correction: the earlier artifact told Signal users Exception Review
    // was "Managed mode only" while the API reserved the remediation
    // categories FOR Signal. The gate is gone; a Signal user with no seeded
    // exceptions gets a working queue with a clean empty state.
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("exceptions-page")).toHaveAttribute(
      "data-mode",
      "signal",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("exceptions-not-applicable")).toHaveCount(0);
    await expect(page.getByTestId("exceptions-empty-open")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("No forbidden language or testids anywhere on the exceptions surface (Managed view)", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.exceptionsUser.eligibilityCookie);
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("exceptions-page")).toBeVisible({
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
      "managed-place-order-button",
      "order-submit-button",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    for (const phrase of [
      "Accept Recommendation",
      "Approve Trade",
      "Approve Recommendation",
      "Accept and Execute",
      "Approve for Execution",
      "Manual Rebalance",
      "accept_trade",
      "approve_exception",
      "reject_exception",
      "execute exception",
      "override guardrail",
      "override risk",
      "investor accept",
      "staff review",
      "admin action",
      "terminal reason",
      "autopilot",
      "compliance adapter",
    ]) {
      await expect(page.getByText(phrase, { exact: false })).toHaveCount(0);
    }
  });
});
