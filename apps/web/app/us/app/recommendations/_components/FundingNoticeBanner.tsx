"use client";

/**
 * Persistent portfolio funding notice (alpha.4 FUNDING.md §2; founder F-H1,
 * 2026-09-13). Renders ONLY what the contract supplies on
 * `funding_assessment` for an INSUFFICIENT assessment: the USD decimal
 * strings verbatim (never parsed through floating point) and the limiting
 * constituents. Informational only — it does not indicate admission,
 * suitability, authorization or any guarantee of execution, and dismissing or
 * ignoring it grants nothing. The notice is rebuilt server-side from persisted
 * recommendations; only newer, current, fresh SUFFICIENT evidence clears it.
 */
import { StatusBanner } from "@ui/components";
import type { FundingNotice } from "@lib/investor-api/funding-notices";
import { fractionToPercent } from "@lib/investor-api/fraction-percent";
import { appCopy } from "../../../_content/app-copy";
import { formatDateTime } from "../_view";

const { funding } = appCopy.recommendations;

function money(currency: string, value: string | null | undefined): string {
  // Contract amounts are canonical decimal strings; display them as-is.
  return value === null || value === undefined ? "—" : `${currency} ${value}`;
}

export function FundingNoticeBanner({
  notices,
}: {
  notices: readonly FundingNotice[];
}) {
  const active = notices.filter(
    (n) => n.state === "active" && n.assessment?.status === "INSUFFICIENT",
  );
  if (active.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="funding-notices">
      {active.map((n) => {
        const a = n.assessment;
        if (!a) return null;
        return (
          <StatusBanner
            key={`${n.templateId}:${n.recommendationId}`}
            variant="warning"
            title={`${funding.title} — ${n.templateId}`}
            data-testid="funding-notice"
            data-state={n.state}
            data-stale={n.stale ? "true" : "false"}
            data-template={n.templateId}
          >
            <p>{funding.body}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <dt>{funding.allocatedCapital}</dt>
              <dd className="font-mono tabular-nums">
                {money(a.currency, a.allocated_capital)}
              </dd>
              <dt>{funding.requiredPortfolioCapital}</dt>
              <dd className="font-mono tabular-nums">
                {money(a.currency, a.required_portfolio_capital)}
              </dd>
              <dt>{funding.capitalShortfall}</dt>
              <dd
                className="font-mono tabular-nums"
                data-testid="funding-notice-shortfall"
              >
                {money(a.currency, a.capital_shortfall)}
              </dd>
              <dt>{funding.requiredAccountEquity}</dt>
              <dd className="font-mono tabular-nums">
                {money(a.currency, a.required_account_equity)}
              </dd>
              {a.user_min_order !== "0" && (
                <>
                  <dt>{funding.userMinOrder}</dt>
                  <dd className="font-mono tabular-nums">
                    {money(a.currency, a.user_min_order)}
                  </dd>
                </>
              )}
              <dt>{funding.assessedAt}</dt>
              <dd className="font-mono tabular-nums">
                {formatDateTime(n.assessedAt)}
                {n.stale ? ` · ${funding.staleSuffix}` : ""}
              </dd>
            </dl>
            {a.limiting_constituents.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium">
                  {funding.limitingConstituents}
                </p>
                <ul
                  className="mt-1 flex flex-col gap-0.5 text-xs font-mono tabular-nums"
                  data-testid="funding-notice-constituents"
                >
                  {a.limiting_constituents.map((c) => (
                    <li key={c.security_id}>
                      {c.security_id} · {funding.targetWeight}{" "}
                      {fractionToPercent(c.target_weight)}% ·{" "}
                      {funding.effectiveMinimum}{" "}
                      {money(a.currency, c.effective_minimum_notional)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 text-xs opacity-80">{funding.disclaimer}</p>
          </StatusBanner>
        );
      })}
    </div>
  );
}
