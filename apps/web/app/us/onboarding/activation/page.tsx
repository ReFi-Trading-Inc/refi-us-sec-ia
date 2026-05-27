"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, StatusBanner, Badge } from "@ui/components";
import {
  useActivateAccount,
  useActivationStatus,
  type AccountActivationStatus,
} from "@refi/api-clients";
import { onboardingCopy } from "../../_content/onboarding";
import { useDocumentAcks } from "../../_lib/document-acks";

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
  const acks = useDocumentAcks();
  // Server returns the persona-fixture activation; we override `disclosures`
  // with the client-side ack tracker since the Document Registry has not
  // shipped yet (MIG-P2.5-06 / `06-backend-contract-map.md` §6).
  const baseStatus = data ?? FALLBACK;
  const status: AccountActivationStatus = {
    ...baseStatus,
    disclosures: acks.allRequiredAcked,
  };

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
            const isDisclosuresRow = item.key === "disclosures";
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 py-1"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
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
                  {isDiscloresSubLabel(isDisclosuresRow, acks) ? (
                    <span className="text-xs font-mono text-charcoal-500">
                      · {acks.requiredAckedCount}/{acks.requiredTotal}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {isDisclosuresRow ? (
                    <Link
                      href="/us/app/documents"
                      className="text-xs text-mint-400 hover:text-mint-300"
                    >
                      Review →
                    </Link>
                  ) : null}
                  {item.auto && (
                    <Badge variant="neutral" aria-label="Auto-checked">
                      Auto
                    </Badge>
                  )}
                </div>
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

function isDiscloresSubLabel(
  isRow: boolean,
  acks: ReturnType<typeof useDocumentAcks>,
): boolean {
  return isRow && acks.isHydrated;
}
