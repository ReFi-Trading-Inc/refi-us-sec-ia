"use client";

import { use } from "react";
import Link from "next/link";
import {
  Badge,
  Card,
  CardContent,
  ModeBadge,
  StatusBanner,
} from "@ui/components";
import { useRecommendation, useSubscriptionMode } from "@refi/api-clients";
import { appCopy } from "../../../_content/app-copy";

const { recommendations } = appCopy;

// Next.js 16: params is a Promise; unwrap in client components with React.use.
export default function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, isError } = useRecommendation(id);
  const { data: modeState } = useSubscriptionMode();
  const mode = modeState?.mode ?? null;
  const modeKey: "signal" | "managed" | "unset" =
    mode === "signal" ? "signal" : mode === "managed" ? "managed" : "unset";

  if (isLoading) {
    return <p className="text-sm text-charcoal-500">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <StatusBanner variant="error">Recommendation not available.</StatusBanner>
    );
  }

  const actionable = data.action !== "hold";

  const tone =
    data.action === "buy"
      ? "active"
      : data.action === "sell"
        ? "warning"
        : "neutral";

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/us/app/recommendations"
          className="text-sm text-charcoal-400 hover:text-charcoal-200"
        >
          ← Recommendations
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {data.symbol}
        </h1>
        <Badge variant={tone}>{data.action.toUpperCase()}</Badge>
        <span className="text-xs text-charcoal-500 font-mono">
          {(data.confidence * 100).toFixed(0)}% confidence
        </span>
        <ModeBadge mode={modeKey} data-testid="recommendation-detail-mode" />
      </div>

      <Card>
        <CardContent className="pt-5 flex flex-col gap-4">
          <Section
            label={recommendations.detail.rationale}
            value={data.rationale}
          />
          <Section
            label={recommendations.detail.complianceStatus}
            value={`Status: ${data.status} · Expires ${new Date(data.expires_at).toLocaleString()}`}
          />
        </CardContent>
      </Card>

      {actionable && modeKey === "managed" && (
        <StatusBanner
          variant="info"
          title="Managed execution active"
          data-testid="managed-detail-banner"
        >
          {recommendations.managed.banner}
          <div className="mt-2">
            <Link
              href="/us/app/exceptions"
              className="text-mint-400 hover:text-mint-300 text-sm"
              data-testid="managed-detail-exception-link"
            >
              {recommendations.managed.reviewCta} →
            </Link>
          </div>
        </StatusBanner>
      )}

      {actionable && modeKey !== "managed" && (
        <Card data-testid="signal-manual-panel">
          <CardContent className="pt-5 pb-5 flex flex-col gap-3">
            <p className="text-sm font-semibold text-charcoal-50">
              {recommendations.detail.manualAction}
            </p>
            <p className="text-sm text-charcoal-300">
              {recommendations.signalManual.body}
            </p>
            <ol className="list-decimal list-inside text-sm text-charcoal-300 flex flex-col gap-1">
              {recommendations.signalManual.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-xs text-charcoal-500">
              {recommendations.signalManual.title}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
        {label}
      </p>
      <p className="text-sm text-charcoal-300">{value}</p>
    </div>
  );
}
