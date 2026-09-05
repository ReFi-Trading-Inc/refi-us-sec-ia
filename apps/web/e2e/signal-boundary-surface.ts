/**
 * The Managed/execution surface that must be structurally ABSENT from the
 * September artifact — one definition, asserted in two lanes.
 *
 * c2a-structure.spec.ts (main lane, REFI_RELEASE_STAGE=managed_paper) proves
 * absence is stage-independent; signal-authority.spec.ts (signal lane,
 * REFI_RELEASE_STAGE=signal) proves the same absence at the actual September
 * stage, so the release-authority lane certifies the artifact on its own.
 * Divergence between the lanes' route lists was the failure mode this module
 * removes.
 */

/** Removed Managed mutation routes — POST must answer 404, not a gate. */
export const ABSENT_MANAGED_POST_ROUTES: ReadonlyArray<string> = [
  "/api/v1/investor/managed/pause",
  "/api/v1/investor/managed/resume",
  "/api/v1/investor/execution-policy/activate",
  "/api/v1/investor/profile/reconfirm",
  "/api/v1/investor/disclosures/reacknowledge",
];

/** Removed Managed read/query routes — GET must answer 404, not a gate. */
export const ABSENT_MANAGED_GET_ROUTES: ReadonlyArray<string> = [
  "/api/v1/investor/managed/state",
  "/api/v1/investor/execution-policy",
  "/api/v1/investor/execution-policy/draft",
  "/api/v1/investor/orders",
  "/api/v1/investor/orders/any-id/lineage",
  // Reclassified in the C2a correction: profile reactivation and disclosure
  // re-acknowledgement are ExecutionPolicy/MES workflows, not Signal
  // remediation. Parked with the Managed product.
  "/api/v1/investor/profile/reactivation",
  "/api/v1/investor/disclosures/reacknowledgement",
];

/** The investor-facing mode surface — gone in both directions. */
export const ABSENT_MODE_ROUTE = "/api/v1/investor/subscription-mode";

/** Removed pages — must 404 with no redirect. */
export const ABSENT_MANAGED_PAGES: ReadonlyArray<string> = [
  "/us/app/settings/automation",
  "/us/app/settings/automation/activate",
  "/us/app/settings/automation/profile",
  "/us/app/settings/automation/disclosures",
  // C2a correction: briefly presented as "moved Signal IA"; actually the
  // Managed reactivation workflow under new URLs. Parked, not relocated.
  "/us/app/profile",
  "/us/app/documents/reacknowledge",
];

/** The genuine Signal remediation surfaces — must serve (200). */
export const SIGNAL_REMEDIATION_PAGES: ReadonlyArray<string> = [
  "/us/onboarding/investor-profile",
  "/us/app/documents",
];

/** Managed exception categories — schema-unrepresentable (400). */
export const MANAGED_EXCEPTION_RESOLUTIONS: ReadonlyArray<string> = [
  "approve_exception", // allow-investor-boundary: "approve_exception" reason: "negative-assertion fixture shared by both e2e lanes"
  "reject_exception", // allow-investor-boundary: "reject_exception" reason: "negative-assertion fixture shared by both e2e lanes"
  "pause_managed",
];

/** A Signal exception category that must reach the handler (past both gates). */
export const SIGNAL_EXCEPTION_RESOLUTION = "update_profile";
