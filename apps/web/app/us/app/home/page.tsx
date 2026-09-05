"use client";

/**
 * Home — reconciled account truth from the backend (valuation, history,
 * positions, membership) through the BFF. No client-side simulation: what is
 * shown is what the backend reconciled, with its freshness.
 */
import Link from "next/link";
import { Badge, Card, CardContent, StatusBanner } from "@ui/components";
import { appCopy } from "../../_content/app-copy";
import { useInvestorPortfolio } from "../../../_hooks/useInvestorPortfolio";
import { useInvestorActivity } from "../../../_hooks/useInvestorActivity";
import { EquityChart, formatCurrency } from "../_components/EquityChart";
import { TickerTape } from "../_components/TickerTape";

const { home, activity: activityCopy } = appCopy;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function HomePage() {
  const { data, isLoading } = useInvestorPortfolio();
  const recent = useInvestorActivity();
  const p = data?.portfolio ?? null;
  const upstream = data?.upstream;
  const membership = p?.memberships[0] ?? null;

  const first = p?.history[0]?.equity;
  const last = p?.valuation.equity;
  const change =
    first !== undefined && last !== undefined
      ? Number(last) - Number(first)
      : null;
  const changePct =
    change !== null && first !== undefined && Number(first) !== 0
      ? change / Number(first)
      : null;

  return (
    <div className="flex flex-col gap-8 max-w-4xl" data-testid="home-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {home.heading}
        </h1>
        {p && (
          <Badge
            variant={p.valuation.freshness === "FRESH" ? "active" : "warning"}
          >
            {home.reconciledLabel} {formatDateTime(p.valuation.asOf)} ·{" "}
            {p.valuation.freshness.toLowerCase()}
          </Badge>
        )}
      </div>

      {upstream && upstream.state !== "ok" && (
        <StatusBanner variant="warning" data-testid="home-upstream-state">
          {home.upstreamUnavailable}
        </StatusBanner>
      )}

      {isLoading ? (
        <p className="text-sm text-charcoal-500">Loading…</p>
      ) : p ? (
        <>
          <TickerTape positions={p.positions} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi
              label={home.portfolioValue}
              value={formatCurrency(p.valuation.equity)}
              testId="home-equity"
            />
            <Kpi
              label={home.periodChange}
              value={
                change === null
                  ? "—"
                  : `${change >= 0 ? "+" : ""}${formatCurrency(change)}${changePct === null ? "" : ` (${(changePct * 100).toFixed(2)}%)`}`
              }
              tone={
                change !== null && change < 0
                  ? "text-status-rejected-text"
                  : "text-mint-400"
              }
            />
            <Kpi label={home.cash} value={formatCurrency(p.valuation.cash)} />
            <Kpi
              label={home.openPositions}
              value={String(p.valuation.positionCount)}
              testId="home-position-count"
            />
          </div>

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-charcoal-500 mb-3">
                {home.equityHistory}
              </p>
              <EquityChart history={p.history} height={160} id="homeArea" />
            </CardContent>
          </Card>

          {membership && (
            <Card data-testid="home-membership">
              <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-charcoal-500">
                    {home.subscribedTo}
                  </p>
                  <p className="text-sm font-medium text-charcoal-50">
                    {membership.templateName ?? membership.templateId}
                    {membership.constituentCount !== null && (
                      <span className="text-charcoal-400">
                        {" "}
                        · {membership.constituentCount} {home.constituents}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-charcoal-500">{home.allocation}</p>
                  <p className="text-sm font-mono tabular-nums text-charcoal-50">
                    {membership.allocationPercent !== null
                      ? `${(Number(membership.allocationPercent) * 100).toFixed(0)}%`
                      : "—"}{" "}
                    <Badge
                      variant={
                        membership.status === "ACTIVE" ? "active" : "neutral"
                      }
                    >
                      {membership.status}
                    </Badge>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-charcoal-300">
                {home.recentActivity}
              </h2>
              <Link
                href="/us/app/activity"
                className="text-xs text-mint-400 hover:text-mint-300"
              >
                {home.viewAll}
              </Link>
            </div>
            <div
              className="flex flex-col gap-2"
              data-testid="home-recent-activity"
            >
              {(recent.data?.items ?? []).slice(0, 5).map((r) => (
                <Card key={r.recordId}>
                  <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-charcoal-100 capitalize">
                        {r.recordType.replace(/_/g, " ")}{" "}
                        <span className="text-charcoal-400 normal-case">
                          · {r.status}
                        </span>
                      </p>
                      <p className="text-xs font-mono text-charcoal-500 truncate">
                        {r.entityId}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {r.notional && (
                        <p className="text-sm font-mono tabular-nums text-charcoal-100">
                          {formatCurrency(r.notional)}
                        </p>
                      )}
                      <p className="text-xs text-charcoal-500">
                        {formatDateTime(r.createdAt)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {recent.data && recent.data.items.length === 0 && (
                <p className="text-sm text-charcoal-500">
                  {activityCopy.emptyState}
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-charcoal-500" data-testid="home-empty">
          {home.noAccount}
        </p>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: string;
  testId?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-charcoal-500 mb-1">{label}</p>
        <p
          className={`text-2xl font-mono tabular-nums ${tone ?? "text-charcoal-100"}`}
          data-testid={testId}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
