// Named compliance verdict fixtures for MIG-P2.5-03.
//
// The first 7 codes are UI scenario labels — they don't come from Daniel's
// blueprint, which deliberately leaves the policy taxonomy open-ended
// because it depends on ACE policy bundles (Compliance Adapter.pdf:p6).
// The last 2 (`ACE_UNAVAILABLE`, `INCOMPLETE_KYC`) are the only codes Daniel
// names explicitly (CompAdapter.pdf:p8). We surface both so the UI's
// reason renderer recognizes whichever shape ships first.
//
// Each verdict is a partial OrderPreviewResult missing only `expiry_at` and
// `policy_version` — those are populated by the handler so timestamps stay
// live. Latency band is deterministic per scenario so Playwright snapshots
// are stable.

import type { OrderPreviewResult } from "../../../generated/api";

export type ScenarioVerdict = {
  /** Stable scenario id; used in `?scenario=` query / cookie. */
  id: ScenarioId;
  /** Human-readable label for the dev scenario switcher. */
  label: string;
  /** What the dev should expect to see when this scenario is selected. */
  description: string;
  /** Deterministic round-trip latency in ms. */
  latency_ms: number;
  /** Whether to render as `source: "cache"` or `"fresh"`. */
  source: "cache" | "fresh";
  /** Partial verdict — handler adds expiry_at + policy_version. */
  verdict: Pick<OrderPreviewResult, "status" | "reasons">;
};

export type ScenarioId =
  // UI scenario labels (our 7) — fixture-only, not Daniel-contract codes
  | "ALLOW"
  | "ALLOW_CACHED"
  | "REVIEW_CONCENTRATION"
  | "REVIEW_TAX_IMPACT"
  | "DENY_POSITION_SIZE"
  | "DENY_DISCLOSURE_REQUIRED"
  | "DENY_STALE_BROKER_DATA"
  | "DENY_COMPLIANCE_UNAVAILABLE"
  // Daniel's two explicitly-named codes (CompAdapter.pdf:p8)
  | "REVIEW_ACE_UNAVAILABLE"
  | "DENY_INCOMPLETE_KYC"
  // Non-compliance failure scenarios (broker / order / support)
  | "BROKER_BAD_KEYS"
  | "BROKER_NO_PERMS"
  | "BROKER_UNSUPPORTED_ENV"
  | "ORDER_REJECTED"
  | "ORDER_INSUFFICIENT_BP"
  | "ORDER_BROKER_UNAVAILABLE"
  | "SUPPORT_RATE_LIMIT"
  | "SUPPORT_BLOCKED_BY_POLICY";

export const VERDICT_FIXTURES: Record<ScenarioId, ScenarioVerdict> = {
  ALLOW: {
    id: "ALLOW",
    label: "ALLOW — fresh, low latency",
    description: "Happy path. All guardrails pass; Submit is enabled.",
    latency_ms: 38,
    source: "fresh",
    verdict: { status: "ALLOW", reasons: [] },
  },
  ALLOW_CACHED: {
    id: "ALLOW_CACHED",
    label: "ALLOW — cache hit",
    description: "Verdict served from cache; sub-10ms latency.",
    latency_ms: 8,
    source: "cache",
    verdict: { status: "ALLOW", reasons: [] },
  },
  REVIEW_CONCENTRATION: {
    id: "REVIEW_CONCENTRATION",
    label: "REVIEW — single-name concentration",
    description: "Position exposure approaches per-name cap.",
    latency_ms: 142,
    source: "fresh",
    verdict: {
      status: "REVIEW",
      reasons: [
        {
          code: "REVIEW_CONCENTRATION",
          message:
            "Single-name exposure within 1pp of cap — requires manual review.",
        },
      ],
    },
  },
  REVIEW_TAX_IMPACT: {
    id: "REVIEW_TAX_IMPACT",
    label: "REVIEW — tax impact",
    description: "Short-term capital gain exceeds review threshold.",
    latency_ms: 156,
    source: "fresh",
    verdict: {
      status: "REVIEW",
      reasons: [
        {
          code: "REVIEW_TAX_IMPACT",
          message:
            "Short-term capital gain exceeds per-trade tax-impact review threshold.",
        },
      ],
    },
  },
  DENY_POSITION_SIZE: {
    id: "DENY_POSITION_SIZE",
    label: "DENY — position size limit",
    description: "Order exceeds per-submission quantity cap.",
    latency_ms: 41,
    source: "fresh",
    verdict: {
      status: "DENY",
      reasons: [
        {
          code: "POSITION_SIZE_LIMIT",
          message: "Order exceeds maximum allowed quantity per submission.",
        },
      ],
    },
  },
  DENY_DISCLOSURE_REQUIRED: {
    id: "DENY_DISCLOSURE_REQUIRED",
    label: "DENY — disclosure required",
    description: "User must acknowledge a required disclosure version.",
    latency_ms: 33,
    source: "fresh",
    verdict: {
      status: "DENY",
      reasons: [
        {
          code: "DISCLOSURE_REQUIRED",
          message:
            "Form CRS, ADV Part 2A, and Investment Advisory Agreement acknowledgment required before Managed Execution.",
        },
      ],
    },
  },
  DENY_STALE_BROKER_DATA: {
    id: "DENY_STALE_BROKER_DATA",
    label: "DENY — stale broker data",
    description: "Broker positions older than freshness window.",
    latency_ms: 67,
    source: "fresh",
    verdict: {
      status: "DENY",
      reasons: [
        {
          code: "STALE_PRICES",
          message:
            "Broker position data is older than the freshness window. Reconnect or refresh broker connection.",
        },
      ],
    },
  },
  DENY_COMPLIANCE_UNAVAILABLE: {
    id: "DENY_COMPLIANCE_UNAVAILABLE",
    label: "DENY — compliance unavailable",
    description:
      "Compliance Adapter unreachable. UI escalates to DENY for investor protection (stricter than Daniel's REVIEW+ACE_UNAVAILABLE).",
    latency_ms: 412,
    source: "fresh",
    verdict: {
      status: "DENY",
      reasons: [
        {
          code: "COMPLIANCE_UNAVAILABLE",
          message:
            "Compliance preview did not return a verdict. Submit is disabled until the service is reachable.",
        },
      ],
    },
  },
  // --- Daniel's explicitly-named codes ---
  REVIEW_ACE_UNAVAILABLE: {
    id: "REVIEW_ACE_UNAVAILABLE",
    label: "REVIEW — ACE_UNAVAILABLE (Daniel's named code)",
    description:
      "Daniel's documented fallback: ACE unreachable returns REVIEW with short TTL (CompAdapter.pdf:p8). Note: our UI escalates this to DENY.",
    latency_ms: 312,
    source: "fresh",
    verdict: {
      status: "REVIEW",
      reasons: [
        {
          code: "ACE_UNAVAILABLE",
          message:
            "Compliance evaluation engine unavailable; returning last-known verdict with short TTL.",
        },
      ],
    },
  },
  DENY_INCOMPLETE_KYC: {
    id: "DENY_INCOMPLETE_KYC",
    label: "DENY — INCOMPLETE_KYC (Daniel's named code)",
    description:
      "Daniel's documented KYC-block code (CompAdapter.pdf:p8). Surfaces when KYC attestation is missing or revoked.",
    latency_ms: 28,
    source: "fresh",
    verdict: {
      status: "DENY",
      reasons: [
        {
          code: "INCOMPLETE_KYC",
          message:
            "Identity verification is incomplete or has been revoked. Complete KYC before submitting trades.",
        },
      ],
    },
  },
  // --- Non-compliance failure scenarios (broker / order / support) ---
  BROKER_BAD_KEYS: {
    id: "BROKER_BAD_KEYS",
    label: "Broker: invalid API keys (401)",
    description: "Alpaca rejects the submitted API key pair.",
    latency_ms: 0,
    source: "fresh",
    verdict: { status: "DENY", reasons: [] },
  },
  BROKER_NO_PERMS: {
    id: "BROKER_NO_PERMS",
    label: "Broker: insufficient permissions (422)",
    description:
      "API keys valid but lack required scopes (trading or account-read).",
    latency_ms: 0,
    source: "fresh",
    verdict: { status: "DENY", reasons: [] },
  },
  BROKER_UNSUPPORTED_ENV: {
    id: "BROKER_UNSUPPORTED_ENV",
    label: "Broker: unsupported environment (403)",
    description: "Live keys submitted to paper-only env (or vice versa).",
    latency_ms: 0,
    source: "fresh",
    verdict: { status: "DENY", reasons: [] },
  },
  ORDER_REJECTED: {
    id: "ORDER_REJECTED",
    label: "Order: rejected by broker",
    description: "Broker rejects submitted order (e.g. invalid symbol).",
    latency_ms: 0,
    source: "fresh",
    verdict: { status: "DENY", reasons: [] },
  },
  ORDER_INSUFFICIENT_BP: {
    id: "ORDER_INSUFFICIENT_BP",
    label: "Order: insufficient buying power",
    description: "Account buying power below order notional.",
    latency_ms: 0,
    source: "fresh",
    verdict: { status: "DENY", reasons: [] },
  },
  ORDER_BROKER_UNAVAILABLE: {
    id: "ORDER_BROKER_UNAVAILABLE",
    label: "Order: broker unavailable",
    description: "Broker adapter returns 5xx.",
    latency_ms: 0,
    source: "fresh",
    verdict: { status: "DENY", reasons: [] },
  },
  SUPPORT_RATE_LIMIT: {
    id: "SUPPORT_RATE_LIMIT",
    label: "Support: rate limited (429)",
    description: "Too many tickets in the rate window.",
    latency_ms: 0,
    source: "fresh",
    verdict: { status: "DENY", reasons: [] },
  },
  SUPPORT_BLOCKED_BY_POLICY: {
    id: "SUPPORT_BLOCKED_BY_POLICY",
    label: "Support: blocked by policy (422)",
    description:
      "Server-side support-boundary classifier rejects the ticket category.",
    latency_ms: 0,
    source: "fresh",
    verdict: { status: "DENY", reasons: [] },
  },
};

/** Compliance-verdict scenarios only — for the /orders/preview gate. */
export const COMPLIANCE_SCENARIO_IDS: ScenarioId[] = [
  "ALLOW",
  "ALLOW_CACHED",
  "REVIEW_CONCENTRATION",
  "REVIEW_TAX_IMPACT",
  "DENY_POSITION_SIZE",
  "DENY_DISCLOSURE_REQUIRED",
  "DENY_STALE_BROKER_DATA",
  "DENY_COMPLIANCE_UNAVAILABLE",
  "REVIEW_ACE_UNAVAILABLE",
  "DENY_INCOMPLETE_KYC",
];
