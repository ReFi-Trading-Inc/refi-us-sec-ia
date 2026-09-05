/**
 * Signal recommendation READS through the frozen v1.1.0-alpha.2 client
 * (C1b-2 rows 18/19): `listAccountRecommendations`, `getAccountRecommendation`,
 * `listAccountRecommendationLegs`.
 *
 * The projection is the NARROWEST view of Daniel's generated data the pages
 * need. It deliberately does not reconstruct the retired flat frontend shape
 * (symbol / buy-sell action / confidence / rationale / expiry): the contract
 * carries none of those on a Recommendation. Decimal strings stay strings.
 *
 * `execution_eligible` / `executable` are backend INFORMATIONAL flags. They
 * are surfaced as status only and never drive a control — the Signal release
 * is informational/manual and execution authority is behind D-LAUNCH-06.
 */
import type {
  InvestorApiClient,
  OperationResponse,
} from "@refi/api-clients/investor-api";
import {
  collectPages,
  CONTRACT_MAX_PAGE_SIZE,
  type ContractPage,
} from "./pagination";

export type ContractRecommendation =
  OperationResponse<"getAccountRecommendation">["data"];
export type ContractRecommendationLeg =
  OperationResponse<"listAccountRecommendationLegs">["data"]["items"][number];

export type RecommendationStatus = ContractRecommendation["status"];
export type FreshnessStatus =
  ContractRecommendation["freshness"]["freshness_status"];

export interface FreshnessView {
  status: FreshnessStatus;
  freshUntil: string;
  expiresAt: string;
  lastEvaluatedAt: string;
  sourceAsOf: string;
  policyVersion: string;
  reasonCodes: string[];
}

export interface RecommendationSummaryView {
  recommendationId: string;
  templateId: string;
  status: RecommendationStatus;
  freshness: FreshnessView;
  /** Decimal string exactly as the contract sent it. */
  estimatedTurnoverPercent: string;
  legCount: number;
  /** Backend informational flag — NOT an execution control (D-LAUNCH-06). */
  executionEligible: boolean;
}

export interface RecommendationLegView {
  securityId: string;
  symbol: string;
  currentQuantity: string;
  targetQuantity: string;
  deltaQuantity: string;
  notionalDelta: string;
  referencePrice: string;
  /** Backend informational flag — NOT an execution control. */
  executable: boolean;
  reasonCodes: string[];
}

export interface PageView {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface RecommendationLegsPageView {
  items: RecommendationLegView[];
  page: PageView;
}

export interface RecommendationDetailView {
  recommendation: RecommendationSummaryView;
  legs: RecommendationLegsPageView;
}

/** Bounded list: at most this many contract pages of 100. */
export const RECOMMENDATION_LIST_MAX_PAGES = 4;
/** One contract page of legs per BFF request; the browser pages by cursor. */
export const LEGS_PAGE_SIZE = CONTRACT_MAX_PAGE_SIZE;

export function projectRecommendation(
  r: ContractRecommendation,
): RecommendationSummaryView {
  return {
    recommendationId: r.recommendation_id,
    templateId: r.template_id,
    status: r.status,
    freshness: {
      status: r.freshness.freshness_status,
      freshUntil: r.freshness.fresh_until,
      expiresAt: r.freshness.expires_at,
      lastEvaluatedAt: r.freshness.last_evaluated_at,
      sourceAsOf: r.freshness.source_as_of,
      policyVersion: r.freshness.freshness_policy_version,
      reasonCodes: [...r.freshness.freshness_reason_codes],
    },
    estimatedTurnoverPercent: r.estimated_turnover_percent,
    legCount: r.leg_count,
    executionEligible: r.execution_eligible,
  };
}

export function projectLeg(
  l: ContractRecommendationLeg,
): RecommendationLegView {
  return {
    securityId: l.security_id,
    symbol: l.symbol,
    currentQuantity: l.current_quantity,
    targetQuantity: l.target_quantity,
    deltaQuantity: l.delta_quantity,
    notionalDelta: l.notional_delta,
    referencePrice: l.reference_price,
    executable: l.executable,
    reasonCodes: [...l.reason_codes],
  };
}

function pageView(p: ContractPage): PageView {
  return { hasMore: p.has_more, nextCursor: p.next_cursor };
}

export async function listRecommendations(
  client: InvestorApiClient,
  accountId: string,
): Promise<{ items: RecommendationSummaryView[]; truncated: boolean }> {
  const collected = await collectPages(
    async (cursor) => {
      const res = await client.call("listAccountRecommendations", {
        path: { account_id: accountId },
        query: { page_size: CONTRACT_MAX_PAGE_SIZE, cursor },
      });
      return { items: res.data.data.items, page: res.data.data.page };
    },
    { maxPages: RECOMMENDATION_LIST_MAX_PAGES },
  );
  return {
    items: collected.items.map(projectRecommendation),
    truncated: collected.truncated,
  };
}

export async function listRecommendationLegsPage(
  client: InvestorApiClient,
  accountId: string,
  recommendationId: string,
  cursor: string | undefined,
): Promise<RecommendationLegsPageView> {
  const res = await client.call("listAccountRecommendationLegs", {
    path: { account_id: accountId, recommendation_id: recommendationId },
    query: { page_size: LEGS_PAGE_SIZE, cursor },
  });
  return {
    items: res.data.data.items.map(projectLeg),
    page: pageView(res.data.data.page),
  };
}

export async function getRecommendationDetail(
  client: InvestorApiClient,
  accountId: string,
  recommendationId: string,
): Promise<RecommendationDetailView> {
  const rec = await client.call("getAccountRecommendation", {
    path: { account_id: accountId, recommendation_id: recommendationId },
  });
  const legs = await listRecommendationLegsPage(
    client,
    accountId,
    recommendationId,
    undefined,
  );
  return { recommendation: projectRecommendation(rec.data.data), legs };
}
