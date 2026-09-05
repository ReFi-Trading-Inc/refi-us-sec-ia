"use client";

/**
 * /us/onboarding/activation — the setup checklist.
 *
 * Reads `/api/v1/investor/onboarding` and shows where setup stands. There is
 * no "activate" verb: the contract has none (C1b-2 row 26 → C), Alpha
 * admission is a human decision recorded in the backend, and portfolio
 * management is enabled by ReFi after setup review. The only action here is a
 * link to the dashboard once the investor's own steps are done.
 */
import Link from "next/link";
import { Badge, Card, CardContent, StatusBanner } from "@ui/components";
import { onboardingCopy } from "../../_content/onboarding";
import { useOnboardingSummary } from "../../../_hooks/useOnboardingSummary";

const { setup } = onboardingCopy;

export default function OnboardingSetupPage() {
  const summary = useOnboardingSummary();
  const s = summary.data ?? null;

  const done: Record<(typeof setup.checklist)[number]["key"], boolean> = {
    identity: s?.identity.state === "passed",
    profile: !!s?.profile?.assessment,
    broker:
      s?.connection?.connectionStatus === "CONNECTED" &&
      !!s.connection.lastSyncedAt,
  };
  const allDone = Object.values(done).every(Boolean);
  const admitted = s?.authorization?.status === "AUTHORIZED";

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
            const checked = done[item.key];
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
                {setup.admissionLabel}
              </p>
              <p className="text-xs text-charcoal-500">{setup.admissionNote}</p>
            </div>
            <Badge
              variant={admitted ? "active" : "neutral"}
              data-testid="setup-authorization"
            >
              {s?.authorization?.status.toLowerCase() ?? "—"}
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
            <Badge variant="neutral" data-testid="setup-onboarding-state">
              {s?.onboarding.state.toLowerCase().replace(/_/g, " ") ?? "—"}
            </Badge>
          </div>
          <p className="text-xs text-charcoal-500">{setup.disclosuresNote}</p>
        </CardContent>
      </Card>

      {allDone ? (
        <div className="flex flex-col gap-2">
          <Link
            href="/us/app/home"
            className="inline-flex items-center justify-center rounded-md bg-mint-400 px-4 py-2 text-sm font-medium text-charcoal-950 hover:bg-mint-300 transition-colors"
            data-testid="setup-dashboard"
          >
            {setup.dashboardCta}
          </Link>
          <p className="text-xs text-charcoal-500">{setup.dashboardNote}</p>
        </div>
      ) : (
        <p
          className="text-sm text-charcoal-500"
          data-testid="setup-finish-first"
        >
          {setup.finishFirst}
        </p>
      )}
    </div>
  );
}
