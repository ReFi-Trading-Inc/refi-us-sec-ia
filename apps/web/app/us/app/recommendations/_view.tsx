/**
 * Presentation helpers shared by the Signal recommendation pages. Pure.
 */
import type {
  FreshnessStatus,
  RecommendationStatus,
} from "@lib/investor-api/recommendations";
import type { UpstreamState } from "@lib/investor-api/upstream-state";
import { appCopy } from "../../_content/app-copy";

type BadgeTone = "active" | "warning" | "neutral";

export function formatDateTime(iso: string): string {
  if (!Number.isFinite(Date.parse(iso))) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function statusTone(status: RecommendationStatus): BadgeTone {
  switch (status.toUpperCase()) {
    case "CURRENT":
      return "active";
    case "BLOCKED":
    case "EXPIRED":
      return "warning";
    case "SUPERSEDED":
      return "neutral";
    default:
      return "neutral";
  }
}

export function freshnessTone(status: FreshnessStatus): BadgeTone {
  switch (status) {
    case "fresh":
      return "active";
    case "stale":
    case "expired":
      return "warning";
    default:
      return "neutral";
  }
}

export function upstreamMessage(
  upstream: Exclude<UpstreamState, { state: "ok" }>,
): string {
  const { upstreamStates } = appCopy.recommendations;
  return upstreamStates[upstream.state];
}
