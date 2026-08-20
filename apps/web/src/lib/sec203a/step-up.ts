/**
 * Backend-adjudicated control-flow responses: `STEP_UP_REQUIRED` and
 * `ACKNOWLEDGMENT_REQUIRED`.
 *
 * Source of truth: Daniel's written reply 2026-08-17, recorded in
 *   docs/phase2-7-daniel-contract-mechanics-resolution.md §4 and §5
 *   (closes D-014 and D-015), and his reply 2026-08-19, recorded in
 *   docs/phase2-7-daniel-connection-mechanics-resolution.md §4 (closes D-019).
 *
 * ─── The two loops take OPPOSITE idempotency-key rules ─────────────────────
 *
 * This is the one place the two are easy to conflate, so it is stated once:
 *
 *   STEP_UP_REQUIRED         retry with the SAME key — the challenge is bound
 *                            to it, and the request body is unchanged.
 *   ACKNOWLEDGMENT_REQUIRED  retry with a NEW key — the body now carries the
 *                            continuation and consent-receipt references, so
 *                            it is a different request.
 *
 * Same-shaped 409s, opposite rules, and the reason is the same in both: a key
 * identifies a REQUEST, not a user intention. Getting it backwards on the
 * acknowledgment loop is rejected as IDEMPOTENCY_KEY_REUSED.
 *
 * Both are NORMAL CONTROL FLOW, not error states. Neither may surface as a
 * generic failure, and neither may be resolved by an HTTP retry layer — that
 * would collide with the "no blind mutation retry" rule (July direction §3).
 *
 * The governing rule for both: THE FRONTEND DOES NOT PRE-CLASSIFY. It does not
 * decide whether a preference change is trading-expanding, and it does not
 * decide whether an action needs step-up. It submits, and reacts to what the
 * backend answers. Daniel: "the backend will re-evaluate the policy on the
 * final mutation, so the frontend should not independently classify a change as
 * restrictive or expanding."
 */
import { z } from "zod";
import type { InvestorAdminVerb } from "./admin-verbs";

// ─── ACKNOWLEDGMENT_REQUIRED (409 on PATCH /preferences) ───────────────────

export const ACKNOWLEDGMENT_REQUIRED = "ACKNOWLEDGMENT_REQUIRED" as const;

/**
 * Returned as HTTP **409** when a proposed preference change expands trading
 * and lacks the required current acknowledgment. The mutation makes NO change.
 *
 * Resolution loop (all three steps backend-adjudicated):
 *   1. PATCH /preferences                    → 409 + this payload
 *   2. disclosure flow → POST /consents      → consent receipt
 *   3. retry the SAME preference change, carrying the consent-receipt ref,
 *      under a NEW `Idempotency-Key` (Daniel 2026-08-19 — closes D-019)
 *
 * Step 3's key rule is not a detail. The final PATCH carries the continuation
 * and consent-receipt references, so it is a DIFFERENT request from the one
 * that 409'd — replaying the original key against a changed body is rejected
 * as IDEMPOTENCY_KEY_REUSED. Exact retries of that final PATCH (a timeout, a
 * dropped connection) reuse its new key, which is what makes the retry safe.
 *
 * The disclosure identity is key + version + hash together; acknowledging by
 * key alone is insufficient.
 */
export interface AcknowledgmentRequired {
  code: typeof ACKNOWLEDGMENT_REQUIRED;
  /** Version of the backend policy that classified the change. */
  policy_version: string;
  /** The disclosure that must be acknowledged — all three fields bind it. */
  disclosure_key: string;
  disclosure_version: string;
  disclosure_hash: string;
  effective_date: string;
  /** Carry this through the disclosure flow into the retry. */
  continuation_reference: string;
  correlation_id: string;
}

export const acknowledgmentRequiredSchema = z.object({
  code: z.literal(ACKNOWLEDGMENT_REQUIRED),
  policy_version: z.string(),
  disclosure_key: z.string(),
  disclosure_version: z.string(),
  disclosure_hash: z.string(),
  effective_date: z.string(),
  continuation_reference: z.string(),
  correlation_id: z.string(),
});

export function isAcknowledgmentRequired(
  value: unknown,
): value is AcknowledgmentRequired {
  return acknowledgmentRequiredSchema.safeParse(value).success;
}

/**
 * Returned by investor-api when an `Idempotency-Key` is replayed against a
 * request that is not byte-identical to the one it was issued for.
 *
 * The frontend cannot pre-empt this and must not retry through it: it means a
 * key was reused for a changed body, which is a caller defect, not a transient
 * failure. Daniel 2026-08-19, on the acknowledgment loop specifically:
 * "Reusing the original key with the changed request is rejected as
 * IDEMPOTENCY_KEY_REUSED."
 */
export const IDEMPOTENCY_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED" as const;

/**
 * Which idempotency key the continuation of a 409 loop must carry.
 *
 * Exists so the two rules are read from one place rather than remembered. The
 * distinction is the request body: step-up replays an unchanged request after
 * a fresh authentication, while the acknowledgment retry adds the continuation
 * and consent-receipt references and is therefore a new request.
 */
export function continuationIdempotencyKeyRule(
  code: typeof ACKNOWLEDGMENT_REQUIRED | typeof STEP_UP_REQUIRED,
): "new" | "same" {
  return code === ACKNOWLEDGMENT_REQUIRED ? "new" : "same";
}

// ─── STEP_UP_REQUIRED ──────────────────────────────────────────────────────

export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED" as const;

/**
 * Returned when the underlying authentication is too old for the requested
 * action. The challenge is bound to user, account, action, AND idempotency key.
 *
 * Resolution: the BFF performs FRESH authentication through `identity-ccid`,
 * then retries with an assertion carrying the new underlying `auth_time` and
 * the SAME `Idempotency-Key` (the challenge is bound to it).
 *
 * SAME key here, NEW key on the acknowledgment loop — because this retry
 * resubmits an unchanged body, and that one does not.
 *
 * Daniel, explicitly: "Merely minting a new BFF assertion from an old session
 * does not satisfy step-up." The `auth_time` claim must reflect the underlying
 * user authentication, never the mint time.
 */
export interface StepUpRequired {
  code: typeof STEP_UP_REQUIRED;
  challenge_id: string;
  expires_at: string;
  correlation_id: string;
}

export const stepUpRequiredSchema = z.object({
  code: z.literal(STEP_UP_REQUIRED),
  challenge_id: z.string(),
  expires_at: z.string(),
  correlation_id: z.string(),
});

export function isStepUpRequired(value: unknown): value is StepUpRequired {
  return stepUpRequiredSchema.safeParse(value).success;
}

/**
 * Maximum age of the underlying `auth_time` that investor-api accepts for a
 * step-up-gated action, in seconds. Ten minutes, per Daniel 2026-08-17 §5.
 *
 * This is BACKEND-ENFORCED. It is recorded here as documentation and for
 * pre-emptive UX (e.g. warning that re-authentication is imminent). The
 * frontend must never gate an action on it locally — investor-api's
 * `STEP_UP_REQUIRED` is the only authority.
 *
 * Distinct from the BFF user-assertion TTL (2 minutes, D-017): those are two
 * different clocks. A freshly minted, perfectly valid assertion can still carry
 * a 40-minute-old `auth_time` and be rejected.
 */
export const STEP_UP_MAX_AUTH_TIME_AGE_SECONDS = 600;

/**
 * Reference matrix — which Managed-contract actions require step-up.
 * Documentation-grade only; investor-api decides. Signal-only release requires
 * step-up for NOTHING beyond a valid authenticated session.
 *
 * Organizing principle: RELAXING a control requires step-up; TIGHTENING never
 * does.
 *
 * `join_template` is the mode-dependent case — it requires step-up only when
 * the join activates Managed automation, which the frontend cannot determine.
 * It is marked `conditional` for exactly that reason.
 */
export type StepUpRequirement = "required" | "not-required" | "conditional";

export const MANAGED_STEP_UP_MATRIX: Record<
  InvestorAdminVerb,
  StepUpRequirement
> = {
  // Relaxations.
  resume_autopilot: "required",
  // reduce_only: required to DISABLE (relaxation), not to enable (tightening).
  reduce_only: "conditional",
  // Required only when the join activates Managed automation.
  join_template: "conditional",
  // Tightenings and neutral actions.
  pause_autopilot: "not-required",
  leave_template: "not-required",
};

/**
 * A trading-expanding preference change in Managed mode also requires step-up,
 * on top of the ACKNOWLEDGMENT_REQUIRED disclosure loop above. It is not in the
 * matrix because preferences do not travel `/actions`.
 *
 * The future `liquidate_all` requires step-up as well; it is absent from the
 * matrix because it is not an allowlisted verb (see ForbiddenInvestorAdminVerb).
 */
export const PREFERENCE_CHANGE_STEP_UP_NOTE =
  "Trading-expanding preference changes in Managed mode require step-up in addition to disclosure re-acknowledgment. Restrictive changes require neither.";
