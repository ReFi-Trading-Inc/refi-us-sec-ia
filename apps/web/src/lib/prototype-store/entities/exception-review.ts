/**
 * ExceptionReview — exception items the investor must resolve under
 * Managed mode, plus an append-only resolution log.
 *
 * The single per-decision investor touchpoint allowed by Rule 203A-2(e).
 * Resolution category is constrained by ExceptionResolution
 * (apps/web/src/lib/sec203a/actions.ts) — anything outside is rejected
 * at the BFF.
 *
 * ─── Exception Review is NON-RISK by construction ──────────────────────────
 *
 * Every `ExceptionKind` below is a RESOLVABLE OPERATIONAL OR CONSENT
 * condition: something the investor can actually clear (reconnect a broker,
 * acknowledge a disclosure, refresh a profile) or wait out.
 *
 * A backend risk rejection is NOT one of them. Daniel's Q1 answer
 * (2026-05-30, upheld 2026-07-28) makes `RiskDecision` binary — `approved` or
 * `rejected` — and a `rejected` decision is TERMINAL for its intent. It never
 * becomes an exception, because an exception implies a resolution path and a
 * risk rejection has none. Routing a risk denial through this queue would
 * manufacture exactly the investor risk-override that
 * docs/phase2-7-daniel-direction-resolution.md §5 permanently excludes.
 *
 * `out_of_policy_intent` is the one that most invites confusion. It means the
 * intent fell outside the guardrails in the investor's OWN signed Execution
 * Policy — a BFF-owned artifact — not that the backend risk gate rejected it.
 * Note its resolutions are `dismiss_exception` and `pause_managed` only:
 * neither releases the intent, so even this kind cannot function as an
 * override. See ExceptionKindReason below for the guarantee in type form.
 */
import {
  appendOnlyStore,
  kvStore,
  makePrototypeMeta,
  type PrototypeMeta,
} from "../store";
import type { ExceptionResolution } from "../../sec203a/actions";

export type ExceptionStatus = "open" | "resolved" | "expired";

/**
 * Resolvable non-risk conditions. The first six shipped in Phase 2; the last
 * three complete the set Daniel named on 2026-07-28 (missing consent, broker
 * disconnection, reconciliation block) so a backend condition with a genuine
 * investor-side remedy has a home that is not the risk path.
 */
export const EXCEPTION_KINDS = [
  "stale_broker_data",
  "insufficient_buying_power",
  "expired_disclosure",
  "changed_preference",
  "stale_profile",
  "out_of_policy_intent",
  // Added 2026-07-30 (Daniel's resolvable non-risk list).
  "missing_consent",
  "broker_disconnected",
  "reconciliation_block",
] as const;

export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export function isExceptionKind(value: unknown): value is ExceptionKind {
  return (
    typeof value === "string" &&
    (EXCEPTION_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Kinds that must NEVER exist: a risk rejection is terminal, so there is no
 * such thing as a risk exception the investor can resolve. Exported only so
 * the type checker can prove the allowed union excludes them.
 */
export type ForbiddenExceptionKind =
  | "risk_rejected"
  | "risk_denied"
  | "risk_review"
  | "risk_override"
  | "denied_by_risk"
  | "risk_limit_breach";

// Compile-time proof no risk-derived kind can enter the exception queue.
type _ForbiddenIsNotAllowed = ForbiddenExceptionKind & ExceptionKind;
type _Assert<T extends never> = T;
type _Check = _Assert<_ForbiddenIsNotAllowed>;

export interface ExceptionReview {
  accountId: string;
  exceptionId: string;
  kind: ExceptionKind;
  status: ExceptionStatus;
  intentRef?: string;
  summary: string;
  openedAt: string;
  expiresAt?: string;
  meta: PrototypeMeta;
}

export interface ExceptionResolutionEvent {
  accountId: string;
  exceptionId: string;
  resolution: ExceptionResolution;
  reasonCode?: string;
  clientAttestation: boolean;
  signedAt: string;
  authId: string;
  correlationId: string;
}

const reviews = kvStore<ExceptionReview>("exception-reviews");
const resolutions = appendOnlyStore<ExceptionResolutionEvent>(
  "exception-resolutions",
);

function reviewKey(accountId: string, exceptionId: string): string {
  return `${accountId}__${exceptionId}`;
}

export async function listExceptionReviews(
  accountId: string,
): Promise<ExceptionReview[]> {
  const all = await reviews.list(`${accountId}__`);
  return all
    .map((e) => e.value)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

export async function getExceptionReview(
  accountId: string,
  exceptionId: string,
): Promise<ExceptionReview | null> {
  return reviews.get(reviewKey(accountId, exceptionId));
}

export async function upsertExceptionReview(args: {
  review: Omit<ExceptionReview, "meta">;
  correlationId: string;
}): Promise<ExceptionReview> {
  const stored: ExceptionReview = {
    ...args.review,
    meta: makePrototypeMeta(args.correlationId),
  };
  await reviews.put(
    reviewKey(args.review.accountId, args.review.exceptionId),
    stored,
  );
  return stored;
}

export async function appendExceptionResolution(
  event: ExceptionResolutionEvent,
): Promise<void> {
  await resolutions.append(event);
  const existing = await getExceptionReview(event.accountId, event.exceptionId);
  if (existing) {
    await reviews.put(reviewKey(event.accountId, event.exceptionId), {
      ...existing,
      status: "resolved",
    });
  }
}

export async function listExceptionResolutions(
  accountId: string,
): Promise<ExceptionResolutionEvent[]> {
  return resolutions.list((e) => e.accountId === accountId);
}
