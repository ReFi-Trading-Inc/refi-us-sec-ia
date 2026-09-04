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
type DraftView = {
  sessionId: string;
  draftRevision: number;
  currentStepId: string;
  answers: Record<string, unknown>;
} | null;

async function readDraft(page: Page): Promise<DraftView> {
  const res = await page.request.get("/api/v1/investor/profile/v2/draft");
  expect(res.status()).toBe(200);
  return ((await res.json()) as { data: DraftView }).data;
}

async function saveDraft(
  page: Page,
  body: {
    sessionId: string;
    draftRevision: number;
    currentStepId?: string;
    answers?: Record<string, unknown>;
  },
) {
  const res = await postSameOrigin(page, "/api/v1/investor/profile/v2/draft", {
    data: {
      answers: body.answers ?? { questionnaireVersion: 2 },
      currentStepId: body.currentStepId ?? "accountType",
      sessionId: body.sessionId,
      draftRevision: body.draftRevision,
    },
  });
  expect(res.status()).toBe(200);
  return (
    (await res.json()) as {
      data: {
        stored: boolean;
        draftRevision: number | null;
        sessionId: string | null;
        reason?: string;
      };
    }
  ).data;
}

/**
 * Park the caller's draft on step 0 WITHIN its existing logical session (a
 * different session must not take over an active draft — PR #65 round 3);
 * a fresh session is only used when the scope has no active draft.
 */
async function resetDraft(page: Page) {
  await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
  const existing = await readDraft(page);
  await saveDraft(page, {
    sessionId:
      existing?.sessionId ??
      `reset-${String(Date.now())}-${String(Math.random())}`,
    draftRevision: (existing?.draftRevision ?? 0) + 1,
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
    details?: string;
    changeKinds?: string[];
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
  const restrictions = multis.restrictions ?? ["none"];
  await pickMulti(page, restrictions);
  if (restrictions.some((r) => r !== "none")) {
    for (const r of restrictions.filter((x) => x !== "none")) {
      await page.getByTestId(`ip-detail-${r}`).fill(multis.details ?? "ACME");
    }
    await page.getByTestId("ip-next").click();
  }
  await pickSingle(page, single.expectedFinancialChange);
  if (single.expectedFinancialChange === "yes") {
    await pickMulti(page, multis.changeKinds ?? ["retirement"]);
  }
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
          restrictionDetails: { employerSecurities: ["ACME"] },
        }),
      },
    );
    expect(contradictory.status()).toBe(400);

    // Explicit-answer requirement (PR #65 round 2): empty/omitted is NOT
    // "none" — both are rejected; the explicit ["none"] succeeds elsewhere.
    const emptyRestrictions = await postSameOrigin(
      page,
      "/api/v1/investor/profile/v2",
      { data: apiAnswers({ restrictions: [] }) },
    );
    expect(emptyRestrictions.status()).toBe(400);
    const { restrictions: _omitted, ...withoutRestrictions } = apiAnswers();
    const omittedRestrictions = await postSameOrigin(
      page,
      "/api/v1/investor/profile/v2",
      { data: withoutRestrictions },
    );
    expect(omittedRestrictions.status()).toBe(400);

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

  test("retracted branch answers are canonicalized away before persistence (API)", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const res = await postSameOrigin(page, "/api/v1/investor/profile/v2", {
      data: apiAnswers({
        expectedFinancialChange: "no",
        expectedFinancialChangeKinds: ["retirement"], // stale child
        productIntent: ["disciplined_long_term"],
        alphaLossImpact: "no", // stale child
        restrictions: ["none"],
        restrictionDetails: { excludedCompanies: ["ACME"] }, // stale child
      }),
    });
    expect(res.status()).toBe(201);
    const get = await page.request.get("/api/v1/investor/profile/v2");
    const body = (await get.json()) as {
      data: {
        answers: {
          answers: {
            expectedFinancialChangeKinds?: unknown;
            alphaLossImpact?: unknown;
            restrictionDetails?: unknown;
          };
        };
      };
    };
    expect(
      body.data.answers.answers.expectedFinancialChangeKinds,
    ).toBeUndefined();
    expect(body.data.answers.answers.alphaLossImpact).toBeUndefined();
    expect(body.data.answers.answers.restrictionDetails).toBeUndefined();
  });

  test("Review → Edit resolves correct steps with conditional branches HIDDEN", async ({
    page,
  }) => {
    await start(page);
    await pickSingle(page, "individual");
    await pickSingle(page, "long_term_wealth");
    await pickSingle(page, "gt_10y");
    await pickSingle(page, "gradual");
    await page.getByTestId("ip-next").click();
    await pickSingle(page, "100_200k");
    await pickSingle(page, "very_predictable");
    await pickSingle(page, "500k_1m");
    await pickSingle(page, "250_500k");
    await pickSingle(page, "10_25pct");
    await pickSingle(page, "gt_6mo");
    await pickSingle(page, "none");
    await pickSingle(page, "very_unlikely");
    await pickSingle(page, "experienced");
    await pickSingle(page, "5_10y");
    await pickMulti(page, ["stocks"]);
    await pickSingle(page, "stay");
    await pickSingle(page, "pct_20");
    await page.getByTestId("ip-opt-scale-4").click();
    await pickSingle(page, "plan_b");
    await pickMulti(page, ["none"]);
    await pickSingle(page, "no");
    await pickMulti(page, ["disciplined_long_term"]);
    await expect(page.getByTestId("ip-review")).toBeVisible();

    // With restrictionDetails / changeKinds / alpha ALL hidden, editing a
    // question that sits AFTER those hidden branches must open exactly that
    // question (PR #65 round 2 — no filtered-index drift).
    await page.getByTestId("ip-edit-expectedFinancialChange").click();
    await expect(
      page.getByTestId("ip-step-expectedFinancialChange"),
    ).toBeVisible();
    await pickSingle(page, "no"); // returns to review
    await expect(page.getByTestId("ip-review")).toBeVisible();
    await page.getByTestId("ip-edit-productIntent").click();
    await expect(page.getByTestId("ip-step-productIntent")).toBeVisible();
  });

  test("Review → Edit resolves correct steps with branches VISIBLE; structured details round-trip", async ({
    page,
  }) => {
    await start(page);
    await completeQuestionnaire(
      page,
      { expectedFinancialChange: "yes" },
      {
        restrictions: ["specific_companies"],
        details: "ACME, Globex",
        changeKinds: ["retirement"],
      },
    );
    await expect(page.getByTestId("ip-result")).toBeVisible({
      timeout: 15_000,
    });

    const get = await page.request.get("/api/v1/investor/profile/v2");
    const body = (await get.json()) as {
      data: {
        answers: {
          answers: {
            restrictionDetails?: { excludedCompanies?: string[] };
            expectedFinancialChangeKinds?: string[];
          };
        };
      };
    };
    expect(
      body.data.answers.answers.restrictionDetails?.excludedCompanies,
    ).toEqual(["ACME", "Globex"]);
    expect(body.data.answers.answers.expectedFinancialChangeKinds).toEqual([
      "retirement",
    ]);
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

test.describe("Investor Profile v2 draft finality (PR #65 round 3)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
  });

  test("resume continues session A at revision N+1; submit closes it server-side; late A save cannot resurrect", async ({
    page,
  }) => {
    await start(page);
    await pickSingle(page, "individual");
    await pickSingle(page, "retirement");
    await expect(page.getByTestId("ip-step-horizon")).toBeVisible();
    const before = await readDraft(page);
    if (before === null) throw new Error("expected an active server draft");
    const sessionA = before.sessionId;
    const revN = before.draftRevision;

    // Reload → resume adopts session A and revision N (no session B minted).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ip-step-horizon")).toBeVisible({
      timeout: 30_000,
    });
    await pickSingle(page, "gt_10y");
    await expect(page.getByTestId("ip-step-withdrawalPattern")).toBeVisible();
    await expect(async () => {
      const after = await readDraft(page);
      expect(after?.sessionId).toBe(sessionA);
      expect(after?.draftRevision ?? 0).toBeGreaterThan(revN);
      expect(after?.currentStepId).toBe("withdrawalPattern");
    }).toPass({ timeout: 10_000 });
    const resumed = await readDraft(page);
    if (resumed === null) throw new Error("expected the resumed server draft");
    const revResumed = resumed.draftRevision;

    // Direct valid submit WITHOUT draftSessionId: finality must be server-derived.
    const submit = await postSameOrigin(page, "/api/v1/investor/profile/v2", {
      data: apiAnswers({}),
    });
    expect(submit.status()).toBe(201);
    expect(await readDraft(page)).toBeNull();

    // Late autosave from the closed session A: not stored, draft stays closed.
    const late = await saveDraft(page, {
      sessionId: sessionA,
      draftRevision: revResumed + 100,
      currentStepId: "withdrawalPattern",
      answers: { questionnaireVersion: 2, accountType: "individual" },
    });
    expect(late.stored).toBe(false);
    expect(late.reason).toBe("session_closed");
    expect(await readDraft(page)).toBeNull();
  });

  test("a bogus client draftSessionId cannot defeat server-derived closing", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    // Scope was closed by the previous test → a fresh session is admitted.
    const sessionC = `c-${String(Date.now())}`;
    const created = await saveDraft(page, {
      sessionId: sessionC,
      draftRevision: 1,
      currentStepId: "goal",
      answers: { questionnaireVersion: 2, accountType: "individual" },
    });
    expect(created.stored).toBe(true);
    expect((await readDraft(page))?.sessionId).toBe(sessionC);

    const submit = await postSameOrigin(page, "/api/v1/investor/profile/v2", {
      data: { ...apiAnswers({}), draftSessionId: "bogus-session-id" },
    });
    expect(submit.status()).toBe(201);
    expect(await readDraft(page)).toBeNull();
    const late = await saveDraft(page, {
      sessionId: sessionC,
      draftRevision: 2,
    });
    expect(late.stored).toBe(false);
    expect(late.reason).toBe("session_closed");
    expect(await readDraft(page)).toBeNull();
  });

  test("an unrelated session cannot silently take over an active draft", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const sessionE = `e-${String(Date.now())}`;
    const e1 = await saveDraft(page, {
      sessionId: sessionE,
      draftRevision: 1,
      currentStepId: "goal",
      answers: { questionnaireVersion: 2, accountType: "individual" },
    });
    expect(e1.stored).toBe(true);
    const takeover = await saveDraft(page, {
      sessionId: `b-${String(Date.now())}`,
      draftRevision: 1,
      currentStepId: "horizon",
      answers: { questionnaireVersion: 2, accountType: "trust" },
    });
    expect(takeover.stored).toBe(false);
    expect(takeover.reason).toBe("session_mismatch");
    const still = await readDraft(page);
    expect(still?.sessionId).toBe(sessionE);
    expect(still?.currentStepId).toBe("goal");
    // Session E continues normally at the next revision.
    const e2 = await saveDraft(page, {
      sessionId: sessionE,
      draftRevision: 2,
      currentStepId: "horizon",
    });
    expect(e2.stored).toBe(true);
    // Stale revision from E is ignored.
    const stale = await saveDraft(page, {
      sessionId: sessionE,
      draftRevision: 2,
      currentStepId: "goal",
    });
    expect(stale.stored).toBe(false);
    expect(stale.reason).toBe("stale_revision");
    expect((await readDraft(page))?.currentStepId).toBe("horizon");
  });
});

test.describe("Investor Profile v2 draft isolation", () => {
  test("one user's draft is invisible to another user", async ({ browser }) => {
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
    // USER-level isolation: the managed user sees no draft, or at most their
    // OWN — never the signal user's education_family answer. ACCOUNT-level
    // isolation for one authId owning multiple accounts is proven at the
    // persistence seam in investor-profile-invariants.test.ts (the e2e seed
    // has one account per user).
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
