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
      "/api/v1/investor/profile/reconfirm",
      "/api/v1/investor/disclosures/reacknowledge",
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
      // Reclassified in the C2a correction: profile reactivation and
      // disclosure re-acknowledgement are ExecutionPolicy/MES workflows, not
      // Signal remediation. Parked with the Managed product.
      "/api/v1/investor/profile/reactivation",
      "/api/v1/investor/disclosures/reacknowledgement",
    ]) {
      const res = await page.request.get(path);
      expect(res.status(), `${path} must be gone, not gated`).toBe(404);
    }
  });

  test("the investor-facing mode surface is structurally absent", async ({
    page,
  }) => {
    // C2a correction: after the last UI consumer (ModeStatusStrip, mode
    // branches, the upgrade card) was removed, GET /subscription-mode had no
    // legitimate September consumer left — so the whole route is gone, not
    // retained reflexively as a read.
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const get = await page.request.get("/api/v1/investor/subscription-mode");
    expect(get.status()).toBe(404);
    const post = await postSameOrigin(
      page,
      "/api/v1/investor/subscription-mode",
      { data: { mode: "managed" } },
    );
    expect(post.status()).toBe(404);
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

  test("Automation and reactivation pages are gone; the REAL Signal flows serve", async ({
    page,
  }) => {
    for (const path of [
      "/us/app/settings/automation",
      "/us/app/settings/automation/activate",
      "/us/app/settings/automation/profile",
      "/us/app/settings/automation/disclosures",
      // C2a correction: these two were briefly presented as "moved Signal
      // IA". They were the Managed reactivation workflow under new URLs and
      // are parked with the Managed product, not relocated.
      "/us/app/profile",
      "/us/app/documents/reacknowledge",
    ]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} must 404 — removed, no redirects`).toBe(
        404,
      );
    }
    // The genuine Signal surfaces remediation routes to:
    for (const [path, marker] of [
      ["/us/onboarding/profile", "heading"],
      ["/us/app/documents", "heading"],
    ] as const) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} must serve`).toBe(200);
      await expect(page.getByRole(marker, { level: 1 })).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("No Managed navigation or Automation CTA renders anywhere reachable", async ({
    page,
  }) => {
    for (const path of [
      "/us/app/home",
      "/us/app/exceptions",
      "/us/app/documents",
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

test.describe("C2a — the product is Signal-only for the SIGNAL user", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
  });

  test("Home renders no mode selector, status strip, or Managed promotion", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 30_000,
    });
    for (const text of [
      "ReFi Managed",
      "Activate ReFi Managed",
      "Choose how ReFi works for you",
      "You are on ReFi Signal",
    ]) {
      await expect(page.getByText(text)).toHaveCount(0);
    }
  });

  test("Recommendations render Signal-only for the Signal user", async ({
    page,
  }) => {
    await page.goto("/us/app/recommendations", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("recommendations-list")).toBeVisible({
      timeout: 30_000,
    });
    for (const id of [
      "signal-upgrade-cta",
      "managed-banner",
      "recommendations-mode-badge",
      "managed-status-row",
      "managed-exception-cta",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByText("Activate ReFi Managed")).toHaveCount(0);
  });
});
