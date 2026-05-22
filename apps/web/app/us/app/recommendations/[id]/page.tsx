"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ModeBadge,
  StatusBanner,
} from "@ui/components";
import {
  useRecommendation,
  useSubmitOrder,
  useSubscriptionMode,
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
  const { data: modeState } = useSubscriptionMode();
  const mode = modeState?.mode ?? null;
  const modeKey: "signal" | "managed" | "unset" =
    mode === "signal" ? "signal" : mode === "managed" ? "managed" : "unset";
  const [qty, setQty] = useState(1);

  if (isLoading) {
    return <p className="text-sm text-charcoal-500">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <StatusBanner variant="error">Recommendation not available.</StatusBanner>
    );
  }

  const previewOrder: OrderRequest | null =
    data.action === "hold"
      ? null
      : {
          symbol: data.symbol,
          qty,
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

      {previewOrder && modeKey === "managed" && (
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

      {previewOrder && modeKey !== "managed" && (
        <div className="flex flex-col gap-4" data-testid="signal-order-entry">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="order-qty"
              className="text-sm font-medium text-charcoal-200"
            >
              Quantity
            </label>
            <input
              id="order-qty"
              type="number"
              min={1}
              max={10000}
              value={qty}
              onChange={(e) => {
                const v = Math.max(1, Math.min(10000, Number(e.target.value)));
                setQty(Number.isNaN(v) ? 1 : v);
              }}
              className="w-32 rounded-md border border-charcoal-700 bg-charcoal-800 px-3 py-2 text-sm text-charcoal-100 focus:outline-none focus:ring-2 focus:ring-mint-400 tabular-nums"
              aria-label="Order quantity"
            />
            <p className="text-xs text-charcoal-500">
              Shares to {data.action}. You place this order yourself through
              your connected broker.
            </p>
          </div>

          <CompliancePreview
            order={previewOrder}
            renderSubmit={(canSubmit) => (
              <Button
                disabled={!canSubmit || submitOrder.isPending}
                onClick={() => submitOrder.mutate(previewOrder)}
                data-testid="signal-place-order-button"
              >
                {recommendations.detail.manualAction}
              </Button>
            )}
          />
        </div>
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
