/**
 * Production-artifact invariants.
 *
 * These assert properties of the SHIPPED build that a `next dev` suite cannot
 * observe. They exist because #40 shipped production with every script blocked
 * by CSP: `script-src` was `nonce-… 'strict-dynamic'`, but pages are statically
 * prerendered so Next's script tags never carry a per-request nonce, and under
 * 'strict-dynamic' browsers ignore 'self'. Nothing hydrated. The eligibility
 * form silently degraded to a native GET submit, and a fully green dev-mode
 * suite reported nothing wrong through two deploy cycles.
 *
 * The webServer for this suite runs `next build` + `next start` at
 * NEXT_PUBLIC_REFI_ENV=prod, which is the only configuration where the
 * production CSP branch in apps/web/proxy.ts is reachable at all — it keys on
 * that build constant, not on NODE_ENV.
 */
import { expect, test } from "@playwright/test";

test.describe("Production artifact", () => {
  test("serves a CSP that permits the scripts the page actually loads", async ({
    page,
  }) => {
    const response = await page.goto("/us/eligibility");
    if (!response) throw new Error("navigation produced no response");

    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp, "no Content-Security-Policy header").toBeTruthy();

    // The #40 signature. 'strict-dynamic' makes the browser ignore 'self', and
    // a nonce cannot reach a statically prerendered <script>, so together they
    // block every bundle. Either one alone is enough to re-break hydration.
    expect(csp, "'strict-dynamic' re-introduces the #40 outage").not.toContain(
      "strict-dynamic",
    );
    expect(csp, "a nonce cannot reach prerendered scripts").not.toMatch(
      /script-src[^;]*nonce-/,
    );
    expect(csp).toContain("script-src 'self'");

    // Production tightening: 'unsafe-eval' is dev-only.
    const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc, "'unsafe-eval' must not ship").not.toContain(
      "unsafe-eval",
    );
  });

  test("first-party client JavaScript hydrates and is never CSP-blocked", async ({
    page,
  }) => {
    const cspBlocks: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (/Content Security Policy|Refused to/i.test(t)) cspBlocks.push(t);
    });

    await page.goto("/us/eligibility");

    // Hydration proof: a controlled input must retain a value the user set.
    // Before hydration React has not mounted, so the DOM accepts the value and
    // discards it on mount — exactly what #40 produced. Retried, so a pass
    // means "hydrated" rather than "raced successfully".
    const select = page.locator("select").first();
    await expect(async () => {
      await select.selectOption({ index: 1 });
      await expect(select).not.toHaveValue("");
    }).toPass({ timeout: 30_000 });

    // Scoped to FIRST-PARTY scripts deliberately.
    //
    // This is the #40 regression guard: the app's own bundles must never be
    // blocked. Third-party blocks are filtered out because one is currently
    // EXPECTED and is tracked separately — `script-src` in production is
    // `'self' 'unsafe-inline'`, while the PostHog snippet loads from
    // us-assets.i.posthog.com. proxy.ts adds the PostHog host to `connect-src`
    // only, which does not cover script loading, so product analytics is
    // CSP-blocked in production. That is a real defect, but widening
    // `script-src` is a privacy and product decision rather than a test fix,
    // so this spec refuses to encode either answer. Tighten this filter to
    // `[]` once that decision lands.
    const firstParty = cspBlocks.filter(
      (t) => !/https?:\/\/(?!localhost)/.test(t),
    );
    expect(
      firstParty,
      `CSP blocked first-party scripts on the production artifact:\n${firstParty.join("\n")}`,
    ).toEqual([]);
  });
});
