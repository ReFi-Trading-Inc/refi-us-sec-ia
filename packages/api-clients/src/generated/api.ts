// Public type surface for code that historically imported flat names from
// "@refi/api-clients" or "./generated/api".
//
// openapi-typescript emits schemas under `components["schemas"]`. This file
// re-exports the raw OpenAPI output and adds flat type aliases plus narrow
// compatibility shims for backend semantics that are referenced in the
// frontend but not yet modeled in openapi/refi-api.yaml.
//
// Anything marked "compatibility shim" is a frontend-only declaration pending
// backend/OpenAPI alignment. Do not invent backend behavior here — the shim is
// only what existing call sites already assumed.

import type { components } from "./_openapi.gen";

export * from "./_openapi.gen";

type Schemas = components["schemas"];

// ---------- Flat aliases for OpenAPI-defined schemas ----------

export type OkResult = Schemas["OkResult"];
export type KycStatus = Schemas["KycStatus"];
export type BrokerInfo = Schemas["BrokerInfo"];
export type BrokerConnection = Schemas["BrokerConnection"];
export type BrokerAccount = Schemas["BrokerAccount"];
export type Position = Schemas["Position"];
export type OrderRequest = Schemas["OrderRequest"];
export type Order = Schemas["Order"];
// OrderPreviewResult: extends OpenAPI shape with `latency_ms`, surfaced by the
// preview endpoint for the CompliancePreview observability strip but not yet
// in refi-api.yaml.
export type OrderPreviewResult = Schemas["OrderPreviewResult"] & {
  latency_ms?: number;
};
export type Recommendation = Schemas["Recommendation"];
export type ActivityEvent = Schemas["ActivityEvent"];
export type EligibilityDecision = Schemas["EligibilityDecision"];

// AuthSession: extends the OpenAPI shape with `expires_in_seconds`, which the
// session refresh scheduler in AuthProvider consumes. The field is emitted by
// the backend but not yet declared in refi-api.yaml.
export type AuthSession = Schemas["AuthSession"] & {
  expires_in_seconds?: number;
};

// ---------- Compatibility shims (pending OpenAPI alignment) ----------

// SIWE error codes. Mirrors the switch in hooks/auth.ts:siweErrorCode() and
// the keys of siweCopy.siweErrors in app-copy.ts.
export type SiweErrorCode =
  | "NONCE_INVALID"
  | "SIGNATURE_INVALID"
  | "POLICY_VIOLATION"
  | "CHAIN_DENIED"
  | "ACCOUNT_BLOCKED"
  | "REFRESH_REVOKED"
  | "UNKNOWN";

export type SiweNonceResponse = {
  nonce: string;
  issued_at: string;
  expires_at: string;
};

export type SiweVerifyRequest = {
  message: string;
  signature: string;
};

// KYC. KycStatusValue extends the backend enum with the frontend-only
// "not_started" sentinel used before any KYC attempt exists.
export type KycStatusValue =
  | "not_started"
  | "pending"
  | "incomplete"
  | "under_review"
  | "approved"
  | "denied";

export type KycStartResponse = {
  provider_url?: string;
  provider_reference?: string;
};

// Account activation: backend-checked gating flags for finishing onboarding.
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

// Advisory profile (Reg-Adv-aligned onboarding questionnaire). The exact
// schema is owned by the backend; this shim only declares the field names the
// frontend forms read/write. Values are stored as strings (form-controlled).
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

export type StrategyDescriptor = {
  id: string;
  name: string;
  description?: string;
  version?: number;
};

// Broker connect (Alpaca and similar). Keys are POSTed once and never stored
// client-side; see hooks/onboarding.ts:useBrokerConnectApiKey.
export type BrokerConnectStartResponse = {
  redirect_url?: string;
  state?: string;
};

export type BrokerApiKeyConnectRequest = {
  broker_id: string;
  api_key_id: string;
  api_secret_key: string;
  environment: "paper" | "live";
};

export type BrokerConnectKeyResponse = {
  connected: boolean;
  broker_id: string;
};
