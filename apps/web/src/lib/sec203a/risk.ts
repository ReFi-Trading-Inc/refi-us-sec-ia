/**
 * Risk domain — typed surface for Daniel's `RiskLimits` and `RiskSnapshots`
 * tables. Source of truth: refinity-main-main-1/docs/authoritative/spanner_ddl_all.txt
 *   - RiskLimits (line 1922-1932) — account-scoped policy
 *   - RiskSnapshots (line 497-507) — per-intent immutable decision evidence
 *
 * SEC posture (why these are non-optional, not just hygiene):
 *   - RiskLimits is part of the firm's disclosure to the investor about
 *     guardrails on their managed account (Form ADV §17; IA Act §206).
 *   - RiskSnapshots is the per-decision evidence required under 17 CFR
 *     275.204-2 (Books & Records) — every advisory decision must be
 *     reconstructable from immutable artifacts.
 *
 * Decision semantics (Contract V3 §7.5a + FIC §253-309):
 *   - Decisions are BINARY: "approved" | "rejected".
 *   - No "needs_review", "deny", "flag", "pending", or REVIEW/DENY partition.
 *   - `reasons` are only populated when decision === "rejected".
 *
 * Naming distinction:
 *   - This module declares the wire/storage shape (snake_case fields match
 *     Daniel's DDL where applicable; camelCase TypeScript fields with explicit
 *     mapping where ergonomic).
 *   - Investor-visible labels for these objects live in UI copy, not here.
 */
import { z } from "zod";
import {
  decimalStringRefiner,
  decimalStringMessage,
  type DecimalString,
} from "./decimal";

// ─── Decision enum (binary) ─────────────────────────────────────────────────

export const RISK_DECISIONS = ["approved", "rejected"] as const;

export type RiskDecision = (typeof RISK_DECISIONS)[number];

export const riskDecisionSchema = z.enum(RISK_DECISIONS);

export function isRiskDecision(value: unknown): value is RiskDecision {
  return (
    typeof value === "string" &&
    (RISK_DECISIONS as readonly string[]).includes(value)
  );
}

/**
 * Decision values the BFF must reject — these would re-introduce a
 * REVIEW/DENY partition Daniel's contract explicitly forbids.
 * Compile-time disjointness proof below.
 */
export type ForbiddenRiskDecision =
  | "needs_review"
  | "review"
  | "deny"
  | "denied"
  | "flag"
  | "flagged"
  | "pending"
  | "hold"
  | "manual_review";

type _ForbiddenIsNotAllowed = ForbiddenRiskDecision & RiskDecision;
type _Assert<T extends never> = T;
type _Check = _Assert<_ForbiddenIsNotAllowed>;

// ─── RiskLimits (account-scoped policy) ─────────────────────────────────────

/**
 * Per-account risk policy. FLOAT64 pcts in Spanner; we keep them as `number`
 * on the frontend (percentages aren't precision-sensitive in the same way
 * money is). Money-bearing values inside the JSON sub-objects use
 * DecimalString.
 */
export interface RiskLimits {
  accountId: string;
  /** Cap on total absolute exposure as a fraction of account value. */
  maxGrossExposurePct: number;
  /** Cap on net long-minus-short exposure as a fraction of account value. */
  maxNetExposurePct: number;
  /** Cap on any single instrument as a fraction of account value. */
  maxSingleNamePct: number;
  /** Cap on any single GICS sector as a fraction of account value. */
  maxSectorPct: number;
  varConfig?: RiskVarConfig;
  orderLimits?: RiskOrderLimits;
  staleness?: RiskStaleness;
  compliance?: RiskCompliance;
}

export interface RiskVarConfig {
  /** Historical lookback window for VaR estimation (trading days). */
  lookbackDays: number;
  /** Confidence level, e.g. "0.95", "0.99". DecimalString to avoid 0.95000000001 noise. */
  confidence: DecimalString;
  /** Maximum permitted 1-day VaR as a fraction of account value. */
  maxOneDayVarPct: DecimalString;
}

export interface RiskOrderLimits {
  /** Maximum single-order notional value (USD). */
  maxOrderNotional: DecimalString;
  /** Maximum single-order quantity. */
  maxOrderQty?: DecimalString;
  /** Per-day aggregate notional cap (USD). */
  maxDailyNotional?: DecimalString;
}

export interface RiskStaleness {
  /** Maximum age in seconds for a price input before risk gate rejects. */
  maxPriceAgeSec: number;
  /** Maximum age in seconds for a positions snapshot before risk gate rejects. */
  maxPositionsAgeSec: number;
}

export interface RiskCompliance {
  /** Account-scoped instrument restrictions (asset ids the investor cannot hold). */
  blockedAssetIds: string[];
  /** GICS sectors the investor has excluded. */
  blockedSectors: string[];
  /** Free-form restriction notes for advisor review (NOT shown to investor). */
  notes?: string;
}

const decimalString = z
  .string()
  .refine(decimalStringRefiner, { message: decimalStringMessage("value") });

export const riskVarConfigSchema: z.ZodType<RiskVarConfig> = z.object({
  lookbackDays: z.number().int().positive(),
  confidence: decimalString as unknown as z.ZodType<DecimalString>,
  maxOneDayVarPct: decimalString as unknown as z.ZodType<DecimalString>,
});

export const riskOrderLimitsSchema: z.ZodType<RiskOrderLimits> = z.object({
  maxOrderNotional: decimalString as unknown as z.ZodType<DecimalString>,
  maxOrderQty: (
    decimalString as unknown as z.ZodType<DecimalString>
  ).optional(),
  maxDailyNotional: (
    decimalString as unknown as z.ZodType<DecimalString>
  ).optional(),
});

export const riskStalenessSchema: z.ZodType<RiskStaleness> = z.object({
  maxPriceAgeSec: z.number().int().nonnegative(),
  maxPositionsAgeSec: z.number().int().nonnegative(),
});

export const riskComplianceSchema: z.ZodType<RiskCompliance> = z.object({
  blockedAssetIds: z.array(z.string()),
  blockedSectors: z.array(z.string()),
  notes: z.string().optional(),
});

export const riskLimitsSchema: z.ZodType<RiskLimits> = z.object({
  accountId: z.string().min(1),
  maxGrossExposurePct: z.number().nonnegative().max(10),
  maxNetExposurePct: z.number().min(-10).max(10),
  maxSingleNamePct: z.number().nonnegative().max(1),
  maxSectorPct: z.number().nonnegative().max(1),
  varConfig: riskVarConfigSchema.optional(),
  orderLimits: riskOrderLimitsSchema.optional(),
  staleness: riskStalenessSchema.optional(),
  compliance: riskComplianceSchema.optional(),
});

// ─── RiskSnapshot (per-intent immutable evidence) ───────────────────────────

/**
 * Immutable evidence of the risk gate's decision for a single account intent.
 * Primary key is `intentId` (in Daniel's DDL too); a second write with the
 * same intentId must be rejected.
 *
 * `reasons` is non-empty iff decision === "rejected". `snapshot` is the
 * frozen JSON input set the gate saw (positions, limits, prices, VaR
 * inputs). `snapshotHash` is the SHA-256 of `snapshot` for tamper detection.
 */
export interface RiskSnapshot {
  intentId: string;
  accountId: string;
  decision: RiskDecision;
  /** Frozen input set the gate evaluated. Opaque JSON; do not rely on shape. */
  snapshot: Record<string, unknown>;
  /** SHA-256 hex of the canonicalized snapshot, for tamper detection. */
  snapshotHash: string;
  correlationId: string;
  assessedAt: string;
  /** Rejection reasons. MUST be empty when decision === "approved". */
  reasons: string[];
}

export const riskSnapshotSchema: z.ZodType<RiskSnapshot> = z
  .object({
    intentId: z.string().min(1),
    accountId: z.string().min(1),
    decision: riskDecisionSchema,
    snapshot: z.record(z.string(), z.unknown()),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/, {
      message: "snapshotHash must be 64-char lowercase hex (SHA-256).",
    }),
    correlationId: z.string().min(1),
    assessedAt: z.string().datetime(),
    reasons: z.array(z.string()),
  })
  .refine((s) => (s.decision === "approved" ? s.reasons.length === 0 : true), {
    message: "Approved snapshots must have empty reasons[].",
    path: ["reasons"],
  })
  .refine((s) => (s.decision === "rejected" ? s.reasons.length > 0 : true), {
    message: "Rejected snapshots must have at least one reason.",
    path: ["reasons"],
  });
