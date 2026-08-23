"use client";

/**
 * Exception Review queue (Phase 2 Surface 7).
 *
 * Exception Review is the only per-decision investor touchpoint allowed in
 * Managed mode. It resolves blockers — it never approves trades.
 *
 * Boundary preserved:
 *   - No per-trade Accept affordance.
 *   - No broker order is submitted from this surface.
 *   - The active ExecutionPolicy is never mutated by this surface.
 *   - The UI never exposes the legacy backend resolution identifiers; UI
 *     labels are "Resolve exception" and "Dismiss exception". The mapping
 *     lives in `mapResolutionToBackend`
 *     (packages/api-clients/src/hooks/exceptions.ts).
 */
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ModeBadge,
  StatusBanner,
} from "@ui/components";
import {
  describeBackendResolution,
  isDismissResolution,
  useInvestorExceptions,
  useResolveException,
  useSubscriptionMode,
  type ExceptionKind,
  type InvestorExceptionItem,
  type UiResolution,
} from "@refi/api-clients";

type QueueFilter = "open" | "resolved" | "dismissed";

interface KindCopy {
  title: string;
  why: string;
  /** Allowed resolutions for this kind, in display order. */
  resolutions: UiResolution[];
  /** Optional route a CTA links to (in addition to the resolution mutation). */
  primaryRoute?: string;
  severity: "info" | "warning" | "blocked";
}

const KIND_COPY: Record<ExceptionKind, KindCopy> = {
  stale_broker_data: {
    title: "Broker data needs to refresh",
    why: "Automation paused for this item because the broker connection has not provided fresh data within your policy's freshness window.",
    resolutions: ["reconnect_broker"],
    primaryRoute: "/us/app/account",
    severity: "warning",
  },
  insufficient_buying_power: {
    title: "Not enough buying power",
    why: "Automation paused for this item because your account does not currently have enough buying power to follow the recommendation under your active policy.",
    resolutions: [],
    severity: "warning",
  },
  expired_disclosure: {
    title: "Disclosure needs review",
    why: "An updated disclosure version supersedes the one your active policy was signed under. Automation pauses items affected by this disclosure until you review the new version.",
    resolutions: ["acknowledge_disclosure"],
    primaryRoute: "/us/app/documents/reacknowledge",
    severity: "blocked",
  },
  changed_preference: {
    title: "A profile preference changed",
    why: "Your profile changed in a way that affects what this recommendation would do under your active policy. Review your profile before automation resumes.",
    resolutions: ["update_profile"],
    primaryRoute: "/us/app/profile",
    severity: "warning",
  },
  stale_profile: {
    title: "Profile needs review",
    why: "Your active policy was signed under a profile snapshot that is older than your freshness setting. Review your profile to keep automation eligible.",
    resolutions: ["update_profile"],
    primaryRoute: "/us/app/profile",
    severity: "warning",
  },
  out_of_policy_intent: {
    title: "Recommendation does not fit the active policy",
    why: "Automation paused this item because it falls outside the guardrails you signed in your active Execution Policy. It stays recorded here; no investor action is available for it in the current release.",
    resolutions: [],
    severity: "blocked",
  },
  missing_consent: {
    title: "A consent is missing",
    why: "Automation paused this item because a consent your active policy depends on has not been given. Review and accept it to keep automation eligible.",
    resolutions: ["acknowledge_disclosure"],
    primaryRoute: "/us/app/documents/reacknowledge",
    severity: "blocked",
  },
  broker_disconnected: {
    title: "Broker connection is disconnected",
    why: "Automation paused this item because your brokerage connection is no longer active. Reconnect your broker to resume.",
    resolutions: ["reconnect_broker"],
    primaryRoute: "/us/app/account",
    severity: "blocked",
  },
  reconciliation_block: {
    title: "Account is being reconciled",
    why: "Automation paused this item while ReFi reconciles your account records with your broker. This clears on its own once reconciliation completes; no action is needed from you.",
    resolutions: [],
    severity: "warning",
  },
};

const RESOLUTION_LABEL: Record<UiResolution, string> = {
  // C2a: only Signal remediation is offered as an investor operation. The
  // Managed-era Ui options (resolve/dismiss/pause) are no longer rendered and
  // are unrepresentable at the BFF schema; their entries here exist solely
  // because the Record type spans the full Ui vocabulary, which the hook
  // layer retains for labelling HISTORICAL resolutions.
  resolve_exception: "",
  dismiss_exception: "",
  pause_managed: "",
  update_profile: "Update profile",
  reconnect_broker: "Reconnect broker",
  acknowledge_disclosure: "Review disclosure",
};

function ExceptionCard(props: {
  item: InvestorExceptionItem;
  onResolve: (
    item: InvestorExceptionItem,
    resolution: UiResolution,
  ) => void | Promise<void>;
  pendingResolution: UiResolution | null;
}) {
  const { item, onResolve, pendingResolution } = props;
  const copy = KIND_COPY[item.kind];
  return (
    <Card
      data-testid={`exception-card-${item.exceptionId}`}
      data-kind={item.kind}
      data-status={item.status}
      data-severity={copy.severity}
    >
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>{copy.title}</span>
          <Badge
            variant={
              copy.severity === "blocked"
                ? "rejected"
                : copy.severity === "warning"
                  ? "warning"
                  : "neutral"
            }
            data-testid={`exception-card-${item.exceptionId}-severity`}
          >
            {copy.severity}
          </Badge>
          {item.status !== "open" && (
            <Badge
              variant="neutral"
              data-testid={`exception-card-${item.exceptionId}-resolved-tag`}
            >
              {describeBackendResolution(item.lastResolution)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-5">
        <p className="text-sm text-charcoal-200">{item.summary}</p>
        <p
          className="text-xs text-charcoal-400"
          data-testid={`exception-card-${item.exceptionId}-why`}
        >
          {copy.why}
        </p>
        {item.intentRef && (
          <p
            className="text-xs text-charcoal-500"
            data-testid={`exception-card-${item.exceptionId}-intent-ref`}
          >
            Related recommendation: {item.intentRef}
          </p>
        )}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-charcoal-500">
          <div>
            <dt>Opened</dt>
            <dd className="text-charcoal-300">
              {new Date(item.openedAt).toLocaleString()}
            </dd>
          </div>
          {item.lastResolvedAt && (
            <div>
              <dt>Closed</dt>
              <dd className="text-charcoal-300">
                {new Date(item.lastResolvedAt).toLocaleString()}
              </dd>
            </div>
          )}
        </dl>
        {item.status === "open" && (
          <div
            className="flex flex-wrap gap-2"
            data-testid={`exception-card-${item.exceptionId}-actions`}
          >
            {copy.resolutions.map((res) => {
              const isRouteAction =
                (res === "update_profile" ||
                  res === "acknowledge_disclosure" ||
                  res === "reconnect_broker") &&
                copy.primaryRoute;
              if (isRouteAction && copy.primaryRoute) {
                // Next.js typed-routes brand: copy.primaryRoute is authored
                // as a plain string in the exception copy table; the route
                // value itself does not change.
                const route = copy.primaryRoute as Route;
                return (
                  <Link
                    key={res}
                    href={route}
                    data-testid={`exception-card-${item.exceptionId}-route-${res}`}
                    className="inline-flex items-center justify-center gap-2 rounded-md font-medium border border-charcoal-600 bg-transparent text-charcoal-100 hover:bg-charcoal-800 h-8 px-3 text-sm transition-colors"
                  >
                    {RESOLUTION_LABEL[res]}
                  </Link>
                );
              }
              return (
                <Button
                  key={res}
                  data-testid={`exception-card-${item.exceptionId}-resolve-${res}`}
                  variant="primary"
                  size="sm"
                  loading={pendingResolution === res}
                  onClick={() => {
                    void onResolve(item, res);
                  }}
                >
                  {RESOLUTION_LABEL[res]}
                </Button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExceptionsPage() {
  const modeQ = useSubscriptionMode();
  const listQ = useInvestorExceptions();
  const resolveMut = useResolveException();
  const [filter, setFilter] = useState<QueueFilter>("open");
  const [pendingByItem, setPendingByItem] = useState<
    Record<string, UiResolution | null>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);

  const mode = modeQ.data?.mode ?? "unset";
  // Memoize so the empty-array fallback has a stable identity across renders;
  // otherwise `useMemo(... [allItems, filter])` below recomputes on every
  // render and the dependency array is reported as inexhaustive.
  const allItems = useMemo(() => listQ.data?.items ?? [], [listQ.data?.items]);

  const onResolve = useCallback(
    async (item: InvestorExceptionItem, resolution: UiResolution) => {
      setServerError(null);
      setPendingByItem((prev) => ({ ...prev, [item.exceptionId]: resolution }));
      try {
        await resolveMut.mutateAsync({
          exceptionId: item.exceptionId,
          resolution,
        });
      } catch (e) {
        setServerError(
          e instanceof Error
            ? e.message
            : "We could not record that resolution. Please retry.",
        );
      } finally {
        setPendingByItem((prev) => ({ ...prev, [item.exceptionId]: null }));
      }
    },
    [resolveMut],
  );

  const filtered = useMemo(() => {
    return allItems.filter((it) => {
      if (filter === "open") return it.status === "open";
      if (filter === "dismissed") {
        return it.status !== "open" && isDismissResolution(it.lastResolution);
      }
      return it.status !== "open" && !isDismissResolution(it.lastResolution);
    });
  }, [allItems, filter]);

  // Signal users — show not-applicable panel.
  if (mode === "signal") {
    return (
      <div
        className="flex flex-col gap-6 max-w-3xl"
        data-testid="exceptions-page"
        data-mode={mode}
      >
        <header>
          <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
            Exception Review
          </h1>
          <p className="text-sm text-charcoal-400">
            Managed-mode review of items automation could not act on.
          </p>
        </header>
        <Card data-testid="exceptions-not-applicable">
          <CardContent className="pt-5 pb-5 flex flex-col gap-3">
            <p className="text-sm text-charcoal-300">
              Exception Review applies to ReFi Managed mode only. On Signal, you
              review recommendations manually — return to the recommendations
              list to see what is currently surfaced.
            </p>
            <Link
              href="/us/app/recommendations"
              className="text-sm text-mint-300 underline underline-offset-2"
              data-testid="exceptions-back-to-recommendations"
            >
              Back to recommendations
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="exceptions-page"
      data-mode={mode}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-charcoal-50">
            Exception Review
          </h1>
          {mode !== "unset" && <ModeBadge mode="managed" />}
        </div>
        <p
          className="text-sm text-charcoal-400"
          data-testid="exceptions-explainer"
        >
          Managed execution pauses or skips items that fall outside the active
          policy or need updated information. Resolve the blocker before
          automation continues.
        </p>
      </header>

      <StatusBanner variant="info" data-testid="exceptions-boundary-banner">
        Resolving an exception updates eligibility. It never approves a single
        recommendation and never submits an order outside your signed Execution
        Policy.
      </StatusBanner>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        data-testid="exceptions-filter"
      >
        {(["open", "resolved", "dismissed"] as QueueFilter[]).map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`exceptions-filter-${f}`}
              onClick={() => {
                setFilter(f);
              }}
              className={
                "rounded-md px-3 py-1.5 text-sm transition-colors border " +
                (active
                  ? "bg-charcoal-700 text-charcoal-50 border-charcoal-600"
                  : "bg-transparent text-charcoal-400 border-charcoal-700 hover:bg-charcoal-800")
              }
            >
              {f === "open"
                ? "Open"
                : f === "resolved"
                  ? "Resolved"
                  : "Dismissed"}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && filter === "open" && (
        <Card data-testid="exceptions-empty-open">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm text-charcoal-300">
              No exceptions need review. Managed recommendations that fit your
              active policy continue through the normal automation checks.
            </p>
          </CardContent>
        </Card>
      )}
      {filtered.length === 0 && filter !== "open" && (
        <Card data-testid={`exceptions-empty-${filter}`}>
          <CardContent className="pt-5 pb-5">
            <p className="text-sm text-charcoal-300">
              No {filter} exceptions yet.
            </p>
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-4" data-testid="exceptions-list">
        {filtered.map((item) => (
          <ExceptionCard
            key={item.exceptionId}
            item={item}
            onResolve={onResolve}
            pendingResolution={pendingByItem[item.exceptionId] ?? null}
          />
        ))}
      </section>

      {serverError && (
        <p
          className="text-xs text-status-rejected"
          data-testid="exceptions-server-error"
        >
          {serverError}
        </p>
      )}
    </div>
  );
}
