/**
 * C2a — structural Signal-surface proofs.
 *
 * These assert ABSENCE, not refusal: the September boundary is that Managed
 * execution capabilities do not exist in the artifact, with the C1a-1
 * default-deny policy remaining as defence in depth behind them. Every proof
 * here is stage-independent (a deleted route is 404 at any REFI_RELEASE_STAGE),
 * so this spec runs in the main lane.
 *
 * When C1a-1 landed, its signal-lane tests proved these same capabilities were
 * REFUSED (403). C2a supersedes refusal with absence, and those tests convert
 * to the 404/405/400 proofs below — recorded so nobody reads the smoke lane's
 * shrinkage as lost coverage.
 */
import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { postSameOrigin } from "./api";

test.describe("C2a — removed Managed API surfaces answer 404", () => {
  test.beforeEach(async ({ context }) => {
    // Authenticated as the Managed-tier user, deliberately: absence must hold
    // even for the user the capability once belonged to.
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.managed.eligibilityCookie),
    );
  });

  test("Managed execution routes are structurally absent", async ({ page }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    for (const path of [
      "/api/v1/investor/managed/pause",
      "/api/v1/investor/managed/resume",
      "/api/v1/investor/execution-policy/activate",
    ]) {
      const res = await postSameOrigin(page, path, { data: {} });
      expect(res.status(), `${path} must be gone, not gated`).toBe(404);
    }
    for (const path of [
      "/api/v1/investor/managed/state",
      "/api/v1/investor/execution-policy",
      "/api/v1/investor/execution-policy/draft",
      "/api/v1/investor/orders",
      "/api/v1/investor/orders/any-id/lineage",
    ]) {
      const res = await page.request.get(path);
      expect(res.status(), `${path} must be gone, not gated`).toBe(404);
    }
  });

  test("subscription-mode is read-only: GET works, POST is 405", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const get = await page.request.get("/api/v1/investor/subscription-mode");
    expect(get.status()).toBe(200);
    const post = await postSameOrigin(
      page,
      "/api/v1/investor/subscription-mode",
      { data: { mode: "managed" } },
    );
    // Method removed, not gated: the framework answers 405 because no POST
    // handler exists on the mixed route's retained read.
    expect(post.status()).toBe(405);
  });

  test("Managed exception categories are schema-unrepresentable (400), Signal categories reach the handler", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    for (const resolution of [
      "approve_exception",
      "reject_exception",
      "pause_managed",
    ]) {
      const res = await postSameOrigin(
        page,
        "/api/v1/investor/exceptions/any-id/resolve",
        { data: { resolution, clientAttestation: true } },
      );
      expect(res.status(), `${resolution} must fail shape validation`).toBe(
        400,
      );
    }
    // Positive control: a Signal category passes the schema and the stage
    // policy, reaching the existence lookup — 404 for an unknown id proves the
    // request got PAST both gates rather than being refused by them.
    const ok = await postSameOrigin(
      page,
      "/api/v1/investor/exceptions/no-such-exception/resolve",
      { data: { resolution: "update_profile", clientAttestation: true } },
    );
    expect(ok.status()).toBe(404);
  });
});

test.describe("C2a — removed pages and relocated Signal IA", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.managed.eligibilityCookie),
    );
  });

  test("Automation pages and old advisory paths are gone; new Signal paths serve", async ({
    page,
  }) => {
    for (const path of [
      "/us/app/settings/automation",
      "/us/app/settings/automation/activate",
      "/us/app/settings/automation/profile",
      "/us/app/settings/automation/disclosures",
    ]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(
        res?.status(),
        `${path} must 404 — moved or removed, no redirects`,
      ).toBe(404);
    }
    for (const [path, testId] of [
      ["/us/app/profile", "profile-react-page"],
      ["/us/app/documents/reacknowledge", "reack-page"],
    ] as const) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} must serve`).toBe(200);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
    }
  });

  test("No Managed navigation or Automation CTA renders anywhere reachable", async ({
    page,
  }) => {
    for (const path of [
      "/us/app/home",
      "/us/app/exceptions",
      "/us/app/profile",
      "/us/app/documents/reacknowledge",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(
        page.locator('a[href*="settings/automation"]'),
        `${path} must not link into the removed Automation surface`,
      ).toHaveCount(0);
      await expect(page.getByText("Automation Center")).toHaveCount(0);
    }
  });
});
