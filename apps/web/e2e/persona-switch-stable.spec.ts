// Persona-switch stable replacement — Phase 2.5 backlog §C.
//
// Replaces the 5 brittle copy-regex cases in
// apps/web/e2e/persona-switch.spec.ts. Reads stable data-testid +
// data-status / data-freshness / data-ack-count / data-total-count
// attributes added to BrokerStatusBanner and the dashboard disclosure card.

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
  // Deterministic browser-MSW-only persona pin. The MSW handlers read this
  // header before the cookie, sidestepping cross-fetch cookie quirks.
  await page.context().setExtraHTTPHeaders({ "x-refi-persona": persona });
}

// Serial mode so the same dev-server worker compiles /us/app/home once and
// then every persona swap exercises the same compiled route.
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

async function warmupAndGoto(page: Page, path: string): Promise<void> {
  // First navigation can return 404 while Next dev compiles. Retry up to
  // three times before failing naturally.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    if (response && response.status() === 200) return;
    await page.waitForTimeout(2_000);
  }
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test.describe("§C Persona-switch stable", () => {
  test("Maya — broker is connected and fresh (stable attributes)", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("broker-status-banner");
    await expect(banner).toBeAttached({ timeout: 30_000 });
    // Maya's persona has broker connected with data_stale=false → status
    // resolves to "connected", freshness to "fresh".
    await expect(banner).toHaveAttribute("data-status", "connected", {
      timeout: 30_000,
    });
    await expect(banner).toHaveAttribute("data-freshness", "fresh");
  });

  test("Sarah — broker stale (stable attributes)", async ({ page }) => {
    await setPersona(page, "sarah");
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("broker-status-banner");
    await expect(banner).toBeAttached({ timeout: 30_000 });
    // Sarah's persona has data_stale=true on her broker connection. The
    // banner reports status=stale + freshness=stale.
    await expect(banner).toHaveAttribute("data-status", "stale", {
      timeout: 30_000,
    });
    await expect(banner).toHaveAttribute("data-freshness", "stale");
  });

  test("David — broker missing or waitlist (stable attributes)", async ({
    page,
  }) => {
    await setPersona(page, "david");
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("broker-status-banner");
    await expect(banner).toBeAttached({ timeout: 30_000 });
    // David has no broker connection. The hook may return null (then the
    // banner reports status=missing/loading until response) or a
    // disconnected payload (also status=missing). Either way the value is
    // one of the non-connected states.
    const status = await banner.getAttribute("data-status");
    expect(["missing", "loading", "error"]).toContain(status);
  });

  test("Maya — disclosure card exposes ack/total counts (0 of 5)", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const card = page.getByTestId("disclosure-ack-card");
    await expect(card).toBeAttached({ timeout: 30_000 });
    // Maya's seeded ack state is empty (5 required disclosures, 0 acked).
    // The numeric attributes carry the count without depending on copy.
    await expect(card).toHaveAttribute("data-ack-count", "0", {
      timeout: 30_000,
    });
    await expect(card).toHaveAttribute("data-total-count", "5");
    // With 0 acks of 5 required, the card is in the "blocked" action state.
    await expect(card).toHaveAttribute("data-action", "blocked");
  });

  test("Persona switch updates stable attributes on the same page", async ({
    page,
  }) => {
    // Maya first.
    await setPersona(page, "maya");
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("broker-status-banner");
    await expect(banner).toHaveAttribute("data-status", "connected", {
      timeout: 30_000,
    });
    // Switch to Sarah. The banner status flipping from "connected" to "stale"
    // is the load-bearing proof that the persona swap propagated to MSW and
    // back into the dashboard render on the same page.
    await setPersona(page, "sarah");
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    await expect(banner).toHaveAttribute("data-status", "stale", {
      timeout: 30_000,
    });
    // The disclosure card still attaches for Sarah; its attributes are read
    // to confirm the dashboard rendered the swapped persona's data without
    // asserting fixture-specific ack counts (Sarah and Maya share the same
    // 5-disclosure baseline today, but that's a fixture detail, not a
    // boundary claim).
    const sarahCard = page.getByTestId("disclosure-ack-card");
    await expect(sarahCard).toBeAttached({ timeout: 30_000 });
    const sarahTotal = (await sarahCard.getAttribute("data-total-count")) ?? "";
    expect(sarahTotal).not.toBe("");
  });
});
