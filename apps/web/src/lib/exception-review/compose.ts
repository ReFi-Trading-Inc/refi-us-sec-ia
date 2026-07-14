/**
 * Exception Review composer — PR-H (Sprint 4).
 *
 * Reframes Exception Review to compose exceptions from exactly four
 * sources, per Sprint Plan v3 §Sprint 4:
 *
 *   1. TradingControlStates — active autopilot pause, reduce_only, halt
 *   2. Blocked orders — upstream OrdersBlocked (policy conflicts, buying
 *      power, etc.) surfaced as investor-resolvable exceptions
 *   3. Reconciliation discrepancies — mismatches surfaced by the
 *      reconciliation projection
 *   4. BFF gates — expired disclosure, stale advisory profile, changed
 *      preference that needs re-ack (owned by the BFF, not upstream)
 *
 * **Risk-rejected intents are explicitly excluded.** Per the boundary
 * they route to the Records Center as terminal evidence, never to
 * Exception Review. Even if an upstream item claims kind
 * `out_of_policy_intent` (the legacy label) the composer drops it — the
 * boundary is enforced by construction here, not by presentation.
 *
 * Resolution paths per kind (contract assertion):
 *   - trading_controls → resolve via pause/resume or update_prefs
 *   - blocked_order    → resolve via update_prefs or dismiss
 *   - reconciliation   → resolve via reconnect_broker or acknowledge
 *   - bff_gate         → resolve via acknowledge_disclosure /
 *                        update_profile / reconnect_broker
 */

export const EXCEPTION_SOURCE_KINDS = [
  "trading_controls",
  "blocked_order",
  "reconciliation",
  "bff_gate",
] as const;

export type ExceptionSourceKind = (typeof EXCEPTION_SOURCE_KINDS)[number];

/** Kinds that must NEVER appear in Exception Review; they belong in
 *  Records Center as terminal evidence. This is the boundary the
 *  composer enforces regardless of upstream input. */
export const RECORDS_CENTER_TERMINAL_KINDS = new Set<string>([
  "out_of_policy_intent",
  "risk_rejected_intent",
  "risk_decision_terminal",
]);

/**
 * Resolution categories permitted per source kind. Any resolution
 * outside this map is rejected at the `/exceptions/[id]/resolve` route.
 * Contract assertion covers this in scripts/contract-assertions.ts.
 */
// Note: legacy backend resolution labels are investor-boundary-forbidden
// as UI copy per the tripwire, but they are the authoritative resolution
// categories in ExceptionResolutions. The mapping below uses the backend
// labels; the UI surface aliases them to investor-safe copy at render,
// matching the pattern in packages/api-clients/src/hooks/exceptions.ts.
export const RESOLUTION_PATHS_BY_SOURCE: Record<
  ExceptionSourceKind,
  readonly string[]
> = {
  trading_controls: ["pause_managed", "update_profile"],
  blocked_order: ["update_profile", "reject_exception"], // allow-investor-boundary: "reject_exception" reason: "backend resolution label; UI aliases per packages/api-clients/src/hooks/exceptions.ts"
  reconciliation: ["reconnect_broker", "acknowledge_disclosure"],
  bff_gate: [
    "acknowledge_disclosure",
    "update_profile",
    "reconnect_broker",
    "pause_managed",
  ],
} as const;

export interface ComposedException {
  exceptionId: string;
  accountId: string;
  sourceKind: ExceptionSourceKind;
  summary: string;
  openedAt: string;
  correlationRef?: string;
  intentRef?: string;
  orderRef?: string;
  reconciliationRunRef?: string;
}

/**
 * Filter that drops any item whose kind belongs to the Records Center
 * terminal set. Used by both the composer output pipeline and the
 * contract test, so drift in one is caught by the other.
 */
export function isRecordsCenterTerminal(kind: string): boolean {
  return RECORDS_CENTER_TERMINAL_KINDS.has(kind);
}

/**
 * True if the resolution category is permitted for the given source
 * kind. This is the invariant `/exceptions/[id]/resolve` enforces.
 */
export function isValidResolutionFor(
  sourceKind: ExceptionSourceKind,
  resolution: string,
): boolean {
  const allowed: readonly string[] = RESOLUTION_PATHS_BY_SOURCE[sourceKind];
  return allowed.includes(resolution);
}
