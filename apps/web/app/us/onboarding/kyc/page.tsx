"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  isKycTerminal,
  useComplianceInvalidateCache,
  useKycStart,
  useKycStatus,
  useKycSimulateWebhook,
  type KycStatusValue,
} from "@refi/api-clients";
import { Button, Card, CardContent, StatusBanner } from "@ui/components";
import { kycCopy } from "../../_content/app-copy";
import { useAuth } from "../../../_providers/auth/AuthProvider";

const isDev =
  typeof process !== "undefined" &&
  process.env["NEXT_PUBLIC_REFI_ENV"] !== "prod";

function statusFromAuthOrApi(
  authStatus: KycStatusValue | undefined,
  apiStatus: KycStatusValue | undefined,
): KycStatusValue {
  // Prefer the latest API value; fall back to session-embedded status.
  return apiStatus ?? authStatus ?? "not_started";
}

export default function OnboardingKycPage() {
  const router = useRouter();
  const auth = useAuth();
  const statusQuery = useKycStatus({ poll: true });
  const start = useKycStart();
  const simulate = useKycSimulateWebhook();
  const invalidateCache = useComplianceInvalidateCache();

  const current = statusFromAuthOrApi(
    auth.kyc_status,
    statusQuery.data?.status,
  );
  const meta = useMemo(() => kycCopy.statuses[current], [current]);

  // Once approved, ask the compliance adapter to drop its cached decision so
  // subsequent /orders/preview calls see the new KYC state, then refresh the
  // session so AuthContext reflects the new kyc_status, then forward.
  useEffect(() => {
    if (current !== "approved") return;
    // Use a getter so TS's control-flow analysis cannot narrow the cancelled
    // state to a constant across await boundaries. Cleanup mutates the
    // backing object; isCancelled() always re-reads.
    const ctrl: { cancelled: boolean } = { cancelled: false };
    const isCancelled = (): boolean => ctrl.cancelled;
    void (async () => {
      if (auth.account_id) {
        try {
          await invalidateCache.mutateAsync({ account_id: auth.account_id });
        } catch {
          // Cache invalidation failure is non-fatal; backend will recompute on
          // next preview anyway.
        }
      }
      if (isCancelled()) return;
      await auth.refetchSession();
      if (isCancelled()) return;
      router.replace("/us/onboarding/profile");
    })();
    return () => {
      ctrl.cancelled = true;
    };
    // We intentionally don't include auth.refetchSession / invalidateCache in
    // deps — they're stable across renders and changing references would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, auth.account_id]);

  const showStartCta = current === "not_started";
  const showResumeCta = current === "incomplete";

  function handleStart() {
    start.mutate(undefined, {
      onSuccess: (resp) => {
        if (typeof window !== "undefined" && resp.provider_url) {
          window.location.href = resp.provider_url;
        }
      },
    });
  }

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
          <StatusBanner
            variant={meta.tone === "neutral" ? "info" : meta.tone}
            title={meta.label}
          >
            {meta.body}
          </StatusBanner>

          {(showStartCta || showResumeCta) && (
            <Button onClick={handleStart} disabled={start.isPending}>
              {showResumeCta ? kycCopy.resumeCta : kycCopy.startCta}
            </Button>
          )}

          {!isKycTerminal(current) &&
            current !== "not_started" &&
            current !== "incomplete" && (
              <p
                className="text-xs text-charcoal-500"
                aria-live="polite"
                aria-atomic="true"
              >
                {kycCopy.pollingNote}
              </p>
            )}

          {current === "denied" && (
            <a
              href="/us/app/support"
              className="text-xs text-mint-400 hover:underline"
            >
              {kycCopy.supportLink}
            </a>
          )}
        </CardContent>
      </Card>

      {isDev && (
        <div className="rounded-lg border border-charcoal-700 bg-charcoal-900 p-3 flex flex-wrap gap-2">
          <p className="w-full text-xs text-charcoal-500 mb-1">
            Dev only — simulate provider webhook
          </p>
          {(
            [
              "pending",
              "under_review",
              "approved",
              "denied",
              "incomplete",
            ] as const
          ).map((s) => (
            <Button
              key={s}
              size="sm"
              variant="secondary"
              onClick={() => {
                simulate.mutate({ status: s });
              }}
              disabled={simulate.isPending}
            >
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
