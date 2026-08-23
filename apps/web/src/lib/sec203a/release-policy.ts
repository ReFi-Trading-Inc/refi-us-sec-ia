/**
 * Release-stage capability policy — the server-side answer to
 * "is this investor-originated capability permitted at this release stage?"
 *
 * ─── Why this exists, and why it is not the old gate ───────────────────────
 *
 * The earlier design keyed on isGatedUntilManagedPaper(), whose reach is the
 * three-verb InvestorActionName → admin-verb mapping (pause_autopilot,
 * resume_autopilot, reduce_only). The C0 capability audit
 * (docs/releases/2026-09-signal/c0-capability-audit.md §5) showed that under-
 * covers the surface: execution-policy mutations, Managed exception
 * resolutions, and mode switching are all capability expansions with no gated
 * verb. That predicate survives as a consistency input; it is not the policy.
 *
 * ─── Default-deny, stated as the rule ──────────────────────────────────────
 *
 *   Signal may generate and manage advice.
 *   Signal may not create executable intent or cause broker mutation.
 *
 * At the signal stage an action is permitted only if it is EXPLICITLY on the
 * Signal allowlist. A new InvestorActionName is therefore denied at signal
 * until someone classifies it — the compile-time exhaustiveness proof below
 * forces that classification to happen in this file, not in production.
 */
import {
  InvestorActions,
  ExceptionResolutions,
  type InvestorActionName,
  type ExceptionResolution,
} from "./actions";

/** Mirrors the REFI_RELEASE_STAGE enum in config/env.ts. */
export type ReleaseStage = "signal" | "managed_paper";

/**
 * Actions available at the SIGNAL stage. Advice, consent, connection, and
 * remediation — nothing that authors, activates, or steers execution.
 *
 * resolveException is here because three of its resolution categories are
 * Signal remediation; the category-level split below is enforced separately
 * by the exceptions route. selectMode is NOT here: with one released product,
 * switching an account to "managed" is capability expansion
 * (decided 2026-08-22; see the open-items register).
 */
export const SIGNAL_ALLOWED_ACTIONS = [
  "updateAccountPrefs",
  "refreshProfile",
  "acknowledgeDisclosure",
  "connectBroker",
  "disconnectBroker",
  "resolveException",
  "dismissSignal",
  "saveSignal",
  "submitSupportRequest",
] as const;

/** Actions that exist only once Managed paper is enabled. */
export const MANAGED_PAPER_GATED_ACTIONS = [
  "activateExecutionPolicy",
  "updateExecutionPolicy",
  "saveExecutionPolicyDraft",
  "pauseManaged",
  "resumeManaged",
  "selectMode",
] as const;

type SignalAllowed = (typeof SIGNAL_ALLOWED_ACTIONS)[number];
type ManagedGated = (typeof MANAGED_PAPER_GATED_ACTIONS)[number];

// ─── Compile-time completeness + disjointness proofs ────────────────────────
// Same technique as ForbiddenRiskDecision in ./risk.ts: these lines fail to
// typecheck if the two sets overlap, or if any InvestorActionName is left
// unclassified. Adding an action to InvestorActions without classifying it
// here is a compile error, which is what makes the policy default-deny in
// practice and not just in prose.
type _Overlap = SignalAllowed & ManagedGated;
type _Unclassified = Exclude<InvestorActionName, SignalAllowed | ManagedGated>;
type _Assert<T extends never> = T;
type _CheckOverlap = _Assert<_Overlap>;
type _CheckComplete = _Assert<_Unclassified>;

export function isInvestorActionPermitted(
  action: InvestorActionName,
  stage: ReleaseStage,
): boolean {
  if (stage === "managed_paper") return true;
  return (SIGNAL_ALLOWED_ACTIONS as readonly string[]).includes(action);
}

// ─── Exception-resolution partition ─────────────────────────────────────────
// The resolve route accepts one action name but six resolution categories, and
// the categories cross the Signal/Managed boundary (C0 §3). The route enforces
// this partition BEFORE looking the exception up, so a gated category is
// refused identically whether or not the exception exists.

export const SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS = [
  "update_profile",
  "reconnect_broker",
  "acknowledge_disclosure",
] as const;

export const MANAGED_EXCEPTION_RESOLUTIONS = [
  "approve_exception",
  "reject_exception",
  "pause_managed",
] as const;

type SignalResolution = (typeof SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS)[number];
type ManagedResolution = (typeof MANAGED_EXCEPTION_RESOLUTIONS)[number];
type _ROverlap = SignalResolution & ManagedResolution;
type _RUnclassified = Exclude<
  ExceptionResolution,
  SignalResolution | ManagedResolution
>;
type _CheckROverlap = _Assert<_ROverlap>;
type _CheckRComplete = _Assert<_RUnclassified>;

export function isExceptionResolutionPermitted(
  resolution: ExceptionResolution,
  stage: ReleaseStage,
): boolean {
  if (stage === "managed_paper") return true;
  return (SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS as readonly string[]).includes(
    resolution,
  );
}

// Runtime mirrors of the compile-time proofs, so contract assertions can
// exercise them without type machinery.
export function unclassifiedInvestorActions(): string[] {
  const all = new Set<string>([
    ...SIGNAL_ALLOWED_ACTIONS,
    ...MANAGED_PAPER_GATED_ACTIONS,
  ]);
  return InvestorActions.filter((a) => !all.has(a));
}

export function unclassifiedExceptionResolutions(): string[] {
  const all = new Set<string>([
    ...SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS,
    ...MANAGED_EXCEPTION_RESOLUTIONS,
  ]);
  return ExceptionResolutions.filter((r) => !all.has(r));
}
