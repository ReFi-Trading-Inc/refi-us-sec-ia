// Structural fail-closed compliance — Phase 2.5 backlog §A replacement.
//
// Replaces apps/web/e2e/compliance-fail-closed.spec.ts. The original suite
// bound to a disabled-Submit state on a per-rec "Approve for execution"
// button rendered by the removed CompliancePreview component. Phase 2.5R-19
// removed the button; Phase 2 Surface 1 + Surface 7 took the boundary
// further (tripwire blocks the label entirely). The fail-closed behavior
// is now STRUCTURAL: there is no per-trade Approve / Submit / Accept button
// to disable. This spec asserts that absence directly using stable
// data-testid selectors and outbound-request interception.

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

async function seedEligibilityCookies(
  context: BrowserContext,
  eligibilityValue: string,
): Promise<void> {
  // Clear before setting so serial-mode tests don't inherit a stale
  // us_eligibility_v1 from a previous setPersona call.
  await context.clearCookies();
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

const baseAuth = [
  {
    name: "us_eligibility_v1",
    value: "mock-eligibility-token",
    domain: "localhost",
    path: "/us",
  },
  {
    name: "us_session_v1",
    value: "mock-session-token",
    domain: "localhost",
    path: "/us",
  },
];

async function setPersona(
  page: Page,
  persona: "maya" | "sarah" | "david",
): Promise<void> {
  // Clear before setting so serial-mode tests don't accumulate stale cookies
  // (e.g. a prior test's eligibility value overlapping a new persona).
  await page.context().clearCookies();
  await page.context().addCookies([
    ...baseAuth,
    {
      name: "refi_persona_v1",
      value: persona,
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.context().setExtraHTTPHeaders({ "x-refi-persona": persona });
}

// Per-trade affordances that must NEVER appear on an investor recommendation
// surface in Managed or Signal mode. Tripwire catches these at source level;
// these assertions catch them at render time.
const FORBIDDEN_TESTIDS = [
  "signal-place-order-button",
  "signal-order-entry",
  "managed-place-order-button",
  "order-submit-button",
  "investor-accept",
  "accept-trade-button",
  "approve-trade-button",
  "approve-recommendation-button",
  "approve-for-execution-button",
  "submit-order-button",
] as const;

const FORBIDDEN_COPY = [
  "Accept Recommendation",
  "Accept Trade",
  "Approve Trade",
  "Approve Recommendation",
  "Accept and Execute",
  "Approve for Execution",
  "Manual Rebalance",
  "accept_trade",
  "investor-accept",
  "approve_exception",
  "reject_exception",
  "execute exception",
  "override guardrail",
  "override risk",
  "investor accept",
] as const;

async function assertNoPerTradeAffordances(page: Page): Promise<void> {
  for (const id of FORBIDDEN_TESTIDS) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  for (const phrase of FORBIDDEN_COPY) {
    await expect(page.getByText(phrase, { exact: false })).toHaveCount(0);
  }
}

// Serial mode: Next.js dev compiles each new route on first hit; running
// these in parallel against a single dev server caused intermittent 404s on
// /us/app/recommendations/[id] during the warm-up. Serial avoids that race.
test.describe.configure({ mode: "serial" });

test.describe("§A Structural fail-closed compliance", () => {
  test("Managed recommendation detail never renders a per-trade affordance (ALLOW verdict)", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await page.goto("/us/app/recommendations/rec_m_001", {
      waitUntil: "domcontentloaded",
    });
    const root = page.getByTestId("recommendation-detail-page");
    await expect(root).toBeVisible({ timeout: 30_000 });
    await expect(root).toHaveAttribute("data-tier", "managed");
    await expect(root).toHaveAttribute("data-eligibility", "allow");
    await assertNoPerTradeAffordances(page);
  });

  test("Managed recommendation detail never renders a per-trade affordance (REVIEW verdict)", async ({
    page,
  }) => {
    // Maya rec_m_005 is the single-name momentum (TSLA) recommendation in
    // REVIEW verdict; she has no pending exception against it, so the page
    // renders the managed-non-executing-state branch.
    await setPersona(page, "maya");
    await page.goto("/us/app/recommendations/rec_m_005", {
      waitUntil: "domcontentloaded",
    });
    const root = page.getByTestId("recommendation-detail-page");
    await expect(root).toBeVisible({ timeout: 30_000 });
    await expect(root).toHaveAttribute("data-tier", "managed");
    await expect(root).toHaveAttribute("data-eligibility", "review");
    await assertNoPerTradeAffordances(page);
  });

  test("Signal recommendation surface never renders broker order submission", async ({
    page,
  }) => {
    // David is Signal-tier with no seeded recommendations. The list page
    // still renders (it's mode-aware) and is the right surface to assert
    // the Signal-mode boundary: only advisory affordances, never broker
    // order submission.
    await setPersona(page, "david");
    await page.goto("/us/app/recommendations", {
      waitUntil: "domcontentloaded",
    });
    await assertNoPerTradeAffordances(page);
  });

  test("Review-required recommendation routes the investor to Exception Review only", async ({
    page,
    context,
  }) => {
    // Surface 7's exception-review queue is the canonical Exception Review
    // surface. Any "review-required" recommendation must funnel through
    // /us/app/exceptions. We assert that surface is reachable AND that its
    // resolution CTAs never expose a per-trade Accept path.
    await seedEligibilityCookies(
      context,
      E2E_USERS.exceptionsUser.eligibilityCookie,
    );
    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("exceptions-page")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("exceptions-page")).toHaveAttribute(
      "data-mode",
      "managed",
    );
    // Resolution affordances exist and route to eligibility surfaces only.
    await expect(
      page.getByTestId("exception-card-exc-profile-stale-route-update_profile"),
    ).toHaveAttribute("href", "/us/app/settings/automation/profile");
    await expect(
      page.getByTestId(
        "exception-card-exc-disclosure-expired-route-acknowledge_disclosure",
      ),
    ).toHaveAttribute("href", "/us/app/settings/automation/disclosures");
    // And no per-trade affordances exist anywhere on this surface.
    await assertNoPerTradeAffordances(page);
  });

  test("Exception Review resolution never issues a broker-order request", async ({
    page,
    context,
  }) => {
    await seedEligibilityCookies(
      context,
      E2E_USERS.exceptionsUser.eligibilityCookie,
    );

    const brokerOrderPaths = [
      "/v1/orders",
      "/orders",
      "/api/v1/orders",
      "/api/v1/investor/orders",
    ];
    const offendingRequests: string[] = [];
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (req.method() === "GET") return;
      for (const path of brokerOrderPaths) {
        if (u.pathname === path || u.pathname.endsWith(path)) {
          offendingRequests.push(`${req.method()} ${u.pathname}`);
        }
      }
    });

    await page.goto("/us/app/exceptions", { waitUntil: "domcontentloaded" });
    const dismiss = page.getByTestId(
      "exception-card-exc-broker-stale-resolve-dismiss_exception",
    );
    await expect(dismiss).toBeVisible({ timeout: 30_000 });
    await dismiss.click();
    await expect(
      page.getByTestId("exception-card-exc-broker-stale"),
    ).toHaveCount(0, { timeout: 15_000 });

    expect(offendingRequests).toEqual([]);
  });

  test("Investor recommendation source modules do not import useSubmitOrder", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // Playwright runs with cwd=apps/web; resolve relative to this spec file
    // so the source path is robust to cwd changes.
    const here = dirname(fileURLToPath(import.meta.url));
    for (const rel of [
      "../app/us/app/recommendations/[id]/page.tsx",
      "../app/us/app/recommendations/page.tsx",
    ]) {
      const abs = resolve(here, rel);
      const src = readFileSync(abs, "utf8");
      expect(src).not.toContain("useSubmitOrder");
    }
  });
});
