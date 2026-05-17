import { Button, Card, CardContent, StatusBanner, Badge } from "@ui/components";
import { onboardingCopy } from "../../_content/onboarding";

const { activation } = onboardingCopy;

// Checklist states are stubbed; real values come from session + broker + KYC status (MIG-P1-06)
const stubChecked: Record<string, boolean> = {
  eligibility: true,
  wallet: false,
  kyc: false,
  profile: true,
  broker: false,
  disclosures: false,
};

const allDone = Object.values(stubChecked).every(Boolean);

export default function OnboardingActivationPage() {
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
            const checked = stubChecked[item.key] ?? false;
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

      <Button
        disabled={!allDone}
        title={allDone ? undefined : activation.pendingLabel}
      >
        {allDone ? activation.activateLabel : activation.pendingLabel}
      </Button>
    </div>
  );
}
