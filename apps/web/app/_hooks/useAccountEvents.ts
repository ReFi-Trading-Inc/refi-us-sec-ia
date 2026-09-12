"use client";

/**
 * Browser subscription to the same-origin account event stream
 * (`/api/v1/investor/events`). Events are refresh SIGNALS: each one
 * invalidates the projection it names so the page refetches backend truth.
 * The browser never opens the upstream stream and never reads state from an
 * event body beyond labelling it. EventSource reconnects with Last-Event-ID.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AccountEvent } from "@lib/investor-api/events";
import { useAuth } from "../_providers/auth/AuthProvider";

export type LiveConnection = "connecting" | "live" | "reconnecting" | "closed";

export interface LiveEventView {
  eventId: string;
  eventType: AccountEvent["event_type"];
  entityId: string;
  status: string;
  occurredAt: string;
  reasonCodes: string[];
}

const QUERY_KEYS_FOR_EVENT: Record<string, ReadonlyArray<readonly string[]>> = {
  "valuation.updated": [["investor", "portfolio"]],
  "order.updated": [
    ["investor", "activity"],
    ["investor", "portfolio"],
  ],
  "fill.recorded": [
    ["investor", "activity"],
    ["investor", "portfolio"],
  ],
  "reconciliation.updated": [
    ["investor", "activity"],
    ["investor", "portfolio"],
  ],
  "recommendation.updated": [
    ["investor", "recommendations"],
    ["investor", "activity"],
  ],
  "preference.updated": [
    ["investor", "portfolio"],
    ["investor", "activity"],
  ],
  "account_intent.updated": [["investor", "activity"]],
  "risk_decision.updated": [["investor", "activity"]],
  "execution_plan.updated": [["investor", "activity"]],
  "compliance_profile_attestation.updated": [["investor"]],
  "consent.updated": [["investor"]],
  "brokerage_connection.updated": [["investor"]],
  "brokerage_sync.updated": [["investor"]],
  "allocation.updated": [["investor"]],
  "action_receipt.updated": [["investor"]],
  "trading_control.updated": [["investor"]],
};

export function useAccountEvents(
  options: { enabled?: boolean; onEvent?: (e: LiveEventView) => void } = {},
) {
  const auth = useAuth();
  const enabled = (options.enabled ?? true) && auth.status === "authenticated";
  const scope = `${auth.authId ?? ""}:${auth.accountId ?? ""}`;
  const qc = useQueryClient();
  const [connection, setConnection] = useState<LiveConnection>("connecting");
  const [recent, setRecent] = useState<LiveEventView[]>([]);
  const onEventRef = useRef(options.onEvent);
  useEffect(() => {
    onEventRef.current = options.onEvent;
  });

  useEffect(() => {
    setRecent([]);
    if (
      !enabled ||
      typeof window === "undefined" ||
      typeof EventSource === "undefined"
    )
      return;
    const es = new EventSource("/api/v1/investor/events", {
      withCredentials: true,
    });
    es.onopen = () => {
      setConnection("live");
      // Includes reconnect after expired cursors/auth renewal: recover canonical
      // reads even when no new event arrives to invalidate a stale cache.
      void qc.invalidateQueries({ queryKey: ["investor"] });
    };
    es.onerror = () => {
      setConnection((c) => (c === "closed" ? c : "reconnecting"));
    };
    const handler = (raw: MessageEvent<string>) => {
      let ev: AccountEvent;
      try {
        ev = JSON.parse(raw.data) as AccountEvent;
      } catch {
        return;
      }
      const view: LiveEventView = {
        eventId: ev.event_id,
        eventType: ev.event_type,
        entityId: ev.data.entity_id,
        status: ev.data.status,
        occurredAt: ev.occurred_at,
        reasonCodes: [...ev.data.reason_codes],
      };
      setRecent((prev) =>
        [view, ...prev.filter((item) => item.eventId !== view.eventId)].slice(
          0,
          12,
        ),
      );
      for (const key of QUERY_KEYS_FOR_EVENT[ev.event_type] ?? []) {
        void qc.invalidateQueries({ queryKey: [...key] });
      }
      onEventRef.current?.(view);
    };
    es.addEventListener("upstream", () => {
      void qc.invalidateQueries({ queryKey: ["investor"] });
    });
    for (const type of Object.keys(QUERY_KEYS_FOR_EVENT)) {
      es.addEventListener(type, handler as EventListener);
    }
    return () => {
      setConnection("closed");
      es.close();
    };
  }, [enabled, qc, scope]);

  return { connection, recent };
}
