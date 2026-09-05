"use client";

/**
 * Public U.S. identity verification — the frontend-owned provider lifecycle.
 *
 * Reads and drives the journey ONLY through same-origin ReFi BFF routes
 * (`useKycVerification`). No vendor is named, no vendor state is shown, and
 * nothing here calls the Investor API or identity-ccid. Progression to the
 * profile step happens when the lifecycle reaches `passed` — never from the
 * backend policy projection (`getKycStatus` is a different domain).
 */
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, StatusBanner } from "@ui/components";
import { kycCopy } from "../../_content/app-copy";
import {
  KYC_LIFECYCLE_STATES,
  isTerminalKycState,
  useAdvanceMockKycVerification,
  useKycVerification,
  useStartKycVerification,
  type KycLifecycleState,
} from "../../../_hooks/useKycVerification";

// Development-only mock controls. Hidden in production builds; the BFF route
// they call additionally answers 404 unless explicitly enabled server-side.
const showMockControls =
  typeof process !== "undefined" &&
  process.env["NEXT_PUBLIC_REFI_ENV"] !== "prod";

export default function OnboardingKycPage() {
  const router = useRouter();
  const verification = useKycVerification({ poll: true });
  const start = useStartKycVerification();
  const advance = useAdvanceMockKycVerification();

  const view = verification.data;
  const state: KycLifecycleState = view?.session?.state ?? "not_started";
  const meta = useMemo(() => kycCopy.statuses[state], [state]);

  // Onboarding sequence: identity verification → the canonical Investor
  // Profile questionnaire v2 (docs/releases/2026-09-signal/investor-profile-spec.md).
  // Never the legacy v1 advisory questionnaire (/us/onboarding/profile), where
  // riskTolerance is user-entered; v2 derives capacity, willingness, permitted
  // band and product fit server-side. Progression is on the provider lifecycle
  // reaching exactly `passed` — never on the backend policy projection.
  useEffect(() => {
    if (state !== "passed") return;
    router.replace("/us/onboarding/investor-profile");
  }, [state, router]);

  const unavailable = view !== undefined && !view.available;
  const canStart =
    view?.available === true &&
    (state === "not_started" ||
      state === "additional_info_required" ||
      state === "failed");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {kycCopy.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{kycCopy.subheading}</p>
      </div>

      <Card>
        <CardContent className="pt-5 flex flex-col gap-4">
          {verification.isPending && (
            <p className="text-xs text-charcoal-500">{kycCopy.pollingNote}</p>
          )}
          {verification.isError && (
            <StatusBanner variant="error">{kycCopy.readError}</StatusBanner>
          )}
          {unavailable && (
            <StatusBanner variant="warning" title={kycCopy.unavailable.label}>
              {kycCopy.unavailable.body}
            </StatusBanner>
          )}
          {view?.available === true && (
            <StatusBanner
              variant={meta.tone === "neutral" ? "info" : meta.tone}
              title={meta.label}
              data-testid={`kyc-state-${state}`}
            >
              {meta.body}
            </StatusBanner>
          )}

          {canStart && (
            <Button
              data-testid="kyc-start"
              onClick={() => {
                start.mutate();
              }}
              disabled={start.isPending}
            >
              {state === "not_started" ? kycCopy.startCta : kycCopy.resumeCta}
            </Button>
          )}
          {start.isError && (
            <StatusBanner variant="error">{kycCopy.startError}</StatusBanner>
          )}

          {view?.available === true &&
            !isTerminalKycState(state) &&
            state !== "not_started" &&
            state !== "additional_info_required" && (
              <p
                className="text-xs text-charcoal-500"
                aria-live="polite"
                aria-atomic="true"
              >
                {kycCopy.pollingNote}
              </p>
            )}

          {state === "failed" && (
            <a
              href="/us/app/support"
              className="text-xs text-mint-400 hover:underline"
            >
              {kycCopy.supportLink}
            </a>
          )}
        </CardContent>
      </Card>

      {showMockControls && view?.adapter === "mock" && (
        <div
          data-testid="kyc-mock-controls"
          className="rounded-lg border border-charcoal-700 bg-charcoal-900 p-3 flex flex-wrap gap-2"
        >
          <p className="w-full text-xs text-charcoal-500 mb-1">
            Development only — MOCK identity-verification adapter. This is not a
            KYC check; these buttons move a test state machine.
          </p>
          {KYC_LIFECYCLE_STATES.filter((s) => s !== "not_started").map((s) => (
            <Button
              key={s}
              size="sm"
              variant="secondary"
              onClick={() => {
                advance.mutate(s);
              }}
              disabled={advance.isPending}
            >
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
