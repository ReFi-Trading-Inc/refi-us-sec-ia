/**
 * Provider-neutral frontend KYC boundary (public U.S. onboarding).
 *
 * PRODUCT DECISION (Zeshan, 2026-09-04): the U.S. APPLICATION surface is
 * public while Alpha admission stays closed and human-approved — passing KYC
 * never admits anyone; the frontend system owns the KYC provider lifecycle; no provider has been
 * selected; the current implementation is a MOCK behind this interface so a
 * real vendor can replace the adapter later without changing the product or
 * the backend contract boundary. Once the frontend holds a normalized result
 * it is submitted to the trading backend via `createComplianceProfileAttestation`
 * — a LATER slice (sequenced after Investor Profile slice 3). This module
 * never submits.
 *
 * TWO SEPARATE STATE DOMAINS — never merged:
 *   A. this file: the user's identity-verification JOURNEY with the (future)
 *      vendor — lifecycle state owned by ReFi's frontend/BFF;
 *   B. Daniel's `getKycStatus` (v1.1.0-alpha.2): a backend KYC POLICY /
 *      requirement projection (`status: NOT_REQUIRED`, `level:
 *      CLOSED_US_INVITE_ALPHA`, `public_launch_eligible: false`). It is not a
 *      lifecycle, it does not drive this boundary, `NOT_REQUIRED` is never
 *      converted into a provider `passed`, and its closed-Alpha level is
 *      consistent with a public application surface (closed cohort).
 *
 * No vendor name, vendor field, or vendor status enum appears anywhere in
 * this boundary. `scripts/contract-assertions.ts` enforces that.
 */
import type { components } from "@refi/api-clients/generated/investor-api.gen";

/** The lifecycle states the product flow needs. Not a vendor enum. */
export const KYC_LIFECYCLE_STATES = [
  "not_started",
  "in_progress",
  "additional_info_required",
  "under_review",
  "passed",
  "failed",
] as const;
export type KycLifecycleState = (typeof KYC_LIFECYCLE_STATES)[number];

export const TERMINAL_KYC_STATES: ReadonlySet<KycLifecycleState> = new Set([
  "passed",
  "failed",
]);

export function isKycLifecycleState(v: unknown): v is KycLifecycleState {
  return (
    typeof v === "string" &&
    (KYC_LIFECYCLE_STATES as readonly string[]).includes(v)
  );
}

/** One user's verification journey as the frontend/BFF knows it. */
export interface KycVerificationSession {
  /** Stable, opaque, frontend-owned. Never a vendor id, never PII. */
  referenceId: string;
  state: KycLifecycleState;
  startedAt: string | null;
  updatedAt: string;
  /** Ordered lifecycle history (state + ISO time). Bounded by the adapter. */
  history: ReadonlyArray<{ state: KycLifecycleState; at: string }>;
}

/**
 * The adapter contract a real vendor integration must satisfy. Callbacks /
 * webhooks and vendor trust live BEHIND this interface, on the server.
 */
export interface KycProviderAdapter {
  /** Stable identifier of the adapter kind — for labelling, never for product logic. */
  readonly kind: "mock";
  getSession(subject: KycSubject): Promise<KycVerificationSession>;
  /** Start or resume the user's verification. Idempotent from an in-progress state. */
  start(subject: KycSubject, correlationId?: string): Promise<KycStartResult>;
}

export interface KycSubject {
  /** The authenticated identity (BFF `authId`). Never an account id, email or wallet. */
  authId: string;
}

export type KycStartResult =
  | {
      accepted: true;
      session: KycVerificationSession;
      /** Same-origin continuation for the user, or null when nothing further is needed now. */
      continuePath: string | null;
    }
  | {
      accepted: false;
      reason: "already_terminal" | "unavailable";
      session: KycVerificationSession;
    };

// ─── Normalized result for the (later) compliance attestation ───────────────

/** Exactly the generated attestation `kyc` object of v1.1.0-alpha.2. */
export type AttestationKyc =
  components["schemas"]["ComplianceProfileAttestationRequest"]["kyc"];
export type AttestationKycStatus = AttestationKyc["status"];

/**
 * Normalize the frontend lifecycle into the generated attestation vocabulary
 * (`passed | failed | pending | not_required | expired | withdrawn`).
 *
 * Only three of those are ever produced here: a completed journey is
 * `passed`/`failed`; every non-terminal state is `pending`. `not_required`,
 * `expired` and `withdrawn` are backend-policy or later-lifecycle concepts
 * this boundary does not decide. The input type is the lifecycle enum, so a
 * backend projection value such as `NOT_REQUIRED` cannot even be passed in;
 * `normalizeUnknownLifecycle` guards the runtime path.
 */
export function toAttestationKycStatus(
  state: KycLifecycleState,
): Extract<AttestationKycStatus, "passed" | "failed" | "pending"> {
  switch (state) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "not_started":
    case "in_progress":
    case "additional_info_required":
    case "under_review":
      return "pending";
  }
}

export class NotALifecycleStateError extends Error {
  constructor(value: unknown) {
    super(
      `"${String(value)}" is not a frontend KYC lifecycle state. Backend policy ` +
        "projections (e.g. getKycStatus NOT_REQUIRED) are a different domain and " +
        "are never normalized into a provider result.",
    );
    this.name = "NotALifecycleStateError";
  }
}

/** Runtime guard for values that did not come through the typed lifecycle. */
export function normalizeUnknownLifecycle(
  value: unknown,
): ReturnType<typeof toAttestationKycStatus> {
  if (!isKycLifecycleState(value)) throw new NotALifecycleStateError(value);
  return toAttestationKycStatus(value);
}

/**
 * The normalized KYC block a later attestation slice would send. Built from
 * the frontend journey only; NOT submitted by this boundary.
 */
export function toNormalizedKycResult(
  session: KycVerificationSession,
  adapterKind: KycProviderAdapter["kind"],
): AttestationKyc {
  return {
    status: toAttestationKycStatus(session.state),
    // Provider label is the ADAPTER kind, never a vendor: the mock says so.
    provider: `${adapterKind}-kyc-adapter`,
    level: "frontend-lifecycle",
    evidence_ref: `kyc-session:${session.referenceId}`,
  };
}
