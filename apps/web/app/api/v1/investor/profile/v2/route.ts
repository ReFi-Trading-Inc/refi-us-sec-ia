/**
 * GET  /api/v1/investor/profile/v2 — latest questionnaire-v2 answers version
 *                                    and its policy assessment (or null).
 * POST /api/v1/investor/profile/v2 — submit answers; the deterministic policy
 *                                    engine derives the assessment server-side
 *                                    (spec §4). Unresolved consistency flags
 *                                    return a blocked outcome carrying the
 *                                    flags so the UI can run the clarification
 *                                    screen (spec §5) — the frontend never
 *                                    reimplements any policy rule. On success
 *                                    a new immutable answers version and its
 *                                    assessment are persisted with provenance
 *                                    (spec §12.1), refreshProfile action.
 *
 * The v1 route (/api/v1/investor/profile) remains live per spec §19 until v2
 * fully supersedes it.
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
  RESTRICTION_DETAIL_FIELD,
  RESTRICTION_KINDS,
  RISK_TRADEOFF_CHOICES,
  WITHDRAWAL_PATTERNS,
  canonicalizeAnswers,
  type InvestorProfileAnswers,
} from "@lib/sec203a/investor-profile";
import {
  ASSESSMENT_POLICY_VERSION,
  assessInvestorProfile,
} from "@lib/sec203a/investor-profile-engine";
import {
  appendProfileAnswers,
  appendProfileAssessment,
  clearProfileDraftV2,
  getProfileAnswers,
  getProfileAssessment,
  latestProfileVersion,
} from "@lib/prototype-store/entities/investor-profile-v2";

function member<T extends string>(values: readonly T[]) {
  return z
    .string()
    .refine((v): v is T => (values as readonly string[]).includes(v));
}

const boundedList = z.array(z.string().min(1).max(80)).min(1).max(20);

/** Structured, machine-readable restriction identities (PR #65 round 2). */
const restrictionDetailsSchema = z.object({
  employerSecurities: boundedList.optional(),
  legallyRestrictedSecurities: boundedList.optional(),
  excludedCompanies: boundedList.optional(),
  excludedIndustries: boundedList.optional(),
  other: z.string().min(1).max(300).optional(),
});

const answersBody = z.object({
  questionnaireVersion: z.literal(2),
  accountType: member(ACCOUNT_TYPES),

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

  // Explicit answer REQUIRED on the completed questionnaire (PR #65 round 2):
  // ["none"] is the explicit no-restrictions confirmation; empty/omitted is
  // not equivalent and is rejected below.
  restrictions: z.array(member(RESTRICTION_KINDS)).min(1),
  restrictionDetails: restrictionDetailsSchema.optional(),
  expectedFinancialChange: member(EXPECTED_FINANCIAL_CHANGES).optional(),
  expectedFinancialChangeKinds: z
    .array(member(FINANCIAL_CHANGE_KINDS))
    .optional(),

  productIntent: z.array(member(PRODUCT_INTENTS)).optional(),
  alphaLossImpact: member(ALPHA_LOSS_IMPACTS).optional(),

  reconciledFlags: z.array(member(CONSISTENCY_FLAGS)).optional(),
  /**
   * Transport-only: names the questionnaire draft session so a successful
   * submission tombstones it (a late autosave cannot resurrect the cleared
   * draft). Stripped by canonicalization before hashing/persistence.
   */
  draftSessionId: z.string().min(1).max(64).optional(),
});

/**
 * Cross-field integrity (review of PR #65):
 *   - "none" is mutually exclusive within productExperience and restrictions;
 *   - non-"none" restrictions require restrictionDetails naming them;
 *   - expectedFinancialChange "yes" requires at least one structured kind.
 * Enforced server-side so a hand-written POST cannot create contradictory or
 * unusable snapshots.
 */
const answersBodyChecked = answersBody
  .refine(
    (a) =>
      !a.productExperience?.includes("none") ||
      a.productExperience.length === 1,
    { message: "productExperience 'none' is mutually exclusive" },
  )
  .refine(
    (a) => !a.restrictions.includes("none") || a.restrictions.length === 1,
    { message: "restrictions 'none' is mutually exclusive" },
  )
  .refine(
    (a) =>
      a.restrictions
        .filter((r) => r !== "none")
        .every((r) => {
          const field = RESTRICTION_DETAIL_FIELD[r];
          if (!field) return true;
          const v = a.restrictionDetails?.[field];
          return Array.isArray(v) ? v.length > 0 : typeof v === "string";
        }),
    {
      message:
        "each selected restriction category requires its structured details",
    },
  )
  .refine(
    (a) =>
      a.expectedFinancialChange !== "yes" ||
      (a.expectedFinancialChangeKinds !== undefined &&
        a.expectedFinancialChangeKinds.length > 0),
    { message: "expectedFinancialChange 'yes' requires at least one kind" },
  );

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-003",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) return null;
    const version = await latestProfileVersion(ctx.auth.accountId);
    if (version === 0) return null;
    const answers = await getProfileAnswers(ctx.auth.accountId, version);
    if (!answers) return null;
    const assessment = await getProfileAssessment(
      ctx.auth.accountId,
      version,
      // The stored assessment for the CURRENT policy; a policy change means
      // this returns null until re-assessed under the new version — the old
      // record is never rewritten (spec §12.1).
      ASSESSMENT_POLICY_VERSION,
    );
    return { answers, assessment };
  },
});

type SubmitBody = InvestorProfileAnswers & { draftSessionId?: string };

export const POST = bffMutate<SubmitBody>({
  action: "refreshProfile",
  source: "prototype-bff",
  upstreamGap: "G-003",
  parse: (body) => answersBodyChecked.parse(body),
  apply: async (ctx) => {
    if (!ctx.auth.accountId) {
      return {
        data: { ok: false, reason: "account_not_linked" },
        outcome: "blocked" as const,
        reasonCode: "account_not_linked",
        status: 412,
      };
    }

    // Canonicalize FIRST (PR #65 round 2): branch answers whose parent no
    // longer activates them are removed deterministically, so stale child
    // data can never reach the engine, the hash, or the immutable record.
    const { draftSessionId, ...submitted } = ctx.input;
    const canonical = canonicalizeAnswers(submitted);

    // Server-side derivation — the only place policy runs. Client-supplied
    // reconciliation is honoured ONLY for flags the engine actually computes
    // on THIS submission; arbitrary flags are dropped before anything is
    // persisted (review of PR #65).
    const firstPass = assessInvestorProfile(canonical);
    const sanitizedReconciled = (canonical.reconciledFlags ?? []).filter((f) =>
      firstPass.consistencyFlags.includes(f),
    );
    const sanitizedInput = {
      ...canonical,
      reconciledFlags: sanitizedReconciled,
    };
    const assessment = assessInvestorProfile(sanitizedInput);

    // Clarification loop (spec §5): unresolved flags block persistence and
    // return the flags for the UI to reconcile. The receipt records the
    // blocked attempt. A hard not_fit verdict pre-empts clarification
    // (spec §4 pipeline: product fit is step 1) — the honest exit is the
    // answer regardless of how the contradiction resolves.
    const reconciled = new Set(sanitizedReconciled);
    const unresolved = assessment.consistencyFlags.filter(
      (f) => !reconciled.has(f),
    );
    if (assessment.productFitStatus !== "not_fit" && unresolved.length > 0) {
      return {
        data: {
          needsClarification: true,
          consistencyFlags: unresolved,
        },
        outcome: "blocked" as const,
        reasonCode: "consistency_unresolved",
        status: 409,
      };
    }

    const answersVersion = await appendProfileAnswers({
      accountId: ctx.auth.accountId,
      answers: sanitizedInput,
      correlationId: ctx.correlationId,
    });
    const record = await appendProfileAssessment({
      accountId: ctx.auth.accountId,
      profileVersion: answersVersion.profileVersion,
      answerSnapshotHash: answersVersion.answerSnapshotHash,
      assessment,
      correlationId: ctx.correlationId,
    });

    await clearProfileDraftV2(
      ctx.auth.authId,
      ctx.auth.accountId ?? null,
      draftSessionId ?? "unknown-session",
      ctx.correlationId,
    );

    return {
      data: {
        profileVersion: answersVersion.profileVersion,
        answerSnapshotHash: answersVersion.answerSnapshotHash,
        assessment: record.assessment,
      },
      references: [
        `investor-profile-v2:${answersVersion.accountId}/v${String(answersVersion.profileVersion)}`,
        `investor-profile-assessment:${answersVersion.accountId}/v${String(answersVersion.profileVersion)}/${record.assessment.assessmentPolicyVersion}`,
      ],
      status: 201,
    };
  },
});
