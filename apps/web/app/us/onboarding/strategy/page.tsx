import Link from "next/link";
import { Card, CardContent, StatusBanner } from "@ui/components";
import { onboardingCopy } from "../../_content/onboarding";

const { strategy } = onboardingCopy;

// Strategy data loads from API in MIG-P1-06; skeleton shown until then.
const stubStrategy = {
  strategyName: "—",
  rationale: "—",
  targetAllocation: "—",
  assetUniverse: "—",
  riskGuardrails: "—",
  expectedTurnover: "—",
  exclusions: "—",
  costsAndFees: "—",
  modelVersion: "—",
};

export default function OnboardingStrategyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {strategy.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{strategy.subheading}</p>
      </div>

      <Card>
        <CardContent className="pt-5 flex flex-col gap-4">
          {Object.entries(strategy.fields).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
                {label}
              </p>
              <p className="text-sm text-charcoal-300">
                {stubStrategy[key as keyof typeof stubStrategy]}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <StatusBanner variant="info">{strategy.disclaimer}</StatusBanner>

      <Link
        href="/us/onboarding/activation"
        className="inline-flex items-center justify-center rounded-md bg-mint-400 px-4 py-2 text-sm font-medium text-charcoal-950 hover:bg-mint-300 transition-colors"
      >
        {strategy.cta}
      </Link>
    </div>
  );
}
