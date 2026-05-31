/**
 * InvestorAdminVerb — the snake_case verb vocabulary Daniel's backend
 * `POST /api/v1/accounts/{id}/admin-actions` endpoint accepts from BFF.
 *
 * Source of truth: Daniel authoritative
 *   refinity-main-main-1/apps/admin-portal/backend/api/accounts.py
 *   ACCOUNT_ADMIN_ACTIONS (7 verbs total).
 *
 * Contract V3 §13.3 narrows the investor-visible subset to 6 — `force_rebuild`
 * is operator-only and must never reach the BFF investor surface.
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

export const INVESTOR_ADMIN_VERBS = [
  "pause_autopilot",
  "resume_autopilot",
  "join_template",
  "leave_template",
  "update_prefs",
  "liquidate_all",
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
 * The remaining names appear in Contract V3 §13.3's explicit denylist.
 */
export type ForbiddenInvestorAdminVerb =
  | "force_rebuild"
  | "rebalance"
  | "manual_rebalance"
  | "template.admin"
  | "staff_approve"
  | "founder_approve"
  | "support_advise"
  | "investor_accept";

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
 * When a BFF route translates an investor action into a backend admin-actions
 * call, it MUST read the verb from this map rather than passing a string
 * literal.
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
