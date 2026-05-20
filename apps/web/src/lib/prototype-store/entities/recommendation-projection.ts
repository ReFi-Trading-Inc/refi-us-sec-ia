/**
 * Recommendation projection — investor-readable view of a
 * software-generated account intent.
 *
 * In Managed mode this is informational (the system will execute under the
 * active policy without per-trade investor authorization). In Signal mode
 * the investor may save or dismiss; no execution path exists.
 *
 * Today: projected from MSW fixtures into prototype-bff so the UI has
 * shape. When backend lifecycle wires, this becomes a hybrid projection
 * from Daniel's AccountIntents + RiskSnapshots + ExecutionPlans, anchored
 * to the same DecisionRecord ids.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type { DecimalString } from "../../sec203a/decimal";

export type RecommendationStatus =
  | "open"
  | "executing"
  | "delivered"
  | "dismissed"
  | "saved"
  | "blocked";

export interface RecommendationProjection {
  accountId: string;
  recommendationId: string;
  intentId?: string;
  symbol: string;
  action: "buy" | "sell" | "hold" | "rebalance";
  rationale: string;
  confidence: DecimalString;
  expectedAllocation?: DecimalString;
  status: RecommendationStatus;
  generatedAt: string;
  expiresAt?: string;
  decisionRecordId?: string;
  meta: PrototypeMeta;
}

const recs = kvStore<RecommendationProjection>("recommendation-projections");

function recKey(accountId: string, recId: string): string {
  return `${accountId}__${recId}`;
}

export async function getRecommendation(
  accountId: string,
  recommendationId: string,
): Promise<RecommendationProjection | null> {
  return recs.get(recKey(accountId, recommendationId));
}

export async function listRecommendations(
  accountId: string,
): Promise<RecommendationProjection[]> {
  const all = await recs.list(`${accountId}__`);
  return all
    .map((e) => e.value)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export async function upsertRecommendation(args: {
  rec: Omit<RecommendationProjection, "meta">;
  correlationId: string;
}): Promise<RecommendationProjection> {
  const stored: RecommendationProjection = {
    ...args.rec,
    meta: makePrototypeMeta(args.correlationId),
  };
  await recs.put(recKey(args.rec.accountId, args.rec.recommendationId), stored);
  return stored;
}
