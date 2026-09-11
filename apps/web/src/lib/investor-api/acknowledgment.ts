/**
 * alpha.3 acknowledgment discipline shared by preference confirmation and
 * brokerage disconnect (`preference_mutation` / `brokerage_mutation`):
 *
 *   initial mutation (key A)
 *   → 409 ACKNOWLEDGMENT_REQUIRED with a validated `continuation`
 *   → the COMPLETE continuation is retained durably with the exact intent
 *   → the required disclosure key / version / hash is shown to the investor
 *   → the investor explicitly confirms
 *   → consent is recorded for EXACTLY that disclosure tuple (never inferred
 *     from an earlier generic acceptance); the receipt tuple is re-checked
 *   → confirmation request: the SAME intent + `continuation_ref` +
 *     `consent_receipt_id`, current If-Match, NEW key B (retained for
 *     lost-response recovery only)
 *   → backend result (canonical status) → authoritative re-read.
 *
 * Every step fails closed: unknown/expired/mismatched continuation, changed
 * intent, missing or mismatched consent receipt, reused confirmation.
 */
import { createHash } from "node:crypto";
import {
  InvestorApiError,
  type AcknowledgmentContinuation,
} from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";
import {
  acknowledgeDisclosure,
  type AcknowledgeOutcome,
} from "./disclosure-consent";

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export type ContinuationCheck =
  | { ok: true }
  | { ok: false; reason: "expired" | "not_effective_yet" | "malformed" };

/** The continuation must be currently valid before anything is shown or sent. */
export function checkContinuation(
  c: AcknowledgmentContinuation,
  now: () => number = Date.now,
): ContinuationCheck {
  if (
    !ID_PATTERN.test(c.continuation_ref) ||
    // Runtime guards on constant-typed fields: the client validated the
    // schema, but a hand-built continuation must still be refused.
    (c as { mutation_applied: unknown }).mutation_applied !== false ||
    (c as { retry_idempotency_key: unknown }).retry_idempotency_key !==
      "new_key" ||
    !/^[0-9a-f]{64}$/.test(c.required_disclosure_hash) ||
    c.required_disclosure_version < 1 ||
    c.required_disclosure_key.length === 0
  ) {
    return { ok: false, reason: "malformed" };
  }
  const t = now();
  const exp = Date.parse(c.expires_at);
  const eff = Date.parse(c.effective_at);
  if (!Number.isFinite(exp) || exp <= t)
    return { ok: false, reason: "expired" };
  if (Number.isFinite(eff) && eff > t)
    return { ok: false, reason: "not_effective_yet" };
  return { ok: true };
}

export type ConsentForContinuation =
  | { ok: true; consentReceiptId: string }
  | {
      ok: false;
      reason: "not_effective" | "stale" | "tuple_mismatch" | "upstream";
      status?: number;
      code?: string;
    };

/**
 * Record ACCEPT consent for exactly the disclosure the continuation names and
 * verify the receipt echoes that tuple. A receipt for any other key, version
 * or hash is refused — never "close enough".
 */
export async function recordConsentForContinuation(
  client: InvestorApiReadClient,
  accountId: string,
  c: AcknowledgmentContinuation,
): Promise<ConsentForContinuation> {
  let out: AcknowledgeOutcome;
  try {
    out = await acknowledgeDisclosure(client, {
      accountId,
      selection: {
        disclosureKey: c.required_disclosure_key,
        disclosureVersion: c.required_disclosure_version,
        disclosureHash: c.required_disclosure_hash,
      },
    });
  } catch (err) {
    if (err instanceof InvestorApiError) {
      return {
        ok: false,
        reason: "upstream",
        status: err.status,
        code: err.code,
      };
    }
    throw err;
  }
  if (out.kind === "not_effective")
    return { ok: false, reason: "not_effective" };
  if (out.kind === "stale") return { ok: false, reason: "stale" };
  if (out.kind === "upstream_error") {
    return {
      ok: false,
      reason: "upstream",
      status: out.status,
      code: out.code,
    };
  }
  const r = out.receipt;
  if (
    r.disclosure_key !== c.required_disclosure_key ||
    r.disclosure_version !== c.required_disclosure_version ||
    r.disclosure_hash !== c.required_disclosure_hash ||
    r.status !== "ACTIVE" ||
    r.account_id !== accountId
  ) {
    return { ok: false, reason: "tuple_mismatch" };
  }
  return { ok: true, consentReceiptId: r.consent_receipt_id };
}

export function deterministicKey(parts: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 64);
}

/** Terminal vs retryable partition for alpha.3 mutation profiles. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  429, 500, 502, 503, 504,
]);
export function isRetryable(err: InvestorApiError): boolean {
  return RETRYABLE_STATUSES.has(err.status);
}
