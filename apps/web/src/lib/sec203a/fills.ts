/**
 * Fills domain — typed surface for Daniel's `Fills` table. Each fill is one
 * piece of broker-reported execution evidence: qty filled, price filled,
 * fees, commission, and the broker's own execution identifier.
 *
 * Source of truth (GitLab refinity_dev/refinity-main @ 9f9dfc9):
 *   - DDL: docs/authoritative/spanner_ddl_all.txt:212-247 (table + 6 indexes)
 *   - Writer pattern (strictly append-only):
 *     apps/trade-manager/src/db.py:669-682 (record_fill — INSERT only)
 *     apps/trade-manager/src/pipeline.py:884-944, 1778-1788, 2908-2917
 *   - Dedup: db.py:466-495 (PK check + broker_execution_id uniqueness)
 *   - source values: pipeline.py:2908 ("webhook"/"poller"), :1778 ("reconciliation")
 *
 * SEC posture (17 CFR 275.204-2 Books & Records):
 *   Fills are the firm's evidence of what the broker actually executed.
 *   Combined with OrderEvents (lifecycle log) and BrokerOrderAttempts
 *   (per-call evidence), they let the firm reconstruct any order's
 *   execution path with broker-supplied facts.
 *
 * Hard constraints (enforced by this module + contract assertions):
 *   - PK is composite (order_id, fill_id) — the entity layer keys by both
 *     and rejects duplicate (order_id, fill_id) pairs.
 *   - Strictly append-only. Broker corrections or reconciliation
 *     corrections write NEW rows; existing rows never mutate.
 *   - Frontend NEVER creates fills. Trade Manager / reconciler are the
 *     sole writers (no Exec Gateway write path).
 *
 * Documented divergences from Daniel DDL (intentional):
 *   - `qty`, `price`, `fees`, `commission` typed as DecimalString. Daniel
 *     stores qty/price as FLOAT64 (lossy) and fees/commission as NUMERIC
 *     (precise). The wire posture is exact-decimal for all four; we
 *     refuse to compound precision risk on the investor surface.
 *   - `side` is left untyped (string) at the wire boundary. Daniel does
 *     not enforce a closed set on Fills.side; the broker may report
 *     extensions beyond ORDER_SIDES. The entity preserves what the
 *     broker said; investor surfaces normalize for display.
 *   - No `correlation_id`, `attempt_id`, or `notional` fields. Daniel
 *     has none on Fills; correlation lives on related OrderEvents rows,
 *     and notional is derived from qty × price by readers.
 */
import { z } from "zod";
import {
  decimalStringRefiner,
  decimalStringMessage,
  type DecimalString,
} from "./decimal";

// ─── source enum (pipeline.py: 3 closed values) ────────────────────────────

/**
 * Fill-source tag identifying which subsystem observed this fill. Closed
 * 3-value set per `apps/trade-manager/src/pipeline.py` (`webhook` at line
 * 2908, `poller` at line 2908 ternary, `reconciliation` at line 1778).
 *
 * NOTE: distinct from `BROKER_TRUTH_SOURCES` in transitions.py — that
 * 6-value set governs OrderEvents source_service. Fills.source uses a
 * narrower 3-value set per the writer code.
 */
export const FILL_SOURCES = ["webhook", "poller", "reconciliation"] as const;

export type FillSource = (typeof FILL_SOURCES)[number];

export const fillSourceSchema = z.enum(FILL_SOURCES);

export function isFillSource(value: unknown): value is FillSource {
  return (
    typeof value === "string" &&
    (FILL_SOURCES as readonly string[]).includes(value)
  );
}

// ─── Liquidity — free-form, documented sentinel values ─────────────────────

/**
 * Commonly observed liquidity values. Daniel does NOT enforce a closed
 * enum on `liquidity` (STRING(32) with no check constraint, no Python
 * frozenset). Exported here only for documentation and as the seed of
 * a normalization helper. The Zod schema accepts any non-empty string
 * for forward compatibility with broker-specific values.
 */
export const KNOWN_LIQUIDITY_VALUES = [
  "maker",
  "taker",
  "auction",
  "routed",
  "unknown",
] as const;

export type KnownLiquidity = (typeof KNOWN_LIQUIDITY_VALUES)[number];

// ─── Hash constraint ──────────────────────────────────────────────────────

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const sha256HexSchema = z.string().regex(SHA256_HEX_RE, {
  message: "raw_hash must be 64-char lowercase hex (SHA-256).",
});

// ─── Fill wire shape ───────────────────────────────────────────────────────

const decimalString = z
  .string()
  .refine(decimalStringRefiner, { message: decimalStringMessage("value") });
const decimal = decimalString as unknown as z.ZodType<DecimalString>;

/**
 * Mirrors Daniel's `Fills` row. Field nullability matches the DDL: only
 * `orderId` and `fillId` (the composite PK) are strictly required. All
 * other fields are nullable in Daniel and optional here.
 *
 * `side` is typed as `string` (not an enum) because Daniel does not
 * enforce a closed set on Fills.side. The investor-facing display layer
 * is responsible for normalizing to ORDER_SIDES when rendering.
 */
export interface Fill {
  orderId: string;
  fillId: string;

  // Quantity / price / value — DecimalString on wire
  qty?: DecimalString;
  price?: DecimalString;
  fees?: DecimalString;
  commission?: DecimalString;

  // Identity chain (nullable per DDL)
  accountId?: string;
  planId?: string;
  intentId?: string;
  clientOrderId?: string;
  brokerOrderId?: string;
  brokerExecutionId?: string;

  // Side + asset
  side?: string;
  asset?: string;

  // Liquidity / venue / currency (free-form per Daniel)
  liquidity?: string;
  venue?: string;
  currency?: string;

  // Source + provenance
  source?: FillSource;
  reconciliationRunId?: string;

  // Timestamps
  ts?: string;
  brokerExecutionTs?: string;
  localReceivedAt?: string;
  createdAt?: string;

  // Raw payload + integrity
  raw?: Record<string, unknown>;
  rawHash?: string;
}

export const fillSchema: z.ZodType<Fill> = z.object({
  orderId: z.string().min(1),
  fillId: z.string().min(1),

  qty: decimal.optional(),
  price: decimal.optional(),
  fees: decimal.optional(),
  commission: decimal.optional(),

  accountId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
  intentId: z.string().min(1).optional(),
  clientOrderId: z.string().min(1).optional(),
  brokerOrderId: z.string().min(1).optional(),
  brokerExecutionId: z.string().min(1).optional(),

  side: z.string().min(1).max(16).optional(),
  asset: z.string().min(1).optional(),

  liquidity: z.string().min(1).max(32).optional(),
  venue: z.string().min(1).optional(),
  currency: z.string().min(1).max(16).optional(),

  source: fillSourceSchema.optional(),
  reconciliationRunId: z.string().min(1).optional(),

  ts: z.iso.datetime().optional(),
  brokerExecutionTs: z.iso.datetime().optional(),
  localReceivedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime().optional(),

  raw: z.record(z.string(), z.unknown()).optional(),
  rawHash: sha256HexSchema.optional(),
});
