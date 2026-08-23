"use client";

import Link from "next/link";
import type { Route } from "next";
import { Badge, Button, Card, CardContent } from "@ui/components";
import {
  useInvestorRecommendations,
  type RecommendationProjection,
} from "@refi/api-clients";
import { appCopy } from "../../_content/app-copy";

const { recommendations } = appCopy;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function rationaleExcerpt(r: string): string {
  return r.length > 140 ? `${r.slice(0, 140)}…` : r;
}

export default function RecommendationsPage() {
  const { data, isLoading } = useInvestorRecommendations();
  const items: RecommendationProjection[] = data?.items ?? [];

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="recommendations-page"
      data-mode="signal"
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold text-charcoal-50">
            {recommendations.heading}
          </h1>
        </div>
        <p className="text-sm text-charcoal-400">
          {recommendations.subheading}
        </p>
      </div>

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

function RecommendationListCard({ rec }: { rec: RecommendationProjection }) {
  const actionTone =
    rec.action === "buy"
      ? "active"
      : rec.action === "sell"
        ? "warning"
        : "neutral";
  const detailHref = `/us/app/recommendations/${rec.recommendationId}` as Route;

  return (
    <Card
      data-testid="recommendation-card"
      data-mode="signal"
      data-rec-status={rec.status}
    >
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-charcoal-50">
              {rec.symbol}
            </span>
            <Badge variant={actionTone}>{rec.action.toUpperCase()}</Badge>
          </div>
          <span className="text-xs text-charcoal-500 font-mono tabular-nums">
            {(Number(rec.confidence) * 100).toFixed(0)}% confidence
          </span>
        </div>
        <p className="text-sm text-charcoal-300">
          {rationaleExcerpt(rec.rationale)}
        </p>

        {
          <div
            className="flex items-center justify-between text-xs text-charcoal-500"
            data-testid="signal-status-row"
          >
            <span>
              {recommendations.statusLabel}: {rec.status}
            </span>
            {rec.expiresAt && (
              <span>Expires {formatDateTime(rec.expiresAt)}</span>
            )}
          </div>
        }

        <div
          className="flex flex-wrap gap-2 pt-1"
          data-testid="recommendation-actions"
        >
          <>
            <Link href={detailHref}>
              <Button
                size="sm"
                variant="secondary"
                data-testid="signal-review-action"
              >
                {recommendations.signal.review}
              </Button>
            </Link>
            <Button
              size="sm"
              variant="tertiary"
              disabled
              data-testid="signal-save-action"
            >
              {recommendations.signal.save}
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              disabled
              data-testid="signal-dismiss-action"
            >
              {recommendations.signal.dismiss}
            </Button>
            <Link href={detailHref}>
              <Button
                size="sm"
                variant="primary"
                data-testid="signal-act-manually-action"
              >
                {recommendations.signal.actManually}
              </Button>
            </Link>
          </>
        </div>
      </CardContent>
    </Card>
  );
}
