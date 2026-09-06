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
const PER_TRADE_CONTROL =
  /\b(accept|approve|execute|place order|buy|sell|activate|trade now)\b/i;
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
    // Account scope is resolved by the BFF against the demo world's
    // listAccounts, never supplied by the browser.
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

  test("admitted persona sees a reconciled portfolio: equity, 24 positions, subscription", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "admitted");
    await page.goto("/us/app/home");
    await expect(page.getByTestId("home-equity")).toContainText("$");
    await expect(page.getByTestId("home-position-count")).toHaveText("24");
    await expect(page.getByTestId("home-membership")).toContainText(
      "SP500-Following",
    );
    await expect(page.getByTestId("equity-chart")).toBeVisible();
    await page.goto("/us/app/portfolio");
    await expect(page.getByTestId("position-row")).toHaveCount(24);
    await expect(page.getByTestId("position-row").first()).toContainText(
      /AAPL|MSFT|NVDA/,
    );
  });

  test("applicant persona has no account truth: portfolio reports account scope, never fabricates", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "applicant");
    const res = await page.request.get("/api/v1/investor/portfolio");
    const body = (await res.json()) as {
      data: { portfolio: unknown; upstream: { state: string } };
    };
    expect(body.data.portfolio).toBeNull();
    expect(body.data.upstream.state).toBe("account_scope");
  });

  test("activity renders the execution chain read-only: orders, fills, a DENIED risk decision, no controls", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "admitted");
    await page.goto("/us/app/activity");
    const rows = page.getByTestId("activity-record");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    expect(await rows.count()).toBeGreaterThan(30);
    await expect(
      page.locator('[data-record-type="order"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-record-type="fill"]').first(),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-record-type="risk_decision"]')
        .filter({ hasText: "DENIED" }),
    ).toHaveCount(1);
    expect(
      await page.getByTestId("activity-execution-badge").count(),
    ).toBeGreaterThan(10);
    await expect(
      page.getByTestId("activity-table").getByRole("button"),
    ).toHaveCount(0);
  });

  test("recommendations show CURRENT, SUPERSEDED and BLOCKED with 24 legs and no per-trade control", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "admitted");
    await page.goto("/us/app/recommendations");
    await expect(page.getByTestId("recommendation-card")).toHaveCount(3, {
      timeout: 30_000,
    });
    for (const status of ["CURRENT", "SUPERSEDED", "BLOCKED"]) {
      await expect(page.locator(`[data-rec-status="${status}"]`)).toHaveCount(
        1,
      );
    }
    await page.goto("/us/app/recommendations/recommendation_demo_0003");
    await expect(page.getByTestId("recommendation-leg")).toHaveCount(24, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: PER_TRADE_CONTROL }),
    ).toHaveCount(0);
  });

  test("changing a preference produces new advice and preserves the prior recommendation", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "admitted");
    const before = (await (
      await page.request.get("/api/v1/investor/recommendations")
    ).json()) as {
      data: { items: Array<{ recommendationId: string; status: string }> };
    };
    const beforeCurrent = before.data.items.find((r) => r.status === "CURRENT");
    if (!beforeCurrent) throw new Error("no CURRENT recommendation");
    await page.goto("/us/app/account");
    await expect(page.getByTestId("preferences-card")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("pref-drift").selectOption("0.05");
    await page
      .getByTestId("pref-excluded")
      .fill("security_us_mo, security_us_pm, security_us_tsla");
    await page.getByTestId("pref-save").click();
    await expect(page.getByTestId("pref-saved")).toBeVisible({
      timeout: 15_000,
    });
    const after = (await (
      await page.request.get("/api/v1/investor/recommendations")
    ).json()) as {
      data: { items: Array<{ recommendationId: string; status: string }> };
    };
    expect(after.data.items.length).toBe(before.data.items.length + 1);
    expect(
      after.data.items.find(
        (r) => r.recommendationId === beforeCurrent.recommendationId,
      )?.status,
    ).toBe("SUPERSEDED");
    expect(after.data.items.filter((r) => r.status === "CURRENT")).toHaveLength(
      1,
    );
    const activity = (await (
      await page.request.get("/api/v1/investor/activity")
    ).json()) as {
      data: { items: Array<{ recordType: string; entityId: string }> };
    };
    expect(
      activity.data.items.some(
        (r) =>
          r.recordType === "preference" && r.entityId === "preferences_demo_v2",
      ),
    ).toBe(true);
  });

  test("preferences accept only the four supported fields and reject stale versions", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "admitted");
    const bad = await page.request.patch("/api/v1/investor/preferences", {
      headers: H,
      data: { expectedVersion: 1, allocation_percent: "0.9" },
    });
    expect(bad.status()).toBe(400);
    const stale = await page.request.patch("/api/v1/investor/preferences", {
      headers: H,
      data: { expectedVersion: 99, minOrder: "40" },
    });
    expect(stale.status()).toBe(409);
  });
});

test.describe("Demo tier — live stream", () => {
  test("the event stream is same-origin SSE with validated frames; the strip goes live; advance produces a fill on the stream and in activity", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await page.request.post("/api/demo/session", {
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      data: { persona: "admitted" },
    });
    // Raw SSE probe: first frames arrive quickly.
    const frames = await page.evaluate(async () => {
      const res = await fetch("/api/v1/investor/events", {
        credentials: "include",
      });
      const reader = res.body?.getReader();
      if (!reader)
        return {
          status: res.status,
          type: res.headers.get("content-type"),
          text: "",
        };
      const dec = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && !text.includes("event: ")) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value);
      }
      await reader.cancel();
      return {
        status: res.status,
        type: res.headers.get("content-type"),
        text,
      };
    });
    expect(frames.status).toBe(200);
    expect(frames.type).toContain("text/event-stream");
    expect(frames.text).toMatch(/^id: event_demo_\d{8}$/m);
    expect(frames.text).toMatch(/^event: [a-z_]+\.(updated|recorded)$/m);

    await page.goto("/us/app/home");
    await expect(page.getByTestId("live-status-strip")).toHaveAttribute(
      "data-connection",
      "live",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("ticker-tape")).toBeVisible();
    expect(await page.getByTestId("ticker-item").count()).toBe(24);

    const adv = await page.request.post("/api/demo/advance", {
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      data: { fills: 1 },
    });
    expect(adv.status()).toBe(200);
    await expect(page.getByTestId("live-last-event")).toContainText(
      /fill\.recorded|reconciliation\.updated|order\.updated/,
      { timeout: 20_000 },
    );
    await page.goto("/us/app/activity");
    await expect(
      page
        .locator('[data-record-type="fill"]')
        .filter({ hasText: "fill_demo_live_" })
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("events are refused without a session; the applicant has no stream (no account)", async ({
    page,
    request,
  }) => {
    expect((await request.get("/api/v1/investor/events")).status()).toBe(401);
    await page.goto("/us/demo");
    await page.request.post("/api/demo/session", {
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      data: { persona: "applicant" },
    });
    const res = await page.request.get("/api/v1/investor/events");
    expect(res.status()).toBe(503);
    expect(
      ((await res.json()) as { data: { upstream: { state: string } } }).data
        .upstream.state,
    ).toBe("account_scope");
  });
});

test.describe("Demo tier — no wallet step", () => {
  test("the connect step never mounts the wallet stack; signed-out visitors are pointed to the walkthrough profiles", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (req) => {
      requests.push(req.url());
    });
    // The connect step sits behind the eligibility gate: take the admitted
    // persona's eligibility decision, then drop the session so the visitor is
    // eligible but signed out.
    await page.goto("/us/demo");
    await signIn(page, "admitted");
    await page.context().clearCookies({ name: "us_session_v1" });
    await page.goto("/us/auth/connect");
    await expect(page.getByTestId("connect-signin-unavailable")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("connect-demo-persona-link")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /connect wallet|link wallet/i }),
    ).toHaveCount(0);
    for (const url of requests) {
      expect(url).not.toMatch(/walletconnect|reown|relay\./i);
    }
  });

  test("a signed-in persona passes straight through the connect step into onboarding", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "admitted");
    await page.goto("/us/auth/connect");
    await page.waitForURL(/\/us\/onboarding/, { timeout: 20_000 });
  });

  test("sign out clears the session through the BFF and returns to the public entry", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await page.getByTestId("demo-signin-admitted").click();
    await page.waitForURL("**/us/app/home");
    await page.goto("/us/app/account");
    await page.getByTestId("sign-out").click();
    await page.waitForURL(/\/us\/?$/, { timeout: 20_000 });
    expect((await page.request.get("/api/v1/investor/session")).status()).toBe(
      401,
    );
  });
});

// Shape-valid, low-entropy fixture secret (40 alphanumerics); never real.
const DEMO_FIXTURE_SECRET = "demoFixtureSecret".padEnd(40, "0");

// A complete, valid Investor Profile v2 payload (mirrors investor-profile.spec).
const PROFILE_ANSWERS = {
  questionnaireVersion: 2,
  accountType: "individual",
  goal: "long_term_wealth",
  horizon: "gt_10y",
  withdrawalPattern: "gradual",
  incomeBand: "100_200k",
  incomeStability: "very_predictable",
  netWorthBand: "500k_1m",
  liquidNetWorthBand: "250_500k",
  accountShareOfLiquidAssets: "10_25pct",
  emergencyReserveBand: "gt_6mo",
  debtSignal: "none",
  liquidityLikelihood: "very_unlikely",
  knowledgeLevel: "experienced",
  experienceYears: "5_10y",
  productExperience: ["stocks", "funds"],
  drawdownBehavior: "stay",
  lossThreshold: "pct_20",
  growthProtectionPreference: 4,
  riskTradeoffChoice: "plan_b",
  restrictions: ["none"],
  expectedFinancialChange: "no",
  productIntent: ["disciplined_long_term"],
};

test.describe("Demo tier — invited investor sets up: identity → profile → Alpaca keys → holdings → advice", () => {
  test.describe.configure({ mode: "serial" });

  async function freshInvited(page: Page) {
    await page.goto("/us/demo");
    const res = await signIn(page, "invited");
    expect(res.status()).toBe(200);
    // Presenter control: rebuild the invited world so the walkthrough is
    // re-runnable (and this spec is order-independent under retries).
    const reset = await page.request.post("/api/demo/advance", {
      headers: H,
      data: { reset: true },
    });
    expect(reset.status()).toBe(200);
    // Identity lifecycle is BFF-local: reset the mock adapter as well.
    await page.request.post("/api/v1/investor/kyc/verification/mock", {
      headers: H,
      data: { reset: true },
    });
  }

  test("the invited persona starts admitted, unconnected, with no holdings and no advice", async ({
    page,
  }) => {
    await freshInvited(page);
    const session = (await (
      await page.request.get("/api/v1/investor/session")
    ).json()) as { data: { authId: string; accountId?: string } };
    expect(session.data.authId).toBe("demo-invited-01");
    // The account link is server-derived from the verified subject; the
    // browser never supplied it and every read re-authorizes it upstream.
    expect(session.data.accountId).toBe("acct_demo_invited_01");
    const onboarding = (await (
      await page.request.get("/api/v1/investor/onboarding")
    ).json()) as {
      data: {
        onboarding: { state: string };
        authorization: { status: string } | null;
        connection: unknown;
      };
    };
    expect(onboarding.data.onboarding.state).toBe("INVITED");
    expect(onboarding.data.authorization?.status).toBe("AUTHORIZED");
    expect(onboarding.data.connection).toBeNull();
    // Before setup, the setup surface shows both backend words separately and
    // offers no dashboard continuation: onboarding is INVITED, not READY.
    await page.goto("/us/onboarding/activation");
    await expect(page.getByTestId("setup-onboarding-state")).toHaveText(
      /invited/i,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("setup-authorization")).toHaveText(
      /^authorized$/i,
    );
    await expect(page.getByTestId("setup-dashboard")).toHaveCount(0);
    await expect(page.getByTestId("setup-gate")).toHaveAttribute(
      "data-reason",
      "onboarding_not_ready",
    );
    // The authorization row is labelled as account authorization; no label
    // presents the backend status as Alpha admission.
    await expect(
      page
        .getByTestId("setup-backend-state")
        .getByText("Account authorization", {
          exact: true,
        }),
    ).toBeVisible();
    await expect(
      page.getByTestId("setup-backend-state").getByText(/^Alpha admission$/),
    ).toHaveCount(0);
    const recs = (await (
      await page.request.get("/api/v1/investor/recommendations")
    ).json()) as { data: { items: unknown[] } };
    expect(recs.data.items).toHaveLength(0);
  });

  test("identity check (mock) → Investor Profile v2 (survey) → paper keys → validation → sync → holdings → first advice", async ({
    page,
  }) => {
    await freshInvited(page);

    // 1. Identity: the mock adapter's presenter controls advance the lifecycle.
    await page.goto("/us/onboarding/kyc");
    await expect(page.getByTestId("kyc-state-not_started")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("kyc-start").click();
    await expect(page.getByTestId("kyc-state-in_progress")).toBeVisible({
      timeout: 30_000,
    });
    for (const to of ["under_review", "passed"]) {
      expect(
        (
          await page.request.post("/api/v1/investor/kyc/verification/mock", {
            headers: H,
            data: { to },
          })
        ).status(),
      ).toBe(200);
    }
    await page.waitForURL("**/us/onboarding/investor-profile", {
      timeout: 30_000,
    });

    // 2. Investor Profile v2: the risk survey, derived server-side. Submitted
    //    through the same route the questionnaire uses; the result screen then
    //    continues to the broker step.
    const submit = await page.request.post("/api/v1/investor/profile/v2", {
      headers: H,
      data: PROFILE_ANSWERS,
    });
    expect(submit.status()).toBe(201);
    const assessment = (await submit.json()) as {
      data: { assessment: { permittedRiskBand: number | null } };
    };
    expect(assessment.data.assessment.permittedRiskBand).not.toBeNull();

    // 3. Alpaca paper keys through the form. Format-only fixture values: the
    //    BFF forwards them once to the demo world, which keeps nothing.
    await page.goto("/us/onboarding/broker");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const browserPaths: string[] = [];
    page.on("request", (req) => {
      browserPaths.push(new URL(req.url()).pathname);
    });
    await page
      .getByRole("button", { name: /^connect$/i })
      .first()
      .click();
    await page.getByLabel(/api key id/i).fill("PKDEMO1234567890ABCD");
    await page.getByLabel(/secret key/i).fill(DEMO_FIXTURE_SECRET);
    await page.getByRole("button", { name: /connect alpaca/i }).click();
    await expect(page.getByTestId("broker-connection-status")).toHaveAttribute(
      "data-stage",
      /validating|syncing|synced/,
      { timeout: 20_000 },
    );
    // The secret never appears in any browser-visible URL and the form is wiped.
    for (const p of browserPaths) expect(p).not.toContain(DEMO_FIXTURE_SECRET);
    await expect(page.getByLabel(/secret key/i)).toHaveCount(0);

    // 4. The backend's own lifecycle completes: validated, then synced, then
    //    the holdings the sync found appear.
    await expect(page.getByTestId("broker-connection-status")).toHaveAttribute(
      "data-stage",
      "synced",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("broker-holdings-count")).toHaveText("9");
    await expect(page.getByTestId("broker-holding").first()).toBeVisible();

    // 5. Strategy review: profile band + template + holdings side by side.
    await page.getByTestId("broker-continue").click();
    await expect(page.getByTestId("strategy-permitted-band")).not.toHaveText(
      "—",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("strategy-holdings-in-template")).toHaveText(
      "9 of 9",
    );

    // 6. Setup checklist: all three investor steps done; admission and
    //    management remain backend words, and there is no activate control.
    await page.getByTestId("strategy-continue").click();
    for (const k of ["identity", "profile", "broker"]) {
      await expect(page.getByTestId(`setup-item-${k}`)).toHaveAttribute(
        "data-done",
        "true",
        { timeout: 30_000 },
      );
    }
    // After the sync the backend reports READY; with AUTHORIZED and all steps
    // done the continuation appears. Both words are shown, neither as admission.
    await expect(page.getByTestId("setup-onboarding-state")).toHaveText(
      /ready/i,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("setup-authorization")).toHaveText(
      /^authorized$/i,
    );
    await expect(
      page.getByRole("button", { name: PER_TRADE_CONTROL }),
    ).toHaveCount(0);

    // 7. Dashboard: the ingested holdings, live ticker, and the first
    //    recommendation (not executable: management is not enabled).
    await page.getByTestId("setup-dashboard").click();
    await page.waitForURL("**/us/app/home");
    await expect(page.getByTestId("ticker-tape")).toBeVisible({
      timeout: 30_000,
    });
    expect(await page.getByTestId("ticker-item").count()).toBe(9);
    const recs = (await (
      await page.request.get("/api/v1/investor/recommendations")
    ).json()) as {
      data: { items: Array<{ status: string; executionEligible: boolean }> };
    };
    expect(recs.data.items).toHaveLength(1);
    expect(recs.data.items[0]?.status).toBe("CURRENT");
    expect(recs.data.items[0]?.executionEligible).toBe(false);
    // The records carry the whole setup lineage.
    await page.goto("/us/app/activity");
    for (const t of [
      "brokerage_connection",
      "brokerage_sync",
      "recommendation",
    ]) {
      await expect(
        page.locator(`[data-record-type="${t}"]`).first(),
      ).toBeVisible({ timeout: 30_000 });
    }
  });

  test("a second connection attempt is refused upstream (409) and the account page shows the connection without a credential", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "invited");
    const again = await page.request.post(
      "/api/v1/investor/broker/connection",
      {
        headers: H,
        data: {
          environment: "paper",
          apiKeyId: "PKDEMO1234567890ABCD",
          apiSecretKey: DEMO_FIXTURE_SECRET,
        },
      },
    );
    expect(again.status()).toBe(409);
    expect(await again.text()).not.toContain(DEMO_FIXTURE_SECRET);
    await page.goto("/us/app/account");
    await expect(page.getByTestId("broker-connection-card")).toContainText(
      /connected/i,
      { timeout: 30_000 },
    );
    expect(
      await page.getByTestId("broker-connection-card").innerText(),
    ).not.toMatch(/PKDEMO|demoFixtureSecret/);
  });
});

test.describe("Demo tier — onboarding aggregate and broker mutation preconditions", () => {
  test("zero-account WAITLISTED applicant: aggregate renders the onboarding state with null account fields, never a fabricated account or a 500", async ({
    page,
  }) => {
    await page.goto("/us/demo");
    await signIn(page, "applicant");
    const res = await page.request.get("/api/v1/investor/onboarding");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: {
        onboarding: { state: string };
        accountId: string | null;
        profile: unknown;
        authorization: unknown;
        connection: unknown;
        upstream: { state: string };
        identity: { state: string | null };
      };
    };
    expect(body.data.onboarding.state).toBe("WAITLISTED");
    expect(body.data.accountId).toBeNull();
    expect(body.data.profile).toBeNull();
    expect(body.data.authorization).toBeNull();
    expect(body.data.connection).toBeNull();
    expect(body.data.upstream.state).toBe("account_scope");
    expect(body.data.identity.state).not.toBeUndefined();
    // No account → the broker mutation is refused at account-scope resolution,
    // before any authorization read or credential forwarding.
    const post = await page.request.post("/api/v1/investor/broker/connection", {
      headers: H,
      data: {
        environment: "paper",
        apiKeyId: "PKDEMO1234567890ABCD",
        apiSecretKey: DEMO_FIXTURE_SECRET,
      },
    });
    expect(post.status()).toBe(503);
    const text = await post.text();
    expect(text).toContain("account_scope");
    expect(text).not.toContain(DEMO_FIXTURE_SECRET);
  });
});
