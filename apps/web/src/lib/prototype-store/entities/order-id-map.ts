/**
 * OrderIdMap prototype-store entity. Mirrors Daniel's controlled-upsert
 * semantics: one row per `client_order_id`, identity fields set-once,
 * `latestAttemptId` freely mutable.
 *
 * Single write path: `upsertOrderIdMap()`. Rejects identity-field rebinding
 * (setting an already-set field to a different non-null value). Filling a
 * previously-null identity field is allowed (enrichment).
 *
 * Frontend MUST NEVER call upsertOrderIdMap in production. Writers are
 * Exec Gateway (initial insert at plan creation) and Trade Manager (broker
 * enrichment + latest-attempt rebinding per pipeline.py:138, 2461, 3709).
 * This entity exists for fixture seeding and dual-read only.
 *
 * Lookups expose the index axes from Daniel's 5 OrderIdMap indexes:
 *   - PK on client_order_id                  -> getOrderIdMap
 *   - UX on (broker_name, broker_order_id)   -> getOrderIdMapByBrokerOrderId
 *   - IX on plan_id                          -> listOrderIdMapsForPlan
 *   - IX on (account_id, asset, updated_at)  -> listOrderIdMapsForAccount
 *   - IX on order_id                         -> listOrderIdMapsForOrder
 *   - IX on latest_attempt_id                -> getOrderIdMapByLatestAttempt
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import {
  ORDER_ID_MAP_IDENTITY_FIELDS,
  type OrderIdMapEntry,
} from "../../sec203a/order-id-map";

export interface StoredOrderIdMap extends OrderIdMapEntry {
  bffMeta: PrototypeMeta;
}

const idMap = kvStore<StoredOrderIdMap>("order-id-map");

// ─── Lookups ────────────────────────────────────────────────────────────────

export async function getOrderIdMap(
  clientOrderId: string,
): Promise<StoredOrderIdMap | null> {
  return idMap.get(clientOrderId);
}

export async function getOrderIdMapByBrokerOrderId(
  brokerName: string,
  brokerOrderId: string,
): Promise<StoredOrderIdMap | null> {
  const all = await idMap.list();
  for (const e of all) {
    if (
      e.value.brokerName === brokerName &&
      e.value.brokerOrderId === brokerOrderId
    ) {
      return e.value;
    }
  }
  return null;
}

export async function getOrderIdMapByLatestAttempt(
  latestAttemptId: string,
): Promise<StoredOrderIdMap | null> {
  const all = await idMap.list();
  for (const e of all) {
    if (e.value.latestAttemptId === latestAttemptId) {
      return e.value;
    }
  }
  return null;
}

export async function listOrderIdMapsForPlan(
  planId: string,
): Promise<StoredOrderIdMap[]> {
  const all = await idMap.list();
  return all
    .map((e) => e.value)
    .filter((m) => m.planId === planId)
    .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
}

export async function listOrderIdMapsForAccount(
  accountId: string,
  asset?: string,
): Promise<StoredOrderIdMap[]> {
  const all = await idMap.list();
  return all
    .map((e) => e.value)
    .filter(
      (m) =>
        m.accountId === accountId && (asset === undefined || m.asset === asset),
    )
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function listOrderIdMapsForOrder(
  orderId: string,
): Promise<StoredOrderIdMap[]> {
  const all = await idMap.list();
  return all
    .map((e) => e.value)
    .filter((m) => m.orderId === orderId)
    .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
}

// ─── Write (controlled upsert) ──────────────────────────────────────────────

/**
 * Upsert one OrderIdMap row keyed by `clientOrderId`. Behavior:
 *
 *   - No existing row -> INSERT exactly as provided.
 *   - Existing row -> MERGE: each provided field either matches the existing
 *     value (no-op) or fills a previously-undefined field (enrichment).
 *     Setting an identity field (see ORDER_ID_MAP_IDENTITY_FIELDS) to a
 *     DIFFERENT non-null value is rejected as identity drift.
 *
 *   - `latestAttemptId` is the one freely-mutable field: a new value
 *     overwrites the previous one (per pipeline.py:3709 rebinding on retry).
 *   - `updatedAt` is always overwritten with the provided value (or carried
 *     from the existing row if none provided).
 *
 * Returns the resulting stored row.
 */
export async function upsertOrderIdMap(args: {
  entry: OrderIdMapEntry;
}): Promise<StoredOrderIdMap> {
  const incoming = args.entry;
  const existing = await idMap.get(incoming.clientOrderId);

  if (!existing) {
    const stored: StoredOrderIdMap = {
      ...incoming,
      bffMeta: makePrototypeMeta(
        incoming.correlationId ?? incoming.clientOrderId,
      ),
    };
    await idMap.put(incoming.clientOrderId, stored);
    return stored;
  }

  // Enforce identity invariants on rebinding.
  for (const field of ORDER_ID_MAP_IDENTITY_FIELDS) {
    const next = incoming[field];
    const prev = existing[field];
    if (next !== undefined && prev !== undefined && next !== prev) {
      throw new Error(
        `OrderIdMap identity drift: ${field} for clientOrderId=${incoming.clientOrderId} cannot rebind from "${prev}" to "${next}"`,
      );
    }
  }

  const merged: StoredOrderIdMap = {
    ...existing,
    // Identity-field enrichment: only fill previously-undefined values.
    ...Object.fromEntries(
      ORDER_ID_MAP_IDENTITY_FIELDS.flatMap((field) => {
        const next = incoming[field];
        return next !== undefined && existing[field] === undefined
          ? [[field, next]]
          : [];
      }),
    ),
    // latestAttemptId is freely mutable per Daniel writer semantics.
    ...(incoming.latestAttemptId !== undefined
      ? { latestAttemptId: incoming.latestAttemptId }
      : {}),
    // updatedAt: writer-stamped; overwrite if provided.
    ...(incoming.updatedAt !== undefined
      ? { updatedAt: incoming.updatedAt }
      : {}),
  };
  await idMap.put(incoming.clientOrderId, merged);
  return merged;
}
