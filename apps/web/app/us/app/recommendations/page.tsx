"use client";

import { Badge, Card, CardContent } from "@ui/components";
import { useRecommendations } from "@refi/api-clients";
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
  const { data, isLoading } = useRecommendations();
  const list = data ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {recommendations.heading}
        </h1>
        <p className="text-sm text-charcoal-400">
          {recommendations.subheading}
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-charcoal-500">Loading…</div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sm text-charcoal-500">
          {recommendations.emptyState}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {list.map((r) => {
            const tone =
              r.action === "buy"
                ? "active"
                : r.action === "sell"
                  ? "warning"
                  : "neutral";
            return (
              <Card key={r.id}>
                <CardContent className="pt-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-charcoal-50">
                        {r.symbol}
                      </span>
                      <Badge variant={tone}>{r.action.toUpperCase()}</Badge>
                    </div>
                    <span className="text-xs text-charcoal-500 font-mono tabular-nums">
                      {(r.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <p className="text-sm text-charcoal-300">
                    {rationaleExcerpt(r.rationale)}
                  </p>
                  <div className="flex items-center justify-between text-xs text-charcoal-500">
                    <span>
                      {recommendations.statusLabel}: {r.status}
                    </span>
                    <span>Expires {formatDateTime(r.expires_at)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
