"use client";

/**
 * Investor activity — structured account records from the BFF projection of
 * Daniel's `AccountRecord`s, all 16 variants read-only including the
 * execution chain (intent → risk → plan → order → fill), labelled by
 * category. Columns are the authoritative record type, timestamp, status,
 * amounts, reason codes and record references; nothing is narrated. No
 * execution actions exist on this page.
 */
import {
  Badge,
  StatusBanner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components";
import { useInvestorActivity } from "../../../_hooks/useInvestorActivity";
import { appCopy } from "../../_content/app-copy";

const { activity } = appCopy;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Neutral label from the authoritative record type: snake_case → words. */
function recordTypeLabel(recordType: string): string {
  return recordType.replace(/_/g, " ");
}

export default function ActivityPage() {
  const { data, isLoading, isError } = useInvestorActivity();
  const items = data?.items ?? [];
  const upstream = data?.upstream;

  return (
    <div className="flex flex-col gap-6 max-w-5xl" data-testid="activity-page">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {activity.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{activity.subheading}</p>
      </div>

      {isError && (
        <StatusBanner variant="error">{activity.readError}</StatusBanner>
      )}
      {upstream && upstream.state !== "ok" && (
        <StatusBanner variant="warning" data-testid="activity-upstream-state">
          {activity.upstreamUnavailable}
        </StatusBanner>
      )}

      <Table data-testid="activity-table">
        <TableHeader>
          <TableRow>
            <TableHead>{activity.type}</TableHead>
            <TableHead>{activity.timestamp}</TableHead>
            <TableHead>{activity.status}</TableHead>
            <TableHead>{activity.amount}</TableHead>
            <TableHead>{activity.reasonCodes}</TableHead>
            <TableHead>{activity.recordReference}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-charcoal-500 py-12 text-sm"
              >
                Loading…
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-charcoal-500 py-12 text-sm"
                data-testid="activity-empty"
              >
                {activity.emptyState}
              </TableCell>
            </TableRow>
          ) : (
            items.map((r) => (
              <TableRow
                key={r.recordId}
                data-testid="activity-record"
                data-record-type={r.recordType}
              >
                <TableCell className="capitalize">
                  <span className="flex items-center gap-2">
                    {recordTypeLabel(r.recordType)}
                    {r.category === "execution_chain" && (
                      <Badge
                        variant="neutral"
                        data-testid="activity-execution-badge"
                      >
                        {activity.executionChain}
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="font-mono tabular-nums text-charcoal-400">
                  {formatTimestamp(r.createdAt)}
                </TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell className="font-mono tabular-nums text-xs text-charcoal-200">
                  {r.notional
                    ? Number(r.notional).toLocaleString("en-US", {
                        style: "currency",
                        currency: r.currency ?? "USD",
                      })
                    : r.quantity
                      ? `${r.quantity} ${activity.units}`
                      : ""}
                </TableCell>
                <TableCell className="font-mono text-xs text-charcoal-400">
                  {r.reasonCodes.length > 0
                    ? r.reasonCodes.join(", ")
                    : activity.noReasonCodes}
                </TableCell>
                <TableCell className="font-mono text-xs text-charcoal-400">
                  <div className="flex flex-col gap-0.5">
                    <span>{r.recordId}</span>
                    <span>
                      {activity.entityLabel}: {r.entityId}
                    </span>
                    {r.relatedRecordId && (
                      <span>
                        {activity.relatedLabel}: {r.relatedRecordId}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
