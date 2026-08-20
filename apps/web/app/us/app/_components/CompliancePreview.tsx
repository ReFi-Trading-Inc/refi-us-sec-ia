"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrderPreview, type OrderRequest } from "@refi/api-clients";
import { Badge, Button, StatusBanner } from "@ui/components";
import { compliancePreviewCopy } from "../../_content/app-copy";

/**
 * The risk verdict is binary by construction — see the OrderPreviewResult note
 * in refi-api.yaml and docs/phase2-6-daniel-answer-resolution.md Q1
 * (GAP-RISK-BINARY-006). A DENY is a backend hard stop that no frontend
 * affordance can clear, so there is deliberately no REVIEW state and no
 * "request manual review" escalation here.
 *
 * UNAVAILABLE is not a verdict: it is the client-side state for retryable
 * operational failures (STALE_PRICES, BROKER_UNAVAILABLE, RETRY_PRICES), and
 * it is the only state that carries a retry affordance.
 */
type Verdict =
  | {
      kind: "ALLOW" | "DENY";
      source: "cache" | "fresh";
      reasons: { code: string; message: string }[];
    }
  | { kind: "UNAVAILABLE" }
  | { kind: "LOADING" };

const isDev =
  typeof process !== "undefined" &&
  process.env["NEXT_PUBLIC_REFI_ENV"] !== "prod";

export type CompliancePreviewProps = {
  /** Order to preview. Pass `null` to disable the check. */
  order: OrderRequest | null;
  /** Render prop for the submit action, called with whether submission is allowed. */
  renderSubmit: (
    canSubmit: boolean,
    verdictKind: Verdict["kind"],
  ) => React.ReactNode;
  /** Telemetry hook. Caller can wire to PostHog in MIG-P2-06. */
  onVerdict?: (e: {
    status: "ALLOW" | "DENY" | "UNAVAILABLE";
    source?: "cache" | "fresh";
    latency_ms?: number;
  }) => void;
};

export function CompliancePreview({
  order,
  renderSubmit,
  onVerdict,
}: CompliancePreviewProps) {
  const [override, setOverride] = useState<
    null | "ALLOW" | "DENY" | "UNAVAILABLE"
  >(null);
  const query = useOrderPreview(order);

  const verdict: Verdict = useMemo(() => {
    if (override) {
      if (override === "UNAVAILABLE") return { kind: "UNAVAILABLE" };
      return {
        kind: override,
        source: "fresh",
        reasons:
          override === "DENY"
            ? [
                {
                  code: "DEV_OVERRIDE",
                  message: "Forced DENY for local testing.",
                },
              ]
            : [],
      };
    }
    if (!order) return { kind: "LOADING" };
    if (query.isError) return { kind: "UNAVAILABLE" };
    if (!query.data) return { kind: "LOADING" };
    return {
      kind: query.data.status,
      source: query.data.source,
      reasons: query.data.reasons,
    };
  }, [override, order, query.data, query.isError]);

  // Telemetry emission.
  useEffect(() => {
    if (!onVerdict) return;
    if (verdict.kind === "LOADING") return;
    if (verdict.kind === "UNAVAILABLE") {
      onVerdict({ status: "UNAVAILABLE" });
      return;
    }
    onVerdict({
      status: verdict.kind,
      source: verdict.source,
      latency_ms: query.data?.latency_ms,
    });
  }, [verdict, onVerdict, query.data?.latency_ms]);

  const canSubmit = verdict.kind === "ALLOW";

  if (verdict.kind === "LOADING") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-charcoal-500">Running compliance check…</p>
        {renderSubmit(false, verdict.kind)}
      </div>
    );
  }

  if (verdict.kind === "UNAVAILABLE") {
    const copy = compliancePreviewCopy.UNAVAILABLE;
    return (
      <div className="flex flex-col gap-3">
        <StatusBanner variant="warning" title={copy.label}>
          {copy.body}
        </StatusBanner>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {copy.cta}
        </Button>
        {renderSubmit(false, verdict.kind)}
        {isDev && <DevOverridePanel value={override} onChange={setOverride} />}
      </div>
    );
  }

  const copy = compliancePreviewCopy[verdict.kind];
  return (
    <div className="flex flex-col gap-3">
      <StatusBanner variant={copy.tone} title={copy.label}>
        {copy.body}
      </StatusBanner>

      {isDev && (
        <p className="text-xs text-charcoal-500">
          {verdict.source === "cache"
            ? compliancePreviewCopy.sourceCache
            : compliancePreviewCopy.sourceFresh}
        </p>
      )}

      {verdict.reasons.length > 0 && (
        <div className="rounded-md border border-charcoal-700 bg-charcoal-900 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500 mb-2">
            {compliancePreviewCopy.reasonsHeading}
          </p>
          <ul className="flex flex-col gap-1">
            {verdict.reasons.map((r) => (
              <li
                key={r.code}
                className="text-xs text-charcoal-300 flex items-start gap-2"
              >
                <Badge variant="neutral">{r.code}</Badge>
                <span>{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {renderSubmit(canSubmit, verdict.kind)}

      {isDev && <DevOverridePanel value={override} onChange={setOverride} />}
    </div>
  );
}

function DevOverridePanel({
  value,
  onChange,
}: {
  value: "ALLOW" | "DENY" | "UNAVAILABLE" | null;
  onChange: (v: "ALLOW" | "DENY" | "UNAVAILABLE" | null) => void;
}) {
  return (
    <div className="rounded-md border border-charcoal-700 bg-charcoal-900 p-2 flex flex-wrap items-center gap-2">
      <p className="text-xs text-charcoal-500">Dev: override verdict</p>
      {(["ALLOW", "DENY", "UNAVAILABLE"] as const).map((k) => (
        <Button
          key={k}
          size="sm"
          variant={value === k ? "primary" : "secondary"}
          onClick={() => {
            onChange(value === k ? null : k);
          }}
        >
          {k}
        </Button>
      ))}
      {value && (
        <Button
          size="sm"
          variant="tertiary"
          onClick={() => {
            onChange(null);
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
