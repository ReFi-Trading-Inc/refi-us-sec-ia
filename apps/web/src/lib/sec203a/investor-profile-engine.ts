/**
 * Investor Profile policy engine — deterministic derivation of
 * InvestorProfileAssessment from InvestorProfileAnswers.
 *
 * Source of truth: docs/releases/2026-09-signal/investor-profile-spec.md §4–§5.
 *
 * PIPELINE (order matters, spec §4):
 *   1. product fit          (can pre-empt everything)
 *   2. risk capacity        (weighted factors + hard constraints)
 *   3. risk willingness     (four independent observations)
 *   4. knowledge            (gates complexity; NEVER raises risk)
 *   5. consistency flags    (never averaged away)
 *   6. hard constraints
 *   7. permittedRiskBand = MIN(capacity, willingness)
 *   8. reason codes + bindingConstraint
 *
 * Every number in ASSESSMENT_POLICY_V1 is a PRODUCT-POLICY choice, not an
 * SEC rule (spec §4.1); counsel and the investment-policy owner approve them
 * before release (spec §20 items 3–4), and any change is a NEW
 * assessmentPolicyVersion — historical assessments are never recomputed in
 * place (spec §12.1).
 *
 * This module intentionally contains NO alpha exposure percentage — alpha
 * exposure guidance is backend policy (spec §10, Alpha screen 2) — and no
 * ML/model calls of any kind (spec §1 rule 6). Both exclusions are pinned by
 * the invariants suite.
 */
import type {
  AccountShareBand,
  AlphaReadiness,
  ConsistencyFlag,
  DebtSignal,
  DrawdownBehavior,
  EmergencyReserveBand,
  GrowthProtectionPreference,
  Horizon,
  IncomeStability,
  InvestorProfileAnswers,
  InvestorProfileAssessment,
  KnowledgeBand,
  KnowledgeLevel,
  LiquidityLikelihood,
  LossThreshold,
  ProductFitStatus,
  ReasonCode,
  RiskBand,
  RiskTradeoffChoice,
  WithdrawalPattern,
} from "./investor-profile";
import { RETAIL_ACCOUNT_TYPE } from "./investor-profile";

export const ASSESSMENT_POLICY_VERSION = "profile-policy-v1";

// ─── Policy tables (spec §4.1–§4.2; v1 drafts, policy-versioned) ────────────

/** Factor weights, spec §4.1 — 30/20/20/10/10/10. */
const CAPACITY_WEIGHTS = {
  horizon: 0.3,
  liquidity: 0.2,
  accountShare: 0.2,
  emergencyReserve: 0.1,
  incomeStability: 0.1,
  debt: 0.1,
} as const;

const HORIZON_SCORE: Record<Horizon, number> = {
  lt_1y: 0,
  "1_3y": 25,
  "3_5y": 50,
  "5_10y": 75,
  gt_10y: 100,
  unknown: 35,
};

const WITHDRAWAL_MODIFIER: Record<WithdrawalPattern, number> = {
  lump_sum: -10,
  few_years: 0,
  gradual: 5,
  none_expected: 10,
  unsure: 0,
};

const LIQUIDITY_SCORE: Record<LiquidityLikelihood, number> = {
  very_unlikely: 100,
  possible: 55,
  likely: 15,
  unsure: 40,
};

const ACCOUNT_SHARE_SCORE: Record<AccountShareBand, number> = {
  lt_10pct: 100,
  "10_25pct": 70,
  "25_50pct": 35,
  gt_50pct: 5,
  unsure: 40,
};

const EMERGENCY_RESERVE_SCORE: Record<EmergencyReserveBand, number> = {
  lt_1mo: 0,
  "1_3mo": 40,
  "3_6mo": 70,
  gt_6mo: 100,
  unsure: 40,
  prefer_not: 30,
};

const INCOME_STABILITY_SCORE: Record<IncomeStability, number> = {
  very_predictable: 100,
  mostly_predictable: 75,
  varies_considerably: 35,
  between_sources: 0,
  prefer_not: 40,
};

const DEBT_SCORE: Record<DebtSignal, number> = {
  none: 100,
  manageable: 50,
  significant: 0,
  prefer_not: 40,
};

/** Spec §4.2 ordinal maps — exact values from the specification. */
const DRAWDOWN_WILLINGNESS: Record<DrawdownBehavior, number> = {
  sell_all: 0,
  sell_some: 25,
  unsure: 40,
  stay: 70,
  buy_more: 90,
};

const LOSS_THRESHOLD_WILLINGNESS: Record<LossThreshold, number> = {
  pct_5: 10,
  pct_10: 30,
  pct_20: 55,
  pct_30: 75,
  gt_30: 95,
  unsure: 40,
};

const GROWTH_PREFERENCE_WILLINGNESS: Record<
  GrowthProtectionPreference,
  number
> = { 1: 10, 2: 30, 3: 55, 4: 75, 5: 95 };

const TRADEOFF_WILLINGNESS: Record<RiskTradeoffChoice, number> = {
  plan_a: 25,
  plan_b: 55,
  plan_c: 85,
};

/** 0–100 score → RiskBand 1–5. Shared by capacity and willingness. */
function scoreToBand(score: number): RiskBand {
  if (score < 20) return 1;
  if (score < 40) return 2;
  if (score < 60) return 3;
  if (score < 80) return 4;
  return 5;
}

const KNOWLEDGE_BAND: Record<KnowledgeLevel, KnowledgeBand> = {
  learning: 1,
  comfortable: 2,
  experienced: 3,
  highly_experienced: 4,
};

// ─── Derivation ─────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const lower = s[mid - 1] ?? 0;
  const upper = s[mid] ?? 0;
  return s.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface CapacityResult {
  band: RiskBand;
  codes: ReasonCode[];
}

function deriveCapacity(a: InvestorProfileAnswers): CapacityResult {
  const codes: ReasonCode[] = [];

  const horizonBase = a.horizon !== undefined ? HORIZON_SCORE[a.horizon] : 35;
  const withdrawalMod =
    a.withdrawalPattern !== undefined
      ? WITHDRAWAL_MODIFIER[a.withdrawalPattern]
      : 0;
  const horizonScore = clamp(horizonBase + withdrawalMod, 0, 100);

  const liquidityScore =
    a.liquidityLikelihood !== undefined
      ? LIQUIDITY_SCORE[a.liquidityLikelihood]
      : 40;
  const shareScore =
    a.accountShareOfLiquidAssets !== undefined
      ? ACCOUNT_SHARE_SCORE[a.accountShareOfLiquidAssets]
      : 40;
  const reserveScore =
    a.emergencyReserveBand !== undefined
      ? EMERGENCY_RESERVE_SCORE[a.emergencyReserveBand]
      : 40;
  const incomeScore =
    a.incomeStability !== undefined
      ? INCOME_STABILITY_SCORE[a.incomeStability]
      : 40;
  const debtScore = a.debtSignal !== undefined ? DEBT_SCORE[a.debtSignal] : 40;

  const weighted =
    horizonScore * CAPACITY_WEIGHTS.horizon +
    liquidityScore * CAPACITY_WEIGHTS.liquidity +
    shareScore * CAPACITY_WEIGHTS.accountShare +
    reserveScore * CAPACITY_WEIGHTS.emergencyReserve +
    incomeScore * CAPACITY_WEIGHTS.incomeStability +
    debtScore * CAPACITY_WEIGHTS.debt;

  let band = scoreToBand(weighted);

  // Hard constraints (spec §4.1 table): caps applied AFTER the weighted
  // result, each with its reason code — never silently.
  const cap = (max: RiskBand, code: ReasonCode) => {
    if (band > max) {
      band = max;
      codes.push(code);
    } else if (!codes.includes(code) && band === max) {
      // The condition still holds even if the weighted result already sat at
      // or below the cap — record it only when it actually binds the band.
    }
  };

  if (a.horizon === "1_3y") cap(3, "HORIZON_SHORT_CONSTRAINT");
  if (a.liquidityLikelihood === "likely")
    cap(2, "LIQUIDITY_HIGH_NEED_CONSTRAINT");
  if (a.accountShareOfLiquidAssets === "gt_50pct")
    cap(3, "CONCENTRATION_OVER_50PCT");
  if (a.emergencyReserveBand === "lt_1mo")
    cap(2, "CAPACITY_RESERVE_CONSTRAINT");
  if (a.debtSignal === "significant") cap(3, "CAPACITY_DEBT_CONSTRAINT");
  if (a.incomeStability === "between_sources")
    cap(3, "INCOME_INSTABILITY_CONSTRAINT");

  return { band, codes };
}

function deriveWillingness(a: InvestorProfileAnswers): RiskBand {
  const observations: number[] = [];
  if (a.drawdownBehavior !== undefined)
    observations.push(DRAWDOWN_WILLINGNESS[a.drawdownBehavior]);
  if (a.lossThreshold !== undefined)
    observations.push(LOSS_THRESHOLD_WILLINGNESS[a.lossThreshold]);
  if (a.growthProtectionPreference !== undefined)
    observations.push(
      GROWTH_PREFERENCE_WILLINGNESS[a.growthProtectionPreference],
    );
  if (a.riskTradeoffChoice !== undefined)
    observations.push(TRADEOFF_WILLINGNESS[a.riskTradeoffChoice]);
  if (observations.length === 0) return 2; // conservative default, low confidence handles the rest
  // Median, not mean: one outlier answer must not drag the band; genuine
  // disagreement is the consistency engine's job (spec §4.2).
  return scoreToBand(median(observations));
}

function deriveConsistencyFlags(
  a: InvestorProfileAnswers,
  willingnessBand: RiskBand,
): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = [];
  const alphaInterest = a.productIntent?.includes("explore_alpha") ?? false;

  if ((a.horizon === "lt_1y" || a.horizon === "1_3y") && willingnessBand >= 4) {
    flags.push("SHORT_HORIZON_HIGH_WILLINGNESS");
  }
  if (
    a.goal === "near_term_reserve" &&
    a.liquidityLikelihood === "very_unlikely"
  ) {
    flags.push("GOAL_LIQUIDITY_CONFLICT");
  }
  if (
    (a.lossThreshold === "pct_5" || a.lossThreshold === "pct_10") &&
    a.riskTradeoffChoice === "plan_c"
  ) {
    flags.push("RISK_BEHAVIOR_CONFLICT");
  }
  if (
    a.knowledgeLevel === "learning" &&
    (a.productExperience?.some((p) =>
      ["options", "margin_leverage", "quant_strategies"].includes(p),
    ) ??
      false)
  ) {
    flags.push("EXPERIENCE_CONFLICT");
  }
  if (a.accountShareOfLiquidAssets === "gt_50pct" && alphaInterest) {
    flags.push("CONCENTRATION_ALPHA_CONFLICT");
  }
  if (a.emergencyReserveBand === "lt_1mo" && willingnessBand === 5) {
    flags.push("CAPACITY_WILLINGNESS_GAP");
  }
  if (
    a.drawdownBehavior === "buy_more" &&
    (a.lossThreshold === "pct_5" || a.lossThreshold === "pct_10")
  ) {
    flags.push("INCONSISTENT_LOSS_BEHAVIOR");
  }
  return flags;
}

interface FitResult {
  status: ProductFitStatus;
  codes: ReasonCode[];
}

function deriveProductFit(
  a: InvestorProfileAnswers,
  essentialsMissing: boolean,
  unresolvedFlags: boolean,
  capacityConstrained: boolean,
): FitResult {
  const codes: ReasonCode[] = [];

  if (a.accountType !== RETAIL_ACCOUNT_TYPE && a.accountType !== "joint") {
    return { status: "not_fit", codes: ["PRODUCT_FIT_ENTITY_ROUTED"] };
  }
  if (essentialsMissing) {
    return {
      status: "needs_clarification",
      codes: ["PROFILE_CONFIDENCE_ESSENTIALS_MISSING"],
    };
  }
  // Hard not-fit cases (spec §4.1 / §9): the honest exit.
  if (a.horizon === "lt_1y") {
    codes.push("PRODUCT_FIT_NEAR_TERM", "HORIZON_NEAR_TERM_NOT_FIT");
    return { status: "not_fit", codes };
  }
  if (
    a.goal === "near_term_reserve" &&
    (a.horizon === "1_3y" || a.liquidityLikelihood === "likely")
  ) {
    codes.push("PRODUCT_FIT_EMERGENCY_FUND");
    return { status: "not_fit", codes };
  }
  if (a.lossThreshold === "pct_5" && a.drawdownBehavior === "sell_all") {
    codes.push("PRODUCT_FIT_LOSS_INTOLERANT");
    return { status: "not_fit", codes };
  }
  if (unresolvedFlags) {
    return { status: "needs_clarification", codes: ["CONSISTENCY_UNRESOLVED"] };
  }
  if (capacityConstrained) {
    return { status: "fit_with_constraint", codes };
  }
  return { status: "fit", codes };
}

function deriveAlphaReadiness(
  a: InvestorProfileAnswers,
  capacityBand: RiskBand | null,
  knowledgeBand: KnowledgeBand | null,
  confidence: "complete" | "limited" | "unresolved",
): { readiness: AlphaReadiness; codes: ReasonCode[] } {
  const requested = a.productIntent?.includes("explore_alpha") ?? false;
  if (!requested) return { readiness: "not_requested", codes: [] };

  const codes: ReasonCode[] = [];
  // Capacity-class failures dominate (spec §10): experience never buys risk.
  if (a.alphaLossImpact === "yes" || a.alphaLossImpact === "unsure") {
    codes.push("ALPHA_LOSS_IMPACT_FAILED");
  }
  if (capacityBand === null || capacityBand <= 2) {
    codes.push("ALPHA_CAPACITY_FAILED");
  }
  if (a.accountShareOfLiquidAssets === "gt_50pct") {
    codes.push("ALPHA_CONCENTRATION_FAILED");
  }
  if (codes.length > 0) return { readiness: "capacity_failed", codes };

  if (knowledgeBand === null || knowledgeBand < 3) {
    return {
      readiness: "signal_paper_only",
      codes: ["ALPHA_KNOWLEDGE_LIMITED"],
    };
  }
  if (confidence !== "complete") {
    return {
      readiness: "signal_paper_only",
      codes: ["ALPHA_CONFIDENCE_REQUIRED"],
    };
  }
  // "Eligible" here is eligibility PENDING backend exposure policy — never
  // execution authority (spec §10, Signal-only boundary).
  return { readiness: "eligible_pending_policy", codes: [] };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface AssessOptions {
  /** Injected for deterministic tests; defaults to now. */
  assessedAt?: string;
}

export function assessInvestorProfile(
  answers: InvestorProfileAnswers,
  options: AssessOptions = {},
): InvestorProfileAssessment {
  const essentialsMissing =
    answers.goal === undefined || answers.horizon === undefined;

  const capacity = deriveCapacity(answers);
  const willingnessBand = deriveWillingness(answers);
  const knowledgeBand =
    answers.knowledgeLevel !== undefined
      ? KNOWLEDGE_BAND[answers.knowledgeLevel]
      : null;

  const flags = deriveConsistencyFlags(answers, willingnessBand);
  const reconciled = new Set(answers.reconciledFlags ?? []);
  const unresolvedFlags = flags.some((f) => !reconciled.has(f));

  // Confidence (spec §4.5, §11): refusals on important financial questions
  // and unresolved contradictions degrade it; they never fabricate answers.
  const importantRefusals = [
    answers.incomeBand,
    answers.netWorthBand,
    answers.liquidNetWorthBand,
    answers.emergencyReserveBand,
    answers.debtSignal,
    answers.incomeStability,
  ].filter((v) => v === "prefer_not").length;
  const confidence: "complete" | "limited" | "unresolved" = unresolvedFlags
    ? "unresolved"
    : essentialsMissing || importantRefusals > 0
      ? "limited"
      : "complete";

  const fit = deriveProductFit(
    answers,
    essentialsMissing,
    unresolvedFlags,
    capacity.codes.length > 0,
  );

  const codes: ReasonCode[] = [...capacity.codes, ...fit.codes];
  if (confidence === "limited" && !essentialsMissing) {
    codes.push("PROFILE_CONFIDENCE_LIMITED");
  }
  if (answers.restrictions?.includes("employer_securities")) {
    codes.push("RESTRICTION_EMPLOYER_SECURITIES");
  }
  if (answers.restrictions?.includes("legally_restricted")) {
    codes.push("RESTRICTION_LEGAL");
  }

  // permittedRisk = MIN(capacity, willingness); null when no personalized
  // band may be produced (spec §1 rule 1, §4).
  let permitted: RiskBand | null = null;
  let binding: ReasonCode | null = null;
  const personalizable =
    !essentialsMissing && fit.status !== "not_fit" && !unresolvedFlags;
  if (personalizable) {
    permitted =
      capacity.band <= willingnessBand ? capacity.band : willingnessBand;
    binding =
      capacity.band < willingnessBand
        ? "CAPACITY_BINDING"
        : willingnessBand < capacity.band
          ? "WILLINGNESS_BINDING"
          : "CAPACITY_BINDING"; // equal: capacity named, deterministically
    codes.push(binding);
  }

  const alpha = deriveAlphaReadiness(
    answers,
    personalizable ? capacity.band : null,
    knowledgeBand,
    confidence,
  );
  codes.push(...alpha.codes);

  return {
    assessmentPolicyVersion: ASSESSMENT_POLICY_VERSION,
    riskCapacityBand: essentialsMissing ? null : capacity.band,
    riskWillingnessBand: essentialsMissing ? null : willingnessBand,
    permittedRiskBand: permitted,
    knowledgeBand,
    productFitStatus: fit.status,
    alphaReadiness: alpha.readiness,
    profileConfidence: confidence,
    constraintReasonCodes: [...new Set(codes)],
    consistencyFlags: flags,
    bindingConstraint: binding,
    assessedAt: options.assessedAt ?? new Date().toISOString(),
  };
}
