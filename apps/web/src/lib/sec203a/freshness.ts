/**
 * Recommendation freshness — BACKEND-OWNED.
 *
 * Source of truth: Daniel's written reply 2026-08-17, recorded in
 *   docs/phase2-7-daniel-contract-mechanics-resolution.md §3 (closes D-013).
 *
 * Daniel, verbatim: freshness "will be backend-owned and may vary by
 * strategy/source and market schedule. Please do not make the provisional
 * two-hour and 24-hour thresholds contract constants."
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DO NOT ADD A THRESHOLD CONSTANT TO THIS FILE OR ANY OTHER.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The Phase 2.5 provisional thresholds (fresh ≤ 2h, stale 2h–24h, blocked
 * > 24h) were never confirmed and are now formally dead. The frontend must not
 * compare `generatedAt` / `ts_utc` / `source_as_of` against the wall clock to
 * decide whether something is fresh. It DISPLAYS the fields below.
 *
 * Freshness tolerances vary per strategy, per source, and with the market
 * schedule; any client-side threshold would be wrong for some strategies and
 * silently wrong for all of them the moment the backend policy version changes.
 */
import { z } from "zod";

/**
 * `expired` is a freshness outcome. `blocked` is NOT — Daniel 2026-08-17:
 * "`blocked` remains an authorization, risk, or control outcome rather than a
 * freshness state." It lives on `RecommendationStatus` and must never be
 * derived from freshness.
 */
export const FRESHNESS_STATUSES = ["fresh", "stale", "expired"] as const;

export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number];

export const freshnessStatusSchema = z.enum(FRESHNESS_STATUSES);

/**
 * The freshness envelope carried by recommendation projections.
 *
 * Field names follow Daniel's snake_case wire spelling; they are verified
 * against the exported `v1.0.0-dev.1` contract on receipt.
 *
 * Orthogonality rule: `freshness_status` and `RecommendationStatus` are
 * independent axes. `open` + `stale` is valid. `blocked` + `fresh` is valid.
 * Rendering must not collapse them into one badge.
 */
export interface RecommendationFreshness {
  /** When the underlying source data was as-of. */
  source_as_of: string;
  /** When the backend last evaluated this recommendation. */
  last_evaluated_at: string;
  /** Backend-computed instant through which this stays `fresh`. */
  fresh_until: string;
  /** Backend-computed expiry. Not a client-evaluated deadline. */
  expires_at: string;
  /** Backend verdict. Display this; never compute it. */
  freshness_status: FreshnessStatus;
  /** Which backend freshness policy produced the verdict. */
  freshness_policy_version: string;
  /** Present when `freshness_status` is not `fresh`. */
  freshness_reason_codes?: string[];
}

export const recommendationFreshnessSchema = z.object({
  source_as_of: z.string(),
  last_evaluated_at: z.string(),
  fresh_until: z.string(),
  expires_at: z.string(),
  freshness_status: freshnessStatusSchema,
  freshness_policy_version: z.string(),
  freshness_reason_codes: z.array(z.string()).optional(),
});

/**
 * Read the backend verdict. This is deliberately a field read and not a
 * computation — it exists so call sites have something to import instead of
 * reaching for a date comparison.
 */
export function freshnessStatusOf(
  freshness: RecommendationFreshness,
): FreshnessStatus {
  return freshness.freshness_status;
}

export function isFresh(freshness: RecommendationFreshness): boolean {
  return freshness.freshness_status === "fresh";
}
