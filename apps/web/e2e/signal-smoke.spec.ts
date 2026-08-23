/**
 * Signal-stage smoke — the September release stage under production security.
 *
 * Proves only that the September configuration BOOTS and holds its production
 * posture. It is deliberately not the structural no-execution proof; see the
 * scope note in playwright.signal.config.ts.
 */
import { expect, test } from "@playwright/test";
import { e2eAuthCookies } from "./session";
import { postSameOrigin } from "./api";
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

  // ─── Positive capability controls ──────────────────────────────────────────
  //
  // C1a-1's refusal proofs lived here while refusal was the boundary. C2a made
  // the Managed surfaces structurally ABSENT, so those tests converted to the
  // stage-independent 404/405/400 proofs in c2a-structure.spec.ts (main lane).
  // What remains stage-specific is the positive half: Signal-allowed mutations
  // must actually work at the September stage.

  test("a Signal-allowed mutation SUCCEEDS end to end", async ({
    page,
    context,
  }) => {
    // The acceptance-grade positive control: a Signal-allowed mutation must
    // not merely get past the gate — it must complete. refreshProfile is
    // Signal remediation; a valid advisory profile POST writes an immutable
    // snapshot and answers 201 with a receipt naming the action.
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
    await page.goto("/us/app/recommendations");
    const res = await postSameOrigin(page, "/api/v1/investor/profile", {
      data: {
        goal: "long_term_growth",
        horizon: "10_plus_years",
        incomeBand: "100k_250k",
        liquidityNeed: "low",
        riskTolerance: "moderate",
        experience: "some_experience",
        accountPurpose: "retirement",
      },
    });
    expect(res.status(), "Signal-allowed mutation must SUCCEED").toBe(201);
    const body = (await res.json()) as {
      data?: { profileVersion?: number };
      receipt?: { action?: string };
    };
    expect(body.receipt?.action).toBe("refreshProfile");
    expect(body.data?.profileVersion).toBeGreaterThan(0);
  });

  test("a Signal-allowed mutation with no sink fails at the sink, not the gate", async ({
    page,
    context,
  }) => {
    // Secondary control: support is Signal-allowed, passes the capability
    // gate, and fails closed at the UNCONFIGURED SINK with 412 — not with the
    // policy's 403. Distinguishes gate-refusal from downstream fail-closed;
    // becomes 200 when D-SUPPORT-01 lands a real sink.
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
    await page.goto("/us/app/support");
    const res = await postSameOrigin(page, "/api/us/support", {
      headers: { "x-forwarded-for": "203.0.113.201" },
      data: {
        category: "App issue",
        message: "Signal-stage positive control message.",
      },
    });
    expect(res.status(), "allowed mutation must reach the sink boundary").toBe(
      412,
    );
  });
});
