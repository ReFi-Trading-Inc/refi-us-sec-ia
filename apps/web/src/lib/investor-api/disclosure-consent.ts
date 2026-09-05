/**
 * Disclosure / consent — the first C1b-2 slice migrated onto Daniel's
 * Investor API (docs/releases/2026-09-signal/c1b2-browser-direct-reclassification.md
 * row 21: `POST /v1/documents/acknowledge` → `recordConsent`).
 *
 * Mapping (v1.1.0-alpha.2, `contract.json`):
 *   read  → `listEffectiveDisclosures`  GET  /api/v1/investor/disclosures   → DisclosurePageEnvelope
 *   write → `recordConsent`             POST /api/v1/investor/consents      → ConsentReceiptEnvelope (201)
 *
 * Rules kept here, not in the route or the page:
 *   - The consent names the EXACT `disclosure_key`, integer
 *     `disclosure_version` and 64-hex `disclosure_hash` of an EFFECTIVE
 *     disclosure the backend currently lists. The BFF re-reads the effective
 *     list and refuses a client tuple that does not match it (stale) — it
 *     never reconstructs or normalises a version or hash.
 *   - `consent_key` — OWNER DECISION (Daniel, 2026-09-04): for Alpha the
 *     unified disclosure has a 1:1 consent/disclosure relationship — "consent
 *     must equal disclosure right now … obtain disclosure key then copy it into
 *     consent key". So the BFF COPIES the `disclosure_key` returned by
 *     `listEffectiveDisclosures` into `consent_key`. This is "copy for Alpha",
 *     NOT "these are the same concept": the fields stay distinct because later
 *     releases add separate disclosures (automated trading, trading risk, …)
 *     where `consent_key !== disclosure_key`. Do not merge, alias, or map them.
 *   - `Idempotency-Key` is deterministic over (account, key, version, hash,
 *     action): a genuine replay reuses the same key with a byte-identical
 *     body, so the backend can answer with the original receipt; a changed
 *     tuple is a different key. Never a timestamp or random value.
 *   - `action` is always `ACCEPT` here. Withdrawal is not part of this slice.
 *   - Contract drift (unknown field/enum/status/header) is the frozen client's
 *     `ContractVersionMismatchError` and is NOT caught here: it propagates so
 *     the route fails closed. Only the contract-declared error envelope
 *     (`InvestorApiError`) is translated into an outcome.
 */
import { createHash } from "node:crypto";
import {
  InvestorApiError,
  type OperationResponse,
} from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";

export type EffectiveDisclosure =
  OperationResponse<"listEffectiveDisclosures">["data"]["items"][number];
export type ConsentReceipt = OperationResponse<"recordConsent">["data"];

export interface DisclosureSelection {
  disclosureKey: string;
  disclosureVersion: number;
  disclosureHash: string;
}

export type AcknowledgeOutcome =
  | { kind: "recorded"; status: number; receipt: ConsentReceipt }
  | { kind: "not_effective"; disclosureKey: string }
  | {
      kind: "stale";
      effective: Pick<
        EffectiveDisclosure,
        "disclosure_version" | "content_hash"
      >;
    }
  | {
      kind: "upstream_error";
      status: number;
      code: string;
      correlationId: string | null;
      retryAfterSeconds: number | null;
    };

/** `Idempotency-Key`: 8–128 chars per the contract; deterministic, never random. */
export function consentIdempotencyKey(
  accountId: string,
  selection: DisclosureSelection,
  action: "ACCEPT" | "WITHDRAW",
): string {
  const digest = createHash("sha256")
    .update(
      [
        accountId,
        selection.disclosureKey,
        String(selection.disclosureVersion),
        selection.disclosureHash,
        action,
      ].join("\n"),
    )
    .digest("hex");
  return `consent_${digest.slice(0, 48)}`;
}

/** Effective disclosures as the backend lists them (first page; the contract's cursor is honoured). */
export async function listEffectiveDisclosures(
  client: InvestorApiReadClient,
): Promise<{ items: EffectiveDisclosure[]; hasMore: boolean }> {
  const res = await client.call("listEffectiveDisclosures");
  return { items: res.data.data.items, hasMore: res.data.data.page.has_more };
}

/**
 * Record ACCEPT consent for one effective disclosure, verifying the client's
 * (key, version, hash) against the backend's current effective list first.
 */
export async function acknowledgeDisclosure(
  client: InvestorApiReadClient,
  args: { accountId: string; selection: DisclosureSelection },
): Promise<AcknowledgeOutcome> {
  const { selection, accountId } = args;
  let effective: EffectiveDisclosure[];
  try {
    effective = (await listEffectiveDisclosures(client)).items;
  } catch (err) {
    if (err instanceof InvestorApiError) return upstreamError(err);
    throw err;
  }
  const match = effective.find(
    (d) =>
      d.disclosure_key === selection.disclosureKey && d.status === "EFFECTIVE",
  );
  if (match === undefined) {
    return { kind: "not_effective", disclosureKey: selection.disclosureKey };
  }
  if (
    match.disclosure_version !== selection.disclosureVersion ||
    match.content_hash !== selection.disclosureHash
  ) {
    return {
      kind: "stale",
      effective: {
        disclosure_version: match.disclosure_version,
        content_hash: match.content_hash,
      },
    };
  }

  const action = "ACCEPT" as const;
  try {
    const res = await client.call("recordConsent", {
      idempotencyKey: consentIdempotencyKey(accountId, selection, action),
      body: {
        account_id: accountId,
        // Alpha 1:1 rule (Daniel 2026-09-04, see header): copy the listed
        // disclosure key into the consent key. Distinct field on purpose.
        consent_key: match.disclosure_key,
        disclosure_key: match.disclosure_key,
        disclosure_version: match.disclosure_version,
        disclosure_hash: match.content_hash,
        action,
      },
    });
    return { kind: "recorded", status: res.status, receipt: res.data.data };
  } catch (err) {
    if (err instanceof InvestorApiError) return upstreamError(err);
    throw err;
  }
}

function upstreamError(err: InvestorApiError): AcknowledgeOutcome {
  return {
    kind: "upstream_error",
    status: err.status,
    code: err.code,
    correlationId: err.correlationId,
    retryAfterSeconds: err.retryAfterSeconds,
  };
}
