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

test.describe("Exception Review — Managed user", () => {
  test.beforeEach(async ({ context }) => {
    await seedCookies(context, E2E_USERS.exceptionsUser.eligibilityCookie);
  });

  test("Queue renders mode badge, four seeded exceptions, and the explainer/boundary banner", async ({
    page,
  }) => {
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("exceptions-page")).toHaveAttribute(
      "data-mode",
      "managed",
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

  test("update_profile exception exposes a route CTA to the profile review page (no inline mutation)", async ({
    page,
  }) => {
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    const route = page.getByTestId(
      "exception-card-exc-profile-stale-route-update_profile",
    );
    await expect(route).toBeVisible({ timeout: 30_000 });
    await expect(route).toHaveAttribute("href", "/us/app/profile");
    await route.click();
    await expect(page).toHaveURL(/\/us\/app\/profile$/);
  });

  test("acknowledge_disclosure exception exposes a route CTA to the disclosure review page", async ({
    page,
  }) => {
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    const route = page.getByTestId(
      "exception-card-exc-disclosure-expired-route-acknowledge_disclosure",
    );
    await expect(route).toBeVisible({ timeout: 30_000 });
    await expect(route).toHaveAttribute(
      "href",
      "/us/app/documents/reacknowledge",
    );
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

  test("A Signal remediation closes the exception and the card moves to Resolved", async ({
    page,
  }) => {
    // C2a: no card renders an inline mutation button any more — dismiss
    // (reject_exception) and pause_managed were the only Button-rendered
    // resolutions, and both are Managed-era. Signal categories render as
    // ROUTE CTAs into the remediation surfaces; the resolution itself is
    // recorded through the resolve endpoint. This test drives that endpoint
    // directly and asserts the queue reflects it — the UI truth is "cards
    // link to remediation; they do not mutate inline".
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("exception-card-exc-broker-stale"),
    ).toBeVisible({ timeout: 30_000 });
    const res = await postSameOrigin(
      page,
      "/api/v1/investor/exceptions/exc-broker-stale/resolve",
      {
        headers: { "x-correlation-id": "e2e-exc-reconnect" },
        data: { resolution: "reconnect_broker", clientAttestation: true },
      },
    );
    expect(res.status()).toBe(200);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("exception-card-exc-broker-stale"),
    ).toHaveCount(0, { timeout: 15_000 });
    await page.getByTestId("exceptions-filter-resolved").click();
    await expect(
      page.getByTestId("exception-card-exc-broker-stale"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId("exception-card-exc-broker-stale-resolved-tag"),
    ).toContainText("Resolved by broker reconnect");
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

  test("Signal remediations close every closable exception; only the Managed-era item remains open", async ({
    page,
  }) => {
    // C2a: approve_exception is no longer representable, so exceptions close
    // only through their Signal remediation categories. exc-out-of-policy has
    // none — it remains open by design, which is the September truth this
    // suite must describe rather than paper over.
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    const closures: ReadonlyArray<readonly [string, string]> = [
      ["exc-profile-stale", "update_profile"],
      ["exc-disclosure-expired", "acknowledge_disclosure"],
    ];
    for (const [id, resolution] of closures) {
      const res = await postSameOrigin(
        page,
        `/api/v1/investor/exceptions/${id}/resolve`,
        {
          headers: { "x-correlation-id": `e2e-exc-close-${id}` },
          data: { resolution, clientAttestation: true },
        },
      );
      expect(res.status(), `${id} via ${resolution}`).toBe(200);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("exception-card-exc-out-of-policy"),
    ).toBeVisible({ timeout: 30_000 });
    for (const id of [
      "exception-card-exc-profile-stale",
      "exception-card-exc-disclosure-expired",
      "exception-card-exc-broker-stale",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });
});

test.describe("Exception Review — Signal boundary + forbidden language", () => {
  test("Signal user sees not-applicable panel and no resolution controls", async ({
    page,
    context,
  }) => {
    await seedCookies(context, E2E_USERS.signal.eligibilityCookie);
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("exceptions-page")).toHaveAttribute(
      "data-mode",
      "signal",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("exceptions-not-applicable")).toBeVisible();
    await expect(page.getByTestId("exceptions-list")).toHaveCount(0);
    await expect(page.getByTestId("exceptions-filter")).toHaveCount(0);
    await expect(
      page.getByTestId("exceptions-back-to-recommendations"),
    ).toBeVisible();
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
