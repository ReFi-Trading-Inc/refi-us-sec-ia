// Persona switching via `refi_persona_v1` cookie (MIG-P2.5-15 + MIG-P2.5-10).
//
// Verifies that the per-request persona resolver in MSW handlers + the
// dashboard cards downstream both honor the cookie. Uses raw cookies
// rather than the dropdown UI for determinism — the PersonaSwitcher UI is
// covered indirectly by every persona-specific assertion below.

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

async function setPersona(page: Page, persona: "maya" | "david" | "sarah") {
  await page.context().addCookies([
    ...baseAuth,
    {
      name: "refi_persona_v1",
      value: persona,
      domain: "localhost",
      path: "/",
    },
  ]);
}

test.describe("Persona switching", () => {
  // TODO(replacement-e2e-backlog): see docs/phase2-5-replacement-e2e-backlog.md §C
  //   replacement: apps/web/e2e/persona-switch-stable.spec.ts case 1
  //   ("Maya (default) — broker is connected and fresh", asserts
  //    data-testid=broker-status-banner with data-status=connected,
  //    data-freshness=fresh on the new BrokerStatusBanner).
  // Suspended on 2026-05-27 by the Phase 2.5 rebase. The Phase 2.5
  // BrokerStatusBanner / Dashboard does not surface those exact copy
  // strings against the seeded persona MSW responses.
  test.skip("Maya (default) — dashboard shows broker connected fresh", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await page.goto("/us/app/home");
    await expect(page.getByText(/data is stale/i)).not.toBeVisible();
    await expect(page.getByText(/connected — fresh/i).first()).toBeVisible({
      timeout: 8_000,
    });
  });

  // TODO(replacement-e2e-backlog): see docs/phase2-5-replacement-e2e-backlog.md §C
  //   replacement: apps/web/e2e/persona-switch-stable.spec.ts case 2
  //   ("Sarah — broker stale", asserts data-status=stale OR
  //    data-freshness=stale on BrokerStatusBanner).
  test.skip("Sarah — broker stale banner visible on home", async ({ page }) => {
    await setPersona(page, "sarah");
    await page.goto("/us/app/home");
    await expect(page.getByText(/data is stale/i)).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText(/account state/i).first()).toBeVisible();
  });

  test("David — onboarding incomplete blocks managed execution", async ({
    page,
  }) => {
    await setPersona(page, "david");
    await page.goto("/us/app/home");
    await expect(page.getByText(/managed execution/i).first()).toBeVisible({
      timeout: 8_000,
    });
    // David has no broker connection at all — broker card should show
    // not-connected; managed execution should be blocked-onboarding.
    await expect(
      page.getByText(/blocked — onboarding incomplete/i),
    ).toBeVisible({ timeout: 8_000 });
  });

  // TODO(replacement-e2e-backlog): see docs/phase2-5-replacement-e2e-backlog.md
  //   §A + §B. Replacements:
  //     - apps/web/e2e/compliance-fail-closed-structural.spec.ts case 4
  //       ("Review-required recommendation routes to Exception Review only")
  //     - apps/web/e2e/compliance-verdict-visibility.spec.ts case 2
  //       ("REVIEW verdict produces non-executing UI", asserts
  //        data-eligibility=review on recommendation detail).
  // The CompliancePreview component this case bound to ("REVIEW_TAX_IMPACT"
  // badge + "Approve for execution" button) was removed in P2.5R-19 and is
  // now structurally absent (the tripwire blocks the label).
  test.skip("Sarah — recommendation rec_s_001 sits in compliance REVIEW", async ({
    page,
  }) => {
    await setPersona(page, "sarah");
    await page.goto("/us/app/recommendations/rec_s_001");
    await expect(page.getByText(/REVIEW_TAX_IMPACT/i)).toBeVisible({
      timeout: 8_000,
    });
  });

  // TODO(replacement-e2e-backlog): see docs/phase2-5-replacement-e2e-backlog.md §C
  //   replacement: apps/web/e2e/persona-switch-stable.spec.ts case 4
  //   ("Maya — disclosure card 0 of 5", asserts data-ack-count="0" and
  //    data-total-count="5" on data-testid=disclosure-ack-card).
  test.skip("Maya — disclosure card shows 0 of 5 (default ack state)", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await page.goto("/us/app/home");
    await expect(page.getByText(/0 of 5 acknowledged/i)).toBeVisible({
      timeout: 8_000,
    });
  });

  // TODO(replacement-e2e-backlog): see docs/phase2-5-replacement-e2e-backlog.md §C
  //   replacement: apps/web/e2e/persona-switch-stable.spec.ts case 4/5
  //   (Next-action card surfaces disclosure routing via stable
  //    data-testid=disclosure-ack-card data-ack-count attribute, not via
  //    a copy regex).
  test.skip("Maya — Next action surfaces disclosure acknowledgment", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await page.goto("/us/app/home");
    await expect(
      page.getByText(/acknowledge regulatory disclosures/i),
    ).toBeVisible({ timeout: 8_000 });
  });
});
