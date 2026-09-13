"use client";

/**
 * P1B — brokerage connection.
 *
 * An institutional account-connection panel, not a wallet modal: the
 * Brokerage / Environment / Connection / Account hierarchy is stated as a
 * definition list, the environment is an explicit control rather than an
 * inference, and the single primary action is the only mint element on the
 * screen.
 *
 * Boundary facts this surface is careful about:
 *   - ReFi does NOT create the brokerage account and does NOT take custody.
 *     The investor connects an account they already hold; assets stay there.
 *   - The environment is chosen explicitly. LIVE renders, and is refused by
 *     capability authority with a stated, programmatically-associated reason.
 *   - Credentials live in component state for exactly one submit and are
 *     cleared the moment the request settles. Nothing touches localStorage,
 *     sessionStorage, analytics or error telemetry.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  BrokerageConnection,
  BrokerEnvironment,
  ProductCapabilities,
  ProductFailure,
} from "@lib/investor-product/domain";
import {
  backendUnavailable,
  environmentSelectability,
} from "@lib/investor-product/domain";
import { useInvestorProduct } from "./adapter-context";
import {
  AppButton,
  AppInput,
  DefinitionList,
  DefinitionRow,
  EnvironmentBadge,
  Panel,
  PanelHeading,
  PanelTitle,
  SectionHeading,
  StateBadge,
  StatusPanel,
} from "./primitives";

type Phase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "submitting" }
  | { kind: "unavailable"; failure: ProductFailure }
  | { kind: "error"; failure: ProductFailure };

const CONNECTION_LABEL: Record<BrokerageConnection["status"], string> = {
  not_connected: "Not connected",
  pending_validation: "Validating",
  connected: "Connected",
  degraded: "Needs attention",
  disconnected: "Disconnected",
};

const CONNECTION_TONE = {
  not_connected: "neutral",
  pending_validation: "warning",
  connected: "success",
  degraded: "warning",
  disconnected: "neutral",
} as const;

export function BrokerageConnectionPanel({
  onContinue,
  onSkip,
}: {
  /**
   * Advance to the next step. Wired to an EXPLICIT "Continue" action, never
   * fired automatically on a successful connect: the investor should see the
   * account that was connected, and be able to disconnect it, before the
   * journey moves on. Auto-advancing also hides the one state where a
   * mistaken account is cheap to correct.
   */
  onContinue?: () => void;
  onSkip?: () => void;
}) {
  const { adapter, mode, fixtureDataVisible } = useInvestorProduct();

  // Derived, not set in an effect: with no adapter there is nothing to await,
  // so the unavailable state is the component's FIRST render rather than a
  // second one triggered from an effect. That keeps the effect below free of
  // synchronous setState (react-hooks/set-state-in-effect) and removes a
  // render in which the surface would briefly claim to be loading something
  // that was never going to arrive.
  const [phase, setPhase] = useState<Phase>(() =>
    adapter === null
      ? { kind: "unavailable", failure: backendUnavailable() }
      : { kind: "loading" },
  );
  const [capabilities, setCapabilities] = useState<ProductCapabilities | null>(
    null,
  );
  const [connection, setConnection] = useState<BrokerageConnection | null>(
    null,
  );
  const [environment, setEnvironment] = useState<BrokerEnvironment>("paper");
  const [formOpen, setFormOpen] = useState(false);
  const [apiKeyId, setApiKeyId] = useState("");
  const [apiSecretKey, setApiSecretKey] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  /**
   * Authoritative identity-verification state, or null when it has not been
   * established. NEVER inferred from reaching this route, from being signed
   * in, or from the backend being down — only the product handoff says this.
   */
  const [kycVerified, setKycVerified] = useState<boolean | null>(null);

  /** Re-enter the loading state and re-read. An event handler, not an effect. */
  const retry = useCallback(() => {
    setPhase({ kind: "loading" });
    setReloadToken((t) => t + 1);
  }, []);

  /** Wipe key material from component state. Called on every settle path. */
  const clearCredentials = useCallback(() => {
    setApiKeyId("");
    setApiSecretKey("");
  }, []);

  /**
   * Read the current state. Bumping `reloadToken` re-runs it; that is what
   * Retry does.
   *
   * The fetch lives inside the effect as an async IIFE rather than in a
   * `useCallback` the effect calls, so every `setState` happens in an async
   * continuation instead of synchronously in the effect body. The `cancelled`
   * flag then discards a late response after unmount or a re-run — without it,
   * navigating away mid-request sets state on a dead component, and two
   * overlapping retries could land out of order with the stale one winning.
   */
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
      const caps = await adapter.capabilities();
      if (!live()) return;
      setCapabilities(caps);

      // Read the handoff BEFORE the connection: if the backend is down we
      // still need to know whether we may truthfully say anything about
      // identity verification. `kycVerified` stays null unless the projection
      // asserts it.
      const handoff = await adapter.getHandoff();
      if (!live()) return;
      setKycVerified(handoff.ok ? handoff.value.kycVerified : null);

      const res = await adapter.getBrokerageConnection();
      if (!live()) return;
      if (!res.ok) {
        setPhase({ kind: "unavailable", failure: res.failure });
        return;
      }
      setConnection(res.value);
      setPhase({ kind: "ready" });
    })();

    return () => {
      run.cancelled = true;
    };
  }, [adapter, reloadToken]);

  // Belt-and-suspenders: never leave key material behind on unmount.
  useEffect(() => clearCredentials, [clearCredentials]);

  const liveState =
    capabilities === null
      ? null
      : environmentSelectability("live", capabilities);
  const liveBlocked = liveState !== null && !liveState.selectable;

  async function onSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adapter === null) return;

    if (apiKeyId.trim() === "" || apiSecretKey.trim() === "") {
      setFieldError("Enter both the API key ID and the secret key.");
      return;
    }
    setFieldError(null);
    setPhase({ kind: "submitting" });

    try {
      // The credential pair is passed exactly once and cleared below on every
      // path — success, failure, or throw.
      const res = await adapter.initiateBrokerageConnection({
        broker: "alpaca",
        environment: "paper",
        credentials: {
          apiKeyId: apiKeyId.trim(),
          apiSecretKey: apiSecretKey.trim(),
        },
      });
      if (!res.ok) {
        setPhase(
          res.failure.kind === "backend_connection_unavailable"
            ? { kind: "unavailable", failure: res.failure }
            : { kind: "error", failure: res.failure },
        );
        return;
      }
      setConnection(res.value);
      setFormOpen(false);
      setPhase({ kind: "ready" });
    } finally {
      clearCredentials();
    }
  }

  async function onDisconnect() {
    if (adapter === null || connection === null) return;
    setPhase({ kind: "submitting" });
    const res = await adapter.disconnectBrokerage({
      connectionId: connection.connectionId,
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
    setConnection(res.value);
    setPhase({ kind: "ready" });
  }

  const status = connection?.status ?? "not_connected";
  const isConnected = status === "connected";

  return (
    <div className="flex flex-col gap-4" data-testid="brokerage-surface">
      <div className="flex flex-col gap-1">
        <SectionHeading>Connect Your Brokerage</SectionHeading>
        <p className="text-app-body text-charcoal-200">
          ReFi connects to a brokerage account you already hold. Your assets
          remain at the brokerage — ReFi never takes custody of them.
        </p>
      </div>

      {mode === "fixture" && fixtureDataVisible && (
        <StateBadge tone="warning" className="self-start" dot>
          Simulated data
        </StateBadge>
      )}

      {phase.kind === "loading" && <LoadingPanel />}

      {phase.kind === "unavailable" && (
        <BackendUnavailablePanel
          failure={phase.failure}
          kycVerified={kycVerified}
          onRetry={retry}
          onResumeLater={onSkip}
        />
      )}

      {(phase.kind === "ready" ||
        phase.kind === "submitting" ||
        phase.kind === "error") && (
        <>
          <Panel data-testid="connection-panel">
            <DefinitionList>
              <DefinitionRow label="Brokerage">
                <span className="font-mono">ALPACA</span>
              </DefinitionRow>
              <DefinitionRow label="Environment">
                <EnvironmentBadge
                  environment={connection?.environment ?? "paper"}
                />
              </DefinitionRow>
              <DefinitionRow label="Connection">
                <StateBadge
                  tone={CONNECTION_TONE[status]}
                  dot
                  data-testid="connection-status"
                  data-status={status}
                >
                  {CONNECTION_LABEL[status]}
                </StateBadge>
              </DefinitionRow>
              {connection?.brokerAccountId && (
                <DefinitionRow label="Account">
                  <span className="font-mono" data-testid="broker-account-id">
                    {connection.brokerAccountId}
                  </span>
                </DefinitionRow>
              )}
            </DefinitionList>
          </Panel>

          {!isConnected && (
            <EnvironmentSelector
              value={environment}
              onChange={setEnvironment}
              liveBlocked={liveBlocked}
            />
          )}

          {phase.kind === "error" && (
            <StatusPanel tone="error" title="Connection failed">
              <p>
                {phase.failure.code === "CREDENTIALS_REQUIRED"
                  ? "Enter both the API key ID and the secret key."
                  : "The brokerage refused those credentials. Check the key pair in your Alpaca dashboard and try again."}
              </p>
            </StatusPanel>
          )}

          {isConnected ? (
            <ConnectedActions
              busy={phase.kind === "submitting"}
              onDisconnect={() => void onDisconnect()}
              onContinue={onContinue}
            />
          ) : formOpen ? (
            <CredentialForm
              apiKeyId={apiKeyId}
              apiSecretKey={apiSecretKey}
              onApiKeyId={setApiKeyId}
              onApiSecretKey={setApiSecretKey}
              fieldError={fieldError}
              busy={phase.kind === "submitting"}
              onSubmit={(e) => void onSubmit(e)}
              onCancel={() => {
                setFormOpen(false);
                setFieldError(null);
                clearCredentials();
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <AppButton
                onClick={() => {
                  setFormOpen(true);
                }}
                data-testid="connect-paper"
              >
                Connect PAPER Account
              </AppButton>
              {onSkip && (
                <AppButton
                  variant="tertiary"
                  onClick={onSkip}
                  data-testid="connect-later"
                >
                  Connect Later
                </AppButton>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Environment selector — the PAPER/LIVE gate ────────────────────────────

/**
 * Explicit environment control.
 *
 * LIVE is rendered, not hidden: an investor should be able to see that the
 * capability exists and read why it is closed. It is a genuinely disabled
 * radio whose explanation is associated via `aria-describedby`, so a screen
 * reader reaches the reason rather than an unexplained inert control — and
 * the reason is also stated in visible text, so the gate is never conveyed by
 * styling alone.
 *
 * `liveBlocked` comes from capability authority, never from local state.
 */
function EnvironmentSelector({
  value,
  onChange,
  liveBlocked,
}: {
  value: BrokerEnvironment;
  onChange: (v: BrokerEnvironment) => void;
  liveBlocked: boolean;
}) {
  const liveReasonId = "live-unavailable-reason";

  return (
    <Panel>
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-1 p-0">
          <PanelTitle>Account Environment</PanelTitle>
        </legend>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            name="broker-environment"
            value="paper"
            checked={value === "paper"}
            onChange={() => {
              onChange("paper");
            }}
            className="h-4 w-4 accent-mint-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-400"
            data-testid="environment-paper"
          />
          <span className="flex items-center gap-2">
            <EnvironmentBadge environment="paper" />
            <span className="text-app-body-sm text-charcoal-100">
              Simulated execution against your Alpaca paper account.
            </span>
          </span>
        </label>

        <label
          className={
            liveBlocked
              ? "flex items-center gap-3 opacity-60"
              : "flex cursor-pointer items-center gap-3"
          }
        >
          <input
            type="radio"
            name="broker-environment"
            value="live"
            checked={value === "live"}
            disabled={liveBlocked}
            aria-describedby={liveBlocked ? liveReasonId : undefined}
            onChange={() => {
              onChange("live");
            }}
            className="h-4 w-4 accent-mint-400 disabled:cursor-not-allowed"
            data-testid="environment-live"
          />
          <span className="flex flex-wrap items-center gap-2">
            <StateBadge tone="neutral" mono dot data-testid="live-badge">
              LIVE — NOT AVAILABLE IN ALPHA
            </StateBadge>
          </span>
        </label>

        {liveBlocked && (
          <p
            id={liveReasonId}
            className="text-app-caption text-charcoal-200"
            data-testid="live-unavailable-reason"
          >
            Live trading is closed for the Alpha. The Alpha runs in PAPER only,
            so no real capital is executed. Live access opens in a later
            release.
          </p>
        )}
      </fieldset>
    </Panel>
  );
}

// ─── Credential entry ──────────────────────────────────────────────────────

/**
 * One-shot credential entry.
 *
 * `autoComplete="off"` on both fields and the form, and the secret is a
 * password field: the browser is asked not to retain either, and nothing here
 * writes to storage. The parent clears both values on every settle path.
 */
function CredentialForm({
  apiKeyId,
  apiSecretKey,
  onApiKeyId,
  onApiSecretKey,
  fieldError,
  busy,
  onSubmit,
  onCancel,
}: {
  apiKeyId: string;
  apiSecretKey: string;
  onApiKeyId: (v: string) => void;
  onApiSecretKey: (v: string) => void;
  fieldError: string | null;
  busy: boolean;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <Panel>
      <form
        onSubmit={onSubmit}
        autoComplete="off"
        noValidate
        className="flex flex-col gap-4"
      >
        <PanelHeading level={2}>Alpaca API Keys</PanelHeading>
        <p className="text-app-body-sm text-charcoal-200">
          Generate a paper-trading key pair in your Alpaca dashboard. ReFi sends
          them once to establish the connection and never stores them in your
          browser.
        </p>

        <AppInput
          label="API Key ID"
          value={apiKeyId}
          onChange={(e) => {
            onApiKeyId(e.target.value);
          }}
          error={fieldError ?? undefined}
          autoComplete="off"
          spellCheck={false}
          data-testid="api-key-id"
        />

        <AppInput
          label="Secret Key"
          type="password"
          value={apiSecretKey}
          onChange={(e) => {
            onApiSecretKey(e.target.value);
          }}
          autoComplete="off"
          spellCheck={false}
          data-testid="api-secret-key"
        />

        <div className="flex flex-wrap gap-3">
          <AppButton
            type="submit"
            disabled={busy}
            data-testid="submit-connection"
          >
            {busy ? "Connecting…" : "Connect PAPER Account"}
          </AppButton>
          <AppButton
            type="button"
            variant="tertiary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </AppButton>
        </div>
      </form>
    </Panel>
  );
}

// ─── Remaining states ──────────────────────────────────────────────────────

function ConnectedActions({
  busy,
  onDisconnect,
  onContinue,
}: {
  busy: boolean;
  onDisconnect: () => void;
  onContinue?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {onContinue && (
        <AppButton onClick={onContinue} data-testid="continue-to-subscription">
          Continue
        </AppButton>
      )}
      <AppButton
        variant="danger"
        size="sm"
        onClick={onDisconnect}
        disabled={busy}
        data-testid="disconnect"
      >
        Disconnect Account
      </AppButton>
    </div>
  );
}

/**
 * Scenario A: identity verification succeeded, account setup is temporarily
 * unavailable.
 *
 * Warning tone, not error: this is retryable and transient. It never says
 * rejected, never implies the KYC pass was undone, and never fabricates
 * admission. Progress is preserved — retry re-reads rather than restarting.
 */
function BackendUnavailablePanel({
  failure,
  kycVerified,
  onRetry,
  onResumeLater,
}: {
  failure: ProductFailure;
  /** Authoritative; null when identity-verification state is not established. */
  kycVerified: boolean | null;
  onRetry: () => void;
  onResumeLater?: () => void;
}) {
  return (
    <StatusPanel
      tone="warning"
      title="Account setup is temporarily unavailable"
      data-testid="backend-unavailable"
      data-code={failure.code}
      actions={
        <>
          <AppButton size="sm" onClick={onRetry} data-testid="retry">
            Retry Connection
          </AppButton>
          {onResumeLater && (
            <AppButton size="sm" variant="tertiary" onClick={onResumeLater}>
              Resume Later
            </AppButton>
          )}
        </>
      }
    >
      {kycVerified === true ? (
        <p data-testid="unavailable-kyc-verified">
          Your identity verification is complete. Account setup is temporarily
          unavailable. You can retry now or come back later.
        </p>
      ) : (
        // KYC state is not established — most often because the service that
        // would report it is the same one that is down. Say what we know: the
        // outage changed nothing. Claiming verification succeeded here would
        // be an assertion the frontend has no authority to make.
        <p data-testid="unavailable-kyc-unknown">
          Account setup is temporarily unavailable. Your completed onboarding
          steps have not been changed. You can retry now or come back later.
        </p>
      )}
      {failure.correlationId && (
        <p className="text-app-caption text-charcoal-200">
          Reference <span className="font-mono">{failure.correlationId}</span>
        </p>
      )}
    </StatusPanel>
  );
}

function LoadingPanel() {
  return (
    <Panel aria-busy="true" data-testid="loading">
      <div className="flex flex-col gap-3">
        <div className="h-3 w-32 animate-pulse rounded-app-input bg-charcoal-400 motion-reduce:animate-none" />
        <div className="h-3 w-48 animate-pulse rounded-app-input bg-charcoal-400 motion-reduce:animate-none" />
        <span className="sr-only">Loading connection status</span>
      </div>
    </Panel>
  );
}
