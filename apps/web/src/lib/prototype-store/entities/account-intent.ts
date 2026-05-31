/**
 * AccountIntent prototype-store entity.
 *
 * Mirrors Daniel's `AccountIntents` row (PK: intent_id). Immutable per
 * intentId — a second write for the same intentId is rejected, matching
 * the Books & Records posture for risk snapshots.
 *
 * Frontend MUST NEVER create intents in production. This entity exists for
 * fixture seeding and dual-read scaffolding; no BFF investor route accepts
 * a write derived from investor input.
 *
 * The stored shape wraps Daniel's wire shape with two BFF-only additions:
 *   - `meta`: standard prototype metadata (createdAt, correlationId, source)
 *   - `bffExecutionPolicyRef`: OPTIONAL pin of the local BFF-owned
 *     ExecutionPolicy version at the moment the intent was projected into
 *     the prototype store. NOT a Daniel backend field; never written to
 *     Daniel's table; included only for local correlation in dual-read
 *     scenarios. Cleanly separable from the inner Daniel shape.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type { AccountIntent } from "../../sec203a/account-intents";

export interface BffExecutionPolicyRef {
  policyId: string;
  policyVersion: number;
}

/**
 * Stored intent = Daniel wire shape + BFF-only metadata. The Daniel shape
 * (`AccountIntent` fields) is unmodified; BFF additions are explicitly named.
 */
export interface StoredAccountIntent extends AccountIntent {
  meta: PrototypeMeta;
  /**
   * BFF-only correlation to the local ExecutionPolicy version. Optional.
   * NOT in Daniel's DDL; do NOT forward to backend writes.
   */
  bffExecutionPolicyRef?: BffExecutionPolicyRef;
}

const intents = kvStore<StoredAccountIntent>("account-intents");

export async function getAccountIntent(
  intentId: string,
): Promise<StoredAccountIntent | null> {
  return intents.get(intentId);
}

export async function listAccountIntentsForAccount(
  accountId: string,
): Promise<StoredAccountIntent[]> {
  const all = await intents.list();
  return all
    .map((e) => e.value)
    .filter((i) => i.accountId === accountId)
    .sort((a, b) => b.ts.localeCompare(a.ts));
}

export async function appendAccountIntent(args: {
  intent: AccountIntent;
  bffExecutionPolicyRef?: BffExecutionPolicyRef;
}): Promise<StoredAccountIntent> {
  const stored: StoredAccountIntent = {
    ...args.intent,
    meta: makePrototypeMeta(args.intent.correlationId),
    ...(args.bffExecutionPolicyRef
      ? { bffExecutionPolicyRef: args.bffExecutionPolicyRef }
      : {}),
  };
  const ok = await intents.putIfAbsent(args.intent.intentId, stored);
  if (!ok) {
    throw new Error(
      `account intent ${args.intent.intentId} already exists — intents are immutable per intent_id`,
    );
  }
  return stored;
}
