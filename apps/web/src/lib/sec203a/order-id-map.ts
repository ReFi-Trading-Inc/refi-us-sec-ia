/**
 * OrderIdMap domain — typed surface for Daniel's `OrderIdMap` table. One row
 * per `client_order_id`; carries the stable correspondence between the
 * platform's client-order id, the broker's order id (once known), and the
 * surrounding identity context (order/plan/account/asset/broker).
 *
 * Source of truth (GitLab refinity_dev/refinity-main @ 9f9dfc9):
 *   - DDL: docs/authoritative/spanner_ddl_all.txt:341-361
 *     (11 columns + 5 indexes)
 *   - Auditability contract: docs/authoritative/trade_auditability_contract.md
 *     line 587 (column inventory), lines 269/300/330/361/379 (semantics)
 *   - Trade-lifecycle contract: docs/authoritative/trade_lifecycle_contract.md
 *     line 132 ("Exec Gateway creates; Trade Manager enriches")
 *   - Writer (upsert / insert-or-update):
 *     apps/trade-manager/src/db.py:785-796 (upsert_order_id_map)
 *     apps/trade-manager/src/pipeline.py:138, 2461, 3709 (call sites)
 *     apps/exec-gateway/src/services/spanner_repo.py:605-617 (initial INSERT)
 *     apps/exec-gateway/src/services/spanner_repo.py:694-724 (UPDATE w/ INSERT
 *     fallback on broker_order_id enrichment)
 *   - Pydantic shape: apps/exec-gateway/src/models/domain.py:104-110
 *     (OrderIdMapEntry — 6 fields; subset of full DDL)
 *
 * SEC posture (17 CFR 275.204-2 Books & Records):
 *   OrderIdMap is the durable id-correspondence record. It lets auditors
 *   resolve any of {client_order_id, broker_order_id, order_id} back to the
 *   other two and to the surrounding plan/account/asset/broker context. The
 *   firm must keep this mapping for the same retention window as Orders +
 *   OrderEvents (see retention.py:21).
 *
 * Mutability contract — NOT pure append-only; controlled upsert:
 *   Daniel's writer uses Spanner `insert_or_update` keyed by `client_order_id`.
 *   The investor-facing mirror exposes a SINGLE `upsertOrderIdMap()` write
 *   path that enforces identity invariants:
 *     - PK `client_order_id` is set-once and never rebinds (Spanner PK).
 *     - Identity fields (order_id, plan_id, account_id, asset, broker_name,
 *       broker_order_id, correlation_id, first_attempt_id) are set-once:
 *       once non-null, they cannot be changed to a different non-null value.
 *       Filling a previously-null identity field IS allowed (enrichment).
 *     - latest_attempt_id is the one freely-mutable field (replaces each
 *       retry per pipeline.py:3709).
 *     - updated_at is owned by the writer and stamped at each upsert.
 *
 * Frontend MUST NEVER call upsertOrderIdMap in production. Writers are
 * Exec Gateway (initial insert) and Trade Manager (broker enrichment +
 * latest-attempt rebinding). This entity is for fixture seeding and
 * dual-read only.
 *
 * Documented intentional shape choices:
 *   - All fields except clientOrderId optional, matching Daniel nullability.
 *   - correlationId is included (Daniel has it on OrderIdMap, unlike Fills).
 *   - No `notional` / `qty` / `price` — OrderIdMap is identity-only, not
 *     economic data. Money lives on Orders / Fills.
 */
import { z } from "zod";

// ─── Wire shape ─────────────────────────────────────────────────────────────

/**
 * Mirrors Daniel's `OrderIdMap` row. Only `clientOrderId` (the PK) is
 * strictly required. Every other field is nullable in the DDL and optional
 * here.
 *
 * Identity fields (set-once on the writer side):
 *   orderId, planId, accountId, asset, brokerName, brokerOrderId,
 *   correlationId, firstAttemptId
 *
 * Mutable on enrichment:
 *   latestAttemptId, updatedAt
 */
export interface OrderIdMapEntry {
  clientOrderId: string;

  // Identity binding (set-once at writer)
  orderId?: string;
  planId?: string;
  accountId?: string;
  asset?: string;
  brokerName?: string;
  brokerOrderId?: string;
  correlationId?: string;
  firstAttemptId?: string;

  // Retry-chain pointer (rebinds each retry)
  latestAttemptId?: string;

  // Stamp
  updatedAt?: string;
}

export const orderIdMapEntrySchema: z.ZodType<OrderIdMapEntry> = z.object({
  clientOrderId: z.string().min(1),

  orderId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  asset: z.string().min(1).optional(),
  brokerName: z.string().min(1).optional(),
  brokerOrderId: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  firstAttemptId: z.string().min(1).optional(),

  latestAttemptId: z.string().min(1).optional(),

  updatedAt: z.iso.datetime().optional(),
});

// ─── Identity-field policy (consumed by entity) ─────────────────────────────

/**
 * Fields that are SET-ONCE in OrderIdMap: once written to a non-null value
 * for a given `client_order_id`, they cannot be rebound to a different
 * non-null value. The entity layer rejects upserts that violate this.
 *
 * Setting one of these fields when it was previously null/undefined IS
 * allowed and is the primary "enrichment" path (e.g. Trade Manager sets
 * `brokerOrderId` after the broker ack).
 */
export const ORDER_ID_MAP_IDENTITY_FIELDS = [
  "orderId",
  "planId",
  "accountId",
  "asset",
  "brokerName",
  "brokerOrderId",
  "correlationId",
  "firstAttemptId",
] as const satisfies ReadonlyArray<keyof OrderIdMapEntry>;

export type OrderIdMapIdentityField =
  (typeof ORDER_ID_MAP_IDENTITY_FIELDS)[number];
