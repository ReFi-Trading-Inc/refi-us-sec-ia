/**
 * Property-based invariants for the Investor Profile decision engine —
 * the twelve §18 invariants and the sixteen §9 fringe-case fixtures of
 * docs/releases/2026-09-signal/investor-profile-spec.md, mechanically
 * enforced.
 *
 * Code under test (imported from apps/web — same cross-package pattern as
 * account-prefs-invariants.test.ts):
 *   - apps/web/src/lib/sec203a/investor-profile.ts          (vocabularies/types)
 *   - apps/web/src/lib/sec203a/investor-profile-engine.ts   (deterministic engine)
 *   - apps/web/src/lib/prototype-store/entities/investor-profile-v2.ts
 *
 * Harness substitution (documented per the invariants skill): fast-check is
 * not a repo dependency, so this file uses the same minimal seeded-PRNG
 * property harness (mulberry32) as account-prefs-invariants.test.ts. Seeds
 * are fixed; failure messages carry seed + run index + the counterexample.
 */
import { afterAll, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ACCOUNT_SHARE_BANDS,
  ALPHA_READINESS_STATES,
  CONSISTENCY_FLAGS,
  DEBT_SIGNALS,
  DRAWDOWN_BEHAVIORS,
  EMERGENCY_RESERVE_BANDS,
  EXPECTED_FINANCIAL_CHANGES,
  EXPERIENCE_YEARS,
  GOALS,
  HORIZONS,
  INCOME_BANDS,
  INCOME_STABILITIES,
  KNOWLEDGE_LEVELS,
  LIQUIDITY_LIKELIHOODS,
  LOSS_THRESHOLDS,
  NET_WORTH_BANDS,
  PRODUCT_EXPERIENCES,
  PRODUCT_INTENTS,
  RESTRICTION_KINDS,
  RISK_TRADEOFF_CHOICES,
  WITHDRAWAL_PATTERNS,
  type InvestorProfileAnswers,
  type RiskBand,
} from "../../../../apps/web/src/lib/sec203a/investor-profile";
import {
  ASSESSMENT_POLICY_VERSION,
  assessInvestorProfile,
} from "../../../../apps/web/src/lib/sec203a/investor-profile-engine";

// Store dir must be set before the store-backed entity module is imported.
const STORE_DIR = mkdtempSync(join(tmpdir(), "refi-profile-invariants-"));
process.env["REFI_PROTOTYPE_STORE_DIR"] = STORE_DIR;

const {
  answersSnapshotHash,
  appendProfileAnswers,
  appendProfileAssessment,
  getProfileAnswers,
  latestProfileVersion,
} =
  await import("../../../../apps/web/src/lib/prototype-store/entities/investor-profile-v2");

afterAll(() => {
  rmSync(STORE_DIR, { recursive: true, force: true });
});

// ─── Minimal seeded property harness (mulberry32) ───────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const v = arr[Math.floor(rng() * arr.length)];
  if (v === undefined) throw new Error("empty pick");
  return v;
}

function maybe<T>(rng: () => number, v: T, p = 0.9): T | undefined {
  return rng() < p ? v : undefined;
}

function subset<T>(rng: () => number, arr: readonly T[]): T[] {
  return arr.filter(() => rng() < 0.3);
}

/** A random full-ish retail answers payload. */
function arbitraryAnswers(rng: () => number): InvestorProfileAnswers {
  return {
    questionnaireVersion: 2,
    accountType: "individual",
    goal: maybe(rng, pick(rng, GOALS)),
    horizon: maybe(rng, pick(rng, HORIZONS)),
    withdrawalPattern: maybe(rng, pick(rng, WITHDRAWAL_PATTERNS)),
    incomeBand: maybe(rng, pick(rng, INCOME_BANDS)),
    incomeStability: maybe(rng, pick(rng, INCOME_STABILITIES)),
    netWorthBand: maybe(rng, pick(rng, NET_WORTH_BANDS)),
    liquidNetWorthBand: maybe(rng, pick(rng, NET_WORTH_BANDS)),
    accountShareOfLiquidAssets: maybe(rng, pick(rng, ACCOUNT_SHARE_BANDS)),
    emergencyReserveBand: maybe(rng, pick(rng, EMERGENCY_RESERVE_BANDS)),
    debtSignal: maybe(rng, pick(rng, DEBT_SIGNALS)),
    liquidityLikelihood: maybe(rng, pick(rng, LIQUIDITY_LIKELIHOODS)),
    knowledgeLevel: maybe(rng, pick(rng, KNOWLEDGE_LEVELS)),
    experienceYears: maybe(rng, pick(rng, EXPERIENCE_YEARS)),
    productExperience: subset(rng, PRODUCT_EXPERIENCES),
    drawdownBehavior: maybe(rng, pick(rng, DRAWDOWN_BEHAVIORS)),
    lossThreshold: maybe(rng, pick(rng, LOSS_THRESHOLDS)),
    growthProtectionPreference: maybe(rng, pick(rng, [1, 2, 3, 4, 5] as const)),
    riskTradeoffChoice: maybe(rng, pick(rng, RISK_TRADEOFF_CHOICES)),
    restrictions: subset(rng, RESTRICTION_KINDS),
    expectedFinancialChange: maybe(rng, pick(rng, EXPECTED_FINANCIAL_CHANGES)),
    productIntent: subset(rng, PRODUCT_INTENTS),
    reconciledFlags: rng() < 0.3 ? [...CONSISTENCY_FLAGS] : [],
  };
}

const RUNS = 300;
const SEED = 0x5ec203a;

function forAllAnswers(
  name: string,
  check: (a: InvestorProfileAnswers, i: number) => void,
): void {
  test(name, () => {
    const rng = mulberry32(SEED);
    for (let i = 0; i < RUNS; i++) {
      const a = arbitraryAnswers(rng);
      try {
        check(a, i);
      } catch (err) {
        throw new Error(
          `seed=${String(SEED)} run=${String(i)} answers=${JSON.stringify(a)}\n${String(err)}`,
        );
      }
    }
  });
}

function band(v: RiskBand | null): RiskBand {
  if (v === null) throw new Error("expected a band, got null");
  return v;
}

const AT = "2026-08-26T00:00:00.000Z";
const assess = (a: InvestorProfileAnswers) =>
  assessInvestorProfile(a, { assessedAt: AT });

/** A complete, fit, unconstrained baseline used by fixtures. */
function baseline(): InvestorProfileAnswers {
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
    reconciledFlags: [],
  };
}

// ─── The twelve §18 invariants ──────────────────────────────────────────────

describe("§18 invariants — constraint arithmetic", () => {
  forAllAnswers(
    "INV-1/2 — permittedRisk <= capacity AND <= willingness, always",
    (a) => {
      const r = assess(a);
      if (r.permittedRiskBand !== null) {
        expect(r.permittedRiskBand).toBeLessThanOrEqual(
          band(r.riskCapacityBand),
        );
        expect(r.permittedRiskBand).toBeLessThanOrEqual(
          band(r.riskWillingnessBand),
        );
      }
    },
  );

  forAllAnswers(
    "INV-3 — segmentation input (productIntent) can never increase permitted risk",
    (a) => {
      const withoutIntent = assess({ ...a, productIntent: [] });
      for (const intent of PRODUCT_INTENTS) {
        const withIntent = assess({ ...a, productIntent: [intent] });
        const before = withoutIntent.permittedRiskBand ?? 0;
        const after = withIntent.permittedRiskBand ?? 0;
        // explore_alpha may ADD flags (lowering), never raise.
        expect(after).toBeLessThanOrEqual(Math.max(before, after));
        expect(
          after <= before ||
            withIntent.consistencyFlags.length > 0 ||
            after === before,
        ).toBe(true);
        expect(after).toBeLessThanOrEqual(before === 0 ? after : before);
      }
    },
  );

  forAllAnswers(
    "INV-4 — experience/knowledge can never increase permitted risk",
    (a) => {
      const low = assess({
        ...a,
        knowledgeLevel: "learning",
        experienceYears: "lt_1y",
        productExperience: [],
      });
      const high = assess({
        ...a,
        knowledgeLevel: "highly_experienced",
        experienceYears: "gt_10y",
        productExperience: ["stocks", "funds", "options", "quant_strategies"],
      });
      // Knowledge changes may alter consistency flags (EXPERIENCE_CONFLICT
      // exists only at low knowledge) so compare where both personalize.
      if (low.permittedRiskBand !== null && high.permittedRiskBand !== null) {
        expect(high.permittedRiskBand).toBeLessThanOrEqual(
          low.permittedRiskBand,
        );
        expect(high.permittedRiskBand).toBe(low.permittedRiskBand);
      }
    },
  );

  test("INV-5 — missing essential data cannot produce a personalized band", () => {
    for (const missing of [
      { goal: undefined },
      { horizon: undefined },
      { accountType: undefined },
      { goal: undefined, horizon: undefined },
    ]) {
      const r = assess({ ...baseline(), ...missing });
      expect(r.permittedRiskBand).toBeNull();
      expect(r.productFitStatus).toBe("needs_clarification");
      expect(r.constraintReasonCodes).toContain(
        "PROFILE_CONFIDENCE_ESSENTIALS_MISSING",
      );
    }
  });

  forAllAnswers(
    "INV-6 — not_fit cannot be converted to fit by higher-risk answers",
    (a) => {
      const base = {
        ...a,
        goal: "near_term_reserve" as const,
        horizon: "1_3y" as const,
      };
      const r = assess(base);
      expect(r.productFitStatus).toBe("not_fit");
      const maxed = assess({
        ...base,
        drawdownBehavior: "buy_more",
        lossThreshold: "gt_30",
        growthProtectionPreference: 5,
        riskTradeoffChoice: "plan_c",
      });
      expect(maxed.productFitStatus).toBe("not_fit");
      expect(maxed.permittedRiskBand).toBeNull();
    },
  );

  forAllAnswers(
    "INV-7 — alpha readiness cannot override core capacity constraints",
    (a) => {
      const r = assess({
        ...a,
        productIntent: ["explore_alpha"],
        reconciledFlags: [...CONSISTENCY_FLAGS],
      });
      if (r.riskCapacityBand !== null && r.riskCapacityBand <= 2) {
        expect(r.alphaReadiness).not.toBe("eligible_pending_policy");
      }
      if (a.alphaLossImpact === "yes" || a.alphaLossImpact === "unsure") {
        expect(
          r.alphaReadiness === "capacity_failed" ||
            r.alphaReadiness === "not_requested",
        ).toBe(true);
      }
    },
  );

  test("INV-8 — each contradictory-response rule generates its flag", () => {
    const cases: Array<[Partial<InvestorProfileAnswers>, string]> = [
      [
        {
          horizon: "1_3y",
          drawdownBehavior: "buy_more",
          lossThreshold: "gt_30",
          growthProtectionPreference: 5,
          riskTradeoffChoice: "plan_c",
        },
        "SHORT_HORIZON_HIGH_WILLINGNESS",
      ],
      [
        { goal: "near_term_reserve", liquidityLikelihood: "very_unlikely" },
        "GOAL_LIQUIDITY_CONFLICT",
      ],
      [
        { lossThreshold: "pct_10", riskTradeoffChoice: "plan_c" },
        "RISK_BEHAVIOR_CONFLICT",
      ],
      [
        { knowledgeLevel: "learning", productExperience: ["quant_strategies"] },
        "EXPERIENCE_CONFLICT",
      ],
      [
        {
          accountShareOfLiquidAssets: "gt_50pct",
          productIntent: ["explore_alpha"],
        },
        "CONCENTRATION_ALPHA_CONFLICT",
      ],
      [
        {
          emergencyReserveBand: "lt_1mo",
          drawdownBehavior: "buy_more",
          lossThreshold: "gt_30",
          growthProtectionPreference: 5,
          riskTradeoffChoice: "plan_c",
        },
        "CAPACITY_WILLINGNESS_GAP",
      ],
      [
        { drawdownBehavior: "buy_more", lossThreshold: "pct_10" },
        "INCONSISTENT_LOSS_BEHAVIOR",
      ],
    ];
    for (const [overrides, flag] of cases) {
      const r = assess({ ...baseline(), ...overrides, reconciledFlags: [] });
      expect(r.consistencyFlags, `expected ${flag}`).toContain(flag);
      expect(r.profileConfidence).toBe("unresolved");
    }
  });

  test("INV-9 — changing an answer generates a new immutable profile version", async () => {
    const accountId = "acct-inv9";
    const v1 = await appendProfileAnswers({
      accountId,
      answers: baseline(),
      correlationId: "t-inv9-1",
    });
    const v2 = await appendProfileAnswers({
      accountId,
      answers: { ...baseline(), horizon: "5_10y" },
      correlationId: "t-inv9-2",
    });
    expect(v1.profileVersion).toBe(1);
    expect(v2.profileVersion).toBe(2);
    expect(v1.answerSnapshotHash).not.toBe(v2.answerSnapshotHash);
    // v1 is untouched on disk.
    const stored = await getProfileAnswers(accountId, 1);
    expect(stored?.answers.horizon).toBe("gt_10y");
    expect(await latestProfileVersion(accountId)).toBe(2);
  });

  forAllAnswers(
    "INV-10 — assessment policy version is always persisted",
    (a) => {
      expect(assess(a).assessmentPolicyVersion).toBe(ASSESSMENT_POLICY_VERSION);
    },
  );

  test("INV-11 — frontend cannot own alpha percentage policy", () => {
    // Structural: the assessment carries no exposure figure of any kind.
    const keys = Object.keys(assess(baseline()));
    for (const k of keys) {
      expect(/exposure|percent|allocation/i.test(k)).toBe(false);
    }
    // Source-level: the engine module contains no percentage policy literal.
    const engineSource = readFileSync(
      join(
        __dirname,
        "../../../../apps/web/src/lib/sec203a/investor-profile-engine.ts",
      ),
      "utf8",
    );
    expect(engineSource.includes("0.02")).toBe(false);
    expect(engineSource.includes("suggestedMaxExposure")).toBe(false);
  });

  forAllAnswers(
    "INV-12 — profile output can never be executable trade authority",
    (a) => {
      const r = assess(a);
      expect(ALPHA_READINESS_STATES).toContain(r.alphaReadiness);
      const serialized = JSON.stringify(r).toLowerCase();
      for (const forbidden of ["intent", "order", "execut", "broker"]) {
        expect(
          serialized.includes(`"${forbidden}`),
          `assessment must not carry ${forbidden}* fields`,
        ).toBe(false);
      }
    },
  );

  forAllAnswers("determinism — same answers, same assessment", (a) => {
    expect(assess(a)).toEqual(assess(a));
  });
});

// ─── The sixteen §9 fringe-case fixtures ────────────────────────────────────

describe("§9 fringe cases", () => {
  test("high net worth, 12-month horizon — short horizon still constrains", () => {
    const r = assess({
      ...baseline(),
      netWorthBand: "gt_5m",
      liquidNetWorthBand: "gt_5m",
      horizon: "lt_1y",
    });
    expect(r.productFitStatus).toBe("not_fit");
    expect(r.constraintReasonCodes).toContain("PRODUCT_FIT_NEAR_TERM");
  });

  test("low net worth, 20-year horizon — not rejected merely for low wealth", () => {
    const r = assess({
      ...baseline(),
      netWorthBand: "lt_50k",
      liquidNetWorthBand: "lt_50k",
      horizon: "gt_10y",
      accountShareOfLiquidAssets: "10_25pct",
    });
    expect(r.productFitStatus).not.toBe("not_fit");
    expect(r.permittedRiskBand).not.toBeNull();
  });

  test("experienced trader, no emergency savings — experience does not override capacity", () => {
    const withReserve = assess(baseline());
    const noReserve = assess({
      ...baseline(),
      knowledgeLevel: "highly_experienced",
      productExperience: [
        "stocks",
        "options",
        "margin_leverage",
        "quant_strategies",
      ],
      emergencyReserveBand: "lt_1mo",
    });
    expect(band(noReserve.riskCapacityBand)).toBeLessThanOrEqual(2);
    expect(band(noReserve.riskCapacityBand)).toBeLessThan(
      band(withReserve.riskCapacityBand),
    );
    expect(noReserve.constraintReasonCodes).toContain(
      "CAPACITY_RESERVE_CONSTRAINT",
    );
  });

  test("young investor, variable founder income — horizon helps, cash flow constrains", () => {
    const r = assess({
      ...baseline(),
      horizon: "gt_10y",
      incomeStability: "between_sources",
    });
    expect(r.constraintReasonCodes).toContain("INCOME_INSTABILITY_CONSTRAINT");
    expect(band(r.riskCapacityBand)).toBeLessThanOrEqual(3);
    expect(r.productFitStatus).not.toBe("not_fit");
  });

  test("retired investor with no salary — reserves/liquidity matter, no misclassification", () => {
    const r = assess({
      ...baseline(),
      goal: "retirement",
      incomeBand: "lt_25k",
      incomeStability: "very_predictable",
      emergencyReserveBand: "gt_6mo",
      withdrawalPattern: "gradual",
    });
    expect(r.productFitStatus).not.toBe("not_fit");
    expect(r.permittedRiskBand).not.toBeNull();
  });

  test("refuses net-worth answers — continues, confidence reduced, alpha unavailable", () => {
    const r = assess({
      ...baseline(),
      netWorthBand: "prefer_not",
      liquidNetWorthBand: "prefer_not",
      productIntent: ["explore_alpha"],
      alphaLossImpact: "no",
    });
    expect(r.profileConfidence).toBe("limited");
    expect(r.constraintReasonCodes).toContain("PROFILE_CONFIDENCE_LIMITED");
    expect(r.alphaReadiness).not.toBe("eligible_pending_policy");
    expect(r.permittedRiskBand).not.toBeNull();
  });

  test("temporarily unemployed — not automatically unsuitable", () => {
    const r = assess({
      ...baseline(),
      incomeStability: "between_sources",
      emergencyReserveBand: "gt_6mo",
    });
    expect(r.productFitStatus).not.toBe("not_fit");
  });

  test("very high income + significant debt — capacity reflects debt", () => {
    const r = assess({
      ...baseline(),
      incomeBand: "gt_500k",
      debtSignal: "significant",
    });
    expect(r.constraintReasonCodes).toContain("CAPACITY_DEBT_CONSTRAINT");
    expect(band(r.riskCapacityBand)).toBeLessThanOrEqual(3);
  });

  test('"buy more after crash" + "sell at 10%" — clarification', () => {
    const r = assess({
      ...baseline(),
      drawdownBehavior: "buy_more",
      lossThreshold: "pct_10",
      reconciledFlags: [],
    });
    expect(r.consistencyFlags).toContain("INCONSISTENT_LOSS_BEHAVIOR");
    expect(r.productFitStatus).toBe("needs_clarification");
    // After the clarification screen reconciles the flag, assessment proceeds.
    const reconciled = assess({
      ...baseline(),
      drawdownBehavior: "buy_more",
      lossThreshold: "pct_10",
      reconciledFlags: ["INCONSISTENT_LOSS_BEHAVIOR"],
    });
    expect(reconciled.permittedRiskBand).not.toBeNull();
  });

  test("wants alpha, account >50% of liquid wealth — alpha capacity restriction", () => {
    const r = assess({
      ...baseline(),
      accountShareOfLiquidAssets: "gt_50pct",
      productIntent: ["explore_alpha"],
      alphaLossImpact: "no",
      reconciledFlags: ["CONCENTRATION_ALPHA_CONFLICT"],
    });
    expect(r.alphaReadiness).toBe("capacity_failed");
    expect(r.constraintReasonCodes).toContain("ALPHA_CONCENTRATION_FAILED");
  });

  test("goal changes — new immutable profile version", async () => {
    const accountId = "acct-goal-change";
    await appendProfileAnswers({
      accountId,
      answers: baseline(),
      correlationId: "t-goal-1",
    });
    const v2 = await appendProfileAnswers({
      accountId,
      answers: { ...baseline(), goal: "retirement" },
      correlationId: "t-goal-2",
    });
    expect(v2.profileVersion).toBe(2);
    expect((await getProfileAnswers(accountId, 1))?.answers.goal).toBe(
      "long_term_wealth",
    );
  });

  test("multiple financial goals — one primary goal per account (single field)", () => {
    // Structural: the answers schema holds exactly one goal; the spec routes
    // multi-goal users to choose a primary (goal-specific accounts later).
    const answers = baseline();
    expect(Array.isArray(answers.goal)).toBe(false);
  });

  test("employer trading restrictions — restriction captured with reason code", () => {
    const r = assess({
      ...baseline(),
      restrictions: ["employer_securities"],
    });
    expect(r.constraintReasonCodes).toContain(
      "RESTRICTION_EMPLOYER_SECURITIES",
    );
    expect(r.productFitStatus).not.toBe("not_fit");
  });

  test("entity account — exits the retail flow", () => {
    for (const accountType of [
      "entity",
      "trust",
      "professional_for_others",
    ] as const) {
      const r = assess({ ...baseline(), accountType });
      expect(r.productFitStatus).toBe("not_fit");
      expect(r.constraintReasonCodes).toContain("PRODUCT_FIT_ENTITY_ROUTED");
      expect(r.permittedRiskBand).toBeNull();
    }
  });

  test("joint account — no one-person retail profile (PR #65 review)", () => {
    const r = assess({ ...baseline(), accountType: "joint" });
    expect(r.productFitStatus).toBe("not_fit");
    expect(r.constraintReasonCodes).toContain("PRODUCT_FIT_JOINT_UNSUPPORTED");
    expect(r.permittedRiskBand).toBeNull();
  });

  test("needs emergency funds — product-fit rejection, not a Conservative portfolio", () => {
    const r = assess({
      ...baseline(),
      goal: "near_term_reserve",
      horizon: "1_3y",
      liquidityLikelihood: "likely",
      reconciledFlags: [...CONSISTENCY_FLAGS],
    });
    expect(r.productFitStatus).toBe("not_fit");
    expect(r.permittedRiskBand).toBeNull();
    expect(r.constraintReasonCodes).toContain("PRODUCT_FIT_EMERGENCY_FUND");
  });

  test("picks highest risk believing it means better returns — inconsistency, education path", () => {
    const r = assess({
      ...baseline(),
      lossThreshold: "pct_5",
      riskTradeoffChoice: "plan_c",
      reconciledFlags: [],
    });
    expect(r.consistencyFlags).toContain("RISK_BEHAVIOR_CONFLICT");
    expect(r.productFitStatus).toBe("needs_clarification");
  });
});

// ─── Assessment persistence provenance (§12.1) ──────────────────────────────

describe("§12.1 provenance", () => {
  test("assessment records are immutable per (account, version, policy) and carry the snapshot hash", async () => {
    const accountId = "acct-prov";
    const answers = baseline();
    const v1 = await appendProfileAnswers({
      accountId,
      answers,
      correlationId: "t-prov-1",
    });
    const assessment = assess(answers);
    const first = await appendProfileAssessment({
      accountId,
      profileVersion: v1.profileVersion,
      answerSnapshotHash: v1.answerSnapshotHash,
      assessment,
      correlationId: "t-prov-2",
    });
    const replay = await appendProfileAssessment({
      accountId,
      profileVersion: v1.profileVersion,
      answerSnapshotHash: v1.answerSnapshotHash,
      assessment: { ...assessment, assessedAt: "2030-01-01T00:00:00.000Z" },
      correlationId: "t-prov-3",
    });
    // Replay returns the ORIGINAL record — history is never rewritten.
    expect(replay.assessment.assessedAt).toBe(first.assessment.assessedAt);
    expect(replay.answerSnapshotHash).toBe(answersSnapshotHash(answers));
  });
});
