"use client";

import { useRouter } from "next/navigation";
import { Button, Card, CardContent, StatusBanner, Badge } from "@ui/components";
import {
  useActivateAccount,
  useActivationStatus,
  type AccountActivationStatus,
} from "@refi/api-clients";
import { onboardingCopy } from "../../_content/onboarding";

const { activation } = onboardingCopy;

const FALLBACK: AccountActivationStatus = {
  eligibility: false,
  wallet: false,
  kyc: false,
  profile: false,
  broker: false,
  disclosures: false,
};

export default function OnboardingActivationPage() {
  const router = useRouter();
  const { data, isLoading } = useActivationStatus();
  const activate = useActivateAccount();
  const status = data ?? FALLBACK;

  const allDone = Object.values(status).every(Boolean);

  function handleActivate() {
    activate.mutate(undefined, {
      onSuccess: () => router.push("/us/app/home"),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {activation.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{activation.subheading}</p>
      </div>

      <Card>
        <CardContent className="pt-5 flex flex-col gap-3">
          {activation.checklist.map((item) => {
            const checked = status[item.key as keyof AccountActivationStatus];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 py-1"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      checked
                        ? "text-status-active text-sm"
                        : "text-charcoal-600 text-sm"
                    }
                    aria-hidden="true"
                  >
                    {checked ? "✓" : "○"}
                  </span>
                  <p className="text-sm text-charcoal-200">{item.label}</p>
                </div>
                {item.auto && (
                  <Badge variant="neutral" aria-label="Auto-checked">
                    Auto
                  </Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <StatusBanner variant="warning">
        {activation.warningDisclosure}
      </StatusBanner>

      {activate.isError && (
        <StatusBanner variant="error">{activate.error.message}</StatusBanner>
      )}

      <Button
        disabled={!allDone || activate.isPending || isLoading}
        onClick={handleActivate}
        title={allDone ? undefined : activation.pendingLabel}
      >
        {allDone ? activation.activateLabel : activation.pendingLabel}
      </Button>
    </div>
  );
}
