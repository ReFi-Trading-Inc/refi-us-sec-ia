/**
 * Per-operation credential policy, stated explicitly.
 *
 * The contract's OpenAPI `security` arrays say which credentials each
 * operation takes. This table encodes that policy rather than inferring it
 * from `runtime_owner`; `investor-api-auth-policy.test.ts` proves the table
 * equals `openapi.json` for all 41 operations, so a contract bump that changes
 * a security requirement fails the build instead of silently sending (or
 * omitting) a credential.
 *
 *   none               public route — no Authorization, no user assertion,
 *                      no credential provider is even invoked
 *   google             Google OIDC bearer only (identity exchange)
 *   google+assertion   Google OIDC bearer AND a fresh X-Refinity-User-Assertion
 */
import type { OperationId } from "./routes";

export type AuthPolicy = "none" | "google" | "google+assertion";

export const DEFAULT_AUTH_POLICY: AuthPolicy = "google+assertion";

export const AUTH_POLICY_EXCEPTIONS: Readonly<
  Partial<Record<OperationId, AuthPolicy>>
> = {
  // README "Token and key direction" §2: "That JWKS route needs no credential".
  getIdentityJwks: "none",
  // README §1: the BFF's Google credential authenticates the caller; the user
  // identity travels in the request body, not in a user assertion.
  exchangeIdentity: "google",
};

export function authPolicyFor(operationId: OperationId): AuthPolicy {
  return AUTH_POLICY_EXCEPTIONS[operationId] ?? DEFAULT_AUTH_POLICY;
}
