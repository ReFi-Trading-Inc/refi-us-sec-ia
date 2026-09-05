"use client";

/**
 * Mounts the account event stream once for the app shell, surfaces fills and
 * order changes as toasts, and renders the live status strip. Everything
 * shown is a backend event; nothing is inferred client-side.
 */
import { createContext, useCallback, useContext } from "react";
import { useToast } from "@ui/components";
import {
  useAccountEvents,
  type LiveConnection,
  type LiveEventView,
} from "../../../_hooks/useAccountEvents";
import { appCopy } from "../../_content/app-copy";

const { live } = appCopy;

interface LiveContextValue {
  connection: LiveConnection;
  recent: LiveEventView[];
}
const LiveContext = createContext<LiveContextValue>({
  connection: "closed",
  recent: [],
});
export const useLiveEvents = () => useContext(LiveContext);

export function LiveEventsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const onEvent = useCallback(
    (e: LiveEventView) => {
      if (e.eventType === "fill.recorded") {
        toast({
          variant: "success",
          title: live.toastFill,
          description: `${e.entityId} · ${e.status}`,
          duration: 4000,
        });
      } else if (e.eventType === "order.updated") {
        toast({
          variant: "info",
          title: `${live.toastOrder} ${e.status}`,
          description: e.entityId,
          duration: 3500,
        });
      } else if (e.eventType === "recommendation.updated") {
        toast({
          variant: "info",
          title: `${live.toastRecommendation} ${e.status}`,
          description: e.entityId,
          duration: 3500,
        });
      } else if (
        e.eventType === "risk_decision.updated" &&
        e.status === "DENIED"
      ) {
        toast({
          variant: "warning",
          title: live.toastRiskDenied,
          description: e.reasonCodes.join(", "),
          duration: 5000,
        });
      }
    },
    [toast],
  );
  const value = useAccountEvents({ onEvent });
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function LiveStatusStrip() {
  const { connection, recent } = useLiveEvents();
  const last = recent[0];
  const tone =
    connection === "live"
      ? "bg-mint-400"
      : connection === "reconnecting" || connection === "connecting"
        ? "bg-status-warning"
        : "bg-charcoal-500";
  return (
    <div
      className="flex items-center justify-between gap-4 text-[11px] font-mono text-charcoal-400"
      data-testid="live-status-strip"
      data-connection={connection}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${tone} ${connection === "live" ? "motion-safe:animate-pulse" : ""}`}
          aria-hidden="true"
        />
        {live.label} · {live.connection[connection]}
      </span>
      {last && (
        <span className="truncate" data-testid="live-last-event">
          {last.eventType} · {last.status} ·{" "}
          {new Date(last.occurredAt).toLocaleTimeString("en-US", {
            hour12: false,
          })}
        </span>
      )}
    </div>
  );
}
