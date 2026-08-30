/**
 * GET  /api/v1/investor/profile/v2/draft — the caller's own in-progress
 *                                          questionnaire draft (or null).
 * POST /api/v1/investor/profile/v2/draft — autosave the draft
 *                                          (saveProfileDraft action).
 *
 * Server-side draft persistence exists so sensitive banded financial answers
 * never sit in browser storage (review of PR #65; OWASP HTML5 guidance —
 * localStorage persists across sessions, is XSS-readable, and survives for
 * the next user of the machine profile). Drafts are keyed by the
 * authenticated identity — one user's draft is structurally invisible to
 * another — and are MUTABLE working state: submission promotes the answers
 * into the immutable version chain via POST /api/v1/investor/profile/v2,
 * which also clears the draft.
 *
 * Validation is deliberately partial-tolerant: a draft is an incomplete form,
 * so per-field vocabulary is enforced but cross-field completeness rules
 * (none-exclusivity, required details) are enforced only at submission.
 */
import { z } from "zod";
import { bffRead, bffMutate } from "@lib/bff/handler";
import {
  ACCOUNT_SHARE_BANDS,
  ACCOUNT_TYPES,
  ALPHA_LOSS_IMPACTS,
  CONSISTENCY_FLAGS,
  DEBT_SIGNALS,
  DRAWDOWN_BEHAVIORS,
  EMERGENCY_RESERVE_BANDS,
  EXPECTED_FINANCIAL_CHANGES,
  EXPERIENCE_YEARS,
  FINANCIAL_CHANGE_KINDS,
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
} from "@lib/sec203a/investor-profile";
import {
  getProfileDraftV2,
  saveProfileDraftV2,
} from "@lib/prototype-store/entities/investor-profile-v2";

function member<T extends string>(values: readonly T[]) {
  return z
    .string()
    .refine((v): v is T => (values as readonly string[]).includes(v));
}

const draftAnswers = z.object({
  questionnaireVersion: z.literal(2),
  accountType: member(ACCOUNT_TYPES).optional(),
  goal: member(GOALS).optional(),
  horizon: member(HORIZONS).optional(),
  withdrawalPattern: member(WITHDRAWAL_PATTERNS).optional(),
  incomeBand: member(INCOME_BANDS).optional(),
  incomeStability: member(INCOME_STABILITIES).optional(),
  netWorthBand: member(NET_WORTH_BANDS).optional(),
  liquidNetWorthBand: member(NET_WORTH_BANDS).optional(),
  accountShareOfLiquidAssets: member(ACCOUNT_SHARE_BANDS).optional(),
  emergencyReserveBand: member(EMERGENCY_RESERVE_BANDS).optional(),
  debtSignal: member(DEBT_SIGNALS).optional(),
  liquidityLikelihood: member(LIQUIDITY_LIKELIHOODS).optional(),
  knowledgeLevel: member(KNOWLEDGE_LEVELS).optional(),
  experienceYears: member(EXPERIENCE_YEARS).optional(),
  productExperience: z.array(member(PRODUCT_EXPERIENCES)).optional(),
  drawdownBehavior: member(DRAWDOWN_BEHAVIORS).optional(),
  lossThreshold: member(LOSS_THRESHOLDS).optional(),
  growthProtectionPreference: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ])
    .optional(),
  riskTradeoffChoice: member(RISK_TRADEOFF_CHOICES).optional(),
  restrictions: z.array(member(RESTRICTION_KINDS)).optional(),
  restrictionDetails: z
    .object({
      employerSecurities: z.array(z.string().min(1).max(80)).max(20).optional(),
      legallyRestrictedSecurities: z
        .array(z.string().min(1).max(80))
        .max(20)
        .optional(),
      excludedCompanies: z.array(z.string().min(1).max(80)).max(20).optional(),
      excludedIndustries: z.array(z.string().min(1).max(80)).max(20).optional(),
      other: z.string().max(300).optional(),
    })
    .optional(),
  expectedFinancialChange: member(EXPECTED_FINANCIAL_CHANGES).optional(),
  expectedFinancialChangeKinds: z
    .array(member(FINANCIAL_CHANGE_KINDS))
    .optional(),
  productIntent: z.array(member(PRODUCT_INTENTS)).optional(),
  alphaLossImpact: member(ALPHA_LOSS_IMPACTS).optional(),
  reconciledFlags: z.array(member(CONSISTENCY_FLAGS)).optional(),
});

const draftBody = z.object({
  answers: draftAnswers,
  /** Stable step identity — never a filtered-array index (PR #65 round 2). */
  currentStepId: z.string().min(1).max(64),
  /** Per-wizard-run session; a submission tombstones it. */
  sessionId: z.string().min(1).max(64),
  /** Monotonic per session; the server ignores stale revisions. */
  draftRevision: z.number().int().min(1).max(1_000_000),
});

type DraftBody = z.infer<typeof draftBody>;

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-003",
  fetch: async (ctx) => {
    if (!ctx.auth) return null;
    // Account derived from authenticated server context — never from the
    // browser (PR #65 round 2: drafts are auth+account scoped).
    return getProfileDraftV2(ctx.auth.authId, ctx.auth.accountId ?? null);
  },
});

export const POST = bffMutate<DraftBody>({
  action: "saveProfileDraft",
  source: "prototype-bff",
  upstreamGap: "G-003",
  parse: (body) => draftBody.parse(body),
  apply: async (ctx) => {
    const result = await saveProfileDraftV2({
      authId: ctx.auth.authId,
      accountId: ctx.auth.accountId ?? null,
      sessionId: ctx.input.sessionId,
      draftRevision: ctx.input.draftRevision,
      answers: ctx.input.answers,
      currentStepId: ctx.input.currentStepId,
      correlationId: ctx.correlationId,
    });
    return {
      data: {
        stored: result.stored,
        draftRevision: result.draft?.draftRevision ?? null,
      },
      status: 200,
    };
  },
});
