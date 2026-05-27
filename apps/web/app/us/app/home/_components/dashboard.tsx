"use client";

// 8-card status dashboard for the home screen (MIG-P2.5-09). Each card
// answers one of the five user questions the spec calls out: account state,
// what needs attention, managed-execution state, next action, and what data
// is current. Every card carries a plain-language "What this means" line so
// non-expert investors can read the screen without a glossary.
//
// Cards are read-only signal surfaces. Action is concentrated in the Next
// Action card (one primary CTA per screen, per the brand voice doc).

import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Badge, Card, CardContent } from "@ui/components";
import {
  useActivationStatus,
  useActivity,
  useBrokerConnection,
  useExceptions,
  useTier,
} from "@refi/api-clients";
import { appCopy } from "../../../_content/app-copy";
import { useDocumentAcks } from "../../../_lib/document-acks";

const C = appCopy.home.cards;

// --- Shared card chrome ---------------------------------------------------

type CardShellProps = {
  title: string;
  whatThisMeans: string;
  badge?: ReactNode;
  /** Primary numeric / status line, font-mono. */
  primary?: ReactNode;
  body?: ReactNode;
  cta?: { href: string; label: string };
};

function CardShell({
  title,
  whatThisMeans,
  badge,
  primary,
  body,
  cta,
}: CardShellProps) {
  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-2 h-full">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
            {title}
          </p>
          {badge}
        </div>
        {primary ? (
          <p className="text-base font-mono tabular-nums text-charcoal-50">
            {primary}
          </p>
        ) : null}
        {body ? <div className="text-sm text-charcoal-300">{body}</div> : null}
        <p className="text-xs text-charcoal-500 mt-auto">{whatThisMeans}</p>
        {cta ? (
          <Link
            href={cta.href as Route}
            className="text-xs text-mint-400 hover:text-mint-300 mt-1"
          >
            {cta.label} →
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

// --- 1. Account state -----------------------------------------------------

function AccountStateCard() {
  const { data } = useActivationStatus();
  const { allRequiredAcked } = useDocumentAcks();
  const tier = useTier();
  // Eligibility unlocks Onboarded once KYC/profile/broker pass; Active
  // requires disclosures too. The disclosures signal comes from the
  // client-side ack tracker (MIG-P2.5-06) until the Document Registry
  // ships and the server can compute it authoritatively. Tier is
  // surfaced alongside as a small mono badge so investors can see
  // whether ReFi acts on their behalf (Managed) or only advises (Signal).
  const onboarded = Boolean(
    data?.eligibility && data?.kyc && data?.profile && data?.broker,
  );
  const active = onboarded && allRequiredAcked;
  const eligible = Boolean(data?.eligibility);
  const tierLabel =
    tier === "managed"
      ? C.tier.managed
      : tier === "admin"
        ? C.tier.admin
        : C.tier.signal;

  const state = active
    ? C.accountState.active
    : onboarded
      ? C.accountState.onboarded
      : eligible
        ? C.accountState.eligible
        : "—";

  const tone = active ? "approved" : onboarded ? "active" : "warning";

  return (
    <CardShell
      title={C.accountState.title}
      whatThisMeans={C.accountState.whatThisMeans}
      badge={
        <span className="inline-flex items-center gap-1.5">
          <Badge variant={tone}>{state}</Badge>
          <span className="text-[10px] font-mono uppercase tracking-wider text-charcoal-500">
            {tierLabel}
          </span>
        </span>
      }
      primary={`${eligible ? "✓" : "○"} ${C.accountState.eligible} · ${onboarded ? "✓" : "○"} ${C.accountState.onboarded} · ${active ? "✓" : "○"} ${C.accountState.active}`}
    />
  );
}

// --- 2. Managed execution -------------------------------------------------

function ManagedExecutionCard() {
  const { data } = useActivationStatus();
  const { allRequiredAcked } = useDocumentAcks();
  const tier = useTier();
  const onboarded = Boolean(
    data?.eligibility && data?.kyc && data?.profile && data?.broker,
  );
  const active = tier === "managed" && onboarded && allRequiredAcked;

  let label: string;
  let tone: "approved" | "warning" | "rejected" | "neutral";
  if (active) {
    label = C.managedExecution.active;
    tone = "approved";
  } else if (tier === "signal" && onboarded) {
    label = C.managedExecution.notActivated;
    tone = "neutral";
  } else if (onboarded && !allRequiredAcked) {
    label = C.managedExecution.blockedDisclosures;
    tone = "rejected";
  } else {
    label = C.managedExecution.blockedOnboarding;
    tone = "warning";
  }

  return (
    <CardShell
      title={C.managedExecution.title}
      whatThisMeans={C.managedExecution.whatThisMeans}
      badge={<Badge variant={tone}>{label}</Badge>}
    />
  );
}

// --- 3. Disclosure status -------------------------------------------------

function DisclosureStatusCard() {
  const { requiredAckedCount, requiredTotal } = useDocumentAcks();
  const tone: "approved" | "warning" | "rejected" =
    requiredAckedCount === requiredTotal
      ? "approved"
      : requiredAckedCount === 0
        ? "rejected"
        : "warning";

  const text = C.disclosures.acknowledgedTemplate
    .replace("{ack}", String(requiredAckedCount))
    .replace("{total}", String(requiredTotal));

  return (
    <CardShell
      title={C.disclosures.title}
      whatThisMeans={C.disclosures.whatThisMeans}
      badge={<Badge variant={tone}>{text}</Badge>}
      cta={{ href: "/us/app/documents", label: C.disclosures.cta }}
    />
  );
}

// --- 4. Broker -------------------------------------------------------------

function BrokerStatusCard() {
  const { data, isLoading } = useBrokerConnection();

  if (isLoading) {
    return (
      <CardShell
        title={C.broker.title}
        whatThisMeans={C.broker.whatThisMeans}
        body={<span className="text-charcoal-500">…</span>}
      />
    );
  }

  if (!data) {
    return (
      <CardShell
        title={C.broker.title}
        whatThisMeans={C.broker.whatThisMeans}
        badge={<Badge variant="rejected">{C.broker.notConnected}</Badge>}
        cta={{ href: "/us/onboarding/broker", label: C.broker.cta }}
      />
    );
  }

  if (data.status === "disconnected") {
    return (
      <CardShell
        title={C.broker.title}
        whatThisMeans={C.broker.whatThisMeans}
        badge={<Badge variant="rejected">{C.broker.disconnected}</Badge>}
        primary={data.broker_name}
        cta={{ href: "/us/onboarding/broker", label: C.broker.cta }}
      />
    );
  }

  if (data.status === "pending") {
    return (
      <CardShell
        title={C.broker.title}
        whatThisMeans={C.broker.whatThisMeans}
        badge={<Badge variant="warning">{C.broker.pending}</Badge>}
        primary={data.broker_name}
      />
    );
  }

  const stale = Boolean(data.data_stale);
  return (
    <CardShell
      title={C.broker.title}
      whatThisMeans={C.broker.whatThisMeans}
      badge={
        <Badge variant={stale ? "warning" : "approved"}>
          {stale ? C.broker.connectedStale : C.broker.connectedFresh}
        </Badge>
      }
      primary={data.broker_name}
      body={
        data.last_synced_at ? (
          <p className="text-xs font-mono text-charcoal-500">
            {C.broker.lastSyncLabel}:{" "}
            {new Date(data.last_synced_at).toLocaleString()}
          </p>
        ) : undefined
      }
    />
  );
}

// --- 5. Compliance --------------------------------------------------------

function ComplianceStatusCard() {
  // Today the compliance preview is MSW-driven and always responsive.
  // When the real Compliance Adapter lands, this card reads its health
  // endpoint. For now: operational unless a global health flag flips.
  const status: "operational" | "degraded" | "unavailable" = "operational";
  const tone: "approved" | "warning" | "rejected" =
    status === "operational"
      ? "approved"
      : status === "degraded"
        ? "warning"
        : "rejected";
  const label =
    status === "operational"
      ? C.compliance.operational
      : status === "degraded"
        ? C.compliance.degraded
        : C.compliance.unavailable;

  return (
    <CardShell
      title={C.compliance.title}
      whatThisMeans={C.compliance.whatThisMeans}
      badge={<Badge variant={tone}>{label}</Badge>}
    />
  );
}

// --- 6. Next action -------------------------------------------------------

function NextActionCard() {
  const { data: activation } = useActivationStatus();
  const { allRequiredAcked } = useDocumentAcks();
  const tier = useTier();
  const { data: exceptions } = useExceptions();

  // Tier-aware priority order:
  //   1. Onboarding incomplete   → Complete onboarding
  //   2. Disclosures pending     → Acknowledge disclosures
  //   3. Pending exceptions      → Approve N exceptions (Managed only)
  //   4. Signal-tier onboarded   → Turn on Managed Execution
  //   5. Else                    → No action needed
  //
  // Per `09-daniel-answers-and-product-reframe.md §1 Q5`, this card NEVER
  // says "Review pending recommendation" — Managed users don't review
  // per-rec; Signal users don't either (recommendations are advisory).

  let title: string = C.nextAction.none;
  let body: string = C.nextAction.noneBody;
  let cta: CardShellProps["cta"] | undefined;
  let tone: "active" | "warning" | "rejected" | "neutral" = "neutral";

  const onboarded = Boolean(
    activation?.eligibility &&
    activation?.kyc &&
    activation?.profile &&
    activation?.broker,
  );

  const openExceptions = (exceptions ?? []).filter(
    (e) => e.status === "pending",
  );

  if (!onboarded) {
    title = C.nextAction.completeOnboarding;
    body = C.nextAction.completeOnboardingBody;
    cta = { href: "/us/onboarding/kyc", label: "Continue" };
    tone = "warning";
  } else if (!allRequiredAcked) {
    title = C.nextAction.ackDisclosures;
    body = C.nextAction.ackDisclosuresBody;
    cta = { href: "/us/app/documents", label: C.disclosures.cta };
    tone = "rejected";
  } else if (tier === "managed" && openExceptions.length > 0) {
    const n = openExceptions.length;
    title = C.nextAction.approveExceptions;
    body = C.nextAction.approveExceptionsBodyTemplate
      .replace("{n}", String(n))
      .replace("{s}", n === 1 ? "" : "s");
    cta = {
      href: "/us/app/managed/exceptions",
      label: "Open Exception Review",
    };
    tone = "warning";
  } else if (tier === "signal") {
    title = C.nextAction.upgradeToManaged;
    body = C.nextAction.upgradeToManagedBody;
    cta = { href: "/us/app/managed/activate", label: "Activate" };
    tone = "active";
  }

  return (
    <CardShell
      title={C.nextAction.title}
      whatThisMeans={C.nextAction.whatThisMeans}
      badge={<Badge variant={tone}>{title}</Badge>}
      body={<p>{body}</p>}
      cta={cta}
    />
  );
}

// --- 7. Open exceptions ---------------------------------------------------

function OpenExceptionsCard() {
  // Real Exception Review queue: count items in the canonical /v1/exceptions
  // feed where status === "pending". Was previously reading shallow rec
  // status==="review" — that conflated the policy-engine REVIEW verdict
  // (an internal state) with the investor-facing Exception Review queue
  // (the only Managed-tier per-decision investor surface).
  const { data: exceptions } = useExceptions();
  const count = (exceptions ?? []).filter((e) => e.status === "pending").length;
  const tone: "approved" | "warning" = count === 0 ? "approved" : "warning";
  const label =
    count === 0 ? C.exceptions.none : `${count} ${C.exceptions.countLabel}`;
  return (
    <CardShell
      title={C.exceptions.title}
      whatThisMeans={C.exceptions.whatThisMeans}
      badge={<Badge variant={tone}>{label}</Badge>}
      cta={
        count > 0
          ? { href: "/us/app/managed/exceptions", label: C.exceptions.cta }
          : undefined
      }
    />
  );
}

// --- Footer: data freshness -----------------------------------------------

function DataFreshnessFooter() {
  // Client-rendered timestamp — re-renders on each navigation but does not
  // poll. A future ticket can wire a live "updated Ns ago" ticker.
  const now =
    typeof window !== "undefined" ? new Date().toLocaleTimeString() : "";
  return (
    <p className="text-xs font-mono text-charcoal-500 text-right pt-2">
      {C.dataFreshness.label}: {now} · {C.dataFreshness.sourcesLabel}:{" "}
      {C.dataFreshness.sources}
    </p>
  );
}

// --- Recent activity (replaces the old positions-slice mislabel) ----------

export function RecentActivity() {
  const { data, isLoading } = useActivity();
  const items = (data ?? []).slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-charcoal-300">
          {appCopy.home.recentActivity}
        </h2>
        <Link
          href="/us/app/activity"
          className="text-xs text-mint-400 hover:text-mint-300"
        >
          {appCopy.home.viewAll}
        </Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-charcoal-500">…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-charcoal-500">
          {appCopy.activity.emptyState}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-3 rounded-md border border-charcoal-800 bg-charcoal-900 px-3 py-2"
            >
              <Badge variant="system">{e.kind}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-charcoal-200">{e.description}</p>
                <p className="text-xs font-mono text-charcoal-500 mt-0.5">
                  {new Date(e.ts).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Composed dashboard ---------------------------------------------------

export function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
        <AccountStateCard />
        <ManagedExecutionCard />
        <DisclosureStatusCard />
        <BrokerStatusCard />
        <ComplianceStatusCard />
        <NextActionCard />
        <OpenExceptionsCard />
      </div>
      <DataFreshnessFooter />
    </div>
  );
}
