/**
 * Signal recommendations — browser → same-origin BFF → frozen v1.1.0-alpha.2
 * client → Daniel's deterministic loopback simulator. No browser-side route
 * mock: the legacy `/v1/recommendations` interception is gone with the hook
 * it faked. Simulator evidence only — never a connected refinity-dev claim.
 */
import { test, expect, type Request } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { SIMULATOR_ORIGIN } from "./investor-api-simulator";

const FORBIDDEN_BROWSER_TARGETS = [
  "/v1/recommendations",
  "/v1/activity",
  "/api/v1/investor/accounts/",
  SIMULATOR_ORIGIN,
];

const PER_TRADE_CONTROL =
  /\b(accept|approve|execute|place order|buy|sell|activate|trade now)\b/i;

test.describe("Recommendations — Signal user", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
  });

  test("list renders the simulator's recommendation through the BFF, with contract fields only", async ({
    page,
  }) => {
    const browserRequests: string[] = [];
    page.on("request", (req: Request) => browserRequests.push(req.url()));

    await page.goto("/us/app/recommendations");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("recommendations-list")).toBeVisible({
      timeout: 30_000,
    });
    const card = page.getByTestId("recommendation-card").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-rec-status", "CURRENT");
    await expect(card.getByTestId("recommendation-template")).toHaveText(
      "template_us_sp500_direct_index_v1",
    );
    await expect(card).toContainText("8.25%");
    await expect(card).toContainText("503");
    await expect(card).toContainText(/fresh/i);
    // Retired flat fields are not fabricated.
    await expect(card).not.toContainText(/confidence/i);
    await expect(card).not.toContainText(/\bBUY\b|\bSELL\b/);
    await expect(
      page.getByTestId("recommendations-upstream-state"),
    ).toHaveCount(0);

    for (const url of browserRequests) {
      for (const forbidden of FORBIDDEN_BROWSER_TARGETS) {
        expect(url, `browser must not call ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  test("detail renders recommendation metadata and constituent legs from the simulator; no per-trade control", async ({
    page,
  }) => {
    const browserRequests: string[] = [];
    page.on("request", (req: Request) => browserRequests.push(req.url()));

    await page.goto("/us/app/recommendations");
    await expect(page.getByTestId("recommendations-list")).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByTestId("signal-review-action")
      .first()
      .locator("xpath=ancestor::a")
      .click();
    await page.waitForURL(
      "**/us/app/recommendations/recommendation_alpha_0001",
    );

    await expect(page.getByTestId("recommendation-detail-heading")).toHaveText(
      "template_us_sp500_direct_index_v1",
    );
    await expect(
      page.getByTestId("recommendation-execution-eligibility"),
    ).toContainText(/per backend policy/i);
    const leg = page.getByTestId("recommendation-leg").first();
    await expect(leg).toBeVisible();
    await expect(leg).toContainText("AAPL");
    await expect(leg).toContainText("security_us_aapl");
    await expect(leg).toContainText("1.25");
    await expect(leg).toContainText("TARGET_DELTA");
    // The simulator page has has_more=false: no further-page control.
    await expect(page.getByTestId("recommendation-legs-more")).toHaveCount(0);
    await expect(page.getByTestId("signal-manual-panel")).toBeVisible();

    // SEC 203A-2(e) §A + D-LAUNCH-06: `execution_eligible`/`executable` are
    // informational; nothing may offer per-trade action.
    await expect(
      page.getByRole("button", { name: PER_TRADE_CONTROL }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: PER_TRADE_CONTROL }),
    ).toHaveCount(0);
    for (const forbidden of [
      /accept (recommendation|trade)/i,
      /approve (for execution|trade|rebalance)/i,
      /approve.*execution/i,
      /accept and execute/i,
      /submit trade/i,
      /staff approval/i,
      /founder review/i,
    ]) {
      await expect(page.getByRole("button", { name: forbidden })).toHaveCount(
        0,
      );
    }
    for (const url of browserRequests) {
      for (const forbidden of FORBIDDEN_BROWSER_TARGETS) {
        expect(url, `browser must not call ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  test("a malformed legs cursor fails closed at the BFF", async ({ page }) => {
    await page.goto("/us/app/recommendations");
    const res = await page.request.get(
      `/api/v1/investor/recommendations/recommendation_alpha_0001/legs?cursor=${"x".repeat(600)}`,
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: { legs: unknown; upstream: { state: string; reason?: string } };
    };
    expect(body.data.legs).toBeNull();
    expect(body.data.upstream.state).toBe("pagination");
    expect(body.data.upstream.reason).toBe("cursor_invalid");
  });

  test("unauthenticated reads are refused", async ({ request }) => {
    expect(
      (await request.get("/api/v1/investor/recommendations")).status(),
    ).toBe(401);
    expect(
      (
        await request.get(
          "/api/v1/investor/recommendations/recommendation_alpha_0001",
        )
      ).status(),
    ).toBe(401);
  });
});

test.describe("Recommendations — Managed-tier user sees the Signal product", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.managed.eligibilityCookie));
  });

  test("no Managed banner, upgrade CTA, badge, or Managed action branch renders — even with a historical managed mode in the store", async ({
    page,
  }) => {
    await page.goto("/us/app/recommendations");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("recommendations-list")).toBeVisible({
      timeout: 30_000,
    });
    for (const id of [
      "managed-banner",
      "signal-upgrade-cta",
      "recommendations-mode-badge",
      "managed-status-row",
      "managed-review-action",
      "managed-exception-cta",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByText("Activate ReFi Managed")).toHaveCount(0);
    await expect(page.getByText("ReFi Managed is active")).toHaveCount(0);
  });

  test("detail page renders Signal UI with no per-trade or Managed execution affordance", async ({
    page,
  }) => {
    await page.goto("/us/app/recommendations/recommendation_alpha_0001");
    await expect(page.getByTestId("recommendation-detail-heading")).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    await expect(page.getByTestId("recommendation-detail-mode")).toHaveCount(0);
    await expect(page.getByText(/managed execution active/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: PER_TRADE_CONTROL }),
    ).toHaveCount(0);
  });
});
