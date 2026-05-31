/**
 * Fill prototype-store entity. Strictly append-only per Daniel's writer
 * pattern (`apps/trade-manager/src/db.py:669-682` — `record_fill()` uses
 * `batch.insert()` only; no UPDATE path exists). Broker corrections and
 * reconciliation corrections write NEW rows, not mutations.
 *
 * Daniel's PK is composite (order_id, fill_id). The prototype-store key
 * combines both with a `__` separator so duplicate (order_id, fill_id)
 * pairs are rejected at the entity layer via `putIfAbsent`.
 *
 * Frontend MUST NEVER append fills in production. Writers are Trade
 * Manager broker webhook / poller / reconciler paths. This entity exists
 * for fixture seeding and dual-read only.
 *
 * Lookups expose the index axes from Daniel's 6 Fills indexes that matter
 * to investor-side audit: by order (PK prefix), by broker_order_id, by
 * (account, asset), and by reconciliation_run_id.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type { Fill } from "../../sec203a/fills";

export interface StoredFill extends Fill {
  bffMeta: PrototypeMeta;
}

const fills = kvStore<StoredFill>("fills");

function fillKey(orderId: string, fillId: string): string {
  // sanitize separator collisions defensively (keys must be FS-safe)
  return `${orderId.replace(/__/g, "_")}__${fillId.replace(/__/g, "_")}`;
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export async function getFill(
  orderId: string,
  fillId: string,
): Promise<StoredFill | null> {
  return fills.get(fillKey(orderId, fillId));
}

export async function listFillsForOrder(
  orderId: string,
): Promise<StoredFill[]> {
  const all = await fills.list();
  return all
    .map((e) => e.value)
    .filter((f) => f.orderId === orderId)
    .sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""));
}

export async function listFillsForBrokerOrder(
  brokerOrderId: string,
): Promise<StoredFill[]> {
  const all = await fills.list();
  return all
    .map((e) => e.value)
    .filter((f) => f.brokerOrderId === brokerOrderId)
    .sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""));
}

export async function listFillsForAccount(
  accountId: string,
): Promise<StoredFill[]> {
  const all = await fills.list();
  return all
    .map((e) => e.value)
    .filter((f) => f.accountId === accountId)
    .sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""));
}

// ─── Append-only write ──────────────────────────────────────────────────────

/**
 * Append a single Fill. Rejects if a fill with the same (orderId, fillId)
 * composite key already exists. There is NO `updateFill` / `patchFill` /
 * `deleteFill` — fills are broker-supplied evidence, immutable per Daniel.
 */
export async function appendFill(args: { fill: Fill }): Promise<StoredFill> {
  const stored: StoredFill = {
    ...args.fill,
    bffMeta: makePrototypeMeta(args.fill.fillId),
  };
  const ok = await fills.putIfAbsent(
    fillKey(args.fill.orderId, args.fill.fillId),
    stored,
  );
  if (!ok) {
    throw new Error(
      `fill ${args.fill.orderId}/${args.fill.fillId} already exists — Fills are append-only`,
    );
  }
  return stored;
}
