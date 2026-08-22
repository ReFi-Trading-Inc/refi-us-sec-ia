/**
 * investor-api route projections — the OUTBOUND service contract.
 *
 * Source of truth: Daniel's written reply 2026-08-17, recorded in
 *   docs/phase2-7-daniel-contract-mechanics-resolution.md §1 (closes D-012).
 *
 * ─── Naming collision to keep straight ─────────────────────────────────────
 *
 * Our browser-facing BFF routes are ALSO namespaced `/api/v1/investor/*`
 * (apps/web/app/api/v1/investor/**). These constants are the OUTBOUND ones —
 * the routes the BFF calls on Daniel's `investor-api` service. Different hop,
 * different auth: outbound calls carry the Google OIDC service credential plus
 * `X-Refinity-User-Assertion` (see ./user-assertion.ts).
 *
 * ─── Ownership ─────────────────────────────────────────────────────────────
 *
 *   identity-ccid       authenticated identity, stable user_id, INITIAL
 *                       user/account membership
 *   compliance-adapter  KYC-provider exchange + normalized KYC result
 *   investor-api        durable eligibility decisions, versioned advisory
 *                       profiles, disclosure registry, consent receipts,
 *                       derived account trading authorization
 *
 * Note the split on membership: identity-ccid owns the INITIAL membership,
 * while the derived, per-request trading authorization for an account is read
 * from ACCOUNT_AUTHORIZATION below. Neither is recomputed frontend-side.
 *
 * ─── Not authoritative yet ─────────────────────────────────────────────────
 *
 * Until these projections connect, the BFF's interim records for advisory
 * profiles, disclosures, and consents remain exportable but explicitly NOT the
 * system of record — the same posture set for preferences in July §4. Exact
 * response schemas arrive with the exported `v1.0.0-dev.1` contract (D-011).
 */

/** Every investor-api route sits under this prefix. */
export const INVESTOR_API_PREFIX = "/api/v1/investor";

/**
 * Account-scoped routes take the account id in the PATH. Daniel does not
 * accept a session-implicit account, and the account id never rides in the
 * user assertion — investor-api re-authorizes ownership server-side on every
 * account request.
 */
function accountScoped(path: string): string {
  return `${INVESTOR_API_PREFIX}/accounts/{account_id}${path}`;
}

/**
 * The route groups Daniel specified. Method notes record what he stated;
 * literals are verified against the exported contract on receipt.
 */
export const INVESTOR_API_ROUTES = {
  /** GET — aggregate onboarding progress. */
  ONBOARDING_STATUS: `${INVESTOR_API_PREFIX}/onboarding/status`,
  /** GET | POST — durable eligibility decisions (investor-api owned). */
  ELIGIBILITY: `${INVESTOR_API_PREFIX}/eligibility`,
  /**
   * GET only — `compliance-adapter` owns the provider exchange and the
   * normalized result. The investor product reads it; it never writes KYC.
   */
  KYC: `${INVESTOR_API_PREFIX}/kyc`,
  /**
   * GET | POST — APPEND-ONLY versions. A profile change is a new version, never
   * an in-place update, so no client may model this as a PUT/PATCH.
   */
  ADVISORY_PROFILES: `${INVESTOR_API_PREFIX}/advisory-profiles`,
  /** GET — the currently effective advisory-profile version. */
  ADVISORY_PROFILE_CURRENT: `${INVESTOR_API_PREFIX}/advisory-profiles/current`,
  /**
   * GET — the disclosure registry: document key, version, content hash,
   * effective date, status, content reference.
   */
  DISCLOSURES: `${INVESTOR_API_PREFIX}/disclosures`,
  /** GET | POST — consent receipts. POST records an acknowledgment. */
  CONSENTS: `${INVESTOR_API_PREFIX}/consents`,
  /**
   * GET — DERIVED account trading authorization. Read it; never recompute it
   * frontend-side from KYC + eligibility + profile status.
   */
  ACCOUNT_AUTHORIZATION: accountScoped("/authorization"),
  /** POST — investor actions (allowlist in ../sec203a/admin-verbs.ts). */
  ACCOUNT_ACTIONS: accountScoped("/actions"),
  /**
   * GET | PATCH — the ONLY public write path for preferences. A
   * trading-expanding PATCH without a current acknowledgment returns
   * `409 ACKNOWLEDGMENT_REQUIRED` (see ../sec203a/step-up.ts).
   */
  ACCOUNT_PREFERENCES: accountScoped("/preferences"),
  /** GET — durable preference history (backend-owned canonical writer). */
  ACCOUNT_PREFERENCES_HISTORY: accountScoped("/preferences/history"),
  /**
   * GET (SSE) — account-scoped event stream. The browser subscribes through a
   * BFF-PROXIED route; investor-api performs the authoritative account filter
   * before emitting any event (confirmed 2026-08-17). No direct
   * browser→investor-api streaming.
   */
  ACCOUNT_EVENTS: accountScoped("/events"),
} as const;

export type InvestorApiRoute =
  (typeof INVESTOR_API_ROUTES)[keyof typeof INVESTOR_API_ROUTES];

/**
 * Substitute a real account id into an account-scoped template. Encodes the
 * id so a hostile value cannot escape its path segment.
 */
export function withAccountId(template: string, accountId: string): string {
  return template.replace("{account_id}", encodeURIComponent(accountId));
}

/**
 * Mock-replacement grouping (extends July §7). Recorded so the sequencing
 * survives outside the planning docs.
 */
export const MOCK_REPLACEMENT_GROUPS = {
  /** First group: onboarding, eligibility, KYC, profiles, disclosures, consents. */
  ONBOARDING_AND_AUTHORIZATION: [
    INVESTOR_API_ROUTES.ONBOARDING_STATUS,
    INVESTOR_API_ROUTES.ELIGIBILITY,
    INVESTOR_API_ROUTES.KYC,
    INVESTOR_API_ROUTES.ADVISORY_PROFILES,
    INVESTOR_API_ROUTES.ADVISORY_PROFILE_CURRENT,
    INVESTOR_API_ROUTES.DISCLOSURES,
    INVESTOR_API_ROUTES.CONSENTS,
  ],
  /** Second group: accounts and templates, incl. derived authorization. */
  ACCOUNTS_AND_TEMPLATES: [
    INVESTOR_API_ROUTES.ACCOUNT_AUTHORIZATION,
    INVESTOR_API_ROUTES.ACCOUNT_PREFERENCES,
    INVESTOR_API_ROUTES.ACCOUNT_PREFERENCES_HISTORY,
  ],
} as const;
