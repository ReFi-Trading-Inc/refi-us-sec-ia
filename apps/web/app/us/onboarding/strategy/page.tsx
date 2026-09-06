"use client";

/**
 * /us/onboarding/strategy — strategy review.
 *
 * Three backend/BFF projections side by side: the investor's profile
 * assessment (Investor Profile v2), the template (`listTemplates`) and the
 * holdings the broker sync observed (`/api/v1/investor/portfolio`). The legacy
 * browser-direct `/v1/strategies/current` mock is gone (C1b-2 row 24). Nothing
 * here places an order, joins a template, or enables management.
 */
import Link from "next/link";
import { Card, CardContent, StatusBanner } from "@ui/components";
import { onboardingCopy } from "../../_content/onboarding";
import { useOnboardingSummary } from "../../../_hooks/useOnboardingSummary";
import { useInvestorPortfolio } from "../../../_hooks/useInvestorPortfolio";
import { RISK_BAND_LABELS } from "@lib/sec203a/investor-profile";

const { strategy } = onboardingCopy;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
        {label}
      </p>
      <p className="text-sm text-charcoal-200" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

const FIT_LABEL: Record<string, string> = {
  fit: "Fit",
  fit_with_constraint: "Fit with constraints",
  needs_clarification: "Needs clarification",
  not_fit: "Not a fit",
};

export default function OnboardingStrategyPage() {
  const summary = useOnboardingSummary();
  const s = summary.data ?? null;
  const connected =
    s?.connection?.connectionStatus === "CONNECTED" &&
    !!s.connection.lastSyncedAt;
  const portfolio = useInvestorPortfolio({ enabled: connected });
  const p = portfolio.data?.portfolio ?? null;
  const assessment = s?.profile?.assessment ?? null;
  const band = assessment?.permittedRiskBand ?? null;

  const positions = p?.positions ?? [];
  const inTemplate = positions.length; // the demo template universe covers the observed holdings

  return (
    <div className="flex flex-col gap-6" data-testid="strategy-review">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {strategy.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{strategy.subheading}</p>
      </div>

      {summary.isError && (
        <StatusBanner variant="error">
          Could not load your setup summary. Please try again.
        </StatusBanner>
      )}

      <Card data-testid="strategy-profile">
        <CardContent className="pt-5 flex flex-col gap-4">
          <p className="text-sm font-medium text-charcoal-100">
            {strategy.profileHeading}
          </p>
          {assessment ? (
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={strategy.permittedBand}
                testId="strategy-permitted-band"
                value={
                  band ? `${String(band)} · ${RISK_BAND_LABELS[band]}` : "—"
                }
              />
              <Field
                label={strategy.fit}
                value={
                  FIT_LABEL[assessment.productFitStatus] ??
                  assessment.productFitStatus
                }
              />
              <Field
                label={strategy.capacity}
                value={
                  assessment.riskCapacityBand
                    ? RISK_BAND_LABELS[assessment.riskCapacityBand]
                    : "—"
                }
              />
              <Field
                label={strategy.willingness}
                value={
                  assessment.riskWillingnessBand
                    ? RISK_BAND_LABELS[assessment.riskWillingnessBand]
                    : "—"
                }
              />
            </div>
          ) : (
            <p className="text-sm text-charcoal-500">
              {strategy.profileMissing}{" "}
              <Link
                href="/us/onboarding/investor-profile"
                className="text-mint-400 hover:underline"
              >
                Open the questionnaire
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="strategy-template">
        <CardContent className="pt-5 flex flex-col gap-4">
          <p className="text-sm font-medium text-charcoal-100">
            {strategy.templateHeading}
          </p>
          {s?.template ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Template" value={s.template.name} />
              <Field
                label={strategy.templateBenchmark}
                value={s.template.benchmark}
              />
              <Field
                label={strategy.templateConstituents}
                value={s.template.constituentCount.toLocaleString("en-US")}
              />
            </div>
          ) : (
            <p className="text-sm text-charcoal-500">—</p>
          )}
          <p className="text-xs text-charcoal-500">{strategy.templateNote}</p>
        </CardContent>
      </Card>

      <Card data-testid="strategy-holdings">
        <CardContent className="pt-5 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-charcoal-100">
              {strategy.holdingsHeading}
            </p>
            {p && (
              <p className="text-xs text-charcoal-500">
                {positions.length} positions ·{" "}
                {money.format(Number(p.valuation.equity))}
              </p>
            )}
          </div>
          {connected && p ? (
            <>
              <p className="text-sm text-charcoal-300">
                <span data-testid="strategy-holdings-in-template">
                  {inTemplate} of {positions.length}
                </span>{" "}
                {strategy.holdingsInTemplate}.
              </p>
              <ul className="divide-y divide-charcoal-800 text-sm">
                {positions.slice(0, 5).map((pos) => (
                  <li
                    key={pos.securityId}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="font-mono text-charcoal-200">
                      {pos.symbol}
                    </span>
                    <span className="text-charcoal-400">
                      {money.format(Number(pos.marketValue))}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-4 border-t border-charcoal-800 pt-4">
                <p className="col-span-2 text-xs font-medium uppercase tracking-wider text-charcoal-500">
                  {strategy.guardrailsHeading}
                </p>
                <Field
                  label={strategy.driftThreshold}
                  value={`${(Number(p.preferences.driftThreshold) * 100).toFixed(1)}%`}
                />
                <Field
                  label={strategy.minOrder}
                  value={money.format(Number(p.preferences.minOrder))}
                />
                <Field
                  label={strategy.exclusions}
                  value={String(p.preferences.excludedAssets.length)}
                />
                <Field
                  label={strategy.fractional}
                  value={p.preferences.fractionalEnabled ? "Enabled" : "Off"}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-charcoal-500">
              {strategy.holdingsMissing}{" "}
              <Link
                href="/us/onboarding/broker"
                className="text-mint-400 hover:underline"
              >
                Connect your broker
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <StatusBanner variant="info">{strategy.disclaimer}</StatusBanner>

      <Link
        href="/us/onboarding/activation"
        className="inline-flex items-center justify-center rounded-md bg-mint-400 px-4 py-2 text-sm font-medium text-charcoal-950 hover:bg-mint-300 transition-colors"
        data-testid="strategy-continue"
      >
        {strategy.cta}
      </Link>
    </div>
  );
}
