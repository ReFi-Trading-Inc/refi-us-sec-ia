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
export type KycStatus = Schemas["KycStatus"];
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

// TODO(openapi): align with Daniel's identity-ccid contract; "not_started" is
// a frontend-only sentinel for pre-attempt UI state and should remain
// frontend-side regardless.
export type KycStatusValue =
  | "not_started"
  | "pending"
  | "incomplete"
  | "under_review"
  | "approved"
  | "denied";

// TODO(openapi): model KYC start response in refi-api.yaml.
export type KycStartResponse = {
  provider_url?: string;
  provider_reference?: string;
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
