/**
 * Investor Profile questionnaire (questionnaireVersion 2) — e2e for the
 * spec's flow requirements plus the PR #65 correction proofs: joint exit
 * (UI and direct API), reason-specific not-fit explanations, one-flag-at-a-
 * time clarification (two simultaneous flags require two reconciliations),
 * none-exclusivity rejected server-side, server-side draft resume with
 * account isolation, and no sensitive answers in browser storage. All policy
 * assertions here are about SERVER verdicts rendered by the UI — the page
 * computes nothing.
 */
import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { postSameOrigin } from "./api";

// The server-side draft is keyed per auth identity and the suite shares the
// seeded signal user, so parallel tests would clobber each other's drafts
// (a submit also CLEARS the draft). Serial keeps the draft lifecycle honest.
test.describe.configure({ mode: "serial" });

/**
 * Reset the caller's server draft to step 0 so the wizard deterministically
 * opens on the welcome screen. The suite shares seeded users, so a draft
 * left by an earlier test (or an earlier local run — the prototype store
 * persists between runs) would otherwise resume mid-flow.
 */
async function resetDraft(page: Page) {
  await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
  await postSameOrigin(page, "/api/v1/investor/profile/v2/draft", {
    data: { answers: { questionnaireVersion: 2 }, stepIndex: 0 },
  });
}

async function start(page: Page) {
  await resetDraft(page);
  await page.goto("/us/onboarding/investor-profile", {
    waitUntil: "domcontentloaded",
  });
  // Hydration gate (see e2e/hydration.ts): a click that lands between first
  // paint and hydration is silently discarded, so the FIRST stateful
  // interaction retries until its effect is observed. The page also resolves
  // a server draft on load, so the Start button appears only once the
  // welcome phase renders.
  await expect(page.getByTestId("ip-welcome")).toBeVisible({
    timeout: 30_000,
  });
  await expect(async () => {
    await page.getByTestId("ip-start").click();
    await expect(page.getByTestId("ip-step-accountType")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 30_000 });
}

async function pickSingle(page: Page, value: string) {
  await page.getByTestId(`ip-opt-${value}`).click();
}

async function pickMulti(page: Page, values: string[]) {
  for (const v of values) await page.getByTestId(`ip-opt-${v}`).click();
  await page.getByTestId("ip-next").click();
}

/** Click through the whole questionnaire with the given single answers. */
async function completeQuestionnaire(
  page: Page,
  overrides: Partial<Record<string, string>> = {},
  multis: {
    productExperience?: string[];
    restrictions?: string[];
    productIntent?: string[];
  } = {},
) {
  const single = {
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
    drawdownBehavior: "stay",
    lossThreshold: "pct_20",
    riskTradeoffChoice: "plan_b",
    expectedFinancialChange: "no",
    ...overrides,
  };

  await pickSingle(page, single.accountType);
  await pickSingle(page, single.goal);
  await pickSingle(page, single.horizon);
  await pickSingle(page, single.withdrawalPattern);
  await page.getByTestId("ip-next").click(); // finances intro
  await pickSingle(page, single.incomeBand);
  await pickSingle(page, single.incomeStability);
  await pickSingle(page, single.netWorthBand);
  await pickSingle(page, single.liquidNetWorthBand);
  await pickSingle(page, single.accountShareOfLiquidAssets);
  await pickSingle(page, single.emergencyReserveBand);
  await pickSingle(page, single.debtSignal);
  await pickSingle(page, single.liquidityLikelihood);
  await pickSingle(page, single.knowledgeLevel);
  await pickSingle(page, single.experienceYears);
  await pickMulti(page, multis.productExperience ?? ["stocks", "funds"]);
  await pickSingle(page, single.drawdownBehavior);
  await pickSingle(page, single.lossThreshold);
  await page.getByTestId("ip-opt-scale-4").click();
  await pickSingle(page, single.riskTradeoffChoice);
  await pickMulti(page, multis.restrictions ?? ["none"]);
  await pickSingle(page, single.expectedFinancialChange);
  await pickMulti(page, multis.productIntent ?? ["disciplined_long_term"]);
  await expect(page.getByTestId("ip-review")).toBeVisible();
  await page.getByTestId("ip-submit").click();
}

/** A complete valid API payload for direct-POST proofs. */
function apiAnswers(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

test.describe("Investor Profile v2 questionnaire", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
  });

  test("an entity account exits the retail flow at the first question", async ({
    page,
  }) => {
    await start(page);
    await pickSingle(page, "entity");
    await expect(page.getByTestId("ip-entity-exit")).toBeVisible();
    await expect(
      page.getByText("ReFi for entities works differently."),
    ).toBeVisible();
  });

  test("a joint account exits at the first question AND a direct joint POST cannot create a retail profile", async ({
    page,
  }) => {
    await start(page);
    await pickSingle(page, "joint");
    await expect(page.getByTestId("ip-joint-exit")).toBeVisible();
    await expect(
      page.getByText("Joint accounts are almost here."),
    ).toBeVisible();

    // API leg: UI-only blocking is insufficient (PR #65 review). A direct
    // joint submission must never yield a personalized retail assessment.
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const res = await postSameOrigin(page, "/api/v1/investor/profile/v2", {
      data: apiAnswers({ accountType: "joint" }),
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as {
      data: {
        assessment: {
          productFitStatus: string;
          permittedRiskBand: number | null;
          constraintReasonCodes: string[];
        };
      };
    };
    expect(body.data.assessment.productFitStatus).toBe("not_fit");
    expect(body.data.assessment.permittedRiskBand).toBeNull();
    expect(body.data.assessment.constraintReasonCodes).toContain(
      "PRODUCT_FIT_JOINT_UNSUPPORTED",
    );
  });

  test("the happy path reaches an explained result with neutral component labels and persists it", async ({
    page,
  }) => {
    await start(page);
    await completeQuestionnaire(page);

    await expect(page.getByTestId("ip-result")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("ip-result-band")).toBeVisible();
    // Components use the neutral Very Low..Very High scale, never the
    // portfolio taxonomy (PR #65 review): "financial capacity: Growth" is a
    // category error the suite now forbids.
    for (const testId of ["ip-capacity", "ip-willingness"]) {
      const text = (await page.getByTestId(testId).textContent()) ?? "";
      expect(["Very Low", "Low", "Moderate", "High", "Very High"]).toContain(
        text.trim(),
      );
    }
    await expect(page.getByTestId("ip-fit")).toContainText(
      "Good fit for long-term investing",
    );

    // No sensitive answer payload in browser storage (PR #65 review).
    const storageDump = await page.evaluate(() => {
      const out: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i) ?? "";
        out.push(k + "=" + (window.localStorage.getItem(k) ?? ""));
      }
      return out.join("\n");
    });
    expect(storageDump).not.toContain("netWorthBand");
    expect(storageDump).not.toContain("investor-profile");

    // Persisted server-side: the GET projection returns the assessment.
    const res = await page.request.get("/api/v1/investor/profile/v2");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: {
        assessment: { assessment: { assessmentPolicyVersion: string } } | null;
      } | null;
    };
    expect(body.data?.assessment?.assessment.assessmentPolicyVersion).toBe(
      "profile-policy-v1",
    );
  });

  test("near-term reserve money gets the honest not-fit outcome with the TRUTHFUL reason", async ({
    page,
  }) => {
    await start(page);
    await completeQuestionnaire(page, {
      goal: "near_term_reserve",
      horizon: "1_3y",
      liquidityLikelihood: "likely",
    });
    await expect(page.getByTestId("ip-not-fit")).toBeVisible({
      timeout: 15_000,
    });
    // Reason-specific explanation (PR #65 review): emergency-fund money gets
    // the emergency-fund reason, not a generic timeline sentence.
    await expect(page.getByTestId("ip-not-fit-reason")).toContainText(
      "emergency or near-term reserve",
    );
  });

  test("the three hard not-fit reasons render distinct truthful explanations (API)", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ horizon: "lt_1y" }, "HORIZON_NEAR_TERM_NOT_FIT"],
      [
        {
          goal: "near_term_reserve",
          horizon: "1_3y",
          liquidityLikelihood: "likely",
          // reconcile the flags this combination legitimately raises — the
          // not-fit verdict is the thing under test here
          reconciledFlags: [
            "SHORT_HORIZON_HIGH_WILLINGNESS",
            "GOAL_LIQUIDITY_CONFLICT",
          ],
        },
        "PRODUCT_FIT_EMERGENCY_FUND",
      ],
      [
        { lossThreshold: "pct_5", drawdownBehavior: "sell_all" },
        "PRODUCT_FIT_LOSS_INTOLERANT",
      ],
    ];
    for (const [overrides, code] of cases) {
      const res = await postSameOrigin(page, "/api/v1/investor/profile/v2", {
        data: apiAnswers(overrides),
      });
      expect(res.status(), code).toBe(201);
      const body = (await res.json()) as {
        data: {
          assessment: {
            productFitStatus: string;
            constraintReasonCodes: string[];
          };
        };
      };
      expect(body.data.assessment.productFitStatus, code).toBe("not_fit");
      expect(body.data.assessment.constraintReasonCodes, code).toContain(code);
    }
  });

  test("two simultaneous conflicts require two separate clarification steps", async ({
    page,
  }) => {
    await start(page);
    await completeQuestionnaire(
      page,
      {
        knowledgeLevel: "learning",
        drawdownBehavior: "buy_more",
        lossThreshold: "pct_10",
      },
      { productExperience: ["quant_strategies"] },
    );

    // First flag: EXPERIENCE_CONFLICT — its own copy, not a timeline line.
    await expect(page.getByTestId("ip-clarify")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("ip-clarify-body")).toContainText(
      "still learning",
    );
    await page.getByTestId("ip-keep-both").click();

    // Second flag: INCONSISTENT_LOSS_BEHAVIOR — different copy. One click
    // may never bulk-acknowledge unrelated contradictions.
    await expect(page.getByTestId("ip-clarify")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("ip-clarify-body")).toContainText(
      "invest more after a sharp fall",
    );
    await page.getByTestId("ip-keep-both").click();

    await expect(page.getByTestId("ip-result")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("server rejects contradictory 'none' multi-selects and arbitrary reconciliation flags", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });

    const contradictory = await postSameOrigin(
      page,
      "/api/v1/investor/profile/v2",
      {
        data: apiAnswers({
          restrictions: ["none", "employer_securities"],
          restrictionDetails: "ACME",
        }),
      },
    );
    expect(contradictory.status()).toBe(400);

    const contradictoryExp = await postSameOrigin(
      page,
      "/api/v1/investor/profile/v2",
      { data: apiAnswers({ productExperience: ["none", "options"] }) },
    );
    expect(contradictoryExp.status()).toBe(400);

    const missingDetails = await postSameOrigin(
      page,
      "/api/v1/investor/profile/v2",
      { data: apiAnswers({ restrictions: ["specific_companies"] }) },
    );
    expect(missingDetails.status()).toBe(400);

    const missingKinds = await postSameOrigin(
      page,
      "/api/v1/investor/profile/v2",
      { data: apiAnswers({ expectedFinancialChange: "yes" }) },
    );
    expect(missingKinds.status()).toBe(400);

    // Arbitrary reconciledFlags are dropped server-side: reconciling a flag
    // the engine never raised must not change the clean-profile outcome.
    const bogusReconcile = await postSameOrigin(
      page,
      "/api/v1/investor/profile/v2",
      {
        data: apiAnswers({
          reconciledFlags: ["CONCENTRATION_ALPHA_CONFLICT"],
        }),
      },
    );
    expect(bogusReconcile.status()).toBe(201);
    const body = (await bogusReconcile.json()) as {
      data: { assessment: { consistencyFlags: string[] } };
    };
    expect(body.data.assessment.consistencyFlags).toEqual([]);
  });

  test("a draft saved mid-flow resumes after reload — server-side, not browser storage", async ({
    page,
  }) => {
    await start(page);
    await pickSingle(page, "individual");
    await pickSingle(page, "retirement");
    await pickSingle(page, "gt_10y");
    await expect(page.getByTestId("ip-step-withdrawalPattern")).toBeVisible();

    // Reload: resume must come from the server draft (no browser storage).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ip-step-withdrawalPattern")).toBeVisible({
      timeout: 30_000,
    });
    const storageDump = await page.evaluate(() => {
      const out: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i) ?? "";
        out.push(k + "=" + (window.localStorage.getItem(k) ?? ""));
      }
      return out.join("\n");
    });
    expect(storageDump).not.toContain("retirement");
    expect(storageDump).not.toContain("investor-profile");
  });
});

test.describe("Investor Profile v2 draft isolation", () => {
  test("one user's draft is invisible to another account", async ({
    browser,
  }) => {
    const signalCtx = await browser.newContext();
    await signalCtx.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
    const signalPage = await signalCtx.newPage();
    await start(signalPage);
    await pickSingle(signalPage, "individual");
    await pickSingle(signalPage, "education_family");
    await expect(signalPage.getByTestId("ip-step-horizon")).toBeVisible();

    const managedCtx = await browser.newContext();
    await managedCtx.addCookies(
      await e2eAuthCookies(E2E_USERS.managed.eligibilityCookie),
    );
    const managedPage = await managedCtx.newPage();
    await managedPage.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const res = await managedPage.request.get(
      "/api/v1/investor/profile/v2/draft",
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: { answers?: { goal?: string } } | null;
    };
    // The managed user sees no draft, or at most their OWN — never the
    // signal user's education_family answer.
    expect(body.data?.answers?.goal ?? null).not.toBe("education_family");

    await signalCtx.close();
    await managedCtx.close();
  });
});

test.describe("Investor Profile v2 API boundary", () => {
  test("unauthenticated requests are refused", async ({ request }) => {
    const get = await request.get("/api/v1/investor/profile/v2");
    expect(get.status()).toBe(401);
    const draft = await request.get("/api/v1/investor/profile/v2/draft");
    expect(draft.status()).toBe(401);
  });
});
