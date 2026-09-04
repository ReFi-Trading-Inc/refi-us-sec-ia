/**
 * Canonical investor action catalog + record-access catalog.
 *
 * Two separate unions for two distinct audit classes:
 *   - InvestorActionName: state-changing investor actions. Emit
 *     InvestorActionReceipt (apps/web/src/lib/prototype-store/entities/receipt.ts).
 *   - RecordAccessAction: read/view/export events. Emit RecordAccessLog
 *     (apps/web/src/lib/prototype-store/entities/record-access-log.ts).
 *
 * Source of truth: docs/investor-action-taxonomy.md.
 * Naming rules (durable):
 *   - The investor-approved policy object is "Execution Policy"; runtime
 *     status is "Managed Execution State". The action name is
 *     `activateExecutionPolicy` (NOT `activateManagedPolicy`).
 *   - View/download/export are NOT investor actions — they are record
 *     accesses. Putting them in InvestorActionName creates audit noise and
 *     misrepresents what the investor authorized.
 *   - Exception resolution is a single action (`resolveException`) whose
 *     payload carries the resolution category. The route is `/resolve`,
 *     not `/approve`, so the noun stays general.
 */

// ─── State-changing investor actions ─────────────────────────────────────────

export const InvestorActions = [
  "activateExecutionPolicy",
  "updateExecutionPolicy",
  "saveExecutionPolicyDraft",
  "pauseManaged",
  "resumeManaged",
  "updateAccountPrefs",
  "refreshProfile",
  "acknowledgeDisclosure",
  "connectBroker",
  "disconnectBroker",
  "resolveException",
  "dismissSignal",
  "saveSignal",
  "selectMode",
  // BFF-only, like acknowledgeDisclosure: a support submission is a
  // state-changing investor action that leaves a receipt, but it maps to no
  // backend admin verb because the ticket sink is not an investor-api action.
  "submitSupportRequest",
  // BFF-only: autosaving the questionnaire-v2 profile draft. Mutable draft
  // state, not an immutable snapshot — promotion to a snapshot is
  // refreshProfile. No backend admin verb; drafts never leave the BFF.
  "saveProfileDraft",
  // BFF-only (KYC decision 2026-09-04): the frontend owns the identity-
  // verification provider lifecycle. Starting/resuming it is a receipted
  // investor action that never reaches the trading backend; the normalized
  // result is submitted later via createComplianceProfileAttestation
  // (refreshProfile-era sequencing), not by this action.
  "startKycVerification",
  // BFF-only TEST CONTROL for the mock adapter. Enabled solely by
  // REFI_KYC_MOCK_CONTROLS=1; answers 404 everywhere else.
  "advanceMockKycVerification",
] as const;

export type InvestorActionName = (typeof InvestorActions)[number];

export function isInvestorAction(value: unknown): value is InvestorActionName {
  return (
    typeof value === "string" &&
    (InvestorActions as readonly string[]).includes(value)
  );
}

// ─── Read/view/export access events ──────────────────────────────────────────

export const RecordAccessActions = [
  "viewRecord",
  "downloadRecord",
  "exportRecord",
  "viewEvidence",
] as const;

export type RecordAccessAction = (typeof RecordAccessActions)[number];

export function isRecordAccessAction(
  value: unknown,
): value is RecordAccessAction {
  return (
    typeof value === "string" &&
    (RecordAccessActions as readonly string[]).includes(value)
  );
}

// ─── Exception resolution categories ─────────────────────────────────────────

/**
 * The complete set of resolution types accepted by
 * `POST /api/v1/investor/exceptions/[id]/resolve`. Anything outside this set
 * is rejected at the BFF — including a `resolution_category` of "approve" on
 * its own (would be a per-trade approval in disguise).
 *
 * `approve_exception` is allowed only when the exception is truly outside
 * policy and explicitly requires user authorization to release. The other
 * categories are user-side remediations that unblock the same intent.
 */
export const ExceptionResolutions = [
  "approve_exception",
  "reject_exception",
  "update_profile",
  "reconnect_broker",
  "acknowledge_disclosure",
  "pause_managed",
] as const;

export type ExceptionResolution = (typeof ExceptionResolutions)[number];

export function isExceptionResolution(
  value: unknown,
): value is ExceptionResolution {
  return (
    typeof value === "string" &&
    (ExceptionResolutions as readonly string[]).includes(value)
  );
}

// ─── Forbidden identifiers (compile-time disjointness proof) ─────────────────

/**
 * Forbidden investor action identifiers. Exported only so the type checker
 * can prove the allowed union excludes them.
 *
 * The tripwire treats this file as one of the few exempt locations where
 * forbidden identifiers may appear, since their purpose here is precisely to
 * be named so they can be rejected.
 */
// allow-investor-boundary: "acceptRecommendation" reason: "documented as forbidden in the type system"
export type ForbiddenInvestorActionName =
  | "acceptRecommendation"
  | "approveTrade"
  | "approveRebalance"
  | "adminRebalance"
  | "manualTradeSubmit"
  | "forceInference"
  | "forceTraining"
  | "cancelOrder"
  | "rollback"
  | "configWrite"
  | "controlsWrite"
  | "accountInitialize"
  | "staffReviewAdvice"
  | "founderApproveRecommendation"
  | "editRecommendation"
  | "activateManagedPolicy" // superseded by activateExecutionPolicy
  | "approveUserSideException"; // superseded by resolveException

// Compile-time proof the two unions are disjoint.
type _ForbiddenIsNotAllowed = ForbiddenInvestorActionName & InvestorActionName;
type _Assert<T extends never> = T;
type _Check = _Assert<_ForbiddenIsNotAllowed>;
