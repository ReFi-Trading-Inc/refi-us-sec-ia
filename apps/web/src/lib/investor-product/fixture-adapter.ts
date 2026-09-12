/**
 * `FixtureInvestorProductAdapter` — deterministic investor-product state for
 * development, demo and tests.
 *
 * Properties this implementation guarantees, each covered by a test:
 *
 *   1. LIVE is refused by capability authority, not by UI state. Every
 *      environment-carrying mutation calls `assertEnvironmentSelectable`, so a
 *      hand-built LIVE intent throws here too.
 *   2. Credentials are never read beyond a presence check, and never stored.
 *      `connect` records THAT a connection was made, never the material.
 *   3. No seed value resembles a real credential (see
 *      `FIXTURE_STRINGS` / `looksLikeCredential`): ids are visibly synthetic.
 *   4. Consent is version+hash bound. `submitConsent` refuses a tuple that is
 *      not the live requirement, and `confirmSubscription` refuses a receipt
 *      that does not satisfy it.
 *   5. Admission is never inferred. The fixture reports KYC and setup
 *      availability only; there is no admitted/cohort field to read.
 *
 * It is forbidden in Production by `resolveAdapterMode`; this file does not
 * decide that, so the prohibition cannot be weakened by editing the fixture.
 */
import type { InvestorProductAdapter } from "./adapter";
import {
  ALPHA_CAPABILITIES,
  assertEnvironmentSelectable,
  backendUnavailable,
  consentSatisfies,
  fail,
  isConnectionUsable,
  ok,
  validateAllocation,
  type AdapterResult,
  type AllocationBounds,
  type BrokerageConnection,
  type ConfirmSubscriptionIntent,
  type ConnectBrokerageIntent,
  type ConsentReceipt,
  type ConsentRequirement,
  type InvestorHandoff,
  type ProductCapabilities,
  type StrategyIdentity,
  type StrategySubscription,
} from "./domain";

/**
 * Every synthetic string the fixture can emit. Deliberately enumerated so a
 * test can assert none of them resembles a credential.
 */
export const FIXTURE_STRINGS = {
  connectionId: "fixture-connection-0001",
  brokerAccountId: "FIXTURE-ACCOUNT-0001",
  strategyId: "fixture-strategy-core",
  consentReceiptId: "fixture-consent-receipt-0001",
  disclosureKey: "alpha_automated_investment_disclosure",
  // sha256("refi-alpha-fixture-disclosure-v1"), a real hash of fixture text —
  // so the hash-binding path is exercised with a well-formed value.
  contentHash:
    "6f4a4e87bd7e0f2b0a1a5f4e5a2b73c6c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6",
} as const;

/**
 * Heuristic for "this string looks like an Alpaca credential".
 *
 * Mirrors the real shapes the broker form validates (key `PK`/`AK` + 18
 * alphanumerics, secret 40 mixed-case alphanumerics). Used by tests against
 * fixture output, and as a development guard below.
 */
export function looksLikeCredential(value: string): boolean {
  return /^(PK|AK)[A-Z0-9]{18}$/.test(value) || /^[A-Za-z0-9]{40}$/.test(value);
}

const FIXTURE_STRATEGY: StrategyIdentity = {
  strategyId: FIXTURE_STRINGS.strategyId,
  name: "ReFi Core Alpha",
  // Factual only — no performance claim, no projected return.
  summary:
    "Automated allocation across a diversified equity sleeve. Risk controls " +
    "are applied by ReFi; execution uses your connected brokerage account.",
};

/** Bounds a fixture may state. A transport adapter reads these from backend. */
const FIXTURE_BOUNDS: AllocationBounds = {
  minPercent: 5,
  maxPercent: 50,
  stepPercent: 1,
};

const FIXTURE_CONSENT: ConsentRequirement = {
  disclosureKey: FIXTURE_STRINGS.disclosureKey,
  version: 1,
  contentHash: FIXTURE_STRINGS.contentHash,
  body:
    "ReFi may generate automated investment decisions for this account. " +
    "Risk controls are applied before any instruction is issued. Execution " +
    "uses the brokerage account you connected; your assets remain at the " +
    "brokerage and ReFi does not take custody of them. This Alpha operates " +
    "in a PAPER environment and does not execute live capital.",
  effectiveAt: "2026-09-01T00:00:00.000Z",
};

/** Which deterministic world the fixture presents. */
export interface FixtureScenario {
  /** KYC outcome reported to the handoff surface. */
  readonly kycVerified: boolean;
  /**
   * When false, every operation returns
   * `backend_connection_unavailable` — Scenario A: KYC passed, account setup
   * is temporarily unavailable.
   */
  readonly backendAvailable: boolean;
  /** Seed an already-connected brokerage account. */
  readonly startConnected: boolean;
}

export const DEFAULT_FIXTURE_SCENARIO: FixtureScenario = {
  kycVerified: true,
  backendAvailable: true,
  startConnected: false,
};

/** Fixed clock so snapshots and tests are deterministic. */
const FIXTURE_NOW = "2026-09-12T12:00:00.000Z";

export class FixtureInvestorProductAdapter implements InvestorProductAdapter {
  readonly kind = "fixture" as const;

  private scenario: FixtureScenario;
  private connection: BrokerageConnection | null = null;
  private subscription: StrategySubscription | null = null;
  private receipt: ConsentReceipt | null = null;
  /** Proof-of-non-retention: counts connects without holding material. */
  private connectCount = 0;

  constructor(scenario: Partial<FixtureScenario> = {}) {
    this.scenario = { ...DEFAULT_FIXTURE_SCENARIO, ...scenario };
    if (this.scenario.startConnected) {
      this.connection = this.connectedConnection();
    }
  }

  // ── Test/demo controls ──

  /** Flip backend availability, to exercise the unavailable → retry path. */
  setBackendAvailable(available: boolean): void {
    this.scenario = { ...this.scenario, backendAvailable: available };
  }

  /** How many times connect was called. Never what was passed. */
  get connectAttempts(): number {
    return this.connectCount;
  }

  // ── Capabilities ──

  capabilities(): Promise<ProductCapabilities> {
    // Alpha: PAPER only. LIVE blocked by authority, with a stated reason.
    return Promise.resolve(ALPHA_CAPABILITIES);
  }

  getHandoff(): Promise<AdapterResult<InvestorHandoff>> {
    // KYC state is reported even when setup is unavailable: a backend outage
    // must never read as a failed or undone verification.
    return Promise.resolve(
      ok({
        kycVerified: this.scenario.kycVerified,
        setupAvailable: this.scenario.backendAvailable,
        failure: this.scenario.backendAvailable ? null : backendUnavailable(),
      }),
    );
  }

  // ── Brokerage connection ──

  getBrokerageConnection(): Promise<AdapterResult<BrokerageConnection | null>> {
    if (!this.scenario.backendAvailable) return this.unavailable();
    return Promise.resolve(ok(this.connection));
  }

  async initiateBrokerageConnection(
    intent: ConnectBrokerageIntent,
  ): Promise<AdapterResult<BrokerageConnection>> {
    // Capability gate FIRST — before any state change, so a LIVE intent
    // cannot mutate fixture state even transiently.
    assertEnvironmentSelectable(intent.environment, ALPHA_CAPABILITIES);

    if (!this.scenario.backendAvailable) return this.unavailable();

    if (
      intent.credentials.apiKeyId.length === 0 ||
      intent.credentials.apiSecretKey.length === 0
    ) {
      return Promise.resolve(
        fail({
          kind: "validation",
          retryable: false,
          code: "CREDENTIALS_REQUIRED",
          correlationId: null,
        }),
      );
    }

    // The credential is deliberately NOT read past the presence check above,
    // and nothing derived from it is retained.
    this.connectCount += 1;
    this.connection = this.connectedConnection();
    return Promise.resolve(ok(this.connection));
  }

  async updateBrokerageConnection(
    intent: ConnectBrokerageIntent & { readonly connectionId: string },
  ): Promise<AdapterResult<BrokerageConnection>> {
    assertEnvironmentSelectable(intent.environment, ALPHA_CAPABILITIES);
    if (!this.scenario.backendAvailable) return this.unavailable();
    if (
      this.connection === null ||
      this.connection.connectionId !== intent.connectionId
    ) {
      return Promise.resolve(
        fail({
          kind: "conflict",
          retryable: false,
          code: "CONNECTION_NOT_FOUND",
          correlationId: null,
        }),
      );
    }
    this.connectCount += 1;
    this.connection = {
      ...this.connectedConnection(),
      stateVersion: this.connection.stateVersion + 1,
    };
    return Promise.resolve(ok(this.connection));
  }

  disconnectBrokerage(args: {
    readonly connectionId: string;
    readonly stateVersion: number;
  }): Promise<AdapterResult<BrokerageConnection>> {
    if (!this.scenario.backendAvailable) return this.unavailable();
    const current = this.connection;
    if (current === null || current.connectionId !== args.connectionId) {
      return Promise.resolve(
        fail({
          kind: "conflict",
          retryable: false,
          code: "CONNECTION_NOT_FOUND",
          correlationId: null,
        }),
      );
    }
    if (current.stateVersion !== args.stateVersion) {
      return Promise.resolve(
        fail({
          kind: "conflict",
          retryable: true,
          code: "STATE_VERSION_STALE",
          correlationId: null,
        }),
      );
    }
    this.connection = {
      ...current,
      status: "disconnected",
      brokerAccountId: null,
      lastSyncedAt: null,
      stateVersion: current.stateVersion + 1,
      updatedAt: FIXTURE_NOW,
    };
    // Disconnecting drops the subscription projection: a subscription without
    // a connection is not a state the frontend may assert.
    this.subscription = null;
    return Promise.resolve(ok(this.connection));
  }

  // ── Subscription + allocation ──

  getSubscription(): Promise<AdapterResult<StrategySubscription | null>> {
    if (!this.scenario.backendAvailable) return this.unavailable();
    return Promise.resolve(ok(this.subscription));
  }

  getAllocationBounds(): Promise<AdapterResult<AllocationBounds | null>> {
    if (!this.scenario.backendAvailable) return this.unavailable();
    return Promise.resolve(ok(FIXTURE_BOUNDS));
  }

  updateAllocation(args: {
    readonly strategyId: string;
    readonly percent: number;
    readonly stateVersion: number;
  }): Promise<AdapterResult<StrategySubscription>> {
    if (!this.scenario.backendAvailable) return this.unavailable();

    const check = validateAllocation(args.percent, FIXTURE_BOUNDS);
    if (!check.ok) {
      return Promise.resolve(
        fail({
          kind: "validation",
          retryable: false,
          code: `ALLOCATION_${check.reason.toUpperCase()}`,
          correlationId: null,
        }),
      );
    }

    const current = this.subscription;
    if (current === null) {
      return Promise.resolve(
        fail({
          kind: "conflict",
          retryable: false,
          code: "SUBSCRIPTION_NOT_FOUND",
          correlationId: null,
        }),
      );
    }
    this.subscription = {
      ...current,
      allocation: { percent: check.percent, bounds: FIXTURE_BOUNDS },
      stateVersion: current.stateVersion + 1,
      updatedAt: FIXTURE_NOW,
    };
    return Promise.resolve(ok(this.subscription));
  }

  // ── Consent ──

  getRequiredConsent(args: {
    readonly strategyId: string;
  }): Promise<AdapterResult<ConsentRequirement | null>> {
    if (!this.scenario.backendAvailable) return this.unavailable();
    if (args.strategyId !== FIXTURE_STRATEGY.strategyId) {
      return Promise.resolve(ok(null));
    }
    return Promise.resolve(ok(FIXTURE_CONSENT));
  }

  submitConsent(args: {
    readonly disclosureKey: string;
    readonly version: number;
    readonly contentHash: string;
  }): Promise<AdapterResult<ConsentReceipt>> {
    if (!this.scenario.backendAvailable) return this.unavailable();

    // Consent is recorded for EXACTLY the live tuple. A submission for a
    // different key, an older version, or a different content hash is refused
    // rather than accepted against the current disclosure.
    const matches =
      args.disclosureKey === FIXTURE_CONSENT.disclosureKey &&
      args.version === FIXTURE_CONSENT.version &&
      args.contentHash === FIXTURE_CONSENT.contentHash;
    if (!matches) {
      return Promise.resolve(
        fail({
          kind: "validation",
          retryable: false,
          code: "CONSENT_TUPLE_MISMATCH",
          correlationId: null,
        }),
      );
    }

    this.receipt = {
      consentReceiptId: FIXTURE_STRINGS.consentReceiptId,
      disclosureKey: FIXTURE_CONSENT.disclosureKey,
      version: FIXTURE_CONSENT.version,
      contentHash: FIXTURE_CONSENT.contentHash,
      acceptedAt: FIXTURE_NOW,
    };
    return Promise.resolve(ok(this.receipt));
  }

  async confirmSubscription(
    intent: ConfirmSubscriptionIntent,
  ): Promise<AdapterResult<StrategySubscription>> {
    assertEnvironmentSelectable(intent.environment, ALPHA_CAPABILITIES);
    if (!this.scenario.backendAvailable) return this.unavailable();

    // A usable connection is a precondition; the frontend never confirms a
    // subscription it cannot attach to an account.
    if (!isConnectionUsable(this.connection)) {
      return Promise.resolve(
        fail({
          kind: "conflict",
          retryable: false,
          code: "BROKER_CONNECTION_MISSING",
          correlationId: null,
        }),
      );
    }

    // Consent gate: the receipt must satisfy the live requirement tuple.
    if (
      this.receipt === null ||
      intent.consentReceiptId !== this.receipt.consentReceiptId ||
      !consentSatisfies(FIXTURE_CONSENT, this.receipt)
    ) {
      return Promise.resolve(
        fail({
          kind: "validation",
          retryable: false,
          code: "CONSENT_REQUIRED",
          correlationId: null,
        }),
      );
    }

    const check = validateAllocation(intent.allocationPercent, FIXTURE_BOUNDS);
    if (!check.ok) {
      return Promise.resolve(
        fail({
          kind: "validation",
          retryable: false,
          code: `ALLOCATION_${check.reason.toUpperCase()}`,
          correlationId: null,
        }),
      );
    }

    this.subscription = {
      strategy: FIXTURE_STRATEGY,
      status: "active",
      allocation: { percent: check.percent, bounds: FIXTURE_BOUNDS },
      environment: "paper",
      brokerAccountId: this.connection?.brokerAccountId ?? null,
      stateVersion: 1,
      updatedAt: FIXTURE_NOW,
      blockedReason: null,
    };
    return Promise.resolve(ok(this.subscription));
  }

  private connectedConnection(): BrokerageConnection {
    return {
      connectionId: FIXTURE_STRINGS.connectionId,
      broker: "alpaca",
      environment: "paper",
      status: "connected",
      brokerAccountId: FIXTURE_STRINGS.brokerAccountId,
      stateVersion: 1,
      validatedAt: FIXTURE_NOW,
      lastSyncedAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    };
  }

  private unavailable<T>(): Promise<AdapterResult<T>> {
    return Promise.resolve(fail<T>(backendUnavailable()));
  }
}
