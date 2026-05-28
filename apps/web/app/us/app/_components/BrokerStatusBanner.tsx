"use client";

// Surfaces non-OK broker states (stale data, disconnected, pending handshake)
// on the home and portfolio screens. Hidden when the broker is connected and
// fresh. Reads BrokerConnection via the existing useBrokerConnection hook so
// it picks up persona switches and scenarios automatically.

import Link from "next/link";
import { StatusBanner } from "@ui/components";
import { useBrokerConnection } from "@refi/api-clients";
import { appCopy } from "../../_content/app-copy";

const { brokerStatus } = appCopy;

type BannerStatus = "connected" | "stale" | "missing" | "error" | "loading";
type BannerFreshness = "fresh" | "stale" | "unknown";

export function BrokerStatusBanner() {
  const { data, isLoading } = useBrokerConnection();

  // Stable attributes resolved from the connection state. The wrapper
  // always renders so e2e can read `data-status` / `data-freshness` even
  // when the visual banner is hidden (connected-fresh path). Visual
  // behavior is unchanged.
  const status: BannerStatus = isLoading
    ? "loading"
    : !data
      ? "missing"
      : data.status === "disconnected"
        ? "missing"
        : data.status === "pending"
          ? "error"
          : data.data_stale
            ? "stale"
            : "connected";
  const freshness: BannerFreshness =
    isLoading || !data
      ? "unknown"
      : data.data_stale
        ? "stale"
        : data.status === "connected"
          ? "fresh"
          : "unknown";

  return (
    <div
      data-testid="broker-status-banner"
      data-status={status}
      data-freshness={freshness}
    >
      {!isLoading && data && data.status === "disconnected" ? (
        <StatusBanner variant="error" title={brokerStatus.disconnectedTitle}>
          <p className="mb-1">{brokerStatus.disconnectedBody}</p>
          <Link
            href="/us/onboarding/broker"
            className="text-status-rejected underline underline-offset-2 hover:no-underline"
          >
            {brokerStatus.reconnectAction}
          </Link>
        </StatusBanner>
      ) : !isLoading && data && data.status === "pending" ? (
        <StatusBanner variant="info" title={brokerStatus.pendingTitle}>
          {brokerStatus.pendingBody}
        </StatusBanner>
      ) : !isLoading && data && data.data_stale ? (
        <StatusBanner variant="warning" title={brokerStatus.staleTitle}>
          <p className="mb-1">{brokerStatus.staleBody}</p>
          {data.last_synced_at ? (
            <p className="text-xs font-mono opacity-80">
              {brokerStatus.staleLastSyncedLabel}:{" "}
              {new Date(data.last_synced_at).toLocaleString()}
            </p>
          ) : null}
        </StatusBanner>
      ) : null}
    </div>
  );
}
