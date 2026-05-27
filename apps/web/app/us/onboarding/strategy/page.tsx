"use client";

import Link from "next/link";
import { Card, CardContent, StatusBanner } from "@ui/components";
import { useStrategy } from "@refi/api-clients";
import { onboardingCopy } from "../../_content/onboarding";

const { strategy } = onboardingCopy;

export default function OnboardingStrategyPage() {
  const { data, isLoading, isError } = useStrategy();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {strategy.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{strategy.subheading}</p>
      </div>

      {isError && (
        <StatusBanner variant="error">{strategy.loadError}</StatusBanner>
      )}

      <Card>
        <CardContent className="pt-5 flex flex-col gap-4">
          {isLoading || !data
            ? Object.values(strategy.fields).map((label) => (
                <div key={label} className="flex flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
                    {label}
                  </p>
                  <p className="text-sm text-charcoal-500">—</p>
                </div>
              ))
            : Object.entries(strategy.fields).map(([key, label]) => (
                <div key={key} className="flex flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
                    {label}
                  </p>
                  <p className="text-sm text-charcoal-300">
                    {data[key as keyof typeof data]}
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
