"use client";

// Recommendation detail — tier-aware (P2.5R-19).
//
// Under SEC Rule 203A-2(e), the investor does NOT accept per-recommendation
// under Managed mode. The activation of an ExecutionPolicy IS the approval;
// after that, software-generated intents auto-execute within the signed
// guardrails. Per-decision investor approval exists only in Exception Review.
//
// This page therefore has no Approve/Reject/Request-review buttons and no
// CompliancePreview Submit gate. Action surface is tier-conditional:
//   - Signal:  Save / Dismiss / Upgrade to Managed
//   - Managed (no pending exception): view-only with link to record
//   - Managed (pending exception):    redirect to /us/app/managed/exceptions/<id>
//
// The CompliancePreview component still exists for future surfaces (e.g.,
// activation flow guardrail preview) but is not used on this page.

import { use, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Badge, Button, Card, CardContent, StatusBanner } from "@ui/components";
import {
  useExceptions,
  useRecommendation,
  useRecommendationDetail,
  useTier,
  type Exception,
  type GuardrailCheck,
  type ModelFactor,
  type OrderPreviewStatus,
  type RecommendationDetail,
  type Tier,
} from "@refi/api-clients";
import { appCopy } from "../../../_content/app-copy";

const { recommendations } = appCopy;
const D = recommendations.detail;
const T = D.tier;

// Next.js 16: params is a Promise; unwrap in client components with React.use.
export default function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const detailQ = useRecommendationDetail(id);
  const shallowQ = useRecommendation(id);
  const tier = useTier();
  const exceptionsQ = useExceptions();

  const detail = detailQ.data;
  const shallow = shallowQ.data;
  const isLoading =
    (detailQ.isLoading && shallowQ.isLoading) ||
    (detailQ.isLoading && !shallow && !detail);

  if (isLoading) {
    return <p className="text-sm text-charcoal-500">{D.loading}</p>;
  }
  if (!detail && !shallow) {
    return <StatusBanner variant="error">{D.unavailable}</StatusBanner>;
  }

  const pendingException = (exceptionsQ.data ?? []).find(
    (e) => e.recommendation_id === id && e.status === "pending",
  );

  const actions = (
    <TierAwareActions
      tier={tier}
      recommendationId={id}
      pendingException={pendingException ?? null}
    />
  );

  // Eligibility surface attribute carried at page root so e2e can read it
  // without touching layout. `loading` is short-lived; `unavailable` is the
  // shallow-only fallback when the deep detail isn't published yet.
  const eligibility: "allow" | "review" | "deny" | "unavailable" | "loading" =
    detail
      ? detail.automation_eligibility.status === "ALLOW"
        ? "allow"
        : detail.automation_eligibility.status === "REVIEW"
          ? "review"
          : detail.automation_eligibility.status === "DENY"
            ? "deny"
            : "unavailable"
      : "unavailable";

  if (detail) {
    return (
      <DeepDetail
        detail={detail}
        actions={actions}
        tier={tier}
        eligibility={eligibility}
        pendingExceptionId={pendingException?.exception_id ?? null}
      />
    );
  }
  return (
    <ShallowDetail
      shallow={shallow!}
      actions={actions}
      tier={tier}
      eligibility={eligibility}
      pendingExceptionId={pendingException?.exception_id ?? null}
    />
  );
}

// --- Tier-aware actions (replaces the per-rec Accept/Reject/Review block) -

function TierAwareActions({
  tier,
  recommendationId,
  pendingException,
}: {
  tier: Tier;
  recommendationId: string;
  pendingException: Exception | null;
}) {
  // Managed + this rec has a pending exception → route the investor to the
  // Exception Review surface where the canonical approve/reject buttons live.
  if (tier === "managed" && pendingException) {
    return (
      <Card data-testid="recommendation-exception-route">
        <CardContent className="pt-5 flex flex-col gap-3">
          <SectionLabel>{T.managedException.title}</SectionLabel>
          <StatusBanner variant="warning">
            {T.managedException.body}
          </StatusBanner>
          <ul className="flex flex-col gap-1">
            {pendingException.reasons.map((r) => (
              <li key={r.code} className="text-sm text-charcoal-300 flex gap-2">
                <code className="text-xs font-mono text-charcoal-500 shrink-0">
                  {r.code}
                </code>
                <span>{r.message}</span>
              </li>
            ))}
          </ul>
          <Link
            href={
              `/us/app/exceptions` as Route /* exception detail surface lives at the Surface 7 queue */
            }
            data-testid="recommendation-exception-route-cta"
          >
            <Button size="sm">{T.managedException.openAction}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Managed without a pending exception → view-only. The investor authorized
  // this kind of decision at activation; no per-rec approval needed.
  if (tier === "managed") {
    return (
      <Card data-testid="managed-non-executing-state">
        <CardContent className="pt-5 flex flex-col gap-2">
          <SectionLabel>{T.managed.title}</SectionLabel>
          <p className="text-sm text-charcoal-300">{T.managed.body}</p>
          <Link
            href={`/us/app/records/recommendation/${recommendationId}` as Route}
            className="text-xs text-mint-400 hover:text-mint-300 mt-1"
          >
            {T.managed.viewRecordAction} →
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Signal tier — advisory only. Save / Dismiss are UI-state only; Upgrade
  // routes to the Managed activation flow.
  return <SignalActions />;
}

function SignalActions() {
  const [acted, setActed] = useState<"saved" | "dismissed" | null>(null);

  return (
    <Card data-testid="signal-advisory-actions">
      <CardContent className="pt-5 flex flex-col gap-3">
        <SectionLabel>{T.signal.title}</SectionLabel>
        <p className="text-sm text-charcoal-300">{T.signal.body}</p>
        {acted === "saved" ? (
          <StatusBanner variant="success">{T.signal.savedBody}</StatusBanner>
        ) : null}
        {acted === "dismissed" ? (
          <StatusBanner variant="info">{T.signal.dismissedBody}</StatusBanner>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setActed("saved")}
            disabled={acted !== null}
          >
            {T.signal.saveAction}
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => setActed("dismissed")}
            disabled={acted !== null}
          >
            {T.signal.dismissAction}
          </Button>
          <Link href={"/us/app/managed/activate" as Route}>
            <Button size="sm">{T.signal.upgradeAction}</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Deep detail rendering ------------------------------------------------

function DeepDetail({
  detail,
  actions,
  tier,
  eligibility,
  pendingExceptionId,
}: {
  detail: RecommendationDetail;
  actions: React.ReactNode;
  tier: Tier;
  eligibility: "allow" | "review" | "deny" | "unavailable" | "loading";
  pendingExceptionId: string | null;
}) {
  const rec = detail.recommendation;
  const tone = badgeToneForType(detail.recommendation_type);

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="recommendation-detail-page"
      data-tier={tier}
      data-eligibility={eligibility}
      data-pending-exception={pendingExceptionId ?? ""}
    >
      <BackLink />

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-charcoal-50">
            {detail.title}
          </h1>
          <Badge variant={tone}>
            {detail.recommendation_type.toUpperCase()}
          </Badge>
          <StatusPill status={detail.status} />
        </div>
        <p className="text-xs text-charcoal-500 font-mono">
          {D.generatedLabel}: {new Date(detail.generated_at).toLocaleString()} ·{" "}
          {D.expiresLabel}: {new Date(detail.expires_at).toLocaleString()}
        </p>
      </header>

      {/* Order summary (read-only view of the platform's planned trade) */}
      {rec.symbol ? (
        <Card>
          <CardContent className="pt-5">
            <SectionLabel>{D.orderLabel}</SectionLabel>
            <p className="font-mono text-charcoal-100">
              {(rec.side ?? "").toUpperCase()} {rec.quantity ?? "—"}{" "}
              {rec.symbol}
              {rec.name ? (
                <span className="text-charcoal-400"> · {rec.name}</span>
              ) : null}
              {rec.notional_usd !== undefined ? (
                <span className="text-charcoal-400">
                  {" "}
                  · ${rec.notional_usd.toLocaleString()}
                </span>
              ) : null}
              {rec.order_type ? (
                <span className="text-charcoal-400"> · {rec.order_type}</span>
              ) : null}
              {rec.limit_price !== undefined ? (
                <span className="text-charcoal-400">
                  {" "}
                  · limit ${rec.limit_price}
                </span>
              ) : null}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Explanation */}
      <Card>
        <CardContent className="pt-5 flex flex-col gap-4">
          <Section label={D.summary} value={detail.explanation.summary} />
          <Section label={D.whyNow} value={detail.explanation.why_now} />
          <Section
            label={D.whyFits}
            value={detail.explanation.why_this_fits_profile}
          />
          <Section
            label={D.portfolioImpact}
            value={detail.explanation.portfolio_impact}
          />
          {detail.explanation.risk_notes.length > 0 ? (
            <BulletSection
              label={D.riskNotes}
              items={detail.explanation.risk_notes}
            />
          ) : null}
          {detail.explanation.cost_notes.length > 0 ? (
            <BulletSection
              label={D.costNotes}
              items={detail.explanation.cost_notes}
            />
          ) : null}
          {detail.explanation.tax_notes.length > 0 ? (
            <BulletSection
              label={D.taxNotes}
              items={detail.explanation.tax_notes}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* Model factors */}
      {detail.model_factors.length > 0 ? (
        <Card>
          <CardContent className="pt-5 flex flex-col gap-3">
            <SectionLabel>{D.modelFactors}</SectionLabel>
            <ul className="flex flex-col gap-3">
              {detail.model_factors.map((f) => (
                <ModelFactorRow key={f.name} factor={f} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Guardrails */}
      {detail.guardrails.length > 0 ? (
        <Card>
          <CardContent className="pt-5 flex flex-col gap-3">
            <SectionLabel>{D.guardrails}</SectionLabel>
            <ul className="flex flex-col gap-2">
              {detail.guardrails.map((g) => (
                <GuardrailRow key={g.code} guardrail={g} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Automation eligibility (policy-engine pre-check) */}
      <Card
        data-testid="recommendation-eligibility"
        data-eligibility={eligibility}
      >
        <CardContent className="pt-5 flex flex-col gap-3">
          <SectionLabel>{D.automationEligibility}</SectionLabel>
          <div className="flex items-center gap-3">
            <VerdictPill status={detail.automation_eligibility.status} />
            <span className="text-xs font-mono text-charcoal-400">
              {D.automationSourceLabel}: {detail.automation_eligibility.source}
            </span>
          </div>
          {detail.automation_eligibility.reasons.length === 0 ? (
            <p className="text-sm text-charcoal-400">
              {D.automationEligibilityNoReasons}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {detail.automation_eligibility.reasons.map((r) => (
                <li
                  key={r.code}
                  className="text-sm text-charcoal-300 flex gap-2"
                >
                  <code className="text-xs font-mono text-charcoal-500 shrink-0">
                    {r.code}
                  </code>
                  <span>{r.message}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs font-mono text-charcoal-500">
            {D.automationCheckedAt}{" "}
            {new Date(
              detail.automation_eligibility.checked_at,
            ).toLocaleString()}{" "}
            · {D.automationExpiresAt}{" "}
            {new Date(
              detail.automation_eligibility.expires_at,
            ).toLocaleString()}{" "}
            · {D.automationPolicyVersion}:{" "}
            {detail.automation_eligibility.policy_version}
          </p>
        </CardContent>
      </Card>

      {/* Tier-aware actions (no per-rec Submit gate) */}
      {actions}

      {/* Decision record */}
      <Card>
        <CardContent className="pt-5 flex flex-col gap-2">
          <SectionLabel>{D.decisionRecord}</SectionLabel>
          <p className="text-sm text-charcoal-300 font-mono">
            {D.recordIdLabel}: {detail.record.record_id}
          </p>
          <p className="text-sm text-charcoal-300 font-mono break-all">
            {D.auditHashLabel}: {detail.record.audit_hash}
          </p>
          <p className="text-xs text-charcoal-500">
            {detail.record.explorer_status === "available"
              ? D.explorerAvailableNote
              : D.explorerPendingNote}
          </p>
        </CardContent>
      </Card>

      {/* Advisory context */}
      <Card>
        <CardContent className="pt-5">
          <SectionLabel>{D.advisoryContext}</SectionLabel>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono text-charcoal-400 mt-2">
            <dt>profile_version</dt>
            <dd className="text-charcoal-200">
              {detail.advisory_context.profile_version}
            </dd>
            <dt>strategy_version</dt>
            <dd className="text-charcoal-200">
              {detail.advisory_context.strategy_version}
            </dd>
            <dt>model_version</dt>
            <dd className="text-charcoal-200">
              {detail.advisory_context.model_version}
            </dd>
            <dt>disclosure_version_set</dt>
            <dd className="text-charcoal-200">
              {detail.advisory_context.disclosure_version_set}
            </dd>
            <dt>execution_policy_version</dt>
            <dd className="text-charcoal-200">
              {detail.advisory_context.execution_policy_version}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Shallow fallback -----------------------------------------------------

function ShallowDetail({
  shallow,
  actions,
  tier,
  eligibility,
  pendingExceptionId,
}: {
  shallow: NonNullable<ReturnType<typeof useRecommendation>["data"]>;
  actions: React.ReactNode;
  tier: Tier;
  eligibility: "allow" | "review" | "deny" | "unavailable" | "loading";
  pendingExceptionId: string | null;
}) {
  const tone =
    shallow.action === "buy"
      ? "active"
      : shallow.action === "sell"
        ? "warning"
        : "neutral";

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="recommendation-detail-page"
      data-tier={tier}
      data-eligibility={eligibility}
      data-pending-exception={pendingExceptionId ?? ""}
    >
      <BackLink />
      <StatusBanner variant="info">{D.shallowFallbackNote}</StatusBanner>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {shallow.symbol}
        </h1>
        <Badge variant={tone}>{shallow.action.toUpperCase()}</Badge>
        <span className="text-xs text-charcoal-500 font-mono">
          {(shallow.confidence * 100).toFixed(0)}
          {D.confidenceSuffix}
        </span>
      </div>
      <Card>
        <CardContent className="pt-5 flex flex-col gap-4">
          <Section label={D.rationale} value={shallow.rationale} />
          <Section
            label={D.complianceStatus}
            value={`${D.generatedLabel}: ${new Date(shallow.created_at).toLocaleString()} · ${D.expiresLabel}: ${new Date(shallow.expires_at).toLocaleString()}`}
          />
        </CardContent>
      </Card>
      {actions}
    </div>
  );
}

// --- Shared helpers -------------------------------------------------------

function BackLink() {
  return (
    <Link
      href="/us/app/recommendations"
      className="text-sm text-charcoal-400 hover:text-charcoal-200 self-start"
    >
      {D.backLink}
    </Link>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <p className="text-sm text-charcoal-300">{value}</p>
    </div>
  );
}

function BulletSection({
  label,
  items,
}: {
  label: string;
  items: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item} className="text-sm text-charcoal-300 flex gap-2">
            <span aria-hidden className="text-charcoal-500">
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
      {children}
    </p>
  );
}

function ModelFactorRow({ factor }: { factor: ModelFactor }) {
  const color =
    factor.direction === "positive"
      ? "text-mint-400"
      : factor.direction === "negative"
        ? "text-red-400"
        : "text-charcoal-400";
  const arrow =
    factor.direction === "positive"
      ? "↑"
      : factor.direction === "negative"
        ? "↓"
        : "·";
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span aria-hidden className={`font-mono ${color}`}>
          {arrow}
        </span>
        <span className="text-sm text-charcoal-100 font-medium">
          {factor.name}
        </span>
        <span className="text-xs font-mono text-charcoal-500">
          {D.modelFactorWeightLabel}: {(factor.weight * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-xs text-charcoal-400 ml-5">{factor.explanation}</p>
    </li>
  );
}

function GuardrailRow({ guardrail }: { guardrail: GuardrailCheck }) {
  const tone =
    guardrail.status === "pass"
      ? "approved"
      : guardrail.status === "warn"
        ? "warning"
        : "rejected";
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <Badge variant={tone}>{guardrail.status.toUpperCase()}</Badge>
        <span className="text-sm text-charcoal-100 font-medium">
          {guardrail.label}
        </span>
        {guardrail.current_value !== undefined &&
        guardrail.limit_value !== undefined ? (
          <span className="text-xs font-mono text-charcoal-500">
            {D.guardrailCurrentLabel}:{" "}
            {formatGuardrailValue(guardrail.current_value)} ·{" "}
            {D.guardrailLimitLabel}:{" "}
            {formatGuardrailValue(guardrail.limit_value)}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-charcoal-400">{guardrail.message}</p>
    </li>
  );
}

function formatGuardrailValue(v: number): string {
  if (v > 0 && v < 1) return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString();
}

function StatusPill({ status }: { status: RecommendationDetail["status"] }) {
  const map: Record<
    RecommendationDetail["status"],
    "active" | "approved" | "warning" | "rejected" | "neutral" | "expired"
  > = {
    new: "neutral",
    delivered: "active",
    eligible: "active",
    executed: "approved",
    review: "warning",
    denied: "rejected",
    expired: "expired",
    dismissed: "neutral",
  };
  return <Badge variant={map[status]}>{status.toUpperCase()}</Badge>;
}

function VerdictPill({ status }: { status: OrderPreviewStatus }) {
  const map: Record<OrderPreviewStatus, "approved" | "warning" | "rejected"> = {
    ALLOW: "approved",
    REVIEW: "warning",
    DENY: "rejected",
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}

function badgeToneForType(
  t: RecommendationDetail["recommendation_type"],
): "active" | "warning" | "neutral" {
  switch (t) {
    case "buy":
    case "cash_deployment":
      return "active";
    case "sell":
    case "risk_reduction":
      return "warning";
    default:
      return "neutral";
  }
}
