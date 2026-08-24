/**
 * C2b — release-authority proofs at the September stage.
 *
 * The main lane proves the Managed surface is structurally absent at
 * REFI_RELEASE_STAGE=managed_paper (c2a-structure.spec.ts). This spec runs the
 * same absence proofs at REFI_RELEASE_STAGE=signal — the stage the September
 * artifact actually ships — so the signal lane certifies the release on its
 * own instead of inferring it from another stage's run. Route lists are shared
 * via signal-boundary-surface.ts; the lists diverging between lanes was the
 * failure mode that module exists to remove.
 *
 * Also carries the per-trade-approval proof: no reachable Signal surface may
 * render a control that accepts, approves, or executes a recommendation or
 * trade. The build-time half of that proof is the tripwire's browser-direct
 * execution guard (scripts/tripwire-investor-boundary.ts).
 */
import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { postSameOrigin } from "./api";
import {
  ABSENT_MANAGED_POST_ROUTES,
  ABSENT_MANAGED_GET_ROUTES,
  ABSENT_MODE_ROUTE,
  ABSENT_MANAGED_PAGES,
  SIGNAL_REMEDIATION_PAGES,
  MANAGED_EXCEPTION_RESOLUTIONS,
  SIGNAL_EXCEPTION_RESOLUTION,
} from "./signal-boundary-surface";

test.describe("Signal stage — structural absence of the Managed surface", () => {
  test.beforeEach(async ({ context }) => {
    // The Managed-tier seeded user, deliberately: absence must hold even for
    // the user the capability once belonged to.
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.managed.eligibilityCookie),
    );
  });

  test("removed Managed routes answer 404 at the signal stage", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    for (const path of ABSENT_MANAGED_POST_ROUTES) {
      const res = await postSameOrigin(page, path, { data: {} });
      expect(res.status(), `${path} must be gone, not gated`).toBe(404);
    }
    for (const path of [...ABSENT_MANAGED_GET_ROUTES, ABSENT_MODE_ROUTE]) {
      const res = await page.request.get(path);
      expect(res.status(), `${path} must be gone, not gated`).toBe(404);
    }
  });

  test("removed Managed pages 404; Signal remediation serves", async ({
    page,
  }) => {
    for (const path of ABSENT_MANAGED_PAGES) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} must 404 — removed, no redirects`).toBe(
        404,
      );
    }
    for (const path of SIGNAL_REMEDIATION_PAGES) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} must serve at the signal stage`).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("exception categories partition at the signal stage", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    for (const resolution of MANAGED_EXCEPTION_RESOLUTIONS) {
      const res = await postSameOrigin(
        page,
        "/api/v1/investor/exceptions/any-id/resolve",
        { data: { resolution, clientAttestation: true } },
      );
      expect(res.status(), `${resolution} must fail shape validation`).toBe(
        400,
      );
    }
    // Positive control: a Signal category passes schema AND the signal-stage
    // capability policy, reaching the existence lookup (404 for unknown id).
    const ok = await postSameOrigin(
      page,
      "/api/v1/investor/exceptions/no-such-exception/resolve",
      {
        data: {
          resolution: SIGNAL_EXCEPTION_RESOLUTION,
          clientAttestation: true,
        },
      },
    );
    expect(ok.status(), "Signal category must clear both gates").toBe(404);
  });
});

test.describe("Signal stage — no per-trade approval surface", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
  });

  test("recommendations render no accept/approve/execute control", async ({
    page,
  }) => {
    await page.goto("/us/app/recommendations", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("recommendations-list")).toBeVisible({
      timeout: 30_000,
    });

    const perTradeControl = /\b(accept|approve|execute)\b/i;
    const assertNone = async () => {
      await expect(
        page.getByRole("button", { name: perTradeControl }),
        "no button may offer per-trade approval",
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: perTradeControl }),
        "no link may offer per-trade approval",
      ).toHaveCount(0);
    };
    await assertNone();

    // Follow the first recommendation into its detail/leg view, if one is
    // seeded — the leg table is where an approval control would most plausibly
    // reappear.
    const detail = page.locator('a[href*="/us/app/recommendations/"]').first();
    if ((await detail.count()) > 0) {
      await detail.click();
      await page.waitForLoadState("domcontentloaded");
      await assertNone();
    }
  });
});
