// Persona switching via `refi_persona_v1` cookie (MIG-P2.5-15 + MIG-P2.5-10).
//
// The five copy-regex cases that were previously test.skip'd here have been
// fully replaced by the stable-data-testid suite at
// `apps/web/e2e/persona-switch-stable.spec.ts` (Phase 2.5 backlog §C).
// What remains in this file is the one copy-regex case that survived the
// rebase intact — the David onboarding-blocked check, which is orthogonal
// to the broker-banner/disclosure-card §C coverage and tests the managed-
// execution-blocked status surface specifically.

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
});
