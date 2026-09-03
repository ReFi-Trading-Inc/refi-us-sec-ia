/**
 * investor-api route projections — the OUTBOUND service contract.
 *
 * Since 2026-09-03 these are DERIVED from Daniel's vendored v1.1.0-alpha.2
 * package (`@refi/api-clients/investor-api`, `contract.json`), not hand-written.
 * The named constants are kept so BFF call sites do not churn; a test in the
 * package asserts they resolve to the contract paths and that eligibility and
 * advisory-profiles are GET-only (the questionnaire writers were removed in
 * favour of `createComplianceProfileAttestation`).
 *
 * ─── Naming collision to keep straight ─────────────────────────────────────
 * Our browser-facing BFF routes are ALSO namespaced `/api/v1/investor/*`
 * (apps/web/app/api/v1/investor/**). These constants are the OUTBOUND ones —
 * the routes the BFF calls on Daniel's `investor-api` service. Different hop,
 * different auth: outbound calls carry the Google OIDC service credential plus
 * `X-Refinity-User-Assertion` (see ./user-assertion.ts).
 *
 * Server-only: never import from browser code.
 */
export {
  INVESTOR_API_PREFIX,
  INVESTOR_API_ROUTES,
  ROUTES_BY_OPERATION,
  expandPath,
  routeFor,
  withAccountId,
  type InvestorApiRoute,
  type OperationId,
} from "@refi/api-clients/investor-api";
