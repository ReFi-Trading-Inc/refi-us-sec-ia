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
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function statusTone(status: RecommendationStatus): BadgeTone {
  switch (status) {
    case "CURRENT":
      return "active";
    case "BLOCKED":
    case "EXPIRED":
      return "warning";
    case "SUPERSEDED":
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
  }
}

export function upstreamMessage(
  upstream: Exclude<UpstreamState, { state: "ok" }>,
): string {
  const { upstreamStates } = appCopy.recommendations;
  return upstreamStates[upstream.state];
}
