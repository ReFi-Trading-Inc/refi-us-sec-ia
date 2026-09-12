/**
 * Automated portfolio recommendation READS through the alpha.4 client
 * (C1b-2 rows 18/19): `listAccountRecommendations`, `getAccountRecommendation`,
 * `listAccountRecommendationLegs`.
 *
 * The projection is the NARROWEST view of Daniel's generated data the pages
 * need. It deliberately does not reconstruct the retired flat frontend shape
 * (symbol / buy-sell action / confidence / rationale / expiry): the contract
 * carries none of those on a Recommendation. Decimal strings stay strings.
 *
 * `execution_eligible` / `executable` are backend INFORMATIONAL flags. They
 * are informational, not the state of account automation. Trading progress
 * is independently represented by authorized intents and execution Records.
 */
import type { OperationResponse } from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";
import { projectFundingNotices, type FundingNotice } from "./funding-notices";
import {
  collectPages,
  CONTRACT_MAX_PAGE_SIZE,
  type ContractPage,
} from "./pagination";

export type ContractRecommendation =
  OperationResponse<"getAccountRecommendation">["data"];
export type ContractRecommendationSummary =
  OperationResponse<"listAccountRecommendations">["data"]["items"][number];
export type ContractRecommendationLeg =
  OperationResponse<"listAccountRecommendationLegs">["data"]["items"][number];

export type RecommendationStatus = ContractRecommendation["lifecycle_status"];
export type FreshnessStatus = ContractRecommendation["freshness_status"];

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
  templateId: string | null;
  contentStatus: ContractRecommendation["content_status"];
  lifecycleStatus: string;
  createdAt: string;
  asOfTime: string;
  /** Unconverted canonical decimal fraction. */
  turnover: string;
  fundingAssessment: ContractRecommendation["funding_assessment"];
  reasonCodes: string[];
  status: RecommendationStatus;
  freshness: FreshnessView;
  /** Compatibility display alias: exact fraction × 100, never float math. */
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
  /** Complete canonical detail, including all lineage and state versions. */
  canonical: ContractRecommendation;
  legs: RecommendationLegsPageView;
}

/** Bounded list: at most this many contract pages of 100. */
export const RECOMMENDATION_LIST_MAX_PAGES = 4;
/** One contract page of legs per BFF request; the browser pages by cursor. */
export const LEGS_PAGE_SIZE = CONTRACT_MAX_PAGE_SIZE;

export function projectRecommendation(
  r: ContractRecommendation | ContractRecommendationSummary,
): RecommendationSummaryView {
  const detail = "lineage" in r ? r : null;
  const turnover = "summary" in r ? r.summary.turnover : r.turnover;
  return {
    recommendationId: r.recommendation_id,
    templateId:
      detail?.lineage.template_id ??
      r.funding_assessment?.input_versions.template_id ??
      null,
    contentStatus: r.content_status,
    lifecycleStatus: r.lifecycle_status,
    createdAt: r.created_at,
    asOfTime: r.as_of_time,
    turnover,
    fundingAssessment: r.funding_assessment,
    reasonCodes: [...r.reason_codes],
    status: r.lifecycle_status,
    freshness: {
      status: r.freshness_status,
      freshUntil: r.fresh_until,
      expiresAt: r.expires_at,
      // Alpha.4 does not supply these legacy freshness fields. Empty means
      // unavailable to the existing display, NOT a fabricated time/policy.
      lastEvaluatedAt: "",
      sourceAsOf: r.as_of_time,
      policyVersion: "",
      reasonCodes: [],
    },
    estimatedTurnoverPercent: fractionToPercent(turnover),
    legCount: r.leg_count,
    executionEligible: r.execution_eligible,
  };
}

/** Exact base-10 display conversion. Never used for allocation decisions. */
export function fractionToPercent(value: string): string {
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))
    throw new Error("Invalid decimal fraction");
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".");
  const digits = fraction.padEnd(2, "0");
  const integer = (whole + digits.slice(0, 2)).replace(/^0+(?=\d)/, "");
  const remainder = digits.slice(2).replace(/0+$/, "");
  const result = integer + (remainder ? `.${remainder}` : "");
  return negative && result !== "0" ? `-${result}` : result;
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
  client: InvestorApiReadClient,
  accountId: string,
): Promise<{
  items: RecommendationSummaryView[];
  truncated: boolean;
  nextCursor: string | null;
  fundingNotices: FundingNotice[];
  fundingComplete: boolean;
}> {
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
  const items = collected.items.map(projectRecommendation);
  // Alpha.4 summary intentionally has no lineage. Resolve missing template
  // identity from canonical detail in bounded groups, never from a guessed ID.
  const missing = items.filter((row) => row.templateId === null);
  for (let offset = 0; offset < missing.length; offset += 4) {
    await Promise.all(
      missing.slice(offset, offset + 4).map(async (row) => {
        const detail = await client.call("getAccountRecommendation", {
          path: {
            account_id: accountId,
            recommendation_id: row.recommendationId,
          },
        });
        Object.assign(row, projectRecommendation(detail.data.data));
      }),
    );
  }
  return {
    items,
    truncated: collected.truncated,
    nextCursor: collected.nextCursor,
    fundingNotices: projectFundingNotices(items),
    fundingComplete: !collected.truncated,
  };
}

export async function listRecommendationLegsPage(
  client: InvestorApiReadClient,
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
  client: InvestorApiReadClient,
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
  return {
    recommendation: projectRecommendation(rec.data.data),
    canonical: rec.data.data,
    legs,
  };
}
