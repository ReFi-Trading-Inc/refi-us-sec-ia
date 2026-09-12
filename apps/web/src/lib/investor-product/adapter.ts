/**
 * `InvestorProductAdapter` — the typed frontend boundary for the investor
 * product journey (P1A).
 *
 * Every product surface talks to THIS interface, never to a transport. Two
 * implementations exist:
 *
 *   - `FixtureInvestorProductAdapter` — deterministic, for development, demo
 *     and tests. Forbidden in Production by `resolveAdapterMode`.
 *   - a transport adapter mapping Daniel's client into this same frontend
 *     domain model, once those contracts land.
 *
 * Because both sides speak the domain model in `./domain`, Daniel's payload
 * shape is NOT guessed anywhere in the UI: the mapping lives in one file that
 * does not exist yet, and its absence is a compile-time fact rather than a
 * runtime surprise.
 *
 * Failures are returned as values (`AdapterResult`) so every surface must
 * handle `backend_connection_unavailable` explicitly instead of inheriting a
 * generic error boundary.
 */
import type {
  AdapterResult,
  AllocationBounds,
  BrokerageConnection,
  ConfirmSubscriptionIntent,
  ConnectBrokerageIntent,
  ConsentReceipt,
  ConsentRequirement,
  InvestorHandoff,
  ProductCapabilities,
  StrategySubscription,
} from "./domain";

/** Which implementation is in use. Surfaced so the UI can label demo data. */
export type AdapterKind = "fixture" | "transport";

export interface InvestorProductAdapter {
  readonly kind: AdapterKind;

  /**
   * Capability authority. The ONLY thing that may unblock LIVE.
   * Read before rendering the environment selector.
   */
  capabilities(): Promise<ProductCapabilities>;

  /** Post-KYC handoff state, including backend availability for setup. */
  getHandoff(): Promise<AdapterResult<InvestorHandoff>>;

  // ── Brokerage connection ──
  getBrokerageConnection(): Promise<AdapterResult<BrokerageConnection | null>>;

  /**
   * Create or replace the brokerage connection.
   *
   * Implementations MUST call `assertEnvironmentSelectable` before any
   * transport work, and MUST NOT return, echo, store or log
   * `intent.credentials`.
   *
   * A capability-refused environment REJECTS with
   * `EnvironmentNotSelectableError` rather than returning a failure value:
   * it is a programming error for a surface to request LIVE at all, not an
   * operational outcome the UI should render. Async so the refusal is always
   * observable via `.catch`, never as a synchronous throw.
   */
  initiateBrokerageConnection(
    intent: ConnectBrokerageIntent,
  ): Promise<AdapterResult<BrokerageConnection>>;

  /** Re-validate an existing connection with fresh credentials. */
  updateBrokerageConnection(
    intent: ConnectBrokerageIntent & { readonly connectionId: string },
  ): Promise<AdapterResult<BrokerageConnection>>;

  disconnectBrokerage(args: {
    readonly connectionId: string;
    readonly stateVersion: number;
  }): Promise<AdapterResult<BrokerageConnection>>;

  // ── Subscription + allocation ──
  getSubscription(): Promise<AdapterResult<StrategySubscription | null>>;

  /** Backend-owned bounds. `null` when the backend has not stated them. */
  getAllocationBounds(): Promise<AdapterResult<AllocationBounds | null>>;

  updateAllocation(args: {
    readonly strategyId: string;
    readonly percent: number;
    readonly stateVersion: number;
  }): Promise<AdapterResult<StrategySubscription>>;

  // ── Consent ──
  /** The disclosure tuple that must be shown before confirmation. */
  getRequiredConsent(args: {
    readonly strategyId: string;
  }): Promise<AdapterResult<ConsentRequirement | null>>;

  /**
   * Record consent for EXACTLY the tuple shown. Implementations must refuse a
   * submission whose key/version/hash does not match a live requirement.
   */
  submitConsent(args: {
    readonly disclosureKey: string;
    readonly version: number;
    readonly contentHash: string;
  }): Promise<AdapterResult<ConsentReceipt>>;

  /**
   * Confirm the subscription. Requires a consent receipt id; there is no
   * overload that omits it.
   */
  confirmSubscription(
    intent: ConfirmSubscriptionIntent,
  ): Promise<AdapterResult<StrategySubscription>>;
}
