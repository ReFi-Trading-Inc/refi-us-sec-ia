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

// ─── Route ──────────────────────────────────────────────────────────────────

/**
 * The account-scoped investor-api actions route. Daniel scopes by account in
 * the PATH; a session-implicit path is not acceptable outbound.
 *
 * Naming collision to keep straight: our browser-facing BFF routes are also
 * namespaced `/api/v1/investor/*`, and so is Daniel's service-facing prefix.
 * They are different hops. This constant is the OUTBOUND (investor-api) one.
 */
export function investorActionsRoute(accountId: string): string {
  return `/api/v1/investor/accounts/${encodeURIComponent(accountId)}/actions`;
}

/** Template form of the route above, for docs and assertions. */
export const INVESTOR_ACTIONS_ROUTE_TEMPLATE =
  "/api/v1/investor/accounts/{account_id}/actions";

// ─── Allowlist ──────────────────────────────────────────────────────────────

/**
 * The five investor-originable verbs the BFF may emit at `/actions`, per
 * Daniel 2026-07-28 as narrowed by his 2026-08-17 reply.
 *
 * `update_prefs` is deliberately NOT here. It remains a real backend action
 * kind — preference updates "create the same immutable action receipts" — but
 * Daniel 2026-08-17: they "should not be exposed as a second public write path
 * through `/actions`". The only public write path for preferences is
 * PATCH /api/v1/investor/accounts/{account_id}/preferences. See
 * RECEIPT_ONLY_ADMIN_VERBS below.
 *
 * `reduce_only` and `pause_autopilot` are recorded backend-side as investor
 * *account-control requests*: the backend computes the strongest effective
 * control across investor, risk, reconciliation, broker, and operator sources.
 * An investor request can therefore never weaken a stronger restriction, and
 * `resume_autopilot` clears only the investor's own request. Both are gated to
 * Managed **paper** trading for the initial release.
 */
export const INVESTOR_ADMIN_VERBS = [
  "pause_autopilot",
  "resume_autopilot",
  "join_template",
  "leave_template",
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

/**
 * Backend action-receipt kinds that the investor originates through a
 * DEDICATED route rather than `/actions`. They are neither allowlisted nor
 * forbidden: emitting them at `/actions` would duplicate a write path Daniel
 * explicitly closed (2026-08-17 §6), so no BFF route may construct one.
 */
export const RECEIPT_ONLY_ADMIN_VERBS = ["update_prefs"] as const;

export type ReceiptOnlyAdminVerb = (typeof RECEIPT_ONLY_ADMIN_VERBS)[number];

/** The dedicated preferences write path — the ONLY route that may change prefs. */
export const INVESTOR_PREFERENCES_ROUTE_TEMPLATE =
  "/api/v1/investor/accounts/{account_id}/preferences";

export function investorPreferencesRoute(accountId: string): string {
  return `/api/v1/investor/accounts/${encodeURIComponent(accountId)}/preferences`;
}

// Compile-time proof the dedicated-route verbs are not client-emittable.
type _ReceiptOnlyIsNotEmittable = ReceiptOnlyAdminVerb & InvestorAdminVerb;
type _CheckReceiptOnly = _Assert<_ReceiptOnlyIsNotEmittable>;

// ─── Release gating ─────────────────────────────────────────────────────────

/**
 * The subset enabled in `v1.0.0-dev.1` (Signal-only first release), per Daniel
 * 2026-08-17 §6. `pause_autopilot`, `resume_autopilot`, and `reduce_only` stay
 * unavailable until Managed paper.
 *
 * Note the shape of the gate: the `/actions` surface is NOT gated wholesale —
 * "the initial allowlist is simply limited to Signal-relevant actions, with no
 * path to broker submission."
 *
 * Step-up (Daniel 2026-08-17 §5) is required for NONE of these in Signal mode;
 * a valid authenticated session suffices. A trading-expanding preference change
 * still requires disclosure re-acknowledgment, but that travels the dedicated
 * preferences route, not this one.
 */
export const SIGNAL_RELEASE_ADMIN_VERBS = [
  "join_template",
  "leave_template",
] as const satisfies readonly InvestorAdminVerb[];

export type SignalReleaseAdminVerb =
  (typeof SIGNAL_RELEASE_ADMIN_VERBS)[number];

/** Approved, but gated until Managed paper trading. */
export const MANAGED_PAPER_GATED_ADMIN_VERBS = [
  "pause_autopilot",
  "resume_autopilot",
  "reduce_only",
] as const satisfies readonly InvestorAdminVerb[];

export function isSignalReleaseAdminVerb(
  value: unknown,
): value is SignalReleaseAdminVerb {
  return (
    typeof value === "string" &&
    (SIGNAL_RELEASE_ADMIN_VERBS as readonly string[]).includes(value)
  );
}

/** The release surface a deployment exposes. Server-resolved, never client. */
export type ReleaseStage = "signal" | "managed_paper";

/** Reason code returned when a verb is refused for the current release. */
export const GATED_UNTIL_MANAGED_PAPER = "gated_until_managed_paper" as const;

/**
 * Is this investor action refused by the current release surface?
 *
 * Drives real enforcement in `bffMutate` — a gated action is a 403 with an
 * immutable blocked receipt, not merely an absence from a documented list.
 * Actions that do not map to an `/actions` verb (BFF-only ones, and preference
 * updates, which travel their own route) are never gated by this rule.
 */
export function isGatedUntilManagedPaper(
  action: InvestorActionName,
  stage: ReleaseStage,
): boolean {
  if (stage === "managed_paper") return false;
  const verb = adminVerbFor(action);
  if (!verb) return false;
  return (MANAGED_PAPER_GATED_ADMIN_VERBS as readonly string[]).includes(verb);
}

// ─── Action parameters (Daniel 2026-08-17 §6) ───────────────────────────────

/**
 * The action wire shape uses the EXISTING action envelope — there is no
 * separate account-control request type (this closes the shape half of D-010).
 * Only the `parameters` payload differs by verb.
 *
 * Literal field spellings are verified against the exported `v1.0.0-dev.1`
 * contract on receipt; the shapes below are Daniel's prose, typed.
 */
export interface JoinTemplateParameters {
  template_id: string;
}

export interface LeaveTemplateParameters {
  template_id: string;
}

/**
 * `enabled: false` is a control RELAXATION and requires step-up in Managed
 * mode; `enabled: true` (tightening) does not. The frontend does not enforce
 * this — investor-api answers `STEP_UP_REQUIRED`.
 */
export interface ReduceOnlyParameters {
  enabled: boolean;
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
 *
 * `updateAccountPrefs` was mapped to `update_prefs` until 2026-08-17. Daniel's
 * reply closed that path: preference updates must not be a second public write
 * path through `/actions`. `updateAccountPrefs` now travels
 * `investorPreferencesRoute()` and MUST stay unmapped here — restoring the
 * mapping would re-open the duplicate write path.
 */
export const INVESTOR_ACTION_TO_ADMIN_VERB: Partial<
  Record<InvestorActionName, InvestorAdminVerb>
> = {
  pauseManaged: "pause_autopilot",
  resumeManaged: "resume_autopilot",
};

export function adminVerbFor(
  action: InvestorActionName,
): InvestorAdminVerb | undefined {
  return INVESTOR_ACTION_TO_ADMIN_VERB[action];
}

// ─── Receipt vocabulary (superset of the emittable allowlist) ───────────────

/**
 * Daniel 2026-08-17: preference updates "will create the same immutable action
 * receipts but should not be exposed as a second public write path through
 * `/actions`". The audit vocabulary and the emission allowlist therefore
 * diverge — a receipt may legitimately carry `update_prefs` even though no BFF
 * route may POST it to `/actions`.
 *
 * Use `receiptVerbFor` when labelling an audit record; use `adminVerbFor` when
 * constructing an outbound `/actions` call. Never substitute one for the other.
 */
export type InvestorActionReceiptVerb =
  | InvestorAdminVerb
  | ReceiptOnlyAdminVerb;

export const INVESTOR_ACTION_TO_RECEIPT_VERB: Partial<
  Record<InvestorActionName, InvestorActionReceiptVerb>
> = {
  ...INVESTOR_ACTION_TO_ADMIN_VERB,
  updateAccountPrefs: "update_prefs",
};

export function receiptVerbFor(
  action: InvestorActionName,
): InvestorActionReceiptVerb | undefined {
  return INVESTOR_ACTION_TO_RECEIPT_VERB[action];
}
