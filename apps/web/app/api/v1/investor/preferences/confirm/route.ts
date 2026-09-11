/**
 * POST /api/v1/investor/preferences/confirm — the investor's EXPLICIT
 * confirmation of a preference change the backend challenged with
 * 409 ACKNOWLEDGMENT_REQUIRED (alpha.3 `preference_mutation`).
 *
 * Bound to the retained challenge: the same intended preference values and
 * expected version, a currently valid continuation, consent recorded by the
 * BFF for exactly the required disclosure key/version/hash, then the
 * confirmation PATCH with `continuation_ref` + `consent_receipt_id`, the
 * current If-Match and a NEW Idempotency-Key. Canonical `APPLIED` and an
 * authoritative re-read are returned. Anything else fails closed.
 */
import { z } from "zod";
import { bffMutate } from "../../../../../../src/lib/bff/handler";
import { confirmPreferenceChange } from "../../../../../../src/lib/investor-api/preference-confirmation";
import {
  clientAndScopeOrRefusal,
  upstreamRefusal,
} from "../../../../../../src/lib/investor-api/mutation-route";
import { CONTRACT_VERSION } from "../../../../../../src/lib/investor-api/upstream-state";

const DECIMAL_FRACTION = /^(0(?:\.[0-9]+)?|1(?:\.0+)?)$/;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

const bodySchema = z
  .object({
    confirm: z.literal(true),
    continuationRef: z.string().regex(ID),
    expectedVersion: z.number().int().min(1),
    driftThreshold: z.string().regex(DECIMAL_FRACTION).optional(),
    minOrder: z.string().regex(DECIMAL).optional(),
    excludedAssets: z.array(z.string().regex(ID)).max(100).optional(),
    fractionalEnabled: z.boolean().optional(),
  })
  .strict();
type Body = z.infer<typeof bodySchema>;

export const POST = bffMutate<Body>({
  action: "updateAccountPrefs",
  source: "backend",
  parse: (body) => bodySchema.parse(body),
  apply: async (ctx) => {
    const scope = await clientAndScopeOrRefusal(ctx.auth);
    if ("refusal" in scope) return scope.refusal;
    const b = ctx.input;
    let out;
    try {
      out = await confirmPreferenceChange(scope.client, {
        accountId: scope.accountId,
        continuationRef: b.continuationRef,
        expectedVersion: b.expectedVersion,
        patch: {
          ...(b.driftThreshold !== undefined
            ? { drift_threshold: b.driftThreshold }
            : {}),
          ...(b.minOrder !== undefined ? { min_order: b.minOrder } : {}),
          ...(b.excludedAssets !== undefined
            ? { excluded_assets: b.excludedAssets }
            : {}),
          ...(b.fractionalEnabled !== undefined
            ? { fractional_enabled: b.fractionalEnabled }
            : {}),
        },
        correlationId: ctx.correlationId,
      });
    } catch (err) {
      return upstreamRefusal(err);
    }
    switch (out.kind) {
      case "applied":
        return {
          data: {
            ok: true,
            receipt: out.receipt,
            backendStatus: out.backendStatus,
            preferences: out.preferences,
            contractVersion: CONTRACT_VERSION,
          },
          references: [
            `action-receipt:${out.receipt.action_receipt_id}`,
            `continuation:${b.continuationRef}`,
          ],
          status: 202,
        };
      case "refused":
        return {
          data: {
            ok: false,
            reason: `confirmation_${out.reason}`,
            detail: out.detail ?? null,
          },
          outcome: "blocked" as const,
          reasonCode: `confirmation_${out.reason}`,
          status: 412,
        };
      case "acknowledgment_required":
        return {
          data: {
            ok: false,
            reason: "acknowledgment_required",
            continuation: out.challenge.continuation,
          },
          outcome: "rejected" as const,
          reasonCode: "acknowledgment_required",
          status: 409,
        };
      case "stale_version":
        return {
          data: { ok: false, reason: "stale_version" },
          outcome: "rejected" as const,
          reasonCode: "version_conflict",
          status: 409,
        };
      case "authorization_required":
        return {
          data: { ok: false, reason: "account_authorization_required" },
          outcome: "rejected" as const,
          reasonCode: "account_authorization_required",
          status: 403,
        };
      case "retryable":
        return {
          data: {
            ok: false,
            reason: "retryable",
            upstreamStatus: out.status,
            code: out.code,
            retryAfterSeconds: out.retryAfterSeconds,
          },
          outcome: "blocked" as const,
          reasonCode: out.code.toLowerCase(),
          status: out.status === 429 ? 429 : 503,
        };
      case "rejected":
        return {
          data: {
            ok: false,
            reason: "rejected",
            upstreamStatus: out.status,
            code: out.code,
            upstreamCorrelationId: out.correlationId,
          },
          outcome: "rejected" as const,
          reasonCode: out.code.toLowerCase(),
          status:
            out.status === 413 ||
            out.status === 422 ||
            out.status === 404 ||
            out.status === 409
              ? out.status
              : 502,
        };
    }
  },
});
