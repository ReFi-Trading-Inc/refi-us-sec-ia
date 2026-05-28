// Compliance verdict visibility — Phase 2.5 backlog §B replacement.
//
// Replaces the deleted CompliancePreview-based assertions that bound to
// a per-rec "Approve for execution" Submit button. The new assertions read
// the additive `data-eligibility` and `data-tier` attributes the detail
// page now carries on its root and on the eligibility card. The boundary
// claim is reinforced from §A: NO verdict state may render a per-trade
// Accept / Submit / Approve affordance.

import { test, expect, type Page } from "@playwright/test";

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

// Per-trade affordances — re-asserted on every verdict state. Verdict
// visibility is interesting; per-trade affordance ABSENCE is the load-bearing
// invariant. Both must hold.
const FORBIDDEN_PER_TRADE_TESTIDS = [
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

async function assertNoPerTradeAffordances(page: Page): Promise<void> {
  for (const id of FORBIDDEN_PER_TRADE_TESTIDS) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
}

// Serial mode: Next.js dev compiles each new route on first hit; serial
// runs against a single dev server avoid the cross-test 404 race.
test.describe.configure({ mode: "serial" });

// Some tests need extra time because Next.js dev compiles the dynamic
// /us/app/recommendations/[id] route on first hit.
test.setTimeout(90_000);

async function warmupAndGoto(page: Page, path: string): Promise<void> {
  // First navigation can return 404 from Next dev while it compiles the
  // dynamic segment. Retry up to 3 times before failing the test outright.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    if (response && response.status() === 200) return;
    // 404 / 500 — wait a beat and try again.
    await page.waitForTimeout(2_000);
  }
  // Last attempt: let the test assertion fail naturally if still 404.
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test.describe("§B Compliance verdict visibility", () => {
  test("Recommendation detail surfaces eligibility posture on the root", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await warmupAndGoto(page, "/us/app/recommendations/rec_m_001");
    const root = page.getByTestId("recommendation-detail-page");
    await expect(root).toBeVisible({ timeout: 30_000 });
    const value = await root.getAttribute("data-eligibility");
    expect(value).not.toBeNull();
    expect(["allow", "review", "deny", "unavailable", "loading"]).toContain(
      value,
    );
    // The eligibility card mirrors the same attribute.
    const card = page.getByTestId("recommendation-eligibility");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-eligibility", value!);
  });

  test("ALLOW state in Managed mode shows the managed non-executing state, never a per-trade button", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await warmupAndGoto(page, "/us/app/recommendations/rec_m_001");
    const root = page.getByTestId("recommendation-detail-page");
    await expect(root).toHaveAttribute("data-tier", "managed", {
      timeout: 30_000,
    });
    await expect(root).toHaveAttribute("data-eligibility", "allow");
    // The managed-non-executing-state card renders for Managed-tier without
    // a pending exception. This is the surface that PROVES Managed mode
    // does not require per-trade approval.
    await expect(page.getByTestId("managed-non-executing-state")).toBeVisible();
    await assertNoPerTradeAffordances(page);
  });

  test("REVIEW state in Managed mode renders non-executing UI and never a per-trade button", async ({
    page,
  }) => {
    // Maya rec_m_005 — TSLA single-name momentum, REVIEW verdict, no pending
    // exception against Maya. The detail page renders the managed-non-
    // executing-state because Managed mode never accepts per-rec.
    await setPersona(page, "maya");
    await warmupAndGoto(page, "/us/app/recommendations/rec_m_005");
    const root = page.getByTestId("recommendation-detail-page");
    await expect(root).toHaveAttribute("data-tier", "managed", {
      timeout: 30_000,
    });
    await expect(root).toHaveAttribute("data-eligibility", "review");
    await expect(page.getByTestId("managed-non-executing-state")).toBeVisible();
    await assertNoPerTradeAffordances(page);
  });

  test("REVIEW + pending exception (Sarah rec_s_001) routes to Exception Review, never per-trade", async ({
    page,
  }) => {
    await setPersona(page, "sarah");
    await warmupAndGoto(page, "/us/app/recommendations/rec_s_001");
    const root = page.getByTestId("recommendation-detail-page");
    await expect(root).toBeVisible({ timeout: 30_000 });
    await expect(root).toHaveAttribute("data-eligibility", "review", {
      timeout: 30_000,
    });
    // Pending exception against Sarah → recommendation-exception-route card
    // points the investor at the Surface 7 queue.
    await expect(
      page.getByTestId("recommendation-exception-route"),
    ).toBeVisible();
    await assertNoPerTradeAffordances(page);
  });

  test("UNAVAILABLE state (missing detail) fails closed — no per-trade affordance, no order submission", async ({
    page,
  }) => {
    // Use a managed persona with a recommendation id that has NO seeded
    // detail. The page falls back to the "Recommendation not available."
    // banner. The boundary check is: even in the failed-load state, no
    // per-trade affordance leaks through.
    await setPersona(page, "maya");
    await warmupAndGoto(page, "/us/app/recommendations/does-not-exist");
    // The page may render either the recommendation-detail-page root with
    // data-eligibility="unavailable" or the StatusBanner-only "not
    // available" fallback. Both are acceptable; both must be free of
    // per-trade affordances.
    await assertNoPerTradeAffordances(page);
  });

  test("Signal-tier surface shows recommendation information only, never broker submission", async ({
    page,
  }) => {
    // David is Signal-tier. He has no seeded recommendations; the list
    // page is the right surface to assert that Signal mode never exposes
    // broker submission.
    await setPersona(page, "david");
    await page.goto("/us/app/recommendations", {
      waitUntil: "domcontentloaded",
    });
    await assertNoPerTradeAffordances(page);
  });
});
