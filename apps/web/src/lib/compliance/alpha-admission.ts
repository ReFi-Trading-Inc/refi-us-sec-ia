/**
 * Alpha admission — ONE deterministic, versioned, server-side rule
 * (founder directive 2026-09-10: automatic admission on a final trusted
 * Socure ACCEPT once every non-KYC prerequisite is complete; human review is
 * an exception path, not the default).
 *
 * Admission is derived from CURRENT authoritative prerequisite state, never
 * from event order: KYC may finish before a consent, a consent may finish
 * after KYC — the evaluator admits whenever all ten prerequisites converge.
 * KYC state and admission state are kept separate (a user can be
 * KYC-verified and not admitted). Admission never implies
 * AccountAuthorization, brokerage approval, Signal or Managed Paper — those
 * gates are unchanged and backend-owned.
 *
 * The browser never writes admission; this module is reached only from
 * server routes after a prerequisite changed, and from the admission read.
 */
import type { AuthContext } from "../bff/auth";
import { isTrustedKycEvidence } from "../kyc/provenance";
import { kycEvidenceForAttestation } from "../kyc/attestation-evidence";
import type { KycProviderAdapter } from "../kyc/provider";
import { listEffectiveDisclosures } from "../investor-api/disclosure-consent";
import type { InvestorApiReadClient } from "../investor-api/demo-client";
import { missingConsents } from "./attestation-submission";
import {
  getProfileAssessment,
  latestProfileVersion,
} from "../prototype-store/entities/investor-profile-v2";
import { getKycEvaluation } from "../prototype-store/entities/kyc-evaluation";
import {
  getAlphaAdmission,
  recordAdmissionEvaluation,
  type AlphaAdmissionRecord,
} from "../prototype-store/entities/alpha-admission";
import {
  collectPages,
  CONTRACT_MAX_PAGE_SIZE,
} from "../investor-api/pagination";
import { ASSESSMENT_POLICY_VERSION } from "../sec203a/investor-profile-engine";

export const ALPHA_ADMISSION_RULE_VERSION = "refi.alpha.admission.v1" as const;

/** The ten prerequisites, in the founder's order. */
export const ALPHA_ADMISSION_PREREQUISITES = [
  "authenticated_identity",
  "identity_mapping",
  "alpha_cohort",
  "eligibility",
  "advisory_profile",
  "disclosures_delivered",
  "consents_accepted",
  "kyc_accept",
  "kyc_final_trusted",
  "no_compliance_hold",
] as const;
export type AlphaAdmissionPrerequisite =
  (typeof ALPHA_ADMISSION_PREREQUISITES)[number];

export interface AlphaAdmissionPrerequisites {
  authenticatedIdentity: boolean;
  /** Backend account mapping exists for this identity. */
  accountId: string | null;
  /** Backend onboarding state (cohort/invitation authority is the backend's) and the positive signal that satisfied the gate. */
  cohort: {
    ok: boolean;
    onboardingState: string | null;
    signal: string | null;
  };
  eligibility: { ok: boolean; decisionId: string | null };
  profile: { ok: boolean; version: number };
  disclosures: { delivered: boolean; count: number };
  consents: { ok: boolean; missing: number; receiptIds: readonly string[] };
  kyc: {
    /** Final trusted provider decision, normalised. */
    status: "passed" | "failed" | null;
    trusted: boolean;
    evidenceRef: string | null;
    providerEvaluationId: string | null;
  };
  complianceHold: { active: boolean; reason: string | null };
}

export type AlphaAdmissionOutcome =
  | { state: "admitted"; reason: "KYC_ACCEPT_AND_PREREQUISITES_COMPLETE" }
  | { state: "not_admitted"; reason: "KYC_REJECTED" }
  | { state: "hold"; reason: string }
  | { state: "pending"; missing: AlphaAdmissionPrerequisite[] };

/** Pure rule. */
export function evaluateAlphaAdmission(
  p: AlphaAdmissionPrerequisites,
): AlphaAdmissionOutcome {
  if (p.complianceHold.active) {
    return {
      state: "hold",
      reason: p.complianceHold.reason ?? "COMPLIANCE_HOLD",
    };
  }
  if (p.kyc.status === "failed" && p.kyc.trusted) {
    return { state: "not_admitted", reason: "KYC_REJECTED" };
  }
  const missing: AlphaAdmissionPrerequisite[] = [];
  if (!p.authenticatedIdentity) missing.push("authenticated_identity");
  if (p.accountId === null) missing.push("identity_mapping");
  if (!p.cohort.ok) missing.push("alpha_cohort");
  if (!p.eligibility.ok) missing.push("eligibility");
  if (!p.profile.ok) missing.push("advisory_profile");
  if (!p.disclosures.delivered) missing.push("disclosures_delivered");
  if (!p.consents.ok) missing.push("consents_accepted");
  if (p.kyc.status !== "passed") missing.push("kyc_accept");
  if (!p.kyc.trusted) missing.push("kyc_final_trusted");
  if (missing.length > 0) return { state: "pending", missing };
  return { state: "admitted", reason: "KYC_ACCEPT_AND_PREREQUISITES_COMPLETE" };
}

/**
 * POSITIVE closed-Alpha cohort signal (fail-closed). alpha.3 exposes no
 * dedicated "alpha eligible" field; the backend `OnboardingStatus.state`
 * enum is the only contract-backed signal. Per INTEGRATION.md a user reaches
 * any of the states below only after a backend-issued invitation was
 * accepted at identity exchange, so these — and ONLY these — are accepted as
 * cohort evidence. Everything else (WAITLISTED, INELIGIBLE, SUSPENDED, an
 * unknown/future/malformed/missing value) is NOT in the cohort. The
 * allowlist is pinned against the vendored contract enum by a contract
 * assertion, so a new enum value fails closed until reviewed.
 * BACKEND CONTRACT DEPENDENCY: a dedicated positive cohort field (Daniel).
 */
export const ALPHA_COHORT_POSITIVE_STATES = [
  "INVITED",
  "IDENTITY_VERIFIED",
  "PROFILE_REQUIRED",
  "DISCLOSURE_REQUIRED",
  "CONSENT_REQUIRED",
  "READY",
] as const;
const COHORT_OK = new Set<string>(ALPHA_COHORT_POSITIVE_STATES);

/** The positive signal, or null when the backend state is not explicit cohort evidence. */
export function cohortSignalFrom(onboardingState: unknown): string | null {
  return typeof onboardingState === "string" && COHORT_OK.has(onboardingState)
    ? `onboarding_state:${onboardingState}`
    : null;
}

/**
 * Gather CURRENT prerequisite state from the authorities: backend (cohort,
 * eligibility, disclosures, consents), ReFi profile entity, ReFi KYC
 * evidence (trusted only from a final provider decision), ReFi hold.
 */
export async function gatherAlphaAdmissionPrerequisites(args: {
  auth: Pick<AuthContext, "authId" | "accountId">;
  client: InvestorApiReadClient;
  provider: KycProviderAdapter | null;
}): Promise<AlphaAdmissionPrerequisites> {
  const { auth, client, provider } = args;
  let onboardingState: string | null = null;
  try {
    const onboarding = await client.call("getOnboardingStatus");
    onboardingState = onboarding.data.data.state;
  } catch {
    onboardingState = null; // missing/unavailable → no cohort evidence (fail closed)
  }
  const accountId = auth.accountId ?? null;
  const signal = cohortSignalFrom(onboardingState);
  const cohortOk = accountId !== null && signal !== null;

  let eligibility: AlphaAdmissionPrerequisites["eligibility"] = {
    ok: false,
    decisionId: null,
  };
  let profile: AlphaAdmissionPrerequisites["profile"] = {
    ok: false,
    version: 0,
  };
  let disclosures: AlphaAdmissionPrerequisites["disclosures"] = {
    delivered: false,
    count: 0,
  };
  let consents: AlphaAdmissionPrerequisites["consents"] = {
    ok: false,
    missing: 0,
    receiptIds: [],
  };
  if (accountId !== null) {
    const elig = await client.call("getEligibility");
    eligibility = {
      ok: elig.data.data.decision === "ELIGIBLE",
      decisionId: elig.data.data.eligibility_decision_id,
    };
    const version = await latestProfileVersion(accountId);
    const assessment =
      version > 0
        ? await getProfileAssessment(
            accountId,
            version,
            ASSESSMENT_POLICY_VERSION,
          )
        : null;
    profile = { ok: version > 0 && assessment !== null, version };
    const effective = await listEffectiveDisclosures(client);
    disclosures = { delivered: true, count: effective.items.length };
    const { items: receipts } = await collectPages(
      async (cursor) => {
        const res = await client.call("listConsents", {
          query: { page_size: CONTRACT_MAX_PAGE_SIZE, cursor },
        });
        return { items: res.data.data.items, page: res.data.data.page };
      },
      { maxPages: 10 },
    );
    const missing = missingConsents(effective.items, receipts);
    consents = {
      ok: missing.length === 0,
      missing: missing.length,
      receiptIds: receipts
        .filter((r) => r.status === "ACTIVE")
        .map((r) => r.consent_receipt_id),
    };
  }

  let kyc: AlphaAdmissionPrerequisites["kyc"] = {
    status: null,
    trusted: false,
    evidenceRef: null,
    providerEvaluationId: null,
  };
  let complianceHold: AlphaAdmissionPrerequisites["complianceHold"] = {
    active: false,
    reason: null,
  };
  if (provider) {
    const ev = await kycEvidenceForAttestation(provider, {
      authId: auth.authId,
    });
    if (ev && isTrustedKycEvidence(ev)) {
      const s = ev.normalized.status;
      kyc = {
        status: s === "passed" ? "passed" : s === "failed" ? "failed" : null,
        trusted: true,
        evidenceRef: ev.evidenceRef,
        providerEvaluationId: null,
      };
    }
    const record = await getKycEvaluation(auth.authId);
    if (record) {
      kyc = {
        ...kyc,
        providerEvaluationId: record.evidence.providerEvaluationId,
      };
      if (record.conflict) {
        complianceHold = {
          active: true,
          reason: "CONFLICTING_PROVIDER_DECISION",
        };
      }
    }
  }
  return {
    authenticatedIdentity: auth.authId.length > 0,
    accountId,
    cohort: { ok: cohortOk, onboardingState, signal },
    eligibility,
    profile,
    disclosures,
    consents,
    kyc,
    complianceHold,
  };
}

/**
 * THE shared entry point: gather → evaluate → atomic record. Invoked at
 * every server-side boundary where admitted state matters (post-KYC
 * immediate ACCEPT, final KYC webhook ACCEPT, profile update, consent,
 * onboarding/admission reads, brokerage connection). Because it always
 * derives from current authoritative state, a missed earlier evaluation
 * (e.g. backend unavailable during the webhook) self-heals on the next
 * boundary — no support intervention. Never throws on a missing
 * prerequisite.
 */
export async function ensureAlphaAdmissionEvaluated(args: {
  auth: Pick<AuthContext, "authId" | "accountId">;
  client: InvestorApiReadClient;
  provider: KycProviderAdapter | null;
  correlationId: string;
  trigger: string;
}): Promise<{ record: AlphaAdmissionRecord; transitioned: boolean }> {
  const prerequisites = await gatherAlphaAdmissionPrerequisites(args);
  const outcome = evaluateAlphaAdmission(prerequisites);
  return recordAdmissionEvaluation({
    authId: args.auth.authId,
    accountId: args.auth.accountId ?? null,
    outcome,
    prerequisites,
    ruleVersion: ALPHA_ADMISSION_RULE_VERSION,
    correlationId: args.correlationId,
    trigger: args.trigger,
  });
}

/** @deprecated alias kept for callers; use ensureAlphaAdmissionEvaluated. */
export const runAlphaAdmissionEvaluation = ensureAlphaAdmissionEvaluated;

export { getAlphaAdmission };
