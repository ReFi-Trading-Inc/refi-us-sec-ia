/**
 * ExceptionReview — exception items the investor must resolve under
 * Managed mode, plus an append-only resolution log.
 *
 * The single per-decision investor touchpoint allowed by Rule 203A-2(e).
 * Resolution category is constrained by ExceptionResolution
 * (apps/web/src/lib/sec203a/actions.ts) — anything outside is rejected
 * at the BFF.
 */
import {
  appendOnlyStore,
  kvStore,
  makePrototypeMeta,
  type PrototypeMeta,
} from "../store";
import type { ExceptionResolution } from "../../sec203a/actions";

export type ExceptionStatus = "open" | "resolved" | "expired";

export type ExceptionKind =
  | "stale_broker_data"
  | "insufficient_buying_power"
  | "expired_disclosure"
  | "changed_preference"
  | "stale_profile"
  | "out_of_policy_intent";

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
