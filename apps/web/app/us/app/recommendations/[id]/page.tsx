"use client";

/**
 * Signal recommendation detail — informational only.
 *
 * Rendered from the BFF projection of Daniel's generated `Recommendation` and
 * its paged `RecommendationLeg`s. Displays only contract-supported data:
 * status, freshness, estimated turnover, constituent count, and the legs
 * (symbol, security id, current/target/delta quantities, notional delta,
 * reference price, reason codes). `executionEligible` and per-leg `executable`
 * are backend status shown as text — never a button. ReFi Signal does not
 * place, accept, approve or submit orders.
 */
import { use } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  StatusBanner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components";
import {
  useInvestorRecommendationDetail,
  useInvestorRecommendationLegs,
} from "../../../../_hooks/useInvestorRecommendations";
import type { RecommendationLegView } from "@lib/investor-api/recommendations";
import { appCopy } from "../../../_content/app-copy";
import {
  formatDateTime,
  freshnessTone,
  statusTone,
  upstreamMessage,
} from "../_view";

const { recommendations } = appCopy;

// Next.js 16: params is a Promise; unwrap in client components with React.use.
export default function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, isError } = useInvestorRecommendationDetail(id);
  const detail = data?.detail ?? null;
  const more = useInvestorRecommendationLegs(id);

  if (isLoading) {
    return <p className="text-sm text-charcoal-500">Loading…</p>;
  }
  if (isError || !data || detail === null) {
    return (
      <div className="flex flex-col gap-4 max-w-3xl">
        <BackLink />
        <h1 className="text-xl font-semibold text-charcoal-50">
          {recommendations.detail.unavailableHeading}
        </h1>
        <StatusBanner variant="error" data-testid="recommendation-unavailable">
          {data && data.upstream.state !== "ok"
            ? upstreamMessage(data.upstream)
            : recommendations.readError}
        </StatusBanner>
      </div>
    );
  }

  const rec = detail.recommendation;
  const legs: RecommendationLegView[] = [
    ...detail.legs.items,
    ...more.pages.flatMap((p) => p.items),
  ];
  const lastCursor =
    more.pages.length > 0
      ? (more.pages[more.pages.length - 1]?.page.nextCursor ?? null)
      : detail.legs.page.nextCursor;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <BackLink />

      <div className="flex flex-wrap items-center gap-3">
        <h1
          className="text-xl font-semibold text-charcoal-50"
          data-testid="recommendation-detail-heading"
        >
          {rec.templateId}
        </h1>
        <Badge variant={statusTone(rec.status)}>{rec.status}</Badge>
        <Badge variant={freshnessTone(rec.freshness.status)}>
          {recommendations.freshnessLabel}: {rec.freshness.status}
        </Badge>
      </div>
      <p className="text-xs text-charcoal-500 font-mono">
        {recommendations.detail.idLabel}: {rec.recommendationId}
      </p>

      <Card>
        <CardContent className="pt-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field
              label={recommendations.legCountLabel}
              value={String(rec.legCount)}
            />
            <Field
              label={recommendations.turnoverLabel}
              value={`${rec.estimatedTurnoverPercent}%`}
            />
            <Field
              label={recommendations.freshUntilLabel}
              value={formatDateTime(rec.freshness.freshUntil)}
            />
            <Field
              label={recommendations.detail.expiresLabel}
              value={formatDateTime(rec.freshness.expiresAt)}
            />
            <Field
              label={recommendations.detail.lastEvaluatedLabel}
              value={formatDateTime(rec.freshness.lastEvaluatedAt)}
            />
            <Field
              label={recommendations.detail.sourceAsOfLabel}
              value={formatDateTime(rec.freshness.sourceAsOf)}
            />
            <Field
              label={recommendations.detail.freshnessPolicyLabel}
              value={rec.freshness.policyVersion}
            />
            <Field
              label={recommendations.executionEligibilityLabel}
              value={
                rec.executionEligible
                  ? recommendations.executionEligible
                  : recommendations.executionNotEligible
              }
              testId="recommendation-execution-eligibility"
            />
            {rec.freshness.reasonCodes.length > 0 && (
              <Field
                label={recommendations.detail.freshnessReasonsLabel}
                value={rec.freshness.reasonCodes.join(", ")}
              />
            )}
          </dl>
        </CardContent>
      </Card>

      <section
        className="flex flex-col gap-3"
        data-testid="recommendation-legs"
      >
        <h2 className="text-sm font-semibold text-charcoal-50">
          {recommendations.detail.legsHeading}
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{recommendations.legs.symbol}</TableHead>
              <TableHead>{recommendations.legs.securityId}</TableHead>
              <TableHead>{recommendations.legs.current}</TableHead>
              <TableHead>{recommendations.legs.target}</TableHead>
              <TableHead>{recommendations.legs.delta}</TableHead>
              <TableHead>{recommendations.legs.notionalDelta}</TableHead>
              <TableHead>{recommendations.legs.referencePrice}</TableHead>
              <TableHead>{recommendations.legs.executable}</TableHead>
              <TableHead>{recommendations.legs.reasonCodes}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {legs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-charcoal-500 py-8 text-sm"
                >
                  {recommendations.legs.empty}
                </TableCell>
              </TableRow>
            ) : (
              legs.map((leg) => (
                <TableRow
                  key={`${leg.securityId}:${leg.symbol}`}
                  data-testid="recommendation-leg"
                >
                  <TableCell className="font-semibold text-charcoal-50">
                    {leg.symbol}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-charcoal-400">
                    {leg.securityId}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {leg.currentQuantity}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {leg.targetQuantity}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {leg.deltaQuantity}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {leg.notionalDelta}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {leg.referencePrice}
                  </TableCell>
                  <TableCell className="text-charcoal-400">
                    {leg.executable
                      ? recommendations.legs.executableYes
                      : recommendations.legs.executableNo}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-charcoal-400">
                    {leg.reasonCodes.join(", ")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {lastCursor !== null && (
          <div>
            <Button
              size="sm"
              variant="secondary"
              data-testid="recommendation-legs-more"
              disabled={more.isFetching}
              onClick={() => {
                void more.loadMore(lastCursor);
              }}
            >
              {recommendations.legs.loadMore}
            </Button>
          </div>
        )}
        {more.isError && (
          <StatusBanner variant="error">
            {recommendations.readError}
          </StatusBanner>
        )}
      </section>

      <Card data-testid="signal-manual-panel">
        <CardContent className="pt-5 pb-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-charcoal-50">
            {recommendations.detail.manualAction}
          </p>
          <p className="text-sm text-charcoal-300">
            {recommendations.signalManual.body}
          </p>
          <ol className="list-decimal list-inside text-sm text-charcoal-300 flex flex-col gap-1">
            {recommendations.signalManual.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-xs text-charcoal-500">
            {recommendations.signalManual.title}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/us/app/recommendations"
        className="text-sm text-charcoal-400 hover:text-charcoal-200"
      >
        ← {recommendations.heading}
      </Link>
    </div>
  );
}

function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
        {label}
      </dt>
      <dd className="text-sm text-charcoal-200" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
