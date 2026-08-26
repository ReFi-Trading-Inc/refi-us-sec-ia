"use client";

/**
 * Investor Profile questionnaire — questionnaireVersion 2.
 *
 * Source of truth: docs/releases/2026-09-signal/investor-profile-spec.md.
 * One principal question per screen; section progress (never raw question
 * counts — branching changes the total); Back always available; no
 * preselected answers anywhere (Screen 1 included); neutral presentation.
 *
 * Draft autosave/resume is SERVER-SIDE (POST /profile/v2/draft on every
 * answered screen, GET on load): sensitive banded financial answers never
 * persist in browser storage (PR #65 review; OWASP HTML5 guidance). The
 * browser holds nothing between visits.
 *
 * ALL policy runs server-side. The clarification loop is driven by the
 * submit route's blocked-outcome response and processes ONE flag at a time
 * with flag-specific copy; "keep both" reconciles only the displayed flag.
 * The result screen renders explanations from the server's reason codes —
 * per-reason not-fit copy, per-constraint capped-fit copy, and neutral
 * component labels (the portfolio taxonomy names only the final profile).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, StatusBanner } from "@ui/components";
import { investorProfileCopy as copy } from "../../_content/investor-profile";
import {
  COMPONENT_LEVEL_LABELS,
  RISK_BAND_LABELS,
  type ConsistencyFlag,
  type InvestorProfileAnswers,
  type InvestorProfileAssessment,
  type ReasonCode,
} from "@lib/sec203a/investor-profile";

type SectionId = keyof typeof copy.sections;
type StepKind = "info" | "single" | "multi" | "scale" | "text";

interface StepDef {
  id: string;
  section: SectionId;
  kind: StepKind;
  field?: keyof InvestorProfileAnswers;
  question?: string;
  helper?: string;
  why?: string;
  options?: Record<string, string>;
  /** Multi-select value that is mutually exclusive with every other value. */
  exclusiveValue?: string;
}

const STEPS: StepDef[] = [
  {
    id: "accountType",
    section: "goal",
    kind: "single",
    field: "accountType",
    question: copy.accountType.question,
    options: copy.accountType.options,
  },
  {
    id: "goal",
    section: "goal",
    kind: "single",
    field: "goal",
    question: copy.goal.question,
    helper: copy.goal.helper,
    options: copy.goal.options,
  },
  {
    id: "horizon",
    section: "timeline",
    kind: "single",
    field: "horizon",
    question: copy.horizon.question,
    helper: copy.horizon.helper,
    options: copy.horizon.options,
  },
  {
    id: "withdrawalPattern",
    section: "timeline",
    kind: "single",
    field: "withdrawalPattern",
    question: copy.withdrawalPattern.question,
    options: copy.withdrawalPattern.options,
  },
  { id: "financesIntro", section: "finances", kind: "info" },
  {
    id: "incomeBand",
    section: "finances",
    kind: "single",
    field: "incomeBand",
    question: copy.incomeBand.question,
    why: copy.incomeBand.whyWeAsk,
    options: copy.incomeBand.options,
  },
  {
    id: "incomeStability",
    section: "finances",
    kind: "single",
    field: "incomeStability",
    question: copy.incomeStability.question,
    why: copy.incomeStability.whyWeAsk,
    options: copy.incomeStability.options,
  },
  {
    id: "netWorthBand",
    section: "finances",
    kind: "single",
    field: "netWorthBand",
    question: copy.netWorthBand.question,
    helper: copy.netWorthBand.helper,
    why: copy.netWorthBand.whyWeAsk,
    options: copy.netWorthBand.options,
  },
  {
    id: "liquidNetWorthBand",
    section: "finances",
    kind: "single",
    field: "liquidNetWorthBand",
    question: copy.liquidNetWorthBand.question,
    helper: copy.liquidNetWorthBand.helper,
    why: copy.liquidNetWorthBand.whyWeAsk,
    options: copy.netWorthBand.options,
  },
  {
    id: "accountShareOfLiquidAssets",
    section: "finances",
    kind: "single",
    field: "accountShareOfLiquidAssets",
    question: copy.accountShare.question,
    why: copy.accountShare.whyWeAsk,
    options: copy.accountShare.options,
  },
  {
    id: "emergencyReserveBand",
    section: "finances",
    kind: "single",
    field: "emergencyReserveBand",
    question: copy.emergencyReserve.question,
    why: copy.emergencyReserve.whyWeAsk,
    options: copy.emergencyReserve.options,
  },
  {
    id: "debtSignal",
    section: "finances",
    kind: "single",
    field: "debtSignal",
    question: copy.debtSignal.question,
    why: copy.debtSignal.whyWeAsk,
    options: copy.debtSignal.options,
  },
  {
    id: "liquidityLikelihood",
    section: "finances",
    kind: "single",
    field: "liquidityLikelihood",
    question: copy.liquidityLikelihood.question,
    why: copy.liquidityLikelihood.whyWeAsk,
    options: copy.liquidityLikelihood.options,
  },
  {
    id: "knowledgeLevel",
    section: "experience",
    kind: "single",
    field: "knowledgeLevel",
    question: copy.knowledgeLevel.question,
    options: copy.knowledgeLevel.options,
  },
  {
    id: "experienceYears",
    section: "experience",
    kind: "single",
    field: "experienceYears",
    question: copy.experienceYears.question,
    options: copy.experienceYears.options,
  },
  {
    id: "productExperience",
    section: "experience",
    kind: "multi",
    field: "productExperience",
    question: copy.productExperience.question,
    helper: copy.productExperience.helper,
    options: copy.productExperience.options,
    exclusiveValue: "none",
  },
  {
    id: "drawdownBehavior",
    section: "risk",
    kind: "single",
    field: "drawdownBehavior",
    question: copy.drawdownBehavior.question,
    why: copy.riskSectionWhy,
    options: copy.drawdownBehavior.options,
  },
  {
    id: "lossThreshold",
    section: "risk",
    kind: "single",
    field: "lossThreshold",
    question: copy.lossThreshold.question,
    why: copy.riskSectionWhy,
    options: copy.lossThreshold.options,
  },
  {
    id: "growthProtectionPreference",
    section: "risk",
    kind: "scale",
    field: "growthProtectionPreference",
    question: copy.growthProtection.question,
    why: copy.riskSectionWhy,
  },
  {
    id: "riskTradeoffChoice",
    section: "risk",
    kind: "single",
    field: "riskTradeoffChoice",
    question: copy.riskTradeoff.question,
    why: copy.riskSectionWhy,
    options: copy.riskTradeoff.options,
  },
  {
    id: "restrictions",
    section: "review",
    kind: "multi",
    field: "restrictions",
    question: copy.restrictions.question,
    helper: copy.restrictions.helper,
    options: copy.restrictions.options,
    exclusiveValue: "none",
  },
  {
    id: "restrictionDetails",
    section: "review",
    kind: "text",
    field: "restrictionDetails",
    question: copy.restrictionDetails.question,
    helper: copy.restrictionDetails.helper,
  },
  {
    id: "expectedFinancialChange",
    section: "review",
    kind: "single",
    field: "expectedFinancialChange",
    question: copy.expectedChange.question,
    helper: copy.expectedChange.helper,
    options: copy.expectedChange.options,
  },
  {
    id: "expectedFinancialChangeKinds",
    section: "review",
    kind: "multi",
    field: "expectedFinancialChangeKinds",
    question: copy.financialChangeKinds.question,
    helper: copy.financialChangeKinds.helper,
    options: copy.financialChangeKinds.options,
  },
  {
    id: "productIntent",
    section: "review",
    kind: "multi",
    field: "productIntent",
    question: copy.productIntent.question,
    helper: copy.productIntent.helper,
    options: copy.productIntent.options,
  },
  {
    id: "alphaLossImpact",
    section: "review",
    kind: "single",
    field: "alphaLossImpact",
    question: copy.alphaLossImpact.question,
    options: copy.alphaLossImpact.options,
  },
];

const SECTION_ORDER: SectionId[] = [
  "goal",
  "timeline",
  "finances",
  "experience",
  "risk",
  "review",
];

/** Flag → the two steps the clarification screen offers to revisit. */
const FLAG_REVISIT: Record<ConsistencyFlag, [string, string]> = {
  SHORT_HORIZON_HIGH_WILLINGNESS: ["horizon", "lossThreshold"],
  GOAL_LIQUIDITY_CONFLICT: ["goal", "liquidityLikelihood"],
  RISK_BEHAVIOR_CONFLICT: ["lossThreshold", "riskTradeoffChoice"],
  EXPERIENCE_CONFLICT: ["knowledgeLevel", "productExperience"],
  CONCENTRATION_ALPHA_CONFLICT: ["accountShareOfLiquidAssets", "productIntent"],
  CAPACITY_WILLINGNESS_GAP: ["emergencyReserveBand", "drawdownBehavior"],
  INCONSISTENT_LOSS_BEHAVIOR: ["drawdownBehavior", "lossThreshold"],
};

function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const KNOWLEDGE_DISPLAY: Record<number, string> = {
  1: "Learning",
  2: "Comfortable with the basics",
  3: "Experienced",
  4: "Highly experienced",
};

const NOT_FIT_REASON_ORDER: ReadonlyArray<
  Exclude<keyof typeof copy.result.notFit.reasons, "fallback">
> = [
  "PRODUCT_FIT_JOINT_UNSUPPORTED",
  "PRODUCT_FIT_ENTITY_ROUTED",
  "PRODUCT_FIT_EMERGENCY_FUND",
  "HORIZON_NEAR_TERM_NOT_FIT",
  "PRODUCT_FIT_LOSS_INTOLERANT",
];

type Phase =
  | "loading"
  | "welcome"
  | "steps"
  | "entityExit"
  | "jointExit"
  | "review"
  | "clarify"
  | "result";

interface SubmitResult {
  profileVersion: number;
  assessment: InvestorProfileAssessment;
}

const EMPTY_ANSWERS: InvestorProfileAnswers = { questionnaireVersion: 2 };

export default function InvestorProfilePage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<InvestorProfileAnswers>(EMPTY_ANSWERS);
  const [textValue, setTextValue] = useState("");
  const [returnToReview, setReturnToReview] = useState(false);
  const [pendingFlags, setPendingFlags] = useState<ConsistencyFlag[]>([]);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server-side resume: one GET on mount decides welcome vs resumed. All
  // state updates happen asynchronously after the fetch settles (never
  // synchronously inside the effect); draft-fetch failure is a clean start.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/v1/investor/profile/v2/draft", {
          credentials: "include",
        });
        if (res.ok) {
          const body = (await res.json()) as {
            data: {
              answers?: InvestorProfileAnswers;
              stepIndex?: number;
            } | null;
          };
          if (
            body.data?.answers?.questionnaireVersion === 2 &&
            typeof body.data.stepIndex === "number" &&
            body.data.stepIndex > 0
          ) {
            setAnswers(body.data.answers);
            setStepIndex(Math.min(body.data.stepIndex, STEPS.length - 1));
            setPhase("steps");
            return;
          }
        }
      } catch {
        // fall through to a fresh start
      }
      setPhase("welcome");
    })();
  }, []);

  const saveDraft = useCallback(
    (next: InvestorProfileAnswers, index: number) => {
      // Fire-and-forget autosave after every answered screen. Nothing is
      // stored in the browser.
      void fetch("/api/v1/investor/profile/v2/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ answers: next, stepIndex: index }),
      }).catch(() => undefined);
    },
    [],
  );

  const visibleSteps = useMemo(
    () =>
      STEPS.filter((s) => {
        if (s.id === "alphaLossImpact") {
          return (answers.productIntent ?? []).includes("explore_alpha");
        }
        if (s.id === "restrictionDetails") {
          return (answers.restrictions ?? []).some((r) => r !== "none");
        }
        if (s.id === "expectedFinancialChangeKinds") {
          return answers.expectedFinancialChange === "yes";
        }
        return true;
      }),
    [
      answers.productIntent,
      answers.restrictions,
      answers.expectedFinancialChange,
    ],
  );

  const step = visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)];
  const sectionIndex = step ? SECTION_ORDER.indexOf(step.section) : 0;

  const advance = useCallback(
    (next: InvestorProfileAnswers) => {
      // Non-single-owner accounts exit the retail flow immediately: an entity
      // has its own onboarding, and a JOINT profile needs both owners — a
      // one-person retail assessment is never built for it (PR #65 review).
      if (stepIndex === 0) {
        if (next.accountType === "joint") {
          setAnswers(next);
          setPhase("jointExit");
          return;
        }
        if (
          next.accountType !== undefined &&
          next.accountType !== "individual"
        ) {
          setAnswers(next);
          setPhase("entityExit");
          return;
        }
      }
      if (returnToReview) {
        setReturnToReview(false);
        setAnswers(next);
        setPhase("review");
        saveDraft(next, stepIndex);
        return;
      }
      const nextIndex = stepIndex + 1;
      setAnswers(next);
      if (nextIndex >= visibleSteps.length) {
        setPhase("review");
      } else {
        setStepIndex(nextIndex);
      }
      saveDraft(next, nextIndex);
    },
    [returnToReview, saveDraft, stepIndex, visibleSteps.length],
  );

  const back = useCallback(() => {
    if (phase === "review") {
      setPhase("steps");
      setStepIndex(visibleSteps.length - 1);
      return;
    }
    if (stepIndex === 0) {
      setPhase("welcome");
    } else {
      setStepIndex(stepIndex - 1);
    }
  }, [phase, stepIndex, visibleSteps.length]);

  const jumpTo = useCallback((stepId: string) => {
    const idx = STEPS.findIndex((s) => s.id === stepId);
    if (idx >= 0) {
      setReturnToReview(true);
      setStepIndex(idx);
      setPhase("steps");
    }
  }, []);

  const submit = useCallback(async (payload: InvestorProfileAnswers) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/investor/profile/v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        data?: {
          needsClarification?: boolean;
          consistencyFlags?: ConsistencyFlag[];
          profileVersion?: number;
          assessment?: InvestorProfileAssessment;
        };
        error?: { message?: string };
      };
      if (res.status === 409 && body.data?.needsClarification) {
        setPendingFlags(body.data.consistencyFlags ?? []);
        setPhase("clarify");
        return;
      }
      if (res.status === 201 && body.data?.assessment) {
        setResult({
          profileVersion: body.data.profileVersion ?? 1,
          assessment: body.data.assessment,
        });
        setPhase("result");
        return;
      }
      setError(
        body.error?.message ??
          "We couldn't save your profile. Nothing was lost — please try again.",
      );
      setPhase("review");
    } catch {
      setError(
        "We couldn't reach ReFi. Your progress is saved — please try again.",
      );
      setPhase("review");
    } finally {
      setSubmitting(false);
    }
  }, []);

  // "Keep both" reconciles ONLY the flag currently displayed; if further
  // unresolved flags remain the server returns the next one (PR #65 review —
  // never bulk-acknowledge unrelated contradictions).
  const keepBothAndResubmit = useCallback(() => {
    const current = pendingFlags[0];
    if (!current) return;
    const next: InvestorProfileAnswers = {
      ...answers,
      reconciledFlags: [
        ...new Set([...(answers.reconciledFlags ?? []), current]),
      ],
    };
    setAnswers(next);
    void submit(next);
  }, [answers, pendingFlags, submit]);

  // ── Screens ──────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <main className="mx-auto max-w-xl px-4 py-10" data-testid="ip-loading" />
    );
  }

  if (phase === "welcome") {
    return (
      <main className="mx-auto max-w-xl px-4 py-10" data-testid="ip-welcome">
        <h1 className="text-2xl font-semibold">{copy.welcome.headline}</h1>
        <p className="mt-4 text-neutral-600">{copy.welcome.body}</p>
        <p className="mt-2 text-neutral-600">{copy.welcome.body2}</p>
        <details className="mt-4 text-sm text-neutral-500">
          <summary>Why we ask</summary>
          <p className="mt-2">{copy.welcome.whyWeAsk}</p>
        </details>
        <div className="mt-8">
          <Button
            data-testid="ip-start"
            onClick={() => {
              setPhase("steps");
            }}
          >
            {copy.welcome.cta}
          </Button>
        </div>
      </main>
    );
  }

  if (phase === "entityExit" || phase === "jointExit") {
    const exit =
      phase === "jointExit"
        ? copy.accountType.jointExit
        : copy.accountType.entityExit;
    return (
      <main
        className="mx-auto max-w-xl px-4 py-10"
        data-testid={phase === "jointExit" ? "ip-joint-exit" : "ip-entity-exit"}
      >
        <h1 className="text-2xl font-semibold">{exit.headline}</h1>
        <p className="mt-4 text-neutral-600">{exit.body}</p>
      </main>
    );
  }

  if (phase === "clarify") {
    const flag = pendingFlags[0];
    const flagCopy = flag ? copy.clarification.flags[flag] : undefined;
    const revisit = flag ? FLAG_REVISIT[flag] : undefined;
    return (
      <main className="mx-auto max-w-xl px-4 py-10" data-testid="ip-clarify">
        <h1 className="text-2xl font-semibold">
          {copy.clarification.headline}
        </h1>
        <p className="mt-4 text-neutral-600" data-testid="ip-clarify-body">
          {flagCopy?.body}
        </p>
        <p className="mt-2 text-neutral-600">{flagCopy?.explain}</p>
        <p className="mt-6 font-medium">{copy.clarification.prompt}</p>
        <div className="mt-4 flex flex-col gap-3">
          {revisit?.map((stepId) => {
            const target = STEPS.find((s) => s.id === stepId);
            return (
              <Button
                key={stepId}
                data-testid={`ip-revisit-${stepId}`}
                variant="secondary"
                onClick={() => {
                  jumpTo(stepId);
                }}
              >
                {target?.question ?? stepId}
              </Button>
            );
          })}
          <Button
            data-testid="ip-keep-both"
            onClick={keepBothAndResubmit}
            disabled={submitting}
          >
            {copy.clarification.keepBoth}
          </Button>
        </div>
      </main>
    );
  }

  if (phase === "result" && result) {
    const a = result.assessment;
    if (a.productFitStatus === "not_fit") {
      const reasonKey = NOT_FIT_REASON_ORDER.find((k) =>
        a.constraintReasonCodes.includes(k as ReasonCode),
      );
      const reasonBody = reasonKey
        ? copy.result.notFit.reasons[reasonKey]
        : copy.result.notFit.reasons.fallback;
      return (
        <main className="mx-auto max-w-xl px-4 py-10" data-testid="ip-result">
          <h1 className="text-2xl font-semibold" data-testid="ip-not-fit">
            {copy.result.notFit.headline}
          </h1>
          <p className="mt-4 text-neutral-600" data-testid="ip-not-fit-reason">
            {reasonBody}
          </p>
          <p className="mt-2 text-neutral-600">{copy.result.notFit.body2}</p>
        </main>
      );
    }
    const constraintCodes = (
      Object.keys(copy.result.constraintReasons) as Array<
        keyof typeof copy.result.constraintReasons
      >
    ).filter((c) => a.constraintReasonCodes.includes(c));
    const bindingSentence =
      a.bindingConstraint === "CAPACITY_BINDING" &&
      a.riskWillingnessBand !== null &&
      a.riskCapacityBand !== null &&
      a.riskWillingnessBand > a.riskCapacityBand
        ? copy.result.cautionBinding
        : a.bindingConstraint === "WILLINGNESS_BINDING"
          ? copy.result.willingnessBinding
          : null;
    return (
      <main className="mx-auto max-w-xl px-4 py-10" data-testid="ip-result">
        <h1 className="text-2xl font-semibold">{copy.result.headline}</h1>
        {a.permittedRiskBand !== null && (
          <p
            className="mt-2 text-3xl font-semibold"
            data-testid="ip-result-band"
          >
            {RISK_BAND_LABELS[a.permittedRiskBand]}
          </p>
        )}
        <dl className="mt-8 space-y-4">
          <div>
            <dt className="text-sm text-neutral-500">
              {copy.result.timelineLabel}
            </dt>
            <dd className="font-medium">
              {answers.horizon ? copy.horizon.options[answers.horizon] : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-neutral-500">
              {copy.result.capacityLabel}
            </dt>
            <dd className="font-medium" data-testid="ip-capacity">
              {a.riskCapacityBand !== null
                ? COMPONENT_LEVEL_LABELS[a.riskCapacityBand]
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-neutral-500">
              {copy.result.willingnessLabel}
            </dt>
            <dd className="font-medium" data-testid="ip-willingness">
              {a.riskWillingnessBand !== null
                ? COMPONENT_LEVEL_LABELS[a.riskWillingnessBand]
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-neutral-500">
              {copy.result.experienceLabel}
            </dt>
            <dd className="font-medium">
              {a.knowledgeBand !== null
                ? KNOWLEDGE_DISPLAY[a.knowledgeBand]
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-neutral-500">{copy.result.fitLabel}</dt>
            <dd className="font-medium" data-testid="ip-fit">
              {a.productFitStatus === "fit"
                ? copy.result.fitGood
                : a.productFitStatus === "fit_with_constraint"
                  ? copy.result.fitConstrained
                  : copy.result.fitClarify}
            </dd>
          </div>
        </dl>
        <h2 className="mt-8 text-lg font-semibold">
          {copy.result.shapedHeadline}
        </h2>
        <div className="mt-2 space-y-2" data-testid="ip-shaped">
          {bindingSentence && (
            <p className="text-neutral-600">{bindingSentence}</p>
          )}
          {constraintCodes.map((c) => (
            <p
              key={c}
              className="text-neutral-600"
              data-testid={`ip-reason-${c}`}
            >
              {copy.result.constraintReasons[c]}
            </p>
          ))}
          {!bindingSentence && constraintCodes.length === 0 && (
            <p className="text-neutral-600">
              Your answers point in the same direction, so your profile reflects
              them directly.
            </p>
          )}
        </div>
      </main>
    );
  }

  if (phase === "review") {
    const answered = visibleSteps.filter(
      (s) => s.field && answers[s.field] !== undefined,
    );
    return (
      <main className="mx-auto max-w-xl px-4 py-10" data-testid="ip-review">
        <h1 className="text-2xl font-semibold">{copy.review.headline}</h1>
        <p className="mt-2 text-neutral-600">{copy.review.body}</p>
        {error && (
          <div className="mt-4">
            <StatusBanner variant="error">{error}</StatusBanner>
          </div>
        )}
        <ul className="mt-6 divide-y divide-neutral-200">
          {answered.map((s) => {
            const value = s.field ? answers[s.field] : undefined;
            const display = Array.isArray(value)
              ? value.map((v) => s.options?.[v] ?? v).join(", ")
              : typeof value === "number"
                ? String(value)
                : (s.options?.[value as string] ?? String(value));
            return (
              <li
                key={s.id}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div>
                  <p className="text-sm text-neutral-500">{s.question}</p>
                  <p className="font-medium">{display}</p>
                </div>
                <Button
                  variant="secondary"
                  data-testid={`ip-edit-${s.id}`}
                  onClick={() => {
                    jumpTo(s.id);
                  }}
                >
                  {copy.review.edit}
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 flex gap-3">
          <Button variant="secondary" data-testid="ip-back" onClick={back}>
            Back
          </Button>
          <Button
            data-testid="ip-submit"
            disabled={submitting}
            onClick={() => {
              void submit(answers);
            }}
          >
            {copy.review.submit}
          </Button>
        </div>
      </main>
    );
  }

  // phase === "steps"
  if (!step) return null;
  const field = step.field;
  const multiValue = (field ? answers[field] : undefined) as
    string[] | undefined;

  return (
    <main
      className="mx-auto max-w-xl px-4 py-10"
      data-testid={`ip-step-${step.id}`}
    >
      <nav aria-label="Progress" className="mb-8 text-sm text-neutral-500">
        {SECTION_ORDER.map((s, i) => (
          <span key={s} className={i === sectionIndex ? "font-semibold" : ""}>
            {i > 0 ? " · " : ""}
            {copy.sections[s]}
          </span>
        ))}
        <p className="mt-1">
          {copy.sections[step.section]} · Step {String(sectionIndex + 1)} of{" "}
          {String(SECTION_ORDER.length)}
        </p>
      </nav>

      {step.kind === "info" ? (
        <>
          <h1 className="text-2xl font-semibold">
            {copy.financesIntro.headline}
          </h1>
          <p className="mt-4 text-neutral-600">{copy.financesIntro.body}</p>
          <div className="mt-8 flex gap-3">
            <Button variant="secondary" data-testid="ip-back" onClick={back}>
              Back
            </Button>
            <Button
              data-testid="ip-next"
              onClick={() => {
                advance(answers);
              }}
            >
              Continue
            </Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">{step.question}</h1>
          {step.helper && (
            <p className="mt-2 text-sm text-neutral-500">{step.helper}</p>
          )}
          {step.why && (
            <details
              className="mt-2 text-sm text-neutral-500"
              data-testid="ip-why"
            >
              <summary>Why we ask</summary>
              <p className="mt-2">{step.why}</p>
            </details>
          )}

          {step.kind === "single" && step.options && field && (
            <div className="mt-6 flex flex-col gap-2" role="radiogroup">
              {Object.entries(step.options).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={answers[field] === value}
                  data-testid={`ip-opt-${value}`}
                  className={`rounded border p-3 text-left ${
                    answers[field] === value
                      ? "border-neutral-900"
                      : "border-neutral-300"
                  }`}
                  onClick={() => {
                    advance({ ...answers, [field]: value });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {step.kind === "multi" && step.options && field && (
            <>
              <div className="mt-6 flex flex-col gap-2">
                {Object.entries(step.options).map(([value, label]) => {
                  const selected = (multiValue ?? []).includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      data-testid={`ip-opt-${value}`}
                      className={`rounded border p-3 text-left ${
                        selected ? "border-neutral-900" : "border-neutral-300"
                      }`}
                      onClick={() => {
                        const current = multiValue ?? [];
                        // "None" is mutually exclusive: choosing it clears
                        // everything else; choosing anything real clears it.
                        let next: string[];
                        if (selected) {
                          next = current.filter((v) => v !== value);
                        } else if (value === step.exclusiveValue) {
                          next = [value];
                        } else {
                          next = [
                            ...current.filter((v) => v !== step.exclusiveValue),
                            value,
                          ];
                        }
                        setAnswers({ ...answers, [field]: next });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="secondary"
                  data-testid="ip-back"
                  onClick={back}
                >
                  Back
                </Button>
                <Button
                  data-testid="ip-next"
                  onClick={() => {
                    advance(answers);
                  }}
                >
                  Continue
                </Button>
              </div>
            </>
          )}

          {step.kind === "text" && field && (
            <>
              <textarea
                className="mt-6 w-full rounded border border-neutral-300 p-3"
                rows={3}
                maxLength={500}
                data-testid="ip-text-input"
                value={textValue || asText(answers[field])}
                onChange={(e) => {
                  setTextValue(e.target.value);
                }}
              />
              <div className="mt-6 flex gap-3">
                <Button
                  variant="secondary"
                  data-testid="ip-back"
                  onClick={back}
                >
                  Back
                </Button>
                <Button
                  data-testid="ip-next"
                  disabled={
                    (textValue || asText(answers[field])).trim().length === 0
                  }
                  onClick={() => {
                    const v = (textValue || asText(answers[field])).trim();
                    setTextValue("");
                    advance({ ...answers, [field]: v });
                  }}
                >
                  Continue
                </Button>
              </div>
            </>
          )}

          {step.kind === "scale" && field && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm text-neutral-500">
                <span className="max-w-[10rem]">
                  {copy.growthProtection.left}
                </span>
                <span className="max-w-[10rem] text-right">
                  {copy.growthProtection.right}
                </span>
              </div>
              <div
                className="mt-4 flex justify-between gap-2"
                role="radiogroup"
              >
                {([1, 2, 3, 4, 5] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={answers[field] === v}
                    data-testid={`ip-opt-scale-${String(v)}`}
                    className={`h-12 w-12 rounded-full border ${
                      answers[field] === v
                        ? "border-neutral-900 font-semibold"
                        : "border-neutral-300"
                    }`}
                    onClick={() => {
                      advance({ ...answers, [field]: v });
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step.kind === "single" && (
            <div className="mt-8">
              <Button variant="secondary" data-testid="ip-back" onClick={back}>
                Back
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
