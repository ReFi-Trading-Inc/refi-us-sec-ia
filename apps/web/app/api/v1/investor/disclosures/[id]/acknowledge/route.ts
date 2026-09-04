/**
 * POST /api/v1/investor/disclosures/[id]/acknowledge
 *
 * Records ACCEPT consent for ONE effective disclosure through the frozen
 * v1.1.0-alpha.2 Investor API client (`recordConsent`). `[id]` is the
 * backend `disclosure_key`; the body carries the exact `disclosure_version`
 * and `disclosure_hash` the browser saw. The BFF re-reads the backend's
 * effective list and refuses a tuple that no longer matches (409 stale) —
 * it never reconstructs or normalises a version or hash (reclassification
 * row 21; package README "consent … exact effective disclosures").
 *
 * Idempotency: `Idempotency-Key` is deterministic over (account, key,
 * version, hash, ACCEPT) so a retry replays the same body; mutations are
 * never retried automatically (frozen client rule).
 *
 * Fail closed: a contract mismatch from the frozen client is a 502 with
 * reasonCode `upstream_contract_mismatch`, never a swallowed success. The
 * `acknowledgeDisclosure` action remains Signal-allowed (release-policy) and
 * BFF-only (no admin verb) — unchanged from the prototype era.
 */
import { z } from "zod";
import { bffMutate } from "@lib/bff/handler";
import {
  ContractVersionMismatchError,
  InvestorApiTransportError,
} from "@refi/api-clients/investor-api";
import {
  GoogleCredentialUnavailableError,
  investorApiClientFor,
  SessionAssertionInputError,
  UpstreamNotConfiguredError,
} from "@lib/investor-api/gateway";
import { acknowledgeDisclosure } from "@lib/investor-api/disclosure-consent";

const ackBody = z.object({
  /** Integer version as listed by `listEffectiveDisclosures`. */
  disclosure_version: z.number().int().min(1),
  /** The listed `content_hash` — 64 lowercase hex, echoed exactly. */
  disclosure_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

type AckBody = z.infer<typeof ackBody>;

function disclosureKeyFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("disclosures");
  const key = parts[i + 1];
  return key === undefined || key === "" ? null : decodeURIComponent(key);
}

export const POST = bffMutate<AckBody>({
  action: "acknowledgeDisclosure",
  source: "backend",
  parse: (body) => ackBody.parse(body),
  apply: async (ctx) => {
    const disclosureKey = disclosureKeyFromUrl(ctx.req.url);
    if (disclosureKey === null) {
      return {
        refuse: "bad_request" as const,
        message: "Disclosure key missing from URL.",
        reasonCode: "disclosure_key_missing",
      };
    }
    if (!ctx.auth.accountId) {
      // Consent is an ACCOUNT-scoped receipt in the contract (`account_id`).
      return {
        data: { ok: false, reason: "account_not_linked" },
        outcome: "blocked" as const,
        reasonCode: "account_not_linked",
        status: 412,
      };
    }

    let outcome;
    try {
      const client = investorApiClientFor(ctx.auth);
      outcome = await acknowledgeDisclosure(client, {
        accountId: ctx.auth.accountId,
        selection: {
          disclosureKey,
          disclosureVersion: ctx.input.disclosure_version,
          disclosureHash: ctx.input.disclosure_hash,
        },
      });
    } catch (err) {
      if (err instanceof ContractVersionMismatchError) {
        return {
          data: {
            ok: false,
            reason: "upstream_contract_mismatch",
            schema: err.schema,
          },
          outcome: "blocked" as const,
          reasonCode: "upstream_contract_mismatch",
          status: 502,
        };
      }
      if (
        err instanceof UpstreamNotConfiguredError ||
        err instanceof GoogleCredentialUnavailableError ||
        err instanceof SessionAssertionInputError ||
        err instanceof InvestorApiTransportError
      ) {
        return {
          data: { ok: false, reason: "upstream_unavailable", detail: err.name },
          outcome: "blocked" as const,
          reasonCode: "upstream_unavailable",
          status: 503,
        };
      }
      throw err;
    }

    switch (outcome.kind) {
      case "recorded":
        return {
          data: {
            ok: true,
            receipt: outcome.receipt,
            upstreamStatus: outcome.status,
            contractVersion: "v1.1.0-alpha.2",
          },
          references: [
            `consent-receipt:${outcome.receipt.consent_receipt_id}`,
            `disclosure:${outcome.receipt.disclosure_key}/v${String(outcome.receipt.disclosure_version)}`,
          ],
          status: 201,
        };
      case "not_effective":
        return {
          data: { ok: false, reason: "disclosure_not_effective" },
          outcome: "rejected" as const,
          reasonCode: "disclosure_not_effective",
          status: 404,
        };
      case "stale":
        return {
          data: {
            ok: false,
            reason: "disclosure_stale",
            effective: outcome.effective,
          },
          outcome: "blocked" as const,
          reasonCode: "disclosure_stale",
          status: 409,
        };
      case "upstream_error":
        return {
          data: {
            ok: false,
            reason: "upstream_error",
            code: outcome.code,
            upstreamCorrelationId: outcome.correlationId,
            retryAfterSeconds: outcome.retryAfterSeconds,
          },
          outcome:
            outcome.status === 409 || outcome.status === 422
              ? ("rejected" as const)
              : ("blocked" as const),
          reasonCode: outcome.code,
          // Backend auth failures are a BFF trust misconfiguration, not the
          // investor's — never surface them as the browser's 401.
          status: outcome.status === 401 ? 502 : outcome.status,
        };
    }
  },
});
