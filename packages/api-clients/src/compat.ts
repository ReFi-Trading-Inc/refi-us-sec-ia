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
export type OrderRequest = Schemas["OrderRequest"];
export type EligibilityDecision = Schemas["EligibilityDecision"];

// ---------- Extended OpenAPI types ----------

// TODO(openapi): add `latency_ms` to OrderPreviewResult in refi-api.yaml.
// Surfaced by /orders/preview for the CompliancePreview observability strip.
export type OrderPreviewResult = Schemas["OrderPreviewResult"] & {
  latency_ms?: number;
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
