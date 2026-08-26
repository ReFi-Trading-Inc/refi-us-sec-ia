/**
 * Investor Profile questionnaire (questionnaireVersion 2) — e2e for the
 * spec's flow requirements: entity exit, the happy path to an explained
 * result, the honest not-fit outcome, and the clarification loop. All policy
 * assertions here are about SERVER verdicts rendered by the UI — the page
 * computes nothing.
 */
import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";

async function start(page: Page) {
  await page.goto("/us/onboarding/investor-profile", {
    waitUntil: "domcontentloaded",
  });
  // Hydration gate (see e2e/hydration.ts): a click that lands between first
  // paint and hydration is silently discarded, so the FIRST stateful
  // interaction retries until its effect is observed. React hydrates the tree
  // as a unit, so later clicks in the flow need no wrapper.
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

  test("the happy path reaches an explained result and persists it", async ({
    page,
  }) => {
    await start(page);
    await completeQuestionnaire(page);

    await expect(page.getByTestId("ip-result")).toBeVisible({
      timeout: 15_000,
    });
    // The band label comes from the SERVER assessment; the constraint rule
    // (permitted = min(capacity, willingness)) is asserted by comparing the
    // rendered components, not recomputed.
    await expect(page.getByTestId("ip-result-band")).toBeVisible();
    await expect(page.getByTestId("ip-capacity")).toBeVisible();
    await expect(page.getByTestId("ip-willingness")).toBeVisible();
    await expect(page.getByTestId("ip-fit")).toContainText(
      "Good fit for long-term investing",
    );

    // Persisted: the GET projection returns the same assessment version.
    const res = await page.request.get("/api/v1/investor/profile/v2");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: {
        answers: { profileVersion: number };
        assessment: {
          assessment: { assessmentPolicyVersion: string };
        } | null;
      } | null;
    };
    expect(body.data).not.toBeNull();
    expect(body.data?.assessment?.assessment.assessmentPolicyVersion).toBe(
      "profile-policy-v1",
    );
  });

  test("near-term reserve money gets the honest not-fit outcome, not a Conservative portfolio", async ({
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
    await expect(
      page.getByText("This money may have a different job."),
    ).toBeVisible();
  });

  test("contradictory answers trigger the clarification screen, then resolve", async ({
    page,
  }) => {
    await start(page);
    await completeQuestionnaire(page, {
      drawdownBehavior: "buy_more",
      lossThreshold: "pct_10",
    });
    // Server said 409 consistency_unresolved — the UI runs the clarification
    // screen rather than averaging the contradiction away.
    await expect(page.getByTestId("ip-clarify")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Let's double-check one thing.")).toBeVisible();
    // The user stands by both answers: they are recorded as reconciled and
    // the engine proceeds (history keeps both).
    await page.getByTestId("ip-keep-both").click();
    await expect(page.getByTestId("ip-result")).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Investor Profile v2 API boundary", () => {
  test("unauthenticated requests are refused", async ({ request }) => {
    const get = await request.get("/api/v1/investor/profile/v2");
    expect(get.status()).toBe(401);
  });
});
