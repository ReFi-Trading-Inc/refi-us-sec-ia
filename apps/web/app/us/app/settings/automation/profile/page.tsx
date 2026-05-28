"use client";

/**
 * Profile reactivation (Phase 2 Surface 6).
 *
 * Shown when the investor's advisory profile is flagged as stale relative to
 * the active ExecutionPolicy. Two distinct paths:
 *
 *   1. Aging-only — the latest profile snapshot still matches what was pinned
 *      at activation; no field has materially changed. The investor only
 *      needs to re-confirm their profile is still accurate.
 *
 *   2. Material change — a new profile snapshot has been recorded with
 *      different fields. The active policy was signed under the old fields;
 *      a new policy version is required. We do NOT clear the pause from this
 *      surface; we route the investor to the activation review flow.
 *
 * Boundary preserved:
 *   - Profile re-confirmation is an eligibility event, not a recommendation
 *     acceptance event.
 *   - No per-trade Accept, no broker order, no policy mutation, no operator-
 *     side or staff-side review affordance.
 *   - The Records Center surfaces the durable ProfileConfirmation row.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  StatusBanner,
} from "@ui/components";
import {
  useProfileReactivation,
  useReconfirmProfile,
  useSubscriptionMode,
} from "@refi/api-clients";

export default function ProfileReactivationPage() {
  const modeQ = useSubscriptionMode();
  const reactQ = useProfileReactivation();
  const reconfirmMut = useReconfirmProfile();
  const [accepted, setAccepted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const mode = modeQ.data?.mode ?? "unset";
  const view = reactQ.data ?? null;

  const onConfirm = useCallback(async () => {
    if (!view || view.latestProfileVersion === null) return;
    setServerError(null);
    try {
      await reconfirmMut.mutateAsync({
        profileVersion: view.latestProfileVersion,
        acknowledgeUnchanged: true,
      });
    } catch (e) {
      setServerError(
        e instanceof Error
          ? e.message
          : "We could not record that confirmation. Please retry.",
      );
    }
  }, [reconfirmMut, view]);

  // Signal users — no Managed profile reactivation surface.
  if (mode !== "managed") {
    return (
      <div
        className="flex flex-col gap-6 max-w-3xl"
        data-testid="profile-react-page"
        data-mode={mode}
      >
        <header>
          <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
            Profile review
          </h1>
          <p className="text-sm text-charcoal-400">
            This page is for ReFi Managed users with an active Execution Policy.
          </p>
        </header>
        <Card data-testid="profile-react-not-applicable">
          <CardContent className="pt-5 pb-5 flex flex-col gap-3">
            <p className="text-sm text-charcoal-300">
              You are not currently on ReFi Managed. Return to the Automation
              Center for the controls available to you.
            </p>
            <Link
              href="/us/app/settings/automation"
              className="text-sm text-mint-300 underline underline-offset-2"
              data-testid="profile-react-back-to-automation"
            >
              Back to Automation Center
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentSummary = (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <div>
        <dt className="text-xs text-charcoal-500">Current profile version</dt>
        <dd
          className="text-charcoal-100"
          data-testid="profile-react-latest-version"
        >
          {view?.latestProfileVersion ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-charcoal-500">
          Profile pinned in active policy
        </dt>
        <dd
          className="text-charcoal-100"
          data-testid="profile-react-pinned-version"
        >
          {view?.pinnedProfileVersion ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-charcoal-500">Last confirmed version</dt>
        <dd
          className="text-charcoal-100"
          data-testid="profile-react-last-confirmed-version"
        >
          {view?.lastConfirmedVersion ?? "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-charcoal-500">Last confirmed at</dt>
        <dd
          className="text-charcoal-100"
          data-testid="profile-react-last-confirmed-at"
        >
          {view?.lastConfirmedAt
            ? new Date(view.lastConfirmedAt).toLocaleString()
            : "—"}
        </dd>
      </div>
    </dl>
  );

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="profile-react-page"
      data-mode={mode}
      data-blocker={view?.blockerReason ?? ""}
      data-material-change={view?.materialChange ?? false}
    >
      <header>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          Profile review
        </h1>
        <p className="text-sm text-charcoal-400">
          Re-confirm your advisory profile so ReFi Managed can keep deciding
          what is eligible for automatic execution. Confirming an unchanged
          profile does not create a new Execution Policy version.
        </p>
      </header>

      {view === null && (
        <Card data-testid="profile-react-loading">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm text-charcoal-400">
              Loading your latest profile status…
            </p>
          </CardContent>
        </Card>
      )}

      {/* State 2: Managed profile current — no action required */}
      {view !== null && !view.staleProfile && (
        <Card data-testid="profile-react-current">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span>Profile status</span>
              <Badge variant="active">Up to date</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <p className="text-sm text-charcoal-300 mb-3">
              Your profile is current. No further action is needed.
            </p>
            {currentSummary}
          </CardContent>
        </Card>
      )}

      {/* State 4: Material change — route to activation review */}
      {view !== null && view.staleProfile && view.materialChange && (
        <Card data-testid="profile-react-material-change">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span>Profile has materially changed</span>
              <Badge variant="warning">Policy review required</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5 flex flex-col gap-3">
            <StatusBanner variant="warning">
              Your profile has changed since you signed your current Execution
              Policy. Because the change affects what is eligible for managed
              execution, your policy needs to be reviewed and re-activated
              before automated execution can resume.
            </StatusBanner>
            {currentSummary}
            {view.changedFields.length > 0 && (
              <div data-testid="profile-react-changed-fields">
                <p className="text-xs text-charcoal-500 mb-1">
                  Fields that changed
                </p>
                <ul className="list-disc pl-5 text-sm text-charcoal-200">
                  {view.changedFields.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <Link
                href="/us/app/settings/automation/activate"
                data-testid="profile-react-route-to-activation"
                className="inline-flex items-center text-sm font-medium underline underline-offset-2"
              >
                Review and activate updated policy
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* State 3: Aging-only — reconfirm and clear */}
      {view !== null &&
        view.staleProfile &&
        !view.materialChange &&
        view.latestProfileVersion !== null && (
          <Card data-testid="profile-react-aging">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>Re-confirm your profile</span>
                <Badge variant="warning">Action required</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pb-5">
              <p className="text-sm text-charcoal-300">
                Your profile has not changed since it was pinned to your active
                Execution Policy, but ReFi periodically asks you to re-confirm
                that it is still accurate.
              </p>
              {currentSummary}
              <Checkbox
                label="I have reviewed my profile and confirm it is still accurate."
                data-testid="profile-react-ack-checkbox"
                checked={accepted}
                onChange={(e) => {
                  setAccepted(e.target.checked);
                }}
              />
              <div>
                <Button
                  data-testid="profile-react-submit"
                  disabled={!accepted || reconfirmMut.isPending}
                  loading={reconfirmMut.isPending}
                  onClick={onConfirm}
                >
                  Confirm profile
                </Button>
              </div>
              {reconfirmMut.isSuccess && (
                <p
                  className="text-xs text-status-active"
                  data-testid="profile-react-confirmation"
                >
                  Your profile confirmation is on file.
                </p>
              )}
            </CardContent>
          </Card>
        )}

      {serverError && (
        <p
          className="text-xs text-status-rejected"
          data-testid="profile-react-server-error"
        >
          {serverError}
        </p>
      )}

      <Link
        href="/us/app/settings/automation"
        className="text-sm text-mint-300 underline underline-offset-2"
        data-testid="profile-react-back-to-automation"
      >
        Back to Automation Center
      </Link>
    </div>
  );
}
