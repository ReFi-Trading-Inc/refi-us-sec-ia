import type { RecommendationSummaryView } from "./recommendations";

export interface FundingNotice {
  templateId: string;
  condition: "PORTFOLIO_CAPITAL_BELOW_MINIMUM";
  state: "active" | "resolved" | "unavailable";
  recommendationId: string;
  assessedAt: string;
  freshUntil: string;
  stale: boolean;
  assessment: RecommendationSummaryView["fundingAssessment"];
}

/** Rebuild from canonical saved recommendations on initial load/reconnect.
 * No second ledger, money calculation or state change from SSE payloads.
 * A stale/null/superseded observation cannot erase a previous funding warning.
 */
export function projectFundingNotices(
  rows: readonly RecommendationSummaryView[],
  now = Date.now(),
): FundingNotice[] {
  const grouped = new Map<string, RecommendationSummaryView[]>();
  for (const row of rows) {
    if (!row.templateId) continue;
    const group = grouped.get(row.templateId) ?? [];
    group.push(row);
    grouped.set(row.templateId, group);
  }
  const notices: FundingNotice[] = [];
  for (const [templateId, group] of grouped) {
    // Tie ordering must never cause a same-time sufficient record to clear a warning.
    group.sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.recommendationId.localeCompare(b.recommendationId),
    );
    let notice: FundingNotice | null = null;
    let warningTime = -Infinity;
    for (const row of group) {
      const assessment = row.fundingAssessment;
      const fresh =
        row.lifecycleStatus.toLowerCase() === "current" &&
        row.freshness.status.toLowerCase() === "fresh" &&
        Date.parse(row.freshness.freshUntil) > now &&
        Date.parse(row.freshness.expiresAt) > now;
      const base = {
        templateId,
        condition: "PORTFOLIO_CAPITAL_BELOW_MINIMUM" as const,
        recommendationId: row.recommendationId,
        assessedAt: row.createdAt,
        freshUntil: row.freshness.freshUntil,
        stale: !fresh,
        assessment,
      };
      if (assessment?.status === "INSUFFICIENT") {
        notice = { ...base, state: "active" };
        warningTime = Date.parse(row.createdAt);
      } else if (
        assessment?.status === "SUFFICIENT" &&
        fresh &&
        Date.parse(row.createdAt) > warningTime
      ) {
        notice = { ...base, state: "resolved" };
      } else if (!notice) {
        notice = { ...base, state: "unavailable" };
      } else if (notice.state === "active") {
        Object.assign(notice, { stale: true });
      } else {
        notice = { ...base, state: "unavailable" };
      }
    }
    if (notice) notices.push(notice);
  }
  return notices.sort((a, b) => a.templateId.localeCompare(b.templateId));
}
