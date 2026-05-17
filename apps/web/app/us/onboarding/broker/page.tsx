"use client";

import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, StatusBanner } from "@ui/components";
import { onboardingCopy } from "../../_content/onboarding";

const { broker } = onboardingCopy;

export default function OnboardingBrokerPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {broker.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{broker.subheading}</p>
      </div>

      <div className="flex flex-col gap-3">
        {broker.brokers.map((b) => (
          <Card key={b.id}>
            <CardContent className="pt-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-charcoal-700 flex items-center justify-center text-xs font-mono text-charcoal-400">
                  {b.name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-charcoal-100">
                    {b.name}
                  </p>
                  {b.status === "coming_soon" && (
                    <Badge
                      variant="neutral"
                      aria-label={`${b.name}: coming soon`}
                    >
                      Coming soon
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={b.status === "available" ? "primary" : "secondary"}
                disabled={b.status !== "available"}
                onClick={() =>
                  b.status === "available" &&
                  void router.push("/us/onboarding/strategy")
                }
              >
                {b.status === "available"
                  ? broker.connectLabel
                  : broker.comingSoonLabel}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-charcoal-700 bg-charcoal-900 p-4">
        <p className="text-xs font-medium text-charcoal-300 mb-2">
          {broker.permissionsHeading}
        </p>
        <ul className="flex flex-col gap-1">
          {broker.permissions.map((p) => (
            <li
              key={p}
              className="text-xs text-charcoal-400 flex items-start gap-2"
            >
              <span className="text-mint-400 mt-0.5">✓</span>
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-charcoal-600">
          {broker.permissionsDisclaimer}
        </p>
      </div>
    </div>
  );
}
