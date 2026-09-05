/**
 * /api/v1/investor/broker/connection
 *
 * GET  — the account's brokerage connection projection (status/metadata only;
 *        credentials never cross this boundary) via `listBrokerageConnections`.
 * POST — connect Alpaca (paper) with an API key pair: the ONLY credential-
 *        bearing request in the app. Same-origin only (bffMutate CSRF), session
 *        required, account scope re-derived server-side, shape validated,
 *        `AccountAuthorization.status === AUTHORIZED` read and enforced, then
 *        forwarded ONCE to the contract's `createBrokerageConnection`, and then
 *        forgotten. Nothing here logs, stores, hashes, echoes or reuses the
 *        credentials, and nothing here calls Alpaca. Live keys are refused by
 *        schema (`environment` is the literal "paper"; D-LAUNCH-07 is OPEN).
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { bffMutate, bffRead } from "@lib/bff/handler";
import { InvestorApiError } from "@refi/api-clients/investor-api";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import {
  AccountScopeError,
  resolveAccountScope,
} from "@lib/investor-api/account-scope";
import { classifyUpstream } from "@lib/investor-api/upstream-state";
import {
  connectBrokerage,
  getBrokerageConnection,
} from "@lib/investor-api/brokerage-connection";

// Alpaca API Key IDs are 20-char uppercase alphanumerics; PAPER keys start
// with PK. A live key (AK…) never parses here.
const PAPER_KEY_ID = /^PK[A-Z0-9]{18}$/;
const SECRET = /^[A-Za-z0-9]{40}$/;

const bodySchema = z
  .object({
    environment: z.literal("paper"),
    apiKeyId: z.string().regex(PAPER_KEY_ID),
    apiSecretKey: z.string().regex(SECRET),
  })
  .strict();
type Body = z.infer<typeof bodySchema>;

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx) => {
    if (!ctx.auth) return { connection: null, upstream: { state: "ok" } };
    const client = investorApiClientFor(ctx.auth);
    try {
      const accountId = await resolveAccountScope(client, ctx.auth);
      const connection = await getBrokerageConnection(client, accountId);
      return { connection, upstream: { state: "ok" } };
    } catch (err) {
      if (err instanceof AccountScopeError) {
        // No account yet is an ordinary onboarding state, not an outage.
        return { connection: null, upstream: classifyUpstream(err) };
      }
      return { connection: null, upstream: classifyUpstream(err) };
    }
  },
});

export const POST = bffMutate<Body>({
  action: "connectBroker",
  source: "backend",
  parse: (body) => bodySchema.parse(body),
  apply: async (ctx) => {
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
    // Deterministic per (account, key id, environment) so a retry of the same
    // submission is idempotent upstream. The secret is never part of the key.
    const idempotencyKey = createHash("sha256")
      .update(`${accountId}|${ctx.input.apiKeyId}|paper`)
      .digest("hex")
      .slice(0, 64);
    try {
      // Precondition enforced INSIDE connectBrokerage: AccountAuthorization
      // must be exactly AUTHORIZED before the credential payload is built or
      // forwarded. PENDING / DENIED / SUSPENDED → 412 blocked
      // (`account_not_authorized`, the repository's existing local-precondition
      // refusal shape — cf. `account_not_linked` on profile v2); the response
      // carries the backend status word and never the credentials.
      const outcome = await connectBrokerage(
        client,
        accountId,
        {
          apiKeyId: ctx.input.apiKeyId,
          apiSecretKey: ctx.input.apiSecretKey,
        },
        idempotencyKey,
      );
      if (outcome.kind === "not_authorized") {
        return {
          data: {
            ok: false,
            reason: "account_not_authorized",
            authorization: outcome.authorization,
          },
          outcome: "blocked" as const,
          reasonCode: "account_not_authorized",
          status: 412,
        };
      }
      return {
        data: { ok: true, connection: outcome.connection },
        references: [`brokerage-connection:${outcome.connection.connectionId}`],
        status: 202,
      };
    } catch (err) {
      if (err instanceof InvestorApiError) {
        return {
          data: { ok: false, code: err.code, status: err.status },
          outcome:
            err.status === 409 || err.status === 422
              ? ("rejected" as const)
              : ("blocked" as const),
          reasonCode: err.code.toLowerCase(),
          status: err.status === 409 || err.status === 422 ? err.status : 502,
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
