/**
 * KYC evidence PROVENANCE — server-only trust boundary for the attestation
 * mapping.
 *
 * Daniel's `AttestationKyc` wire shape carries normalized lifecycle data and
 * opaque metadata (`provider`, `level`, `evidence_ref`). Those strings are
 * METADATA: a label such as "some-real-kyc-adapter" is not proof that a real
 * provider exists, that an adapter is trusted, that a callback was
 * authenticated, or that external evidence was verified. Production TRUST is
 * therefore represented separately, here, and can only be established by code
 * that owns an authenticated production-provider boundary.
 *
 * Current product state (KYC decision 2026-09-04): no real provider has been
 * selected; the only adapter is the mock; mock results must never become
 * backend compliance evidence. Consequently NO runtime path in this
 * application calls `establishTrustedKycProvenance` — the contract assertions
 * pin that. A later real-provider integration extends/replaces the adapter
 * implementation behind the existing frontend/BFF boundary and becomes the
 * single caller. Nothing here names or selects a vendor.
 */
import type {
  AttestationKyc,
  KycProviderAdapter,
  KycVerificationSession,
} from "./provider";
import { toNormalizedKycResult } from "./provider";

export const KYC_PROVENANCE_SOURCES = ["mock", "production_provider"] as const;
export type KycProvenanceSource = (typeof KYC_PROVENANCE_SOURCES)[number];

/**
 * Normalized KYC values plus their provenance classification. This is DATA:
 * anyone can construct it, so it never grants trust by itself (see
 * `TrustedKycEvidence`).
 */
export interface KycEvidenceProvenance {
  source: KycProvenanceSource;
  /** Opaque adapter identifier — never a vendor name in this codebase. */
  adapterId: string;
  /** Opaque frontend evidence reference (ATD: "opaque_frontend_reference"). */
  evidenceRef: string | null;
  /** Daniel's normalized wire block (PR #73 vocabulary). */
  normalized: AttestationKyc;
}

// Module-private, non-registered symbol: a plain object literal, a JSON
// payload or a look-alike `Symbol("...")` can never carry it.
const TRUSTED: unique symbol = Symbol("refi.kyc.trusted-production-provenance");

/**
 * Evidence whose production provenance was established by a trusted server
 * boundary. Only `establishTrustedKycProvenance` can produce a value of this
 * type; structural imitation fails `isTrustedKycEvidence`.
 */
export interface TrustedKycEvidence extends KycEvidenceProvenance {
  readonly source: "production_provider";
  readonly [TRUSTED]: true;
}

/** What the current mock boundary yields: normalized values, `source: "mock"`. */
export function mockKycProvenance(
  session: KycVerificationSession,
  adapterKind: KycProviderAdapter["kind"],
): KycEvidenceProvenance {
  return {
    source: "mock",
    adapterId: `${adapterKind}-kyc-adapter`,
    evidenceRef: `kyc-session:${session.referenceId}`,
    normalized: toNormalizedKycResult(session, adapterKind),
  };
}

/**
 * Mark evidence as trusted production provenance.
 *
 * CALLER CONTRACT: only an authenticated production KYC provider boundary
 * (a future adapter/callback path that has verified the external result) may
 * call this. There is no such boundary in the product today, so the only
 * permitted caller is a clearly named test-only fixture. The contract
 * assertions fail if any runtime module under apps/web calls it.
 */
export function establishTrustedKycProvenance(args: {
  adapterId: string;
  evidenceRef: string | null;
  normalized: AttestationKyc;
}): TrustedKycEvidence {
  const adapterId = args.adapterId.trim();
  if (adapterId.length === 0) {
    throw new Error("trusted KYC provenance requires an adapter identifier");
  }
  return Object.freeze({
    source: "production_provider",
    adapterId,
    evidenceRef: args.evidenceRef,
    normalized: args.normalized,
    [TRUSTED]: true,
  }) as TrustedKycEvidence;
}

/** The ONLY test for production trust: the module-private marker, not any string. */
export function isTrustedKycEvidence(
  value: unknown,
): value is TrustedKycEvidence {
  if (value === null || typeof value !== "object") return false;
  return (
    (value as Record<PropertyKey, unknown>)[TRUSTED] === true &&
    (value as KycEvidenceProvenance).source === "production_provider"
  );
}
