"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ModeBadge,
  StatusBanner,
} from "@ui/components";
import {
  useInvestorRecommendations,
  type RecommendationProjection,
  type RecommendationProjectionStatus,
  type SubscriptionMode,
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

// Managed-mode posture: which projection statuses currently require user
// attention via Exception Review. Surface 6 will replace this heuristic with
// the prototype-store ExceptionReview entity.
const REVIEW_REQUIRED: ReadonlySet<RecommendationProjectionStatus> = new Set([
  "blocked",
  "saved",
]);

export default function RecommendationsPage() {
  const { data, isLoading } = useInvestorRecommendations();
  const items: RecommendationProjection[] = data?.items ?? [];
  const mode: SubscriptionMode | null = data?.mode ?? null;
  const modeKey: "signal" | "managed" | "unset" =
    mode === "signal" ? "signal" : mode === "managed" ? "managed" : "unset";

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="recommendations-page"
      data-mode={modeKey}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-semibold text-charcoal-50">
            {recommendations.heading}
          </h1>
          <ModeBadge mode={modeKey} data-testid="recommendations-mode-badge" />
        </div>
        <p className="text-sm text-charcoal-400">
          {recommendations.subheading}
        </p>
      </div>

      {modeKey === "managed" && (
        <StatusBanner variant="info" data-testid="managed-banner">
          {recommendations.managed.banner}
        </StatusBanner>
      )}

      {modeKey === "signal" && (
        <Card data-testid="signal-upgrade-cta">
          <CardContent className="pt-4 pb-4 flex flex-col gap-2">
            <p className="text-sm font-medium text-charcoal-100">
              {recommendations.signal.upgradeCta}
            </p>
            <p className="text-sm text-charcoal-400">
              {recommendations.signal.upgradeHelp}
            </p>
          </CardContent>
        </Card>
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
              <RecommendationListCard rec={r} mode={modeKey} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecommendationListCard({
  rec,
  mode,
}: {
  rec: RecommendationProjection;
  mode: "signal" | "managed" | "unset";
}) {
  const actionTone =
    rec.action === "buy"
      ? "active"
      : rec.action === "sell"
        ? "warning"
        : "neutral";
  const detailHref = `/us/app/recommendations/${rec.recommendationId}` as Route;
  const reviewRequired = mode === "managed" && REVIEW_REQUIRED.has(rec.status);

  return (
    <Card
      data-testid="recommendation-card"
      data-mode={mode}
      data-rec-status={rec.status}
      data-review-required={reviewRequired ? "true" : "false"}
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

        {mode === "managed" && (
          <div
            className="flex items-center justify-between text-xs text-charcoal-500"
            data-testid="managed-status-row"
          >
            <span data-testid="managed-status-label">
              {appCopy.recommendations.managed.statusLabels[rec.status]}
            </span>
            {rec.expiresAt && (
              <span>Expires {formatDateTime(rec.expiresAt)}</span>
            )}
          </div>
        )}

        {mode !== "managed" && (
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
        )}

        <div
          className="flex flex-wrap gap-2 pt-1"
          data-testid="recommendation-actions"
        >
          {mode === "managed" ? (
            <>
              <Link href={detailHref}>
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="managed-review-action"
                >
                  {recommendations.signal.review}
                </Button>
              </Link>
              {reviewRequired && (
                <Link href="/us/app/exceptions">
                  <Button
                    size="sm"
                    variant="primary"
                    data-testid="managed-exception-cta"
                  >
                    {recommendations.managed.reviewCta}
                  </Button>
                </Link>
              )}
            </>
          ) : (
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
