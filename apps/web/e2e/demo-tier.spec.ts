/**
 * Demo tier (REFI_ENV=demo) — the isolated walkthrough deployment.
 *
 * Proves: the persona sign-in works here; impersonation is impossible; the
 * applicant persona has no admission or execution authority; admission and
 * account scope are never asserted by the browser; the alpha-claim page still
 * requires a valid signed token and points retries at game.refi.trading.
 */
import { test, expect, type Page } from "@playwright/test";

const ORIGIN = "http://localhost:3000";
const H = { "content-type": "application/json", origin: ORIGIN };

async function signIn(page: Page, persona: string) {
  return page.request.post("/api/demo/session", {
    headers: H,
    data: { persona },
  });
}

test.describe("Demo tier — persona sign-in", () => {
  test("the demo entry page and indicator exist only on this tier", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await expect(page.getByTestId("demo-persona-picker")).toBeVisible();
    await expect(page.getByTestId("demo-tier-indicator")).toBeVisible();
    await expect(page.getByTestId("demo-tier-indicator")).toContainText(
      /simulated data/i,
    );
    const tier = await page.request.get("/api/demo/session");
    expect(tier.status()).toBe(200);
    expect(((await tier.json()) as { data: { tier: string } }).data.tier).toBe(
      "demo",
    );
  });

  test("applicant persona: session established, no eligibility decision, walks the public flow", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    const res = await signIn(page, "applicant");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data["persona"]).toBe("applicant");
    expect(body.data["authorityAsserted"]).toBe(false);
    expect(body.data).not.toHaveProperty("accountId");
    // Session subject is the fixed persona id; no account is linked.
    const session = await page.request.get("/api/v1/investor/session");
    expect(session.status()).toBe(200);
    const s = (await session.json()) as {
      data: { authId: string; accountId?: string };
    };
    expect(s.data.authId).toBe("demo-applicant-01");
    expect(s.data.accountId).toBeUndefined();
    // Onboarding requires the eligibility decision the applicant has not made.
    await page.goto("/us/onboarding/kyc");
    await expect(page).toHaveURL(/\/us\/eligibility/);
  });

  test("admitted persona: session + eligibility decision, product reachable; admission is never a browser claim", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await page.getByTestId("demo-signin-admitted").click();
    await page.waitForURL("**/us/app/home");
    await expect(page.getByTestId("demo-tier-indicator")).toContainText(
      "persona: admitted",
    );
    const session = await page.request.get("/api/v1/investor/session");
    const s = (await session.json()) as { data: Record<string, unknown> };
    expect(s.data["authId"]).toBe("demo-admitted-01");
    for (const k of [
      "admitted",
      "approved",
      "alphaAdmission",
      "authorization",
    ]) {
      expect(s.data).not.toHaveProperty(k);
    }
    // Account scope is resolved by the BFF against the simulator (listAccounts),
    // never supplied by the browser: the account-scoped read succeeds with the
    // simulator's owned account and reports the upstream state explicitly.
    const recs = await page.request.get("/api/v1/investor/recommendations");
    expect(recs.status()).toBe(200);
    const r = (await recs.json()) as { data: { upstream: { state: string } } };
    expect(r.data.upstream.state).toBe("ok");
  });

  test("impersonation is impossible: closed persona enum, strict body, same-origin, no query-string identity", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    for (const bad of [
      { persona: "root" },
      { persona: "admitted", authId: "usr_alpha_invited_01" },
      { persona: "admitted", accountId: "acct_alpha_other_02" },
      { persona: "admitted", email: "anyone@example.com" },
    ]) {
      expect(
        (
          await page.request.post("/api/demo/session", {
            headers: H,
            data: bad,
          })
        ).status(),
      ).toBe(400);
    }
    expect(
      (
        await page.request.post("/api/demo/session?persona=admitted", {
          headers: H,
          data: {},
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("/api/demo/session", {
          headers: { ...H, origin: "http://evil.example" },
          data: { persona: "admitted" },
        })
      ).status(),
    ).toBe(403);
    // The display cookie carries no authority: forging it does not change the session subject.
    await signIn(page, "applicant");
    await page.context().addCookies([
      {
        name: "us_demo_persona",
        value: "admitted",
        domain: "localhost",
        path: "/",
      },
    ]);
    const session = await page.request.get("/api/v1/investor/session");
    expect(
      ((await session.json()) as { data: { authId: string } }).data.authId,
    ).toBe("demo-applicant-01");
  });

  test("applicant persona cannot reach execution authority or self-admit", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "applicant");
    for (const path of [
      "/api/v1/investor/managed/resume",
      "/api/v1/investor/execution-policy/activate",
      "/api/v1/investor/orders",
      "/api/v1/investor/accounts/acct_alpha_owned_01/actions",
      "/api/v1/investor/admission/approve",
    ]) {
      const res = await page.request.post(path, { headers: H, data: {} });
      expect([404, 405], `${path} must not exist`).toContain(res.status());
    }
  });

  test("alpha-claim still requires a valid signed token; retry link points at game.refi.trading; claim lands at eligibility", async ({
    page,
  }) => {
    await page.goto("/us/alpha-claim?token=" + "x".repeat(40));
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible({
      timeout: 15_000,
    });
    const retry = page.getByRole("link", { name: /return to the game/i });
    await expect(retry).toHaveAttribute("href", "https://game.refi.trading");
    await expect(
      page.getByRole("link", { name: /continue to eligibility/i }),
    ).toHaveAttribute("href", "/us/eligibility");
    const direct = await page.request.post("/api/v1/investor/alpha-claim", {
      headers: H,
      data: { token: "y".repeat(40) },
    });
    expect(direct.status()).toBe(401);
  });

  test("sign-out clears the demo session", async ({ page }) => {
    await page.goto("/us/demo");
    await signIn(page, "admitted");
    expect(
      (await page.request.delete("/api/demo/session", { headers: H })).status(),
    ).toBe(200);
    expect((await page.request.get("/api/v1/investor/session")).status()).toBe(
      401,
    );
  });
});
