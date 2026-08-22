/**
 * Signal-stage smoke — the September release stage under production security.
 *
 * Proves only that the September configuration BOOTS and holds its production
 * posture. It is deliberately not the structural no-execution proof; see the
 * scope note in playwright.signal.config.ts.
 */
import { expect, test } from "@playwright/test";
import { e2eAuthCookies } from "./session";
import { E2E_USERS } from "./global-setup";

test.describe("Signal stage — production posture", () => {
  test("boots and serves the production CSP", async ({ page }) => {
    const response = await page.goto("/us/eligibility");
    if (!response) throw new Error("navigation produced no response");
    expect(response.status(), "app did not boot at signal stage").toBeLessThan(
      400,
    );

    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp, "no Content-Security-Policy header").toBeTruthy();
    expect(csp).not.toContain("strict-dynamic");
    expect(csp).not.toMatch(/script-src[^;]*nonce-/);
    const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc, "'unsafe-eval' must not ship").not.toContain(
      "unsafe-eval",
    );
  });

  test("first-party JavaScript hydrates", async ({ page }) => {
    const cspBlocks: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (/Content Security Policy|Refused to/i.test(t)) cspBlocks.push(t);
    });

    await page.goto("/us/eligibility");

    const select = page.locator("select").first();
    await expect(async () => {
      await select.selectOption({ index: 1 });
      await expect(select).not.toHaveValue("");
    }).toPass({ timeout: 30_000 });

    // First-party only. The known PostHog third-party block is tracked as
    // POSTHOG-CSP in the launch disposition, not silenced here.
    const firstParty = cspBlocks.filter(
      (t) => !/https?:\/\/(?!localhost)/.test(t),
    );
    expect(firstParty, firstParty.join("\n")).toEqual([]);
  });

  test("authentication fails closed with no dev fallback", async ({
    request,
  }) => {
    // REFI_ENV=prod, so bff/auth.ts must not grant a dev identity to an
    // unauthenticated request. Anything other than 401 means the fallback is
    // reachable on a deployed tier.
    const res = await request.get("/api/v1/investor/session");
    expect(
      res.status(),
      "unauthenticated request was not refused — dev fallback is reachable",
    ).toBe(401);
  });

  test("a seeded session reaches a Signal-safe surface", async ({
    page,
    context,
  }) => {
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
    const response = await page.goto("/us/app/recommendations");
    if (!response) throw new Error("navigation produced no response");
    expect(response.status()).toBeLessThan(400);
  });
});
