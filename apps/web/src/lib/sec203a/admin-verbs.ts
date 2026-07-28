/**
 * InvestorAdminVerb — the snake_case verb vocabulary Daniel's backend accepts
 * from the BFF at
 *   `POST /api/v1/investor/accounts/{account_id}/actions`
 * on the dedicated `investor-api` service.
 *
 * Source of truth: Daniel's written direction 2026-07-28, recorded in
 *   docs/phase2-7-daniel-direction-resolution.md §5.
 *
 * The endpoint re-authorizes account ownership, applies current eligibility /
 * consent / control gates, requires step-up auth where appropriate, enforces
 * idempotency, and writes an investor action receipt BEFORE publishing an
 * approved backend command.
 *
 * NOTE — this is NOT the Admin Portal `/admin-actions` route. Daniel rejected
 * the Admin Portal as the investor boundary on 2026-07-28; it is a privileged
 * operator surface. The prior anchor
 * (`refinity-main/apps/admin-portal/backend/api/accounts.py ACCOUNT_ADMIN_ACTIONS`)
 * is retained only as historical lineage for the verb spellings.
 *
 * This module is the ONE place the allowlist lives. Routes that translate an
 * InvestorActionName into an admin-actions verb must import from here, and the
 * contract-assertions tripwire reads from here so the literal cannot drift.
 *
 * Naming distinction (durable):
 *   - InvestorActionName (../sec203a/actions): camelCase, frontend audit
 *     vocabulary (e.g. `pauseManaged`, `updateAccountPrefs`).
 *   - InvestorAdminVerb (this file): snake_case, Daniel's backend wire
 *     vocabulary (e.g. `pause_autopilot`, `update_prefs`).
 *   The mapping below is partial: not every investor action translates to a
 *   backend admin-actions call (e.g. `acknowledgeDisclosure` is BFF-only).
 */
import { z } from "zod";
import type { InvestorActionName } from "./actions";

// ─── Allowlist ──────────────────────────────────────────────────────────────

/**
 * The six investor-originable verbs approved by Daniel 2026-07-28.
 *
 * `reduce_only` and `pause_autopilot` are recorded backend-side as investor
 * *account-control requests*: the backend computes the strongest effective
 * control across investor, risk, reconciliation, broker, and operator sources.
 * An investor request can therefore never weaken a stronger restriction, and
 * `resume_autopilot` clears only the investor's own request.
 *
 * Both are gated to Managed **paper** trading for the initial release.
 */
export const INVESTOR_ADMIN_VERBS = [
  "pause_autopilot",
  "resume_autopilot",
  "join_template",
  "leave_template",
  "update_prefs",
  "reduce_only",
] as const;

export type InvestorAdminVerb = (typeof INVESTOR_ADMIN_VERBS)[number];

export const investorAdminVerbSchema = z.enum(INVESTOR_ADMIN_VERBS);

export function isInvestorAdminVerb(
  value: unknown,
): value is InvestorAdminVerb {
  return (
    typeof value === "string" &&
    (INVESTOR_ADMIN_VERBS as readonly string[]).includes(value)
  );
}

// ─── Forbidden (compile-time disjointness + runtime tripwire) ───────────────

/**
 * Backend-allowed verbs the BFF must NEVER emit on the investor surface.
 * `force_rebuild` is in Daniel's ACCOUNT_ADMIN_ACTIONS but is operator-only.
 *
 * `liquidate_all` is DEFERRED, not forbidden in principle (Daniel 2026-07-28).
 * It returns only once confirmation, current-position preview, step-up
 * authentication, idempotency, partial-fill, unknown-state, and
 * lifecycle-evidence scenarios all pass in paper testing. Listing it here makes
 * the deferral a compile-time guarantee rather than a review convention.
 *
 * Do NOT confuse this with `ACCOUNT_INTENT_KINDS` in ./account-intents, which
 * mirrors Daniel's backend `models.py` IntentKind enum and legitimately still
 * contains `liquidate_all` — the backend constructs liquidation intents; the
 * investor simply cannot originate one.
 *
 * The remaining names are the permanent exclusions: system-wide halts, direct
 * operator controls, reconciliation controls, manual rebalancing, force
 * rebuild, risk-limit changes, order fabrication, and risk-decision overrides.
 */
export type ForbiddenInvestorAdminVerb =
  | "force_rebuild"
  | "rebalance"
  | "manual_rebalance"
  | "template.admin"
  | "staff_approve"
  | "founder_approve"
  | "support_advise"
  | "investor_accept"
  | "liquidate_all";

// Compile-time proof allowlist and denylist are disjoint.
type _ForbiddenIsNotAllowed = ForbiddenInvestorAdminVerb & InvestorAdminVerb;
type _Assert<T extends never> = T;
type _Check = _Assert<_ForbiddenIsNotAllowed>;

// ─── Mapping: InvestorActionName → InvestorAdminVerb ────────────────────────

/**
 * Partial map: investor actions whose semantics correspond to a Daniel
 * admin-actions verb. Actions not in this map are BFF-only (e.g.
 * `acknowledgeDisclosure`, `saveExecutionPolicyDraft`) and never produce
 * an admin-actions call.
 *
 * When a BFF route translates an investor action into a backend investor-action
 * call, it MUST read the verb from this map rather than passing a string
 * literal.
 *
 * `join_template`, `leave_template`, and `reduce_only` are intentionally
 * unmapped: no `InvestorActionName` originates them yet. Template join/leave
 * lands with Surface 5 (Managed activation) and reduce-only with PR-H
 * (investor control requests). The map is `Partial` precisely so an approved
 * verb can exist ahead of the product action that emits it.
 */
export const INVESTOR_ACTION_TO_ADMIN_VERB: Partial<
  Record<InvestorActionName, InvestorAdminVerb>
> = {
  pauseManaged: "pause_autopilot",
  resumeManaged: "resume_autopilot",
  updateAccountPrefs: "update_prefs",
};

export function adminVerbFor(
  action: InvestorActionName,
): InvestorAdminVerb | undefined {
  return INVESTOR_ACTION_TO_ADMIN_VERB[action];
}
