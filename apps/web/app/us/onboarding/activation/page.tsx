"use client";

/**
 * /us/onboarding/activation — the setup checklist.
 *
 * Reads `/api/v1/investor/onboarding` and shows where setup stands. Three
 * distinct things are shown and never conflated:
 *   - the investor-owned steps (identity, profile, broker) from the record;
 *   - `OnboardingStatus.state`      — application / Alpha onboarding;
 *   - `AccountAuthorization.status` — account authorization.
 * Neither backend word is presented as human Alpha admission (the operator
 * write that records admission is outside the public Investor API). There is
 * no activate verb: the contract has none (C1b-2 row 26 → C).
 *
 * The gate now expresses two separate decisions, matching the lifecycle:
 * general account access does NOT require a brokerage connection or
 * `AUTHORIZED` — an investor may legitimately defer brokerage — while
 * economic actions (strategy subscription, allocation) do.
 */
import Link from "next/link";
import { Badge, Card, CardContent, StatusBanner } from "@ui/components";
import { onboardingCopy } from "../../_content/onboarding";
import { useOnboardingSummary } from "../../../_hooks/useOnboardingSummary";
import { setupGate } from "../_lib/setup-gate";

const { setup } = onboardingCopy;

export default function OnboardingSetupPage() {
  const summary = useOnboardingSummary();
  const s = summary.data ?? null;

  const steps = {
    identity: s?.identity.state === "passed",
    profile: !!s?.profile?.assessment,
    broker:
      s?.connection?.connectionStatus === "CONNECTED" &&
      !!s.connection.lastSyncedAt,
  };
  const onboardingState = s?.onboarding.state ?? null;
  const authorizationStatus = s?.authorization?.status ?? null;
  const gate = setupGate({ onboardingState, authorizationStatus, steps });
  const stepsDone = Object.values(steps).every(Boolean);

  return (
    <div className="flex flex-col gap-6" data-testid="setup-checklist">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {setup.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{setup.subheading}</p>
      </div>

      {summary.isError && (
        <StatusBanner variant="error">
          Could not load your setup summary. Please try again.
        </StatusBanner>
      )}

      <Card>
        <CardContent className="pt-5 flex flex-col gap-3">
          {setup.checklist.map((item) => {
            const checked = steps[item.key];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 py-1"
                data-testid={`setup-item-${item.key}`}
                data-done={checked ? "true" : "false"}
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
                {checked ? (
                  <Badge variant="active">{setup.statusDone}</Badge>
                ) : (
                  <Link
                    href={item.href}
                    className="text-xs text-mint-400 hover:underline"
                  >
                    {setup.statusPending} →
                  </Link>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card data-testid="setup-backend-state">
        <CardContent className="pt-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-charcoal-200">
                {setup.onboardingLabel}
              </p>
              <p className="text-xs text-charcoal-500">
                {setup.onboardingNote}
              </p>
            </div>
            <Badge
              variant={onboardingState === "READY" ? "active" : "neutral"}
              data-testid="setup-onboarding-state"
            >
              {onboardingState?.toLowerCase().replace(/_/g, " ") ?? "—"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-charcoal-200">
                {setup.authorizationLabel}
              </p>
              <p className="text-xs text-charcoal-500">
                {setup.authorizationNote}
              </p>
            </div>
            <Badge
              variant={
                authorizationStatus === "AUTHORIZED"
                  ? "active"
                  : authorizationStatus === "DENIED" ||
                      authorizationStatus === "SUSPENDED"
                    ? "rejected"
                    : "neutral"
              }
              data-testid="setup-authorization"
            >
              {authorizationStatus?.toLowerCase() ?? "—"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-charcoal-200">
                {setup.managementLabel}
              </p>
              <p className="text-xs text-charcoal-500">
                {setup.managementNote}
              </p>
            </div>
          </div>
          <p className="text-xs text-charcoal-500">{setup.disclosuresNote}</p>
        </CardContent>
      </Card>

      {gate.accountAccess ? (
        <div
          className="flex flex-col gap-2"
          data-testid="setup-gate"
          data-account-access="true"
          data-economic-reason={gate.economicActionsReason}
        >
          <Link
            href="/us/app/home"
            className="inline-flex items-center justify-center rounded-md bg-mint-400 px-4 py-2 text-sm font-medium text-charcoal-950 hover:bg-mint-300 transition-colors"
            data-testid="setup-dashboard"
          >
            {setup.dashboardCta}
          </Link>
          <p className="text-xs text-charcoal-500">{setup.dashboardNote}</p>

          {/* The account is open; strategy actions are separately gated. The
              commonest reason is simply that brokerage was deferred, which is
              a permitted place to pause — so this is a next step, not a
              refusal. */}
          {!gate.economicActions && s && (
            <StatusBanner
              variant={
                gate.economicActionsReason === "authorization_denied" ||
                gate.economicActionsReason === "authorization_suspended"
                  ? "warning"
                  : "info"
              }
              data-testid="setup-economic-gate"
            >
              {steps.broker
                ? setup.gate[
                    gate.economicActionsReason as keyof typeof setup.gate
                  ]
                : setup.economicPendingNote}
            </StatusBanner>
          )}
        </div>
      ) : (
        <div
          className="flex flex-col gap-2"
          data-testid="setup-gate"
          data-account-access="false"
          data-reason={gate.accountAccessReason}
        >
          {!stepsDone && (
            <p
              className="text-sm text-charcoal-500"
              data-testid="setup-finish-first"
            >
              {setup.finishFirst}
            </p>
          )}
          {s && (
            <StatusBanner variant="info" data-testid="setup-gate-copy">
              {setup.gate[gate.accountAccessReason as keyof typeof setup.gate]}
            </StatusBanner>
          )}
        </div>
      )}
    </div>
  );
}
