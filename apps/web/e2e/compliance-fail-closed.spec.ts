// E2E coverage for the fail-closed compliance gate (MIG-P2.5-15).
//
// SUITE SUSPENDED ON 2026-05-27 by the Phase 2.5 rebase onto post-Surface-7
// `origin/main`. Background:
//
//   - The original gate was the disabled-Submit state of an "Approve for
//     execution" Button rendered by apps/web/app/us/app/_components/
//     CompliancePreview.tsx (MIG-P2.5-15).
//   - That component and its button were removed in Phase 2.5R-19 (the WIP
//     branch's own decision: "Managed mode has no per-rec Approve button;
//     investor accept = ExecutionPolicy activation + per-exception
//     approval in Exception Review only", per app-copy.ts:210). The button
//     no longer exists in any code path.
//   - Phase 2 Surface 1 + Surface 7 took the same boundary further: the
//     tripwire (scripts/tripwire-investor-boundary.ts) now blocks the
//     "approve for execution" label entirely.
//
// The compliance fail-closed *behavior* is now structural rather than
// gate-state-driven: there IS no per-trade Approve button to disable, so
// "Submit only enables when verdict is ALLOW" collapses to "Submit never
// renders". The Surface-7 Exception Review queue covers the
// fail-closed-with-user-action path.
//
// These cases are suspended (skipped) until a replacement test-id-stable
// affordance lands. They are intentionally NOT deleted so the suite acts
// as a checklist for the Phase 2.5R-19 follow-up.
//
// We exercise this via `?scenario=` query params (MIG-P2.5-03) which drive
// the MSW handler to deterministic verdict shapes. URL form is preferred
// over the cookie switcher so each test is fully self-contained.

import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.skip(
  true,
  "Suspended pending Phase 2.5R-19 replacement gate. The Submit/Approve " +
    "button this suite bound to was removed when Managed mode dropped the " +
    "per-rec Approve affordance. Re-enable once a new test-id-stable " +
    "compliance gate ships.",
);

const authCookies = [
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

// rec_m_001 (QQQ buy) and rec_m_005 (TSLA review) both ship a deep
// RecommendationDetail with the Submit gate. Use rec_m_001 for the
// happy-path scenarios; the page renders the same gate regardless of
// which rec the user lands on.
const DETAIL_URL = "/us/app/recommendations/rec_m_001";

async function gotoWithScenario(page: Page, scenarioId: string) {
  await page.context().addCookies(authCookies);
  await page.goto(`${DETAIL_URL}?scenario=${encodeURIComponent(scenarioId)}`);
}

function approveButton(page: Page) {
  // The Submit/Approve button is the only primary `Button` in the gate
  // section. We match by accessible role + name pattern so changes to the
  // exact label don't break the test.
  return page.getByRole("button", { name: /approve for execution/i });
}

test.describe("Compliance fail-closed gate", () => {
  test("ALLOW enables Submit", async ({ page }) => {
    await gotoWithScenario(page, "ALLOW");
    await expect(approveButton(page)).toBeVisible({ timeout: 8_000 });
    await expect(approveButton(page)).toBeEnabled({ timeout: 8_000 });
  });

  test("ALLOW_CACHED enables Submit + shows cache source", async ({ page }) => {
    await gotoWithScenario(page, "ALLOW_CACHED");
    await expect(approveButton(page)).toBeEnabled({ timeout: 8_000 });
    // The dev panel surfaces source; case-insensitive match keeps the test
    // resilient to layout changes.
    await expect(page.getByText(/cache/i).first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test("REVIEW_CONCENTRATION disables Submit", async ({ page }) => {
    await gotoWithScenario(page, "REVIEW_CONCENTRATION");
    await expect(approveButton(page)).toBeVisible({ timeout: 8_000 });
    await expect(approveButton(page)).toBeDisabled({ timeout: 8_000 });
    await expect(page.getByText(/REVIEW_CONCENTRATION/i)).toBeVisible();
  });

  test("REVIEW_TAX_IMPACT disables Submit", async ({ page }) => {
    await gotoWithScenario(page, "REVIEW_TAX_IMPACT");
    await expect(approveButton(page)).toBeDisabled({ timeout: 8_000 });
    await expect(page.getByText(/REVIEW_TAX_IMPACT/i)).toBeVisible();
  });

  test("DENY_POSITION_SIZE disables Submit", async ({ page }) => {
    await gotoWithScenario(page, "DENY_POSITION_SIZE");
    await expect(approveButton(page)).toBeDisabled({ timeout: 8_000 });
    await expect(page.getByText(/POSITION_SIZE_LIMIT/i)).toBeVisible();
  });

  test("DENY_DISCLOSURE_REQUIRED disables Submit", async ({ page }) => {
    await gotoWithScenario(page, "DENY_DISCLOSURE_REQUIRED");
    await expect(approveButton(page)).toBeDisabled({ timeout: 8_000 });
    await expect(page.getByText(/DISCLOSURE_REQUIRED/i)).toBeVisible();
  });

  test("DENY_STALE_BROKER_DATA disables Submit + shows broker banner", async ({
    page,
  }) => {
    await gotoWithScenario(page, "DENY_STALE_BROKER_DATA");
    await expect(approveButton(page)).toBeDisabled({ timeout: 8_000 });
    await expect(page.getByText(/STALE_PRICES/i)).toBeVisible();
    // The same scenario flips BrokerConnection.data_stale so the broker
    // banner appears anywhere it's rendered (home / portfolio).
    await page.goto(`/us/app/portfolio?scenario=DENY_STALE_BROKER_DATA`);
    await expect(page.getByText(/data is stale/i)).toBeVisible({
      timeout: 8_000,
    });
  });

  test("DENY_COMPLIANCE_UNAVAILABLE disables Submit", async ({ page }) => {
    await gotoWithScenario(page, "DENY_COMPLIANCE_UNAVAILABLE");
    await expect(approveButton(page)).toBeDisabled({ timeout: 8_000 });
    await expect(page.getByText(/COMPLIANCE_UNAVAILABLE/i)).toBeVisible();
  });

  test("REVIEW_ACE_UNAVAILABLE (Daniel-named code) disables Submit", async ({
    page,
  }) => {
    await gotoWithScenario(page, "REVIEW_ACE_UNAVAILABLE");
    // UI escalates REVIEW from UNAVAILABLE to DENY for investor protection,
    // but in the named-scenario case the verdict is REVIEW and the UI
    // still disables Submit because canSubmit binds to ALLOW only.
    await expect(approveButton(page)).toBeDisabled({ timeout: 8_000 });
    await expect(page.getByText(/ACE_UNAVAILABLE/i)).toBeVisible();
  });

  test("DENY_INCOMPLETE_KYC (Daniel-named code) disables Submit", async ({
    page,
  }) => {
    await gotoWithScenario(page, "DENY_INCOMPLETE_KYC");
    await expect(approveButton(page)).toBeDisabled({ timeout: 8_000 });
    await expect(page.getByText(/INCOMPLETE_KYC/i)).toBeVisible();
  });

  test("default (no scenario) enables Submit on small qty", async ({
    page,
  }) => {
    // No `?scenario=` — handler falls back to qty>1000 heuristic; qty 1
    // returns ALLOW.
    await page.context().addCookies(authCookies);
    await page.goto(DETAIL_URL);
    await expect(approveButton(page)).toBeEnabled({ timeout: 8_000 });
  });
});
