"use client";

/**
 * Exception Review — the Signal remediation queue.
 *
 * C2a-corrected: this surface was previously gated to "Managed mode only" with
 * a not-applicable panel for Signal users, which contradicted the API split
 * that reserves the remediation categories FOR Signal. It now renders for
 * every investor. Items link to the genuine remediation surfaces (advisory
 * profile editor, Documents, Account/broker); items with no Signal remedy are
 * informational, with no investor override of any kind.
 *
 * Closure truth: route CTAs take the investor to remediation — they do not
 * call the resolve endpoint, and nothing marks an exception resolved from this
 * page. The remediation-completion contract (what observes a completed
 * remediation and closes the exception) is an open backend item recorded in
 * the release ledger. Until it exists, remediated items legitimately remain
 * listed as open.
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
  StatusBanner,
} from "@ui/components";
import {
  describeBackendResolution,
  isDismissResolution,
  useInvestorExceptions,
  useResolveException,
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
    why: "Your broker connection has not provided fresh account data recently, so this item cannot be kept current. Check your broker connection.",
    resolutions: ["reconnect_broker"],
    primaryRoute: "/us/app/account",
    severity: "warning",
  },
  insufficient_buying_power: {
    title: "Not enough buying power",
    why: "Your account does not currently have enough buying power for this item to be reflected as recommended.",
    resolutions: [],
    severity: "warning",
  },
  expired_disclosure: {
    title: "Disclosure needs review",
    why: "An updated disclosure version supersedes one you previously acknowledged. Review the current documents to bring your acknowledgements up to date.",
    resolutions: ["acknowledge_disclosure"],
    primaryRoute: "/us/app/documents",
    severity: "blocked",
  },
  changed_preference: {
    title: "A profile preference changed",
    why: "Your profile changed in a way that affects this item. Review and update your advisory profile so your recommendations reflect it.",
    resolutions: ["update_profile"],
    primaryRoute: "/us/onboarding/profile",
    severity: "warning",
  },
  stale_profile: {
    title: "Profile needs review",
    why: "Your advisory profile has not been confirmed recently. Review and update it so your recommendations stay grounded in current information.",
    resolutions: ["update_profile"],
    primaryRoute: "/us/onboarding/profile",
    severity: "warning",
  },
  out_of_policy_intent: {
    title: "Recommendation does not fit the active policy",
    why: "This item falls outside your configured guardrails. It stays recorded here; no investor action is available for it in the current release.",
    resolutions: [],
    severity: "blocked",
  },
  missing_consent: {
    title: "A consent is missing",
    why: "A required consent has not been given. Review and accept it in your documents.",
    resolutions: ["acknowledge_disclosure"],
    primaryRoute: "/us/app/documents",
    severity: "blocked",
  },
  broker_disconnected: {
    title: "Broker connection is disconnected",
    why: "Your brokerage connection is no longer active. Reconnect your broker.",
    resolutions: ["reconnect_broker"],
    primaryRoute: "/us/app/account",
    severity: "blocked",
  },
  reconciliation_block: {
    title: "Account is being reconciled",
    why: "ReFi is reconciling your account records with your broker. This clears on its own once reconciliation completes; no action is needed from you.",
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
  const listQ = useInvestorExceptions();
  const resolveMut = useResolveException();
  const [filter, setFilter] = useState<QueueFilter>("open");
  const [pendingByItem, setPendingByItem] = useState<
    Record<string, UiResolution | null>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);

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

  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="exceptions-page"
      data-mode="signal"
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-charcoal-50">
            Exception Review
          </h1>
        </div>
        <p
          className="text-sm text-charcoal-400"
          data-testid="exceptions-explainer"
        >
          Items that need your attention before they can be reflected in your
          recommendations — a stale profile, an unacknowledged disclosure, or a
          broker connection issue. Each links to the place where you can put it
          right.
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
              No exceptions need review. Recommendations that fit your active
              policy continue through the normal automation checks.
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
