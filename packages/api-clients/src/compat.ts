// Compatibility layer for @refi/api-clients.
//
// openapi-typescript emits schemas nested under `components["schemas"]`. This
// file flattens the schemas we use and declares narrow shims for backend
// semantics that are referenced in the frontend but not yet modeled in
// packages/api-clients/openapi/refi-api.yaml.
//
// Every shim in this file is a frontend-only declaration pending backend /
// OpenAPI alignment. Do not invent backend behavior here — a shim is only what
// existing call sites already assumed. Each shim carries a TODO marker so it
// can be deleted (or narrowed) once Daniel's OpenAPI catches up.

import type { components } from "./generated/_openapi.gen";

type Schemas = components["schemas"];

// ---------- Flat aliases for OpenAPI-defined schemas ----------

export type OkResult = Schemas["OkResult"];
export type BrokerInfo = Schemas["BrokerInfo"];
export type BrokerConnection = Schemas["BrokerConnection"];
export type BrokerAccount = Schemas["BrokerAccount"];
export type Position = Schemas["Position"];
export type OrderRequest = Schemas["OrderRequest"];
export type Order = Schemas["Order"];
export type Recommendation = Schemas["Recommendation"];
export type ActivityEvent = Schemas["ActivityEvent"];
export type EligibilityDecision = Schemas["EligibilityDecision"];

// ---------- Extended OpenAPI types ----------

// TODO(openapi): add `latency_ms` to OrderPreviewResult in refi-api.yaml.
// Surfaced by /orders/preview for the CompliancePreview observability strip.
export type OrderPreviewResult = Schemas["OrderPreviewResult"] & {
  latency_ms?: number;
};

// TODO(openapi): add `expires_in_seconds` to AuthSession in refi-api.yaml.
// Consumed by AuthProvider's auto-refresh scheduler; emitted by /auth/session.
export type AuthSession = Schemas["AuthSession"] & {
  expires_in_seconds?: number;
};

// ---------- Compatibility shims (pending OpenAPI alignment) ----------

// TODO(openapi): model SIWE error codes in refi-api.yaml.
// Mirrors the switch in hooks/auth.ts:siweErrorCode() and the keys of
// siweCopy.siweErrors in app-copy.ts.
export type SiweErrorCode =
  | "NONCE_INVALID"
  | "SIGNATURE_INVALID"
  | "POLICY_VIOLATION"
  | "CHAIN_DENIED"
  | "ACCOUNT_BLOCKED"
  | "REFRESH_REVOKED"
  | "UNKNOWN";

// TODO(openapi): model SIWE nonce response in refi-api.yaml.
export type SiweNonceResponse = {
  nonce: string;
  issued_at: string;
  expires_at: string;
};

// TODO(openapi): model SIWE verify request in refi-api.yaml.
export type SiweVerifyRequest = {
  message: string;
  signature: string;
};

// TODO(openapi): model account activation gates in refi-api.yaml. Backend-
// owned booleans for finishing onboarding.
export type AccountActivationStatus = {
  eligibility: boolean;
  wallet: boolean;
  kyc: boolean;
  profile: boolean;
  broker: boolean;
  disclosures: boolean;
};

export type AccountActivationResponse = {
  activated: boolean;
  account_id?: string;
};

// TODO(openapi): model AdvisoryProfile (Reg-Adv questionnaire) in refi-api.yaml.
// Field names match the frontend forms in apps/web/app/us/onboarding/profile/.
// Values are form-controlled strings; the BFF will translate to the eventual
// backend enum payload.
export type AdvisoryProfile = {
  goal: string;
  timeHorizon: string;
  incomeBand: string;
  liquidNetWorth: string;
  riskTolerance: string;
  investmentExperience: string;
  accountPurpose: string;
};

export type AdvisoryProfileResponse = AdvisoryProfile & {
  version?: number;
  updated_at?: string;
};

// TODO(openapi): model strategy catalog in refi-api.yaml.
export type StrategyDescriptor = {
  id: string;
  name: string;
  description?: string;
  version?: number;
};

// TODO(openapi): model broker-connect endpoints in refi-api.yaml. Keys are
// POSTed once and never stored client-side; see
// hooks/onboarding.ts:useBrokerConnectApiKey.
export type BrokerConnectStartResponse = {
  redirect_url?: string;
  state?: string;
};

/**
 * Raw API-key broker connection. PAPER ONLY.
 *
 * `environment` is narrowed to the literal so a live credential cannot be
 * expressed by this client at all — not merely rejected by a form. Signal must
 * never hold a credential capable of placing, cancelling, or modifying an
 * order, and a raw live key carries whatever authority the broker granted it
 * regardless of what this frontend does with it.
 *
 * SCOPE OF THE GUARANTEE, stated precisely: this narrows what the shipped
 * frontend can originate. It does NOT prove the ReFi system refuses a live
 * credential — this request still goes browser-direct to the external
 * /v1/brokers/connect/keys, so a modified client or a plain HTTP call bypasses
 * every check in this repository. Backend refusal of `environment: "live"` is
 * unproven here and tracked as D-SIGNAL-01 (EXTERNAL PROOF REQUIRED).
 *
 * The intended live path is not this endpoint at all. The settled requirement
 * is read access WITHOUT broker-write authority; the mechanism that delivers
 * it belongs to the backend's broker-connection contract, not to this type.
 */
export type BrokerApiKeyConnectRequest = {
  broker_id: string;
  api_key_id: string;
  api_secret_key: string;
  environment: "paper";
};

export type BrokerConnectKeyResponse = {
  connected: boolean;
  broker_id: string;
};

// ---------- Subscription mode (Phase 2 surface 1) ----------

// TODO(openapi): model subscription mode in refi-api.yaml. Mirrors the
// prototype-store entity at apps/web/src/lib/prototype-store/entities/
// subscription-mode.ts. The string union is load-bearing — adding a value
// requires updating mode-branching UI in every consuming surface.
export type SubscriptionMode = "signal" | "managed";

export interface SubscriptionModeState {
  accountId: string;
  mode: SubscriptionMode;
  selectedAt: string;
}

// ---------- Investor recommendations (BFF projection) ----------

// TODO(openapi): model recommendation projection in refi-api.yaml. Mirrors
// apps/web/src/lib/prototype-store/entities/recommendation-projection.ts.
// The "review-required" frontend state is derived (a recommendation gated by
// a pending ExceptionReview), not stored as a projection status.
export type RecommendationProjectionStatus =
  "open" | "executing" | "delivered" | "dismissed" | "saved" | "blocked";

export interface RecommendationProjection {
  accountId: string;
  recommendationId: string;
  intentId?: string;
  symbol: string;
  action: "buy" | "sell" | "neutral" | "rebalance";
  rationale: string;
  confidence: string;
  expectedAllocation?: string;
  status: RecommendationProjectionStatus;
  generatedAt: string;
  expiresAt?: string;
  decisionRecordId?: string;
}

export interface InvestorRecommendationsResponse {
  items: RecommendationProjection[];
  mode: SubscriptionMode | null;
}
