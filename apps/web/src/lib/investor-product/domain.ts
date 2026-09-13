/**
 * Investor product — frontend domain model (P1A).
 *
 * This is the ReFi-owned frontend projection of the investor journey:
 * brokerage connection, PAPER/LIVE environment, strategy subscription,
 * allocation, and version/hash-bound consent. It is deliberately INDEPENDENT
 * of Daniel's unfinished membership/admission/brokerage contracts so the
 * journey is demoable and contract-ready before those land.
 *
 * Boundary rules this file exists to enforce (founder directive 2026-09-12):
 *
 *   1. Every state here is a PROJECTION. This module never owns Alpha
 *      membership authority, canonical admission, AccountAuthorization,
 *      brokerage persistence, subscription persistence, or trading
 *      authorization. Those are backend-owned; the frontend displays what it
 *      is told and never infers authority from the absence of a field.
 *   2. `BrokerEnvironment` is EXPLICIT. It is never inferred from a URL, a
 *      credential prefix, an account number, or copy.
 *   3. LIVE is gated by capability authority (`ProductCapabilities`), not by a
 *      disabled input. A disabled control with no authority behind it is not a
 *      gate.
 *   4. No credential material is part of any readable state. Credentials
 *      appear only as a one-shot argument to the connect intent and are never
 *      returned, echoed, stored, or logged.
 *
 * Vocabulary is aligned to the contract terms already in this repo
 * (`account_environment`, `connection_status`, `required_disclosure_key` /
 * `_version` / `_hash`, `consent_receipt_id`) so the transport adapter can map
 * into this model later without renaming the domain. Where the backend shape
 * is genuinely unknown it is modelled as nullable rather than guessed.
 */

// ─── Broker environment + capability authority ───────────────────────────────

/**
 * The account environment, stated explicitly.
 *
 * Mirrors the contract's `account_environment`. Never derived from anything.
 */
export type BrokerEnvironment = "paper" | "live";

/** The only brokerage in Alpha. */
export type BrokerId = "alpaca";

/**
 * Why LIVE is unavailable. A reason is REQUIRED whenever LIVE is gated so the
 * UI can render an accessible explanation rather than a bare disabled control.
 */
export type LiveUnavailableReason =
  /** Alpha is PAPER by construction. */
  | "alpha_paper_only"
  /** Capability withheld by backend authority (reason not disclosed to UI). */
  | "not_authorized";

/**
 * Capability authority for the product surfaces.
 *
 * `liveTradingEnabled` is the ONLY thing that may unblock LIVE. For Alpha it
 * is false, and `assertEnvironmentSelectable` refuses LIVE regardless of what
 * any component passes.
 */
export interface ProductCapabilities {
  readonly liveTradingEnabled: boolean;
  /** Present whenever `liveTradingEnabled` is false. */
  readonly liveUnavailableReason: LiveUnavailableReason | null;
}

/** Alpha capability set: PAPER only, LIVE blocked by authority. */
export const ALPHA_CAPABILITIES: ProductCapabilities = {
  liveTradingEnabled: false,
  liveUnavailableReason: "alpha_paper_only",
};

/** Selectability of one environment, with the reason when refused. */
export type EnvironmentSelectability =
  | { readonly selectable: true }
  | {
      readonly selectable: false;
      readonly reason: LiveUnavailableReason;
    };

/**
 * Whether an environment may be selected, under explicit capability authority.
 *
 * PAPER is always selectable. LIVE is selectable only when capability
 * authority says so — so a component cannot enable LIVE by passing a flag, and
 * a future capability change is the single place LIVE opens.
 */
export function environmentSelectability(
  environment: BrokerEnvironment,
  capabilities: ProductCapabilities,
): EnvironmentSelectability {
  if (environment === "paper") return { selectable: true };
  if (capabilities.liveTradingEnabled) return { selectable: true };
  return {
    selectable: false,
    reason: capabilities.liveUnavailableReason ?? "not_authorized",
  };
}

/** Thrown when a caller attempts an environment capability authority refuses. */
export class EnvironmentNotSelectableError extends Error {
  constructor(
    readonly environment: BrokerEnvironment,
    readonly reason: LiveUnavailableReason,
  ) {
    super(`environment not selectable: ${environment} (${reason})`);
    this.name = "EnvironmentNotSelectableError";
  }
}

/**
 * Fail-closed guard for every mutation that carries an environment.
 *
 * Adapters call this BEFORE any transport work, so LIVE cannot reach a
 * backend even if a caller constructs the intent by hand.
 */
export function assertEnvironmentSelectable(
  environment: BrokerEnvironment,
  capabilities: ProductCapabilities,
): void {
  const s = environmentSelectability(environment, capabilities);
  if (!s.selectable) {
    throw new EnvironmentNotSelectableError(environment, s.reason);
  }
}

// ─── Brokerage connection (projection) ───────────────────────────────────────

/**
 * Connection lifecycle as the UI needs to render it.
 *
 * A projection of the contract's `connection_status`, plus the `not_connected`
 * case the contract expresses as "no connection row". `degraded` deliberately
 * collapses the backend's several unhealthy spellings: the UI treats them
 * identically (explain + offer reconnect) and the backend stays authoritative
 * over which one it is.
 */
export type BrokerageConnectionStatus =
  | "not_connected"
  | "pending_validation"
  | "connected"
  | "degraded"
  | "disconnected";

/**
 * A brokerage connection as displayed. Carries status and metadata ONLY —
 * there is no credential field, by construction, so no read path can leak one.
 */
export interface BrokerageConnection {
  readonly connectionId: string;
  readonly broker: BrokerId;
  /** Explicit; mirrors `account_environment`. */
  readonly environment: BrokerEnvironment;
  readonly status: BrokerageConnectionStatus;
  /** Shown only when the backend supplies it. Never synthesised. */
  readonly brokerAccountId: string | null;
  /** Backend concurrency token; passed back on mutations, never invented. */
  readonly stateVersion: number;
  readonly validatedAt: string | null;
  readonly lastSyncedAt: string | null;
  readonly updatedAt: string | null;
}

/** True once the connection is usable for a subscription decision. */
export function isConnectionUsable(c: BrokerageConnection | null): boolean {
  return c !== null && c.status === "connected";
}

/**
 * The connect intent.
 *
 * `credentials` is a one-shot argument: adapters forward it at most once and
 * MUST NOT return, echo, cache, hash, or log it. It is intentionally not part
 * of `BrokerageConnection`, so no read model can carry it.
 */
export interface ConnectBrokerageIntent {
  readonly broker: BrokerId;
  readonly environment: BrokerEnvironment;
  readonly credentials: BrokerageCredentials;
}

/** One-shot credential pair. Never persisted browser-side. */
export interface BrokerageCredentials {
  readonly apiKeyId: string;
  readonly apiSecretKey: string;
}

// ─── Allocation ──────────────────────────────────────────────────────────────

/**
 * Allocation bounds are BACKEND-OWNED.
 *
 * Null means "not yet known" — the UI must then refuse to validate rather than
 * substitute a plausible 0–100/1% default. Inventing bounds would be inventing
 * a risk control.
 */
export interface AllocationBounds {
  readonly minPercent: number;
  readonly maxPercent: number;
  readonly stepPercent: number;
}

export interface AllocationModel {
  /** The investor's current selection, or null before they choose. */
  readonly percent: number | null;
  /** Backend-supplied bounds, or null when the backend has not stated them. */
  readonly bounds: AllocationBounds | null;
}

export type AllocationInvalidReason =
  | "required"
  | "not_a_number"
  | "out_of_range"
  | "not_on_step"
  /** Bounds unknown — cannot validate, so the UI must not accept a value. */
  | "bounds_unknown";

export type AllocationValidation =
  | { readonly ok: true; readonly percent: number }
  | { readonly ok: false; readonly reason: AllocationInvalidReason };

/**
 * Validate an allocation percentage against backend-stated bounds.
 *
 * Fails closed when bounds are unknown: without them there is no authority to
 * accept any number, so the UI shows "unavailable", not a free-text field.
 */
export function validateAllocation(
  raw: string | number | null | undefined,
  bounds: AllocationBounds | null,
): AllocationValidation {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, reason: "required" };
  }
  if (bounds === null) return { ok: false, reason: "bounds_unknown" };

  const percent = typeof raw === "number" ? raw : Number(raw.trim());
  if (!Number.isFinite(percent)) return { ok: false, reason: "not_a_number" };
  if (percent < bounds.minPercent || percent > bounds.maxPercent) {
    return { ok: false, reason: "out_of_range" };
  }
  // Integer-cent arithmetic: 0.1 steps must not fail on binary float error.
  const scale = 1000;
  const offset = Math.round((percent - bounds.minPercent) * scale);
  const step = Math.round(bounds.stepPercent * scale);
  if (step > 0 && offset % step !== 0) {
    return { ok: false, reason: "not_on_step" };
  }
  return { ok: true, percent };
}

// ─── Consent (version + hash bound) ──────────────────────────────────────────

/**
 * A required disclosure, bound to an exact version and content hash.
 *
 * Field names mirror the existing acknowledgment architecture
 * (`required_disclosure_key` / `_version` / `_hash`) so consent is recorded
 * for EXACTLY the tuple the investor was shown — never inferred from an
 * earlier generic acceptance.
 */
export interface ConsentRequirement {
  readonly disclosureKey: string;
  readonly version: number;
  /** sha256, 64 lowercase hex. Validated before display. */
  readonly contentHash: string;
  /** The disclosure text actually rendered to the investor. */
  readonly body: string;
  readonly effectiveAt: string;
}

/** Proof of acceptance for one exact disclosure tuple. */
export interface ConsentReceipt {
  readonly consentReceiptId: string;
  readonly disclosureKey: string;
  readonly version: number;
  readonly contentHash: string;
  readonly acceptedAt: string;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** A requirement is displayable only if its hash is well-formed. */
export function isConsentRequirementWellFormed(r: ConsentRequirement): boolean {
  return (
    r.disclosureKey.length > 0 &&
    r.version >= 1 &&
    HASH_PATTERN.test(r.contentHash) &&
    r.body.length > 0
  );
}

/**
 * Whether a receipt satisfies a requirement.
 *
 * All three of key, version and hash must match. A receipt for v1 does not
 * satisfy v2, and a receipt whose hash differs does not satisfy the tuple even
 * at the same version — that is the point of hash binding.
 */
export function consentSatisfies(
  requirement: ConsentRequirement,
  receipt: ConsentReceipt | null,
): boolean {
  if (receipt === null) return false;
  return (
    receipt.disclosureKey === requirement.disclosureKey &&
    receipt.version === requirement.version &&
    receipt.contentHash === requirement.contentHash
  );
}

// ─── Subscription ────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  /** Backend refuses for a stated reason; the frontend never relabels this. */
  | "blocked";

export interface StrategyIdentity {
  readonly strategyId: string;
  readonly name: string;
  /** Short factual description. No performance claims. */
  readonly summary: string;
}

export interface StrategySubscription {
  readonly strategy: StrategyIdentity;
  readonly status: SubscriptionStatus;
  readonly allocation: AllocationModel;
  readonly environment: BrokerEnvironment;
  readonly brokerAccountId: string | null;
  readonly stateVersion: number;
  readonly updatedAt: string | null;
  /** Backend-stated reason when `status === "blocked"`. Never synthesised. */
  readonly blockedReason: string | null;
}

/** The confirm intent: account → strategy → allocation → consent → confirm. */
export interface ConfirmSubscriptionIntent {
  readonly strategyId: string;
  readonly connectionId: string;
  readonly environment: BrokerEnvironment;
  readonly allocationPercent: number;
  /** Consent is mandatory; there is no path that confirms without a receipt. */
  readonly consentReceiptId: string;
  readonly stateVersion: number;
}

// ─── Failure + availability states ───────────────────────────────────────────

/**
 * Why a product operation did not succeed.
 *
 * `backend_connection_unavailable` is the explicit product state that replaces
 * a generic 500 after a KYC pass: identity verification succeeded, account
 * setup is temporarily unavailable. It is RETRYABLE and must never be rendered
 * as rejection, nor cause KYC to be undone, nor be satisfied from fixtures in
 * Production.
 */
export type ProductFailureKind =
  | "backend_connection_unavailable"
  | "validation"
  | "conflict"
  | "not_authorized"
  | "capability_blocked";

export interface ProductFailure {
  readonly kind: ProductFailureKind;
  /** Whether the UI may offer retry. */
  readonly retryable: boolean;
  /** Stable code for tests/telemetry. Never a raw upstream body. */
  readonly code: string;
  /** Correlation id when the transport supplied one. */
  readonly correlationId: string | null;
}

export function backendUnavailable(
  correlationId: string | null = null,
): ProductFailure {
  return {
    kind: "backend_connection_unavailable",
    retryable: true,
    code: "BACKEND_CONNECTION_UNAVAILABLE",
    correlationId,
  };
}

/** Uniform adapter result. Failures are values, not exceptions. */
export type AdapterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ProductFailure };

export function ok<T>(value: T): AdapterResult<T> {
  return { ok: true, value };
}

export function fail<T>(failure: ProductFailure): AdapterResult<T> {
  return { ok: false, failure };
}

/**
 * The post-KYC handoff state.
 *
 * `kycVerified` is reported by the KYC surface; this module never sets it and
 * never infers admission or a cohort from it. `admission` is intentionally
 * absent: admission is Daniel-owned and the frontend has no projection of it
 * until the contract is bound (F/G remain superseded).
 */
export interface InvestorHandoff {
  readonly kycVerified: boolean;
  /** Backend availability for account setup after a KYC pass. */
  readonly setupAvailable: boolean;
  /** Present when `setupAvailable` is false. */
  readonly failure: ProductFailure | null;
}
