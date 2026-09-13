"use client";

/**
 * P1C — strategy subscription: allocation, disclosure, consent, confirm.
 *
 * The chain Account → Strategy → Allocation → Consent → Confirm is the visible
 * structure of the screen, in that order, so the investor can see what is
 * being connected to what before they commit. Related facts sit together
 * rather than each occupying its own full-screen wizard step.
 *
 * Consent is version + hash bound: the exact disclosure shown is the exact
 * tuple recorded, and `confirmSubscription` is unreachable without the receipt
 * that tuple produced.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  AllocationBounds,
  BrokerageConnection,
  ConsentReceipt,
  ConsentRequirement,
  ProductFailure,
  StrategySubscription,
} from "@lib/investor-product/domain";
import {
  backendUnavailable,
  validateAllocation,
} from "@lib/investor-product/domain";
import { useInvestorProduct } from "./adapter-context";
import {
  AppButton,
  AppInput,
  DefinitionList,
  DefinitionRow,
  EnvironmentBadge,
  Num,
  Panel,
  PanelHeading,
  PanelTitle,
  SectionHeading,
  StateBadge,
  StatusPanel,
} from "./primitives";

const ALLOCATION_ERROR: Record<string, string> = {
  required: "Enter an allocation percentage.",
  not_a_number: "Enter a number.",
  out_of_range: "Outside the permitted range.",
  not_on_step: "Use the permitted increment.",
  bounds_unknown:
    "Allocation limits are unavailable right now, so this cannot be set.",
};

type Phase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "submitting" }
  | { kind: "unavailable"; failure: ProductFailure }
  | { kind: "error"; failure: ProductFailure };

export function SubscriptionPanel() {
  const { adapter } = useInvestorProduct();

  // Derived rather than set from an effect — see BrokerageConnectionPanel.
  const [phase, setPhase] = useState<Phase>(() =>
    adapter === null
      ? { kind: "unavailable", failure: backendUnavailable() }
      : { kind: "loading" },
  );
  const [connection, setConnection] = useState<BrokerageConnection | null>(
    null,
  );
  const [bounds, setBounds] = useState<AllocationBounds | null>(null);
  const [requirement, setRequirement] = useState<ConsentRequirement | null>(
    null,
  );
  const [receipt, setReceipt] = useState<ConsentReceipt | null>(null);
  const [subscription, setSubscription] = useState<StrategySubscription | null>(
    null,
  );

  const [allocationRaw, setAllocationRaw] = useState("");
  const [allocationTouched, setAllocationTouched] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  /** Authoritative only; null when not established. See BrokerageConnectionPanel. */
  const [kycVerified, setKycVerified] = useState<boolean | null>(null);

  const retry = useCallback(() => {
    setPhase({ kind: "loading" });
    setReloadToken((t) => t + 1);
  }, []);

  const STRATEGY_ID = "fixture-strategy-core";

  /** See BrokerageConnectionPanel: effect-local fetch, cancellation on unmount. */
  useEffect(() => {
    if (adapter === null) return;
    // Read through a predicate call, not a bare boolean: TypeScript narrows a
    // local flag to `false` because it cannot see the cleanup closure assign
    // it, which makes every guard below look statically dead. A call defeats
    // that narrowing, so the guards stay meaningful to the compiler and the
    // linter as well as at runtime.
    const run = { cancelled: false };
    const live = () => !run.cancelled;

    void (async () => {
      const handoff = await adapter.getHandoff();
      if (!live()) return;
      setKycVerified(handoff.ok ? handoff.value.kycVerified : null);

      const [conn, bnds, req, sub] = await Promise.all([
        adapter.getBrokerageConnection(),
        adapter.getAllocationBounds(),
        adapter.getRequiredConsent({ strategyId: STRATEGY_ID }),
        adapter.getSubscription(),
      ]);
      if (!live()) return;

      for (const r of [conn, bnds, req, sub]) {
        if (!r.ok) {
          setPhase({ kind: "unavailable", failure: r.failure });
          return;
        }
      }
      if (conn.ok) setConnection(conn.value);
      if (bnds.ok) setBounds(bnds.value);
      if (req.ok) setRequirement(req.value);
      if (sub.ok) setSubscription(sub.value);
      setPhase({ kind: "ready" });
    })();

    return () => {
      run.cancelled = true;
    };
  }, [adapter, reloadToken]);

  const validation = validateAllocation(
    allocationRaw === "" ? null : allocationRaw,
    bounds,
  );
  // Only surface a validation error once the field has been interacted with,
  // so an untouched form is not pre-reddened.
  const allocationError =
    allocationTouched && !validation.ok
      ? ALLOCATION_ERROR[validation.reason]
      : undefined;

  const isSubmitting = phase.kind === "submitting";
  const canConfirm =
    validation.ok &&
    consentChecked &&
    requirement !== null &&
    connection?.status === "connected" &&
    phase.kind === "ready";

  async function onConfirm() {
    if (adapter === null || requirement === null || !validation.ok) return;
    if (connection === null) return;

    setPhase({ kind: "submitting" });

    // Consent is recorded for the exact tuple rendered above, immediately
    // before confirmation, so the receipt cannot belong to older text.
    const consent = await adapter.submitConsent({
      disclosureKey: requirement.disclosureKey,
      version: requirement.version,
      contentHash: requirement.contentHash,
    });
    if (!consent.ok) {
      setPhase(
        consent.failure.kind === "backend_connection_unavailable"
          ? { kind: "unavailable", failure: consent.failure }
          : { kind: "error", failure: consent.failure },
      );
      return;
    }
    setReceipt(consent.value);

    const res = await adapter.confirmSubscription({
      strategyId: STRATEGY_ID,
      connectionId: connection.connectionId,
      environment: "paper",
      allocationPercent: validation.percent,
      consentReceiptId: consent.value.consentReceiptId,
      stateVersion: connection.stateVersion,
    });
    if (!res.ok) {
      setPhase(
        res.failure.kind === "backend_connection_unavailable"
          ? { kind: "unavailable", failure: res.failure }
          : { kind: "error", failure: res.failure },
      );
      return;
    }
    setSubscription(res.value);
    setPhase({ kind: "ready" });
  }

  if (phase.kind === "loading") {
    return (
      <Panel aria-busy="true" data-testid="loading">
        <span className="sr-only">Loading subscription</span>
        <div className="h-3 w-40 animate-pulse rounded-app-input bg-charcoal-400 motion-reduce:animate-none" />
      </Panel>
    );
  }

  if (phase.kind === "unavailable") {
    return (
      <StatusPanel
        tone="warning"
        title="Account setup is temporarily unavailable"
        data-testid="backend-unavailable"
        actions={
          <AppButton size="sm" onClick={retry} data-testid="retry">
            Retry
          </AppButton>
        }
      >
        {kycVerified === true ? (
          <p data-testid="unavailable-kyc-verified">
            Your identity verification is complete. Account setup is temporarily
            unavailable. Retry now or come back later.
          </p>
        ) : (
          <p data-testid="unavailable-kyc-unknown">
            Account setup is temporarily unavailable. Your completed onboarding
            steps have not been changed. Retry now or come back later.
          </p>
        )}
      </StatusPanel>
    );
  }

  // Confirmed state.
  if (subscription !== null && subscription.status === "active") {
    return (
      <div className="flex flex-col gap-4" data-testid="subscription-confirmed">
        <SectionHeading>Subscription Confirmed</SectionHeading>
        <StatusPanel
          tone="success"
          title="Your strategy subscription is active"
        >
          <p>
            ReFi will generate automated investment decisions for this account
            in the PAPER environment. No live capital is executed.
          </p>
        </StatusPanel>
        <Panel>
          <DefinitionList>
            <DefinitionRow label="Strategy">
              {subscription.strategy.name}
            </DefinitionRow>
            <DefinitionRow label="Environment">
              <EnvironmentBadge environment={subscription.environment} />
            </DefinitionRow>
            <DefinitionRow label="Account">
              <span className="font-mono">
                {subscription.brokerAccountId ?? "—"}
              </span>
            </DefinitionRow>
            <DefinitionRow label="Allocation">
              <Num
                value={subscription.allocation.percent ?? 0}
                unit="%"
                className="text-app-h2 font-semibold text-charcoal-50"
                data-testid="confirmed-allocation"
              />
            </DefinitionRow>
          </DefinitionList>
        </Panel>
        {receipt && <ConsentReceiptPanel receipt={receipt} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="subscription-surface">
      <div className="flex flex-col gap-1">
        <SectionHeading>Subscribe to a Strategy</SectionHeading>
        <p className="text-app-body text-charcoal-200">
          Review the account, allocation and disclosure below, then confirm.
        </p>
      </div>

      {connection?.status !== "connected" && (
        <StatusPanel tone="warning" title="Brokerage account required">
          <p>Connect a PAPER brokerage account before subscribing.</p>
        </StatusPanel>
      )}

      {/* Account → Strategy */}
      <Panel data-testid="account-strategy-panel">
        <PanelTitle>Account</PanelTitle>
        <div className="mt-3">
          <DefinitionList>
            <DefinitionRow label="Brokerage">
              <span className="font-mono">ALPACA</span>
            </DefinitionRow>
            <DefinitionRow label="Environment">
              <EnvironmentBadge
                environment={connection?.environment ?? "paper"}
              />
            </DefinitionRow>
            <DefinitionRow label="Account">
              <span className="font-mono">
                {connection?.brokerAccountId ?? "—"}
              </span>
            </DefinitionRow>
          </DefinitionList>
        </div>
        <div className="mt-4 border-t border-charcoal-400 pt-4">
          <PanelTitle>Strategy</PanelTitle>
          <PanelHeading level={3} className="mt-2">
            ReFi Core Alpha
          </PanelHeading>
          <p className="mt-1 text-app-body-sm text-charcoal-200">
            Automated allocation across a diversified equity sleeve. Risk
            controls are applied by ReFi before any instruction is issued.
          </p>
        </div>
      </Panel>

      {/* Allocation */}
      <Panel data-testid="allocation-panel">
        <PanelTitle>Allocation</PanelTitle>
        <div className="mt-3 flex flex-col gap-3">
          <div className="max-w-[200px]">
            <AppInput
              label="Portfolio allocation"
              mono
              suffix="%"
              inputMode="decimal"
              value={allocationRaw}
              error={allocationError}
              hint={
                bounds
                  ? `Permitted ${String(bounds.minPercent)}–${String(bounds.maxPercent)}% in ${String(bounds.stepPercent)}% steps`
                  : undefined
              }
              onChange={(e) => {
                setAllocationRaw(e.target.value);
              }}
              onBlur={() => {
                setAllocationTouched(true);
              }}
              data-testid="allocation-input"
            />
          </div>
          {bounds === null && (
            <StatusPanel tone="warning" title="Allocation limits unavailable">
              <p>
                The permitted range has not been published, so an allocation
                cannot be set right now.
              </p>
            </StatusPanel>
          )}
        </div>
      </Panel>

      {/* Consent */}
      {requirement && (
        <Panel data-testid="consent-panel">
          <PanelTitle>Disclosure &amp; Consent</PanelTitle>
          <p
            className="mt-3 text-app-body-sm text-charcoal-100"
            data-testid="disclosure-body"
          >
            {requirement.body}
          </p>

          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => {
                setConsentChecked(e.target.checked);
              }}
              className="mt-0.5 h-4 w-4 accent-mint-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-400"
              data-testid="consent-checkbox"
            />
            <span className="text-app-body-sm text-charcoal-50">
              I have read and accept this disclosure.
            </span>
          </label>

          <p className="mt-3 text-app-micro text-charcoal-200">
            <span className="font-mono">{requirement.disclosureKey}</span> · v
            <span className="font-mono">{requirement.version}</span> ·{" "}
            <span className="font-mono">
              {requirement.contentHash.slice(0, 12)}
            </span>
          </p>
        </Panel>
      )}

      {phase.kind === "error" && (
        <StatusPanel tone="error" title="Could not confirm subscription">
          <p className="font-mono text-app-caption">{phase.failure.code}</p>
        </StatusPanel>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <AppButton
          onClick={() => void onConfirm()}
          disabled={!canConfirm || isSubmitting}
          data-testid="confirm-subscription"
        >
          {isSubmitting ? "Confirming…" : "Confirm Subscription"}
        </AppButton>
        {!consentChecked && (
          <StateBadge tone="warning" dot data-testid="consent-required">
            Consent required
          </StateBadge>
        )}
      </div>
    </div>
  );
}

/** The receipt tuple, recorded for exactly the disclosure that was shown. */
function ConsentReceiptPanel({ receipt }: { receipt: ConsentReceipt }) {
  return (
    <Panel data-testid="consent-receipt">
      <PanelTitle>Consent Receipt</PanelTitle>
      <div className="mt-3">
        <DefinitionList>
          <DefinitionRow label="Disclosure">
            <span className="font-mono">{receipt.disclosureKey}</span>
          </DefinitionRow>
          <DefinitionRow label="Version">
            <Num value={receipt.version} />
          </DefinitionRow>
          <DefinitionRow label="Content hash">
            <span className="font-mono text-app-micro">
              {receipt.contentHash.slice(0, 24)}…
            </span>
          </DefinitionRow>
          <DefinitionRow label="Accepted">
            <span className="font-mono text-app-caption">
              {receipt.acceptedAt}
            </span>
          </DefinitionRow>
        </DefinitionList>
      </div>
    </Panel>
  );
}
