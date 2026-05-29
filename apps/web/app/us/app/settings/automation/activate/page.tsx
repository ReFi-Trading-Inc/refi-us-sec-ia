"use client";

/**
 * Automation Activation (Phase 2 Surface 3).
 *
 * Single user action: turn the saved Execution Policy Draft into a signed,
 * immutable ExecutionPolicy version and flip ManagedExecutionState to active.
 *
 * Boundary preserved:
 *   - This route never submits a broker order.
 *   - This route never creates a per-trade Accept.
 *   - The Activate button is the only state-changing control; there is no
 *     "approve a trade" or "execute now" affordance.
 *   - All prerequisites must be green client-side AND the BFF re-validates
 *     them server-side; the UI cannot bypass a missing prerequisite.
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  useActivateExecutionPolicy,
  useDisclosureRegistry,
  useExecutionPolicyDraft,
  useInvestorStatus,
  useSubscriptionMode,
  type ActivateExecutionPolicyInput,
} from "@refi/api-clients";

const ADVISORY_AGREEMENT_VERSION = "advisory-agreement-v2026-01";

function checklistRow(
  testId: string,
  label: string,
  status: "ok" | "blocked" | "pending",
  detail?: string,
) {
  const variant =
    status === "ok" ? "active" : status === "blocked" ? "rejected" : "warning";
  return (
    <li
      className="flex items-center justify-between gap-3 py-2 border-b border-charcoal-800 last:border-b-0"
      data-testid={testId}
      data-status={status}
    >
      <div>
        <p className="text-sm text-charcoal-100">{label}</p>
        {detail && <p className="text-xs text-charcoal-400">{detail}</p>}
      </div>
      <Badge variant={variant}>
        {status === "ok"
          ? "Ready"
          : status === "blocked"
            ? "Blocked"
            : "Pending"}
      </Badge>
    </li>
  );
}

export default function ActivatePage() {
  const router = useRouter();
  const draftQ = useExecutionPolicyDraft();
  const statusQ = useInvestorStatus();
  const modeQ = useSubscriptionMode();
  const disclosuresQ = useDisclosureRegistry();
  const activateMut = useActivateExecutionPolicy();

  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [confirmActivation, setConfirmActivation] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const draft = draftQ.data ?? null;
  const status = statusQ.data ?? null;
  const mode = modeQ.data?.mode ?? "unset";

  // Available, non-superseded disclosure documents the user must ack.
  const availableDisclosures = useMemo(
    () =>
      disclosuresQ.data?.documents.filter(
        (d) => d.displayStatus === "available",
      ) ?? [],
    [disclosuresQ.data],
  );
  const userAcks = disclosuresQ.data?.userAcks ?? [];
  const allDisclosuresAcked =
    availableDisclosures.length > 0 &&
    availableDisclosures.every((d) =>
      userAcks.some((a) => a.docId === d.docId && a.version === d.version),
    );

  const draftReady = draft !== null;
  const profileReady = (status?.latestProfileVersion ?? null) !== null;
  const brokerReady = status?.brokerageStatus === "active";

  const allPrereqsReady =
    draftReady && profileReady && brokerReady && allDisclosuresAcked;
  const canActivate = allPrereqsReady && agreementAccepted && confirmActivation;

  const onActivate = useCallback(async () => {
    if (!canActivate || availableDisclosures.length === 0) return;
    setServerError(null);
    const input: ActivateExecutionPolicyInput = {
      acknowledgedDisclosures: availableDisclosures.map((d) => ({
        docId: d.docId,
        version: d.version,
      })),
      advisoryAgreementVersion: ADVISORY_AGREEMENT_VERSION,
      clientAttestation: true,
      deviceFingerprint:
        typeof navigator !== "undefined"
          ? `${navigator.userAgent}|${navigator.language}|${String(screen.width)}x${String(screen.height)}`
          : "unknown-device",
    };
    try {
      await activateMut.mutateAsync(input);
      router.push("/us/app/settings/automation");
    } catch (e) {
      setServerError(
        e instanceof Error ? e.message : "Activation failed. Please retry.",
      );
    }
  }, [activateMut, availableDisclosures, canActivate, router]);

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="activate-page"
      data-mode={mode}
    >
      <header>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          Activate ReFi Managed
        </h1>
        <p className="text-sm text-charcoal-400">
          Sign your Execution Policy and turn on automated execution. This is
          the only action that turns a draft into an active policy version.
        </p>
      </header>

      <StatusBanner variant="info" data-testid="activate-boundary-banner">
        ReFi Managed runs from your signed Execution Policy. We never ask you to
        approve individual trades and we never execute outside the active policy
        version.
      </StatusBanner>

      {/* Prerequisites checklist */}
      <Card data-testid="activate-checklist">
        <CardHeader>
          <CardTitle>Activation checklist</CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          <ul>
            {checklistRow(
              "checklist-draft",
              "Saved Execution Policy draft",
              draftReady ? "ok" : "blocked",
              draftReady
                ? `Last saved ${new Date(draft.updatedAt).toLocaleString()}`
                : "Save a draft in the Automation Center first.",
            )}
            {checklistRow(
              "checklist-profile",
              "Advisory profile on file",
              profileReady ? "ok" : "blocked",
              profileReady
                ? `Profile version ${String(status?.latestProfileVersion ?? "")}`
                : "Complete your investor profile before activating.",
            )}
            {checklistRow(
              "checklist-broker",
              "Brokerage connection active",
              brokerReady ? "ok" : "blocked",
              brokerReady
                ? `Broker connection status: ${status.brokerageStatus ?? "unknown"}`
                : `Broker status: ${status?.brokerageStatus ?? "not connected"}.`,
            )}
            {checklistRow(
              "checklist-disclosures",
              "Required disclosures acknowledged",
              disclosuresQ.isLoading
                ? "pending"
                : allDisclosuresAcked
                  ? "ok"
                  : "blocked",
              allDisclosuresAcked
                ? `${String(availableDisclosures.length)} disclosure(s) acknowledged`
                : `${String(availableDisclosures.length - userAcks.length)} disclosure(s) pending acknowledgement`,
            )}
          </ul>
        </CardContent>
      </Card>

      {/* Policy summary from draft */}
      <Card data-testid="activate-policy-summary">
        <CardHeader>
          <CardTitle>Policy you&apos;re about to sign</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          {draft ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-charcoal-500">Strategy</dt>
                <dd className="text-charcoal-100">{draft.strategyId}</dd>
              </div>
              <div>
                <dt className="text-xs text-charcoal-500">Account scope</dt>
                <dd className="text-charcoal-100">{draft.accountScope}</dd>
              </div>
              <div>
                <dt className="text-xs text-charcoal-500">Max single order</dt>
                <dd className="text-charcoal-100">
                  ${draft.maxSingleOrderUsd}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-charcoal-500">Daily order limit</dt>
                <dd className="text-charcoal-100">{draft.dailyOrderLimit}</dd>
              </div>
              <div>
                <dt className="text-xs text-charcoal-500">Max position size</dt>
                <dd className="text-charcoal-100">
                  {(draft.maxPositionSizeBps / 100).toFixed(2)}%
                </dd>
              </div>
              <div>
                <dt className="text-xs text-charcoal-500">Drawdown pause</dt>
                <dd className="text-charcoal-100">
                  {(draft.drawdownPauseBps / 100).toFixed(2)}%
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-charcoal-500">Asset universe</dt>
                <dd className="text-charcoal-100">
                  {draft.assetUniverse.join(", ") || "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-charcoal-400">
              No draft saved yet. Save your policy draft in the Automation
              Center before activating.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Required acknowledgements */}
      <Card data-testid="activate-acknowledgments">
        <CardHeader>
          <CardTitle>Acknowledgements</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-5">
          <Checkbox
            label={`I have read and accept the advisory agreement (${ADVISORY_AGREEMENT_VERSION}).`}
            data-testid="ack-advisory-agreement"
            checked={agreementAccepted}
            onChange={(e) => {
              setAgreementAccepted(e.target.checked);
            }}
          />
          <Checkbox
            label="I understand that activation signs this exact policy version and that ReFi will execute trades automatically under it until I pause or supersede it."
            data-testid="ack-confirm-activation"
            checked={confirmActivation}
            onChange={(e) => {
              setConfirmActivation(e.target.checked);
            }}
          />
        </CardContent>
      </Card>

      {/* Activate */}
      <Card data-testid="activate-controls">
        <CardContent className="flex flex-col gap-3 pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-testid="activate-managed-button"
              onClick={() => {
                void onActivate();
              }}
              loading={activateMut.isPending}
              disabled={!canActivate}
            >
              Activate ReFi Managed
            </Button>
            <Button
              data-testid="activate-cancel"
              variant="secondary"
              onClick={() => {
                router.push("/us/app/settings/automation");
              }}
            >
              Back to Automation Center
            </Button>
          </div>
          {!allPrereqsReady && (
            <p
              className="text-xs text-status-warning"
              data-testid="activate-prereq-warning"
            >
              Resolve every checklist item before activating.
            </p>
          )}
          {serverError && (
            <p
              className="text-xs text-status-rejected"
              data-testid="activate-server-error"
            >
              {serverError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
