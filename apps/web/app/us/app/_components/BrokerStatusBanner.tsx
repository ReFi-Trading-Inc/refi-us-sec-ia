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

export function BrokerStatusBanner() {
  const { data, isLoading } = useBrokerConnection();
  if (isLoading || !data) return null;

  if (data.status === "disconnected") {
    return (
      <StatusBanner variant="error" title={brokerStatus.disconnectedTitle}>
        <p className="mb-1">{brokerStatus.disconnectedBody}</p>
        <Link
          href="/us/onboarding/broker"
          className="text-status-rejected underline underline-offset-2 hover:no-underline"
        >
          {brokerStatus.reconnectAction}
        </Link>
      </StatusBanner>
    );
  }

  if (data.status === "pending") {
    return (
      <StatusBanner variant="info" title={brokerStatus.pendingTitle}>
        {brokerStatus.pendingBody}
      </StatusBanner>
    );
  }

  if (data.data_stale) {
    return (
      <StatusBanner variant="warning" title={brokerStatus.staleTitle}>
        <p className="mb-1">{brokerStatus.staleBody}</p>
        {data.last_synced_at ? (
          <p className="text-xs font-mono opacity-80">
            {brokerStatus.staleLastSyncedLabel}:{" "}
            {new Date(data.last_synced_at).toLocaleString()}
          </p>
        ) : null}
      </StatusBanner>
    );
  }

  return null;
}
