/**
 * PATCH /api/v1/investor/preferences
 *
 * The investor's ONLY preference write: exactly the four supported fields
 * (`drift_threshold`, `min_order`, `excluded_assets`, `fractional_enabled`;
 * IB-06) through the frozen v1.1.0-alpha.2 client (`updateAccountPreferences`,
 * a dedicated PATCH — never `/actions`, per Daniel 2026-08-17 / D-018).
 *
 * Governed by `bffMutate` (same-origin, release-stage capability policy —
 * `updateAccountPrefs` is Signal-allowed — and an append-only receipt).
 * Optimistic concurrency: the client sends the preference version it saw and
 * the BFF forwards it as If-Match; a stale version is a 409 the UI must
 * refresh from. Deterministic Idempotency-Key; no automatic retry. A
 * preference change is advice-side: the backend produces NEW advice and
 * preserves the prior recommendation. Nothing here touches execution.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { bffMutate } from "@lib/bff/handler";
import { InvestorApiError } from "@refi/api-clients/investor-api";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import { resolveAccountScope } from "@lib/investor-api/account-scope";
import { classifyUpstream } from "@lib/investor-api/upstream-state";

const DECIMAL_FRACTION = /^(0(?:\.[0-9]+)?|1(?:\.0+)?)$/;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

const bodySchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    driftThreshold: z.string().regex(DECIMAL_FRACTION).optional(),
    minOrder: z.string().regex(DECIMAL).optional(),
    excludedAssets: z.array(z.string().regex(ID)).max(100).optional(),
    fractionalEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.driftThreshold !== undefined ||
      b.minOrder !== undefined ||
      b.excludedAssets !== undefined ||
      b.fractionalEnabled !== undefined,
    { message: "at least one preference field is required" },
  );
type Body = z.infer<typeof bodySchema>;

export const PATCH = bffMutate<Body>({
  action: "updateAccountPrefs",
  source: "backend",
  parse: (body) => bodySchema.parse(body),
  apply: async (ctx) => {
    const body = ctx.input;
    const client = investorApiClientFor(ctx.auth);
    let accountId: string;
    try {
      accountId = await resolveAccountScope(client, ctx.auth);
    } catch (err) {
      return {
        data: { ok: false, upstream: classifyUpstream(err) },
        outcome: "blocked" as const,
        reasonCode: "account_scope",
        status: 503,
      };
    }
    const patch = {
      ...(body.driftThreshold !== undefined
        ? { drift_threshold: body.driftThreshold }
        : {}),
      ...(body.minOrder !== undefined ? { min_order: body.minOrder } : {}),
      ...(body.excludedAssets !== undefined
        ? { excluded_assets: body.excludedAssets }
        : {}),
      ...(body.fractionalEnabled !== undefined
        ? { fractional_enabled: body.fractionalEnabled }
        : {}),
    };
    const idempotencyKey = createHash("sha256")
      .update(
        JSON.stringify({
          a: accountId,
          v: body.expectedVersion,
          p: patch,
        }),
      )
      .digest("hex")
      .slice(0, 64);
    try {
      const res = await client.call("updateAccountPreferences", {
        path: { account_id: accountId },
        body: patch,
        ifMatch: String(body.expectedVersion),
        idempotencyKey,
      });
      return {
        data: { ok: true, receipt: res.data.data },
        references: [`action-receipt:${res.data.data.action_receipt_id}`],
        status: 202,
      };
    } catch (err) {
      if (err instanceof InvestorApiError) {
        return {
          data: { ok: false, code: err.code, status: err.status },
          outcome:
            err.status === 409 ? ("rejected" as const) : ("blocked" as const),
          reasonCode: err.code.toLowerCase(),
          status: err.status === 409 ? 409 : 502,
        };
      }
      return {
        data: { ok: false, upstream: classifyUpstream(err) },
        outcome: "blocked" as const,
        reasonCode: "upstream",
        status: 503,
      };
    }
  },
});
