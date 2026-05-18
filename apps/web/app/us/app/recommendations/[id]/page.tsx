"use client";

import { use } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, StatusBanner } from "@ui/components";
import {
  useRecommendation,
  useSubmitOrder,
  type OrderRequest,
} from "@refi/api-clients";
import { appCopy } from "../../../_content/app-copy";
import { CompliancePreview } from "../../_components/CompliancePreview";

const { recommendations } = appCopy;

// Next.js 16: params is a Promise; unwrap in client components with React.use.
export default function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, isError } = useRecommendation(id);
  const submitOrder = useSubmitOrder();

  if (isLoading) {
    return <p className="text-sm text-charcoal-500">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <StatusBanner variant="error">Recommendation not available.</StatusBanner>
    );
  }

  // Recommendations carry an action (buy/sell/hold). For preview purposes,
  // construct a placeholder order with qty=1 market — actual execution sizing
  // is handled by the managed execution engine.
  const previewOrder: OrderRequest | null =
    data.action === "hold"
      ? null
      : {
          symbol: data.symbol,
          qty: 1,
          side: data.action,
          type: "market",
        };

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

      {previewOrder && (
        <CompliancePreview
          order={previewOrder}
          renderSubmit={(canSubmit) => (
            <Button
              disabled={!canSubmit || submitOrder.isPending}
              onClick={() => submitOrder.mutate(previewOrder)}
            >
              {recommendations.detail.approveAction}
            </Button>
          )}
        />
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
