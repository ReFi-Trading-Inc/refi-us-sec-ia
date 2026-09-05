"use client";

/**
 * Signal recommendations — informational. Data is Daniel's generated
 * `Recommendation` projected by the BFF (template, status, freshness,
 * turnover, leg count). There is no symbol / buy-sell / confidence / rationale
 * on the contract, so none is shown. `executionEligible` is backend status,
 * never a control: ReFi Signal places no orders.
 */
import Link from "next/link";
import type { Route } from "next";
import { Badge, Button, Card, CardContent, StatusBanner } from "@ui/components";
import { useInvestorRecommendations } from "../../../_hooks/useInvestorRecommendations";
import type { RecommendationSummaryView } from "@lib/investor-api/recommendations";
import { appCopy } from "../../_content/app-copy";
import {
  formatDateTime,
  freshnessTone,
  statusTone,
  upstreamMessage,
} from "./_view";

const { recommendations } = appCopy;

export default function RecommendationsPage() {
  const { data, isLoading, isError } = useInvestorRecommendations();
  const items = data?.items ?? [];
  const upstream = data?.upstream;

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="recommendations-page"
      data-mode="signal"
    >
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {recommendations.heading}
        </h1>
        <p className="text-sm text-charcoal-400">
          {recommendations.subheading}
        </p>
      </div>

      {isError && (
        <StatusBanner variant="error">{recommendations.readError}</StatusBanner>
      )}
      {upstream && upstream.state !== "ok" && (
        <StatusBanner
          variant="warning"
          data-testid="recommendations-upstream-state"
        >
          {upstreamMessage(upstream)}
        </StatusBanner>
      )}

      {isLoading ? (
        <div className="text-sm text-charcoal-500">Loading…</div>
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 text-sm text-charcoal-500"
          data-testid="recommendations-empty"
        >
          {recommendations.emptyState}
        </div>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="recommendations-list">
          {items.map((r) => (
            <li key={r.recommendationId}>
              <RecommendationListCard rec={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecommendationListCard({ rec }: { rec: RecommendationSummaryView }) {
  const detailHref =
    `/us/app/recommendations/${encodeURIComponent(rec.recommendationId)}` as Route;

  return (
    <Card
      data-testid="recommendation-card"
      data-mode="signal"
      data-rec-status={rec.status}
    >
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="text-base font-semibold text-charcoal-50 truncate"
              data-testid="recommendation-template"
            >
              {rec.templateId}
            </span>
            <Badge variant={statusTone(rec.status)}>{rec.status}</Badge>
          </div>
          <Badge variant={freshnessTone(rec.freshness.status)}>
            {recommendations.freshnessLabel}: {rec.freshness.status}
          </Badge>
        </div>

        <dl
          className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-charcoal-400"
          data-testid="signal-status-row"
        >
          <dt>{recommendations.legCountLabel}</dt>
          <dd className="font-mono tabular-nums text-charcoal-200">
            {rec.legCount}
          </dd>
          <dt>{recommendations.turnoverLabel}</dt>
          <dd className="font-mono tabular-nums text-charcoal-200">
            {rec.estimatedTurnoverPercent}%
          </dd>
          <dt>{recommendations.freshUntilLabel}</dt>
          <dd className="font-mono tabular-nums text-charcoal-200">
            {formatDateTime(rec.freshness.freshUntil)}
          </dd>
          <dt>{recommendations.executionEligibilityLabel}</dt>
          <dd
            className="text-charcoal-200"
            data-testid="recommendation-execution-eligibility"
          >
            {rec.executionEligible
              ? recommendations.executionEligible
              : recommendations.executionNotEligible}
          </dd>
        </dl>

        <div
          className="flex flex-wrap gap-2 pt-1"
          data-testid="recommendation-actions"
        >
          <Link href={detailHref}>
            <Button
              size="sm"
              variant="secondary"
              data-testid="signal-review-action"
            >
              {recommendations.signal.review}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
