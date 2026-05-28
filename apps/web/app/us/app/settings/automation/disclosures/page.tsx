"use client";

/**
 * Disclosure re-acknowledgement (Phase 2 Surface 5).
 *
 * Shown when one or more disclosures pinned in the investor's active
 * ExecutionPolicy have been superseded since activation. The flow lets the
 * investor re-read and acknowledge the new versions without re-signing the
 * policy itself — the policy version stays as it was, only the disclosure
 * acknowledgement set is brought current.
 *
 * Boundary preserved:
 *   - No per-trade Accept is involved.
 *   - No broker order is submitted.
 *   - No staff-side review or operator-side review is involved.
 *   - The active ExecutionPolicy version is never mutated from here.
 *   - If ManagedExecutionState is `paused_by_system` because of stale
 *     disclosures, the BFF restores `active` only after every stale entry
 *     is acknowledged. The UI never touches state directly.
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
  useDisclosureReacknowledgement,
  useReacknowledgeDisclosure,
  useSubscriptionMode,
  type StaleDisclosureDto,
} from "@refi/api-clients";

function DisclosureRow(props: {
  doc: StaleDisclosureDto;
  onAcknowledge: (doc: StaleDisclosureDto) => Promise<void>;
  pending: boolean;
}) {
  const { doc, pending } = props;
  const [accepted, setAccepted] = useState(false);
  const acknowledged = doc.alreadyAcknowledged;

  return (
    <Card
      data-testid={`reack-row-${doc.docId}`}
      data-doc-id={doc.docId}
      data-already-acknowledged={acknowledged}
    >
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>{doc.docId}</span>
          <Badge variant={acknowledged ? "active" : "warning"}>
            {acknowledged ? "Acknowledged" : "Action required"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-charcoal-500">Document type</dt>
            <dd className="text-charcoal-100">{doc.kind}</dd>
          </div>
          <div>
            <dt className="text-xs text-charcoal-500">Effective date</dt>
            <dd className="text-charcoal-100">
              {doc.effectiveAt
                ? new Date(doc.effectiveAt).toLocaleDateString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-charcoal-500">Previously accepted</dt>
            <dd
              className="text-charcoal-100"
              data-testid={`reack-row-${doc.docId}-previous`}
            >
              {doc.previousVersion}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-charcoal-500">Current version</dt>
            <dd
              className="text-charcoal-100"
              data-testid={`reack-row-${doc.docId}-current`}
            >
              {doc.currentVersion}
            </dd>
          </div>
        </dl>
        {!acknowledged && (
          <>
            <Checkbox
              label={`I have reviewed ${doc.docId} ${doc.currentVersion} and acknowledge it.`}
              data-testid={`reack-row-${doc.docId}-ack-checkbox`}
              checked={accepted}
              onChange={(e) => {
                setAccepted(e.target.checked);
              }}
            />
            <div>
              <Button
                data-testid={`reack-row-${doc.docId}-submit`}
                disabled={!accepted || pending}
                loading={pending}
                onClick={() => props.onAcknowledge(doc)}
              >
                Submit acknowledgement
              </Button>
            </div>
          </>
        )}
        {acknowledged && (
          <p
            className="text-xs text-status-active"
            data-testid={`reack-row-${doc.docId}-ack-confirmation`}
          >
            Your acknowledgement is on file. No further action is needed for
            this disclosure.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DisclosureReackPage() {
  const modeQ = useSubscriptionMode();
  const reackQ = useDisclosureReacknowledgement();
  const reackMut = useReacknowledgeDisclosure();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittingDocId, setSubmittingDocId] = useState<string | null>(null);

  const mode = modeQ.data?.mode ?? "unset";
  const view = reackQ.data ?? null;

  const onAcknowledge = useCallback(
    async (doc: StaleDisclosureDto) => {
      setServerError(null);
      setSubmittingDocId(doc.docId);
      try {
        await reackMut.mutateAsync({
          docId: doc.docId,
          version: doc.currentVersion,
        });
      } catch (e) {
        setServerError(
          e instanceof Error
            ? e.message
            : "We could not record that acknowledgement. Please retry.",
        );
      } finally {
        setSubmittingDocId(null);
      }
    },
    [reackMut],
  );

  // Signal users have no Managed disclosures to re-acknowledge from here.
  if (mode !== "managed") {
    return (
      <div
        className="flex flex-col gap-6 max-w-3xl"
        data-testid="reack-page"
        data-mode={mode}
      >
        <header>
          <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
            Updated disclosures
          </h1>
          <p className="text-sm text-charcoal-400">
            This page is for ReFi Managed users with an active Execution Policy.
          </p>
        </header>
        <Card data-testid="reack-not-applicable">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm text-charcoal-300">
              You are not currently on ReFi Managed. Return to the Automation
              Center for the controls available to you.
            </p>
            <Link
              href="/us/app/settings/automation"
              className="text-sm text-mint-300 underline underline-offset-2"
              data-testid="reack-back-to-automation"
            >
              Back to Automation Center
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allClear =
    view !== null &&
    view.activePolicyVersion !== null &&
    !view.requiresReacknowledgement;

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="reack-page"
      data-mode={mode}
      data-requires-reack={view?.requiresReacknowledgement ?? false}
    >
      <header>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          Updated disclosures
        </h1>
        <p className="text-sm text-charcoal-400">
          Review the disclosures that have changed since you activated your
          Execution Policy. Your active policy version is not changed by
          acknowledging these updates.
        </p>
      </header>

      <StatusBanner
        variant={allClear ? "success" : "info"}
        data-testid="reack-summary-banner"
      >
        {view === null
          ? "Loading the latest disclosure status…"
          : allClear
            ? "Your disclosure acknowledgements are current. No further action is needed."
            : `Your active Execution Policy version v${view.activePolicyVersion ?? "—"} stays signed. Acknowledging these updated disclosures does not create a new policy version.`}
      </StatusBanner>

      <section
        className="flex flex-col gap-4"
        data-testid="reack-disclosure-list"
      >
        {view?.staleDisclosures.map((doc) => (
          <DisclosureRow
            key={doc.docId}
            doc={doc}
            onAcknowledge={onAcknowledge}
            pending={submittingDocId === doc.docId}
          />
        ))}
        {view !== null && view.staleDisclosures.length === 0 && (
          <Card data-testid="reack-empty">
            <CardContent className="pt-5 pb-5">
              <p className="text-sm text-charcoal-300">
                No disclosure updates are pending acknowledgement.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {serverError && (
        <p
          className="text-xs text-status-rejected"
          data-testid="reack-server-error"
        >
          {serverError}
        </p>
      )}

      <Link
        href="/us/app/settings/automation"
        className="text-sm text-mint-300 underline underline-offset-2"
        data-testid="reack-back-to-automation"
      >
        Back to Automation Center
      </Link>
    </div>
  );
}
