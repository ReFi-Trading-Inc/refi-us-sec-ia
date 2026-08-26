/**
 * Investor Profile + Product Fit — answer vocabularies and assessment types.
 *
 * Source of truth: docs/releases/2026-09-signal/investor-profile-spec.md
 * (v2, 2026-08-26). The architectural rule this module encodes:
 *
 *   The questionnaire collects facts and behavioral answers. A separate
 *   deterministic policy engine (investor-profile-engine.ts) derives risk
 *   capacity, risk willingness, product fit, alpha readiness and consistency
 *   flags. `riskTolerance` is NOT a field here — it ceased to be a
 *   user-entered value (spec §1, §19).
 *
 * Enum spellings are the machine-stored values from spec §3 and are part of
 * `questionnaireVersion: 2`. Changing any spelling is a questionnaire-version
 * change, not an edit.
 */

// ─── Screen 1 — account type (spec §3, Screen 1) ────────────────────────────

export const ACCOUNT_TYPES = [
  "individual",
  "joint",
  "trust",
  "entity",
  "professional_for_others",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Only this account type proceeds through the retail questionnaire. */
export const RETAIL_ACCOUNT_TYPE: AccountType = "individual";

// ─── Section 1–2 — goal and timeline ────────────────────────────────────────

export const GOALS = [
  "long_term_wealth",
  "retirement",
  "major_purchase",
  "education_family",
  "income_generation",
  "general_investing",
  "near_term_reserve",
  "other",
] as const;
export type Goal = (typeof GOALS)[number];

export const HORIZONS = [
  "lt_1y",
  "1_3y",
  "3_5y",
  "5_10y",
  "gt_10y",
  "unknown",
] as const;
export type Horizon = (typeof HORIZONS)[number];

export const WITHDRAWAL_PATTERNS = [
  "lump_sum",
  "few_years",
  "gradual",
  "none_expected",
  "unsure",
] as const;
export type WithdrawalPattern = (typeof WITHDRAWAL_PATTERNS)[number];

// ─── Section 3 — financial capacity inputs ──────────────────────────────────

export const INCOME_BANDS = [
  "lt_25k",
  "25_50k",
  "50_100k",
  "100_200k",
  "200_500k",
  "gt_500k",
  "prefer_not",
] as const;
export type IncomeBand = (typeof INCOME_BANDS)[number];

export const INCOME_STABILITIES = [
  "very_predictable",
  "mostly_predictable",
  "varies_considerably",
  "between_sources",
  "prefer_not",
] as const;
export type IncomeStability = (typeof INCOME_STABILITIES)[number];

/** Spec §3 Screen 7 — the revised eight-band scale. */
export const NET_WORTH_BANDS = [
  "lt_50k",
  "50_100k",
  "100_250k",
  "250_500k",
  "500k_1m",
  "1_5m",
  "gt_5m",
  "prefer_not",
] as const;
export type NetWorthBand = (typeof NET_WORTH_BANDS)[number];

export const ACCOUNT_SHARE_BANDS = [
  "lt_10pct",
  "10_25pct",
  "25_50pct",
  "gt_50pct",
  "unsure",
] as const;
export type AccountShareBand = (typeof ACCOUNT_SHARE_BANDS)[number];

export const EMERGENCY_RESERVE_BANDS = [
  "lt_1mo",
  "1_3mo",
  "3_6mo",
  "gt_6mo",
  "unsure",
  "prefer_not",
] as const;
export type EmergencyReserveBand = (typeof EMERGENCY_RESERVE_BANDS)[number];

export const DEBT_SIGNALS = [
  "none",
  "manageable",
  "significant",
  "prefer_not",
] as const;
export type DebtSignal = (typeof DEBT_SIGNALS)[number];

export const LIQUIDITY_LIKELIHOODS = [
  "very_unlikely",
  "possible",
  "likely",
  "unsure",
] as const;
export type LiquidityLikelihood = (typeof LIQUIDITY_LIKELIHOODS)[number];

// ─── Section 4 — knowledge and experience ───────────────────────────────────

export const KNOWLEDGE_LEVELS = [
  "learning",
  "comfortable",
  "experienced",
  "highly_experienced",
] as const;
export type KnowledgeLevel = (typeof KNOWLEDGE_LEVELS)[number];

export const EXPERIENCE_YEARS = [
  "lt_1y",
  "1_3y",
  "3_5y",
  "5_10y",
  "gt_10y",
] as const;
export type ExperienceYears = (typeof EXPERIENCE_YEARS)[number];

export const PRODUCT_EXPERIENCES = [
  "stocks",
  "funds",
  "bonds",
  "options",
  "margin_leverage",
  "digital_assets",
  "automated_services",
  "quant_strategies",
  "none",
] as const;
export type ProductExperience = (typeof PRODUCT_EXPERIENCES)[number];

// ─── Section 5 — the four willingness observations ──────────────────────────

export const DRAWDOWN_BEHAVIORS = [
  "sell_all",
  "sell_some",
  "stay",
  "buy_more",
  "unsure",
] as const;
export type DrawdownBehavior = (typeof DRAWDOWN_BEHAVIORS)[number];

export const LOSS_THRESHOLDS = [
  "pct_5",
  "pct_10",
  "pct_20",
  "pct_30",
  "gt_30",
  "unsure",
] as const;
export type LossThreshold = (typeof LOSS_THRESHOLDS)[number];

/** Screen 18 five-position forced choice; 1 = protect value, 5 = maximize growth. */
export type GrowthProtectionPreference = 1 | 2 | 3 | 4 | 5;

export const RISK_TRADEOFF_CHOICES = ["plan_a", "plan_b", "plan_c"] as const;
export type RiskTradeoffChoice = (typeof RISK_TRADEOFF_CHOICES)[number];

// ─── Section 6–7 — restrictions, circumstances, intent ──────────────────────

export const RESTRICTION_KINDS = [
  "none",
  "employer_securities",
  "legally_restricted",
  "specific_companies",
  "specific_industries",
  "other",
] as const;
export type RestrictionKind = (typeof RESTRICTION_KINDS)[number];

export const EXPECTED_FINANCIAL_CHANGES = ["no", "maybe", "yes"] as const;
export type ExpectedFinancialChange =
  (typeof EXPECTED_FINANCIAL_CHANGES)[number];

/** Spec §3 Screen 21 branch — required when the answer is "yes". */
export const FINANCIAL_CHANGE_KINDS = [
  "income_employment",
  "retirement",
  "major_purchase",
  "major_expense",
  "savings_change",
  "other",
] as const;
export type FinancialChangeKind = (typeof FINANCIAL_CHANGE_KINDS)[number];

export const PRODUCT_INTENTS = [
  "disciplined_long_term",
  "personalized_signals",
  "reduce_emotional_decisions",
  "diversify_existing",
  "less_time",
  "understand_systematic",
  "explore_alpha",
] as const;
export type ProductIntent = (typeof PRODUCT_INTENTS)[number];

export const ALPHA_LOSS_IMPACTS = ["yes", "no", "unsure"] as const;
export type AlphaLossImpact = (typeof ALPHA_LOSS_IMPACTS)[number];

// ─── InvestorProfileAnswers (spec §12) ──────────────────────────────────────

/**
 * Raw facts and answers — questionnaireVersion 2. Essential fields (spec
 * §11): goal and horizon; without them no personalized assessment can be
 * produced. Everything else degrades confidence rather than blocking.
 */
export interface InvestorProfileAnswers {
  questionnaireVersion: 2;
  /** Essential (spec §11): unanswered means no assessment may personalize. */
  accountType?: AccountType;

  goal?: Goal;
  horizon?: Horizon;
  withdrawalPattern?: WithdrawalPattern;

  incomeBand?: IncomeBand;
  incomeStability?: IncomeStability;
  netWorthBand?: NetWorthBand;
  liquidNetWorthBand?: NetWorthBand;
  accountShareOfLiquidAssets?: AccountShareBand;
  emergencyReserveBand?: EmergencyReserveBand;
  debtSignal?: DebtSignal;
  liquidityLikelihood?: LiquidityLikelihood;

  knowledgeLevel?: KnowledgeLevel;
  experienceYears?: ExperienceYears;
  productExperience?: ProductExperience[];

  drawdownBehavior?: DrawdownBehavior;
  lossThreshold?: LossThreshold;
  growthProtectionPreference?: GrowthProtectionPreference;
  riskTradeoffChoice?: RiskTradeoffChoice;

  restrictions?: RestrictionKind[];
  /**
   * Bounded free text naming the restricted companies/industries/securities.
   * Required whenever any non-"none" restriction is selected — a category
   * without an identity is unusable for direct-index exclusions. Collection
   * stays minimal; nothing here claims construction-time enforcement.
   */
  restrictionDetails?: string;
  expectedFinancialChange?: ExpectedFinancialChange;
  /** Required (non-empty) when expectedFinancialChange === "yes". */
  expectedFinancialChangeKinds?: FinancialChangeKind[];

  productIntent?: ProductIntent[];
  alphaLossImpact?: AlphaLossImpact;

  /**
   * Consistency flags the user has explicitly revisited via the
   * clarification screen (spec §5). A flag the engine raises that is NOT in
   * this list leaves profileConfidence at "unresolved".
   */
  reconciledFlags?: ConsistencyFlag[];
}

// ─── Assessment output vocabularies (spec §4, §13) ──────────────────────────

/** 1..5 → Preservation · Conservative · Balanced · Growth · High Growth. */
export type RiskBand = 1 | 2 | 3 | 4 | 5;

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  1: "Preservation",
  2: "Conservative",
  3: "Balanced",
  4: "Growth",
  5: "High Growth",
};

/**
 * Neutral component-level labels for capacity and willingness. The portfolio
 * taxonomy above describes ONLY the final permitted profile — "financial
 * capacity: Growth" is a category error, so components get their own scale.
 */
export const COMPONENT_LEVEL_LABELS: Record<RiskBand, string> = {
  1: "Very Low",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Very High",
};

export type KnowledgeBand = 1 | 2 | 3 | 4;

export const PRODUCT_FIT_STATUSES = [
  "fit",
  "fit_with_constraint",
  "needs_clarification",
  "not_fit",
] as const;
export type ProductFitStatus = (typeof PRODUCT_FIT_STATUSES)[number];

/**
 * None of these values is, or can become, execution authority. Under the
 * Signal-only launch alpha readiness is informational / eligibility /
 * segmentation (spec §10).
 */
export const ALPHA_READINESS_STATES = [
  "not_requested",
  "capacity_failed",
  "signal_paper_only",
  "eligible_pending_policy",
] as const;
export type AlphaReadiness = (typeof ALPHA_READINESS_STATES)[number];

export const PROFILE_CONFIDENCES = [
  "complete",
  "limited",
  "unresolved",
] as const;
export type ProfileConfidence = (typeof PROFILE_CONFIDENCES)[number];

export const CONSISTENCY_FLAGS = [
  "SHORT_HORIZON_HIGH_WILLINGNESS",
  "GOAL_LIQUIDITY_CONFLICT",
  "RISK_BEHAVIOR_CONFLICT",
  "EXPERIENCE_CONFLICT",
  "CONCENTRATION_ALPHA_CONFLICT",
  "CAPACITY_WILLINGNESS_GAP",
  "INCONSISTENT_LOSS_BEHAVIOR",
] as const;
export type ConsistencyFlag = (typeof CONSISTENCY_FLAGS)[number];

/**
 * Closed reason-code vocabulary, spec §13 families. Codes are appended, never
 * repurposed; a new condition gets a new code in its family.
 */
export const REASON_CODES = [
  "HORIZON_SHORT_CONSTRAINT",
  "HORIZON_NEAR_TERM_NOT_FIT",
  "LIQUIDITY_HIGH_NEED_CONSTRAINT",
  "CAPACITY_BINDING",
  "CAPACITY_RESERVE_CONSTRAINT",
  "CAPACITY_DEBT_CONSTRAINT",
  "INCOME_INSTABILITY_CONSTRAINT",
  "CONCENTRATION_OVER_50PCT",
  "WILLINGNESS_BINDING",
  "CONSISTENCY_UNRESOLVED",
  "RESTRICTION_EMPLOYER_SECURITIES",
  "RESTRICTION_LEGAL",
  "PRODUCT_FIT_NEAR_TERM",
  "PRODUCT_FIT_EMERGENCY_FUND",
  "PRODUCT_FIT_LOSS_INTOLERANT",
  "PRODUCT_FIT_ENTITY_ROUTED",
  "PRODUCT_FIT_JOINT_UNSUPPORTED",
  "ALPHA_NOT_REQUESTED",
  "ALPHA_LOSS_IMPACT_FAILED",
  "ALPHA_CAPACITY_FAILED",
  "ALPHA_CONCENTRATION_FAILED",
  "ALPHA_KNOWLEDGE_LIMITED",
  "ALPHA_CONFIDENCE_REQUIRED",
  "PROFILE_CONFIDENCE_LIMITED",
  "PROFILE_CONFIDENCE_ESSENTIALS_MISSING",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

// ─── InvestorProfileAssessment (spec §12) ───────────────────────────────────

/**
 * Derived, deterministic output. Contains NO exposure percentages, NO
 * execution-authority fields, and NO segmentation input — those exclusions
 * are pinned by the §18 invariants suite.
 */
export interface InvestorProfileAssessment {
  assessmentPolicyVersion: string;

  riskCapacityBand: RiskBand | null;
  riskWillingnessBand: RiskBand | null;
  /** null when essentials are missing or the product is not_fit. */
  permittedRiskBand: RiskBand | null;

  knowledgeBand: KnowledgeBand | null;

  productFitStatus: ProductFitStatus;
  alphaReadiness: AlphaReadiness;

  profileConfidence: ProfileConfidence;

  constraintReasonCodes: ReasonCode[];
  consistencyFlags: ConsistencyFlag[];
  /** Which constraint set permittedRiskBand (spec §13). */
  bindingConstraint: ReasonCode | null;

  assessedAt: string;
}

// ─── AdvisoryConsentRecord (spec §12) ───────────────────────────────────────

/**
 * Disclosures stay OUT of the questionnaire snapshot: suitability facts and
 * informed acknowledgment are different records (spec §10). This links an
 * acknowledgment (held in the existing disclosure machinery) to the profile
 * version it was made against.
 */
export interface AdvisoryConsentRecord {
  documentId: string;
  documentVersion: string;
  contentHash: string;
  acknowledgedAt: string;
  profileVersion: number;
}
