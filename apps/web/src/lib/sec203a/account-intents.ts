/**
 * AccountIntents domain — typed surface for Daniel's `AccountIntents` table.
 * Source of truth:
 *   refinity-main-main-1/docs/authoritative/spanner_ddl_all.txt line 74-94
 *   refinity-main-main-1/apps/account-intent-builder/src/domain/{models,builder}.py
 *   refinity-main-main-1/docs/authoritative/{trade_lifecycle_contract,trade_auditability_contract}.md
 *
 * What an AccountIntent is:
 *   - The immutable record produced by Account Intent Builder when a Portfolio
 *     Engine action is translated to an account-specific set of trade legs.
 *   - The lifecycle root: RiskSnapshots, ExecutionPlans, Orders, OrderEvents,
 *     and Fills all reference back via `intent_id`.
 *
 * SEC posture:
 *   - AccountIntents is the artifact that proves "what the firm intended on
 *     behalf of this account at this moment" — the bridge between the signed
 *     standing authorization (Execution Policy, BFF-owned) and the executed
 *     orders (Daniel-owned). Required for Books & Records reconstruction
 *     under 17 CFR 275.204-2.
 *
 * Hard constraints (enforced by this module + contract assertions):
 *   - The frontend NEVER creates intents. Backend Account Intent Builder is
 *     the sole writer. The prototype-store entity exists for fixture seeding
 *     and dual-read; no BFF route accepts a write from investor input.
 *   - Status is closed-set: ready | blocked | empty | invalid. No REVIEW /
 *     DENY / NEEDS_REVIEW partition (matches Risk decision posture).
 *   - `blocked_reason` is non-null IFF status === "blocked".
 *   - Identity hashes (`legs_hash`, `action_id`) are SHA-256 hex (64 chars).
 *   - Money fields on legs are DecimalString.
 *
 * Naming distinction: this declares Daniel's WIRE shape. A
 * `StoredAccountIntent` in the prototype-store entity wraps this with BFF
 * metadata (correlation pinning, optional BFF-only reference to a local
 * Execution Policy version) — the wire shape stays pure.
 */
import { z } from "zod";
import {
  decimalStringRefiner,
  decimalStringMessage,
  type DecimalString,
} from "./decimal";

// ─── Enums (closed sets) ────────────────────────────────────────────────────

/**
 * Status enum per Account Intent Builder models.py + builder.py:
 *   - `ready`    — intent is valid and ready for downstream RiskEngine
 *   - `blocked`  — gating failure; `blockedReason` populated
 *   - `empty`    — no legs (zero-weight or all-dropped)
 *   - `invalid`  — failed validation
 */
export const ACCOUNT_INTENT_STATUSES = [
  "ready",
  "blocked",
  "empty",
  "invalid",
] as const;

export type AccountIntentStatus = (typeof ACCOUNT_INTENT_STATUSES)[number];

export const accountIntentStatusSchema = z.enum(ACCOUNT_INTENT_STATUSES);

export function isAccountIntentStatus(
  value: unknown,
): value is AccountIntentStatus {
  return (
    typeof value === "string" &&
    (ACCOUNT_INTENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Status values the BFF must reject — would re-introduce a REVIEW/DENY
 * partition Daniel's contract forbids (parallels ForbiddenRiskDecision).
 */
export type ForbiddenAccountIntentStatus =
  | "needs_review"
  | "review"
  | "deny"
  | "denied"
  | "flag"
  | "flagged"
  | "pending"
  | "hold"
  | "manual_review"
  | "approved"
  | "rejected";

type _StatusForbiddenIsNotAllowed = ForbiddenAccountIntentStatus &
  AccountIntentStatus;
type _Assert<T extends never> = T;
type _StatusCheck = _Assert<_StatusForbiddenIsNotAllowed>;

/**
 * IntentKind per models.py lines 8-13. STRING(16) in DDL.
 */
export const ACCOUNT_INTENT_KINDS = [
  "rebalance",
  "signal_flip",
  "liquidate_all",
] as const;

export type AccountIntentKind = (typeof ACCOUNT_INTENT_KINDS)[number];

export const accountIntentKindSchema = z.enum(ACCOUNT_INTENT_KINDS);

/**
 * Leg side per models.py line 35.
 */
export const ACCOUNT_INTENT_LEG_SIDES = [
  "buy",
  "sell",
  "sell_short",
  "buy_to_cover",
] as const;

export type AccountIntentLegSide = (typeof ACCOUNT_INTENT_LEG_SIDES)[number];

export const accountIntentLegSideSchema = z.enum(ACCOUNT_INTENT_LEG_SIDES);

// ─── Hash helpers ───────────────────────────────────────────────────────────

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const sha256HexSchema = z.string().regex(SHA256_HEX_RE, {
  message: "must be 64-char lowercase hex (SHA-256)",
});

// ─── Leg shape ──────────────────────────────────────────────────────────────

/**
 * Per-leg shape. Money fields use DecimalString to preserve precision through
 * the wire boundary; the Python backend currently stores them as FLOAT64 but
 * the audit/reconciliation posture is exact-decimal. `rounding` and
 * `constraints_hint` are unspecified-shape per Daniel's docs — typed as
 * opaque records so we don't lock in a shape that doesn't exist yet.
 */
export interface AccountIntentLeg {
  assetId: string;
  legIndex: number;
  /** Target portfolio weight (fraction of NAV). */
  targetWeight: number;
  /** -1 short, 0 flat, 1 long. */
  direction: -1 | 0 | 1;
  targetNotional: DecimalString;
  currentNotionalEst: DecimalString;
  deltaNotional: DecimalString;
  deltaQtyEst: DecimalString;
  side: AccountIntentLegSide;
  priceEst: DecimalString;
  /** Opaque rounding metadata; structure not yet specified in Daniel's docs. */
  rounding?: Record<string, unknown>;
  /** Opaque constraint hint metadata; structure not yet specified. */
  constraintsHint?: Record<string, unknown>;
  reasonCodes: string[];
  dependsOnLegIndex?: number;
  /** Source signal stream ids (e.g. ["AAPL~rf", "AAPL~rl"]). */
  sourceStreams: string[];
  /** Per-stream contributions. Opaque shape per FIC §116-117. */
  streamContributions: Array<Record<string, unknown>>;
}

const decimalString = z
  .string()
  .refine(decimalStringRefiner, { message: decimalStringMessage("value") });

const decimal = decimalString as unknown as z.ZodType<DecimalString>;

export const accountIntentLegSchema: z.ZodType<AccountIntentLeg> = z.object({
  assetId: z.string().min(1),
  legIndex: z.number().int().nonnegative(),
  targetWeight: z.number(),
  direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  targetNotional: decimal,
  currentNotionalEst: decimal,
  deltaNotional: decimal,
  deltaQtyEst: decimal,
  side: accountIntentLegSideSchema,
  priceEst: decimal,
  rounding: z.record(z.string(), z.unknown()).optional(),
  constraintsHint: z.record(z.string(), z.unknown()).optional(),
  reasonCodes: z.array(z.string()),
  dependsOnLegIndex: z.number().int().nonnegative().optional(),
  sourceStreams: z.array(z.string()),
  streamContributions: z.array(z.record(z.string(), z.unknown())),
});

// ─── AccountIntent shape ────────────────────────────────────────────────────

/**
 * Wire shape mirroring Daniel's `AccountIntents` row. `summaryJson` and the
 * per-leg `rounding`/`constraintsHint` carry opaque shapes — Daniel's docs do
 * not yet pin them, and we refuse to invent them.
 *
 * Identity hashes:
 *   - `actionId` — SHA-256 hex (DDL declares STRING(64), code emits hex).
 *   - `legsHash` — SHA-256 hex of the canonicalized legs JSON.
 */
export interface AccountIntent {
  intentId: string;
  accountId: string;
  status: AccountIntentStatus;
  templateId: string;
  templateVersion: string;
  /** SHA-256 hex; deterministic per Portfolio Engine action. */
  actionId: string;
  intentKind: AccountIntentKind;
  /** ISO-8601 timestamp; corresponds to Spanner `ts`. */
  ts: string;
  /**
   * Non-null IFF `status === "blocked"`. Known values include
   * "AUTOPILOT_DISABLED" and "MISSING_CONSENT:{consent_key}"; other values
   * may be added by the backend.
   */
  blockedReason?: string;
  legs: AccountIntentLeg[];
  /** Operator-facing notional summary; opaque to investor surface. */
  summaryJson: Record<string, unknown>;
  /** SHA-256 hex of canonicalized legs JSON. */
  legsHash: string;
  correlationId: string;
}

export const accountIntentSchema: z.ZodType<AccountIntent> = z
  .object({
    intentId: z.string().min(1),
    accountId: z.string().min(1),
    status: accountIntentStatusSchema,
    templateId: z.string().min(1),
    templateVersion: z.string().min(1),
    actionId: sha256HexSchema,
    intentKind: accountIntentKindSchema,
    ts: z.iso.datetime(),
    blockedReason: z.string().min(1).optional(),
    legs: z.array(accountIntentLegSchema),
    summaryJson: z.record(z.string(), z.unknown()),
    legsHash: sha256HexSchema,
    correlationId: z.string().min(1),
  })
  .refine(
    (i) => (i.status === "blocked" ? i.blockedReason !== undefined : true),
    {
      message: "status='blocked' requires blockedReason.",
      path: ["blockedReason"],
    },
  )
  .refine(
    (i) => (i.status !== "blocked" ? i.blockedReason === undefined : true),
    {
      message: "blockedReason is only valid when status='blocked'.",
      path: ["blockedReason"],
    },
  );
