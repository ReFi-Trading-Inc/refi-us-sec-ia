/**
 * Brokerage connection maintenance through the FROZEN v1.1.0-alpha.2 client:
 * credential rotation and sync requests for an EXISTING connection.
 *
 * Neither verb is economic (no subscription or allocation changes), so
 * neither reads AccountAuthorization here; the backend still decides. What
 * IS enforced here is ACCOUNT SCOPE on the connection: the `connection_id`
 * a browser names must belong to the caller's resolved account
 * (`listBrokerageConnections` under the user assertion) before any
 * mutation path is built. A connection id from another account, a retired
 * connection, or a malformed id is refused without an upstream call.
 *
 * Rotation is the second credential-bearing request in the app (after
 * connect): the paper key pair passes through as arguments into the one
 * upstream call and is never retained, hashed, logged or echoed. The
 * Idempotency-Key is derived from the key ID only, never the secret.
 */
import { createHash } from "node:crypto";
import type { OperationResponse } from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";
import {
  projectBrokerageConnection,
  type BrokerageConnectionView,
} from "./brokerage-connection";

export type BrokerageSyncReceipt =
  OperationResponse<"syncBrokerageConnection">["data"];
export const CONNECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export type ConnectionScopeOutcome =
  { kind: "owned" } | { kind: "not_owned" | "terminal" | "malformed" };

/** The named connection must be one of THIS account's non-terminal connections. */
export async function assertConnectionInScope(
  client: InvestorApiReadClient,
  accountId: string,
  connectionId: string,
): Promise<ConnectionScopeOutcome> {
  if (!CONNECTION_ID_PATTERN.test(connectionId)) return { kind: "malformed" };
  const res = await client.call("listBrokerageConnections", {
    path: { account_id: accountId },
    query: { page_size: 20 },
  });
  const match = res.data.data.items.find(
    (c) => c.connection_id === connectionId,
  );
  if (!match) return { kind: "not_owned" };
  if (
    match.connection_status === "DISCONNECTED" ||
    match.connection_status === "REVOKED"
  ) {
    return { kind: "terminal" };
  }
  return { kind: "owned" };
}

function key(parts: readonly string[]): string {
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 64);
}

export interface RotateCredentialsInput {
  apiKeyId: string;
  apiSecretKey: string;
}

export function rotationIdempotencyKey(
  accountId: string,
  connectionId: string,
  apiKeyId: string,
): string {
  return key(["rotate", accountId, connectionId, apiKeyId]);
}

export type MaintenanceOutcome<T> =
  | { kind: "accepted"; result: T; upstreamStatus: number }
  | {
      kind: "connection_out_of_scope";
      reason: "not_owned" | "terminal" | "malformed";
    };

export async function rotateBrokerageCredentials(
  client: InvestorApiReadClient,
  accountId: string,
  connectionId: string,
  input: RotateCredentialsInput,
): Promise<MaintenanceOutcome<BrokerageConnectionView>> {
  const scope = await assertConnectionInScope(client, accountId, connectionId);
  if (scope.kind !== "owned") {
    return { kind: "connection_out_of_scope", reason: scope.kind };
  }
  const res = await client.call("rotateBrokerageCredentials", {
    path: { account_id: accountId, connection_id: connectionId },
    idempotencyKey: rotationIdempotencyKey(
      accountId,
      connectionId,
      input.apiKeyId,
    ),
    body: {
      credentials: { api_key: input.apiKeyId, api_secret: input.apiSecretKey },
    },
  });
  return {
    kind: "accepted",
    result: projectBrokerageConnection(res.data.data),
    upstreamStatus: res.status,
  };
}

/**
 * Sync requests have no body; the key is bucketed to the minute so a burst
 * of retries replays upstream while a later request is a new run.
 */
export function syncIdempotencyKey(
  accountId: string,
  connectionId: string,
  now: () => number = Date.now,
): string {
  return key([
    "sync",
    accountId,
    connectionId,
    String(Math.floor(now() / 60_000)),
  ]);
}

export async function syncBrokerageConnection(
  client: InvestorApiReadClient,
  accountId: string,
  connectionId: string,
  now: () => number = Date.now,
): Promise<MaintenanceOutcome<BrokerageSyncReceipt>> {
  const scope = await assertConnectionInScope(client, accountId, connectionId);
  if (scope.kind !== "owned") {
    return { kind: "connection_out_of_scope", reason: scope.kind };
  }
  const res = await client.call("syncBrokerageConnection", {
    path: { account_id: accountId, connection_id: connectionId },
    idempotencyKey: syncIdempotencyKey(accountId, connectionId, now),
  });
  return {
    kind: "accepted",
    result: res.data.data,
    upstreamStatus: res.status,
  };
}

// ─── Disconnect (alpha.3 `disconnectBrokerageConnection`, DELETE C) ─────────
//
// Disconnecting is exactly that: the backend disconnects the brokerage
// connection. It is not liquidation, account closure, deletion of the ReFi
// identity, or revocation of any historical record (connection, orders,
// fills, reconciliation, consents, preference history, evidence all remain
// backend-owned history). The backend may require an acknowledgment first
// (`brokerage_mutation` includes ACKNOWLEDGMENT_REQUIRED); the same alpha.3
// continuation discipline applies (`./acknowledgment.ts`).

import { InvestorApiError } from "@refi/api-clients/investor-api";
import {
  advanceAcknowledgmentChallenge,
  getAcknowledgmentChallenge,
  openAcknowledgmentChallenge,
  setConfirmKey,
  type AcknowledgmentChallengeRecord,
} from "../prototype-store/entities/acknowledgment-challenge";
import {
  checkContinuation,
  deterministicKey,
  isRetryable,
  recordConsentForContinuation,
} from "./acknowledgment";

export type DisconnectReceipt =
  OperationResponse<"disconnectBrokerageConnection">["data"];

export type DisconnectOutcome =
  | {
      kind: "accepted";
      receipt: DisconnectReceipt;
      backendStatus: DisconnectReceipt["status"];
      upstreamStatus: number;
    }
  | {
      kind: "acknowledgment_required";
      challenge: AcknowledgmentChallengeRecord;
    }
  | {
      kind: "connection_out_of_scope";
      reason: "not_owned" | "terminal" | "malformed";
    }
  | {
      kind: "refused";
      reason:
        | "unknown_continuation"
        | "wrong_kind"
        | "changed_intent"
        | "continuation_expired"
        | "already_confirmed"
        | "challenge_failed"
        | "consent_not_recorded";
      detail?: string;
    }
  | {
      kind: "rejected";
      status: number;
      code: string;
      correlationId: string | null;
    }
  | {
      kind: "retryable";
      status: number;
      code: string;
      retryAfterSeconds: number | null;
    };

function partitionDisconnect(err: InvestorApiError): DisconnectOutcome {
  if (isRetryable(err)) {
    return {
      kind: "retryable",
      status: err.status,
      code: err.code,
      retryAfterSeconds: err.retryAfterSeconds,
    };
  }
  return {
    kind: "rejected",
    status: err.status,
    code: err.code,
    correlationId: err.correlationId,
  };
}

/** Initial disconnect (no confirmation body). Scope is enforced first. */
export async function disconnectBrokerageConnection(
  client: InvestorApiReadClient,
  accountId: string,
  connectionId: string,
  correlationId: string,
): Promise<DisconnectOutcome> {
  const scope = await assertConnectionInScope(client, accountId, connectionId);
  if (scope.kind !== "owned")
    return { kind: "connection_out_of_scope", reason: scope.kind };
  const initialKey = deterministicKey({
    a: accountId,
    c: connectionId,
    op: "disconnect",
  });
  try {
    const res = await client.call("disconnectBrokerageConnection", {
      path: { account_id: accountId, connection_id: connectionId },
      idempotencyKey: initialKey,
    });
    return {
      kind: "accepted",
      receipt: res.data.data,
      backendStatus: res.data.data.status,
      upstreamStatus: res.status,
    };
  } catch (err) {
    if (!(err instanceof InvestorApiError)) throw err;
    if (
      err.status === 409 &&
      err.code === "ACKNOWLEDGMENT_REQUIRED" &&
      err.continuation
    ) {
      const check = checkContinuation(err.continuation);
      if (!check.ok)
        return {
          kind: "rejected",
          status: 409,
          code: `ACKNOWLEDGMENT_REQUIRED_${check.reason.toUpperCase()}`,
          correlationId: err.correlationId,
        };
      const challenge = await openAcknowledgmentChallenge({
        accountId,
        kind: "disconnect",
        continuation: err.continuation,
        intent: { kind: "disconnect", connectionId },
        initialKey,
        correlationId,
      });
      return { kind: "acknowledgment_required", challenge };
    }
    return partitionDisconnect(err);
  }
}

/** Explicit confirmation: consent for exactly the required disclosure, then DELETE with the binding under a NEW key. */
export async function confirmBrokerageDisconnect(
  client: InvestorApiReadClient,
  accountId: string,
  connectionId: string,
  continuationRef: string,
  correlationId: string,
): Promise<DisconnectOutcome> {
  const scope = await assertConnectionInScope(client, accountId, connectionId);
  if (scope.kind !== "owned")
    return { kind: "connection_out_of_scope", reason: scope.kind };
  let challenge = await getAcknowledgmentChallenge(accountId, continuationRef);
  if (!challenge) return { kind: "refused", reason: "unknown_continuation" };
  if (challenge.kind !== "disconnect" || challenge.intent.kind !== "disconnect")
    return { kind: "refused", reason: "wrong_kind" };
  if (challenge.intent.connectionId !== connectionId)
    return { kind: "refused", reason: "changed_intent" };
  if (challenge.state === "confirmed")
    return { kind: "refused", reason: "already_confirmed" };
  if (challenge.state === "failed")
    return { kind: "refused", reason: "challenge_failed" };
  const check = checkContinuation(challenge.continuation);
  if (!check.ok) {
    await advanceAcknowledgmentChallenge({
      accountId,
      continuationRef,
      to: "failed",
      correlationId,
      detail: { reason: check.reason },
    });
    return {
      kind: "refused",
      reason: "continuation_expired",
      detail: check.reason,
    };
  }
  if (challenge.state === "challenged") {
    const consent = await recordConsentForContinuation(
      client,
      accountId,
      challenge.continuation,
    );
    if (!consent.ok)
      return {
        kind: "refused",
        reason: "consent_not_recorded",
        detail: consent.reason,
      };
    challenge = await advanceAcknowledgmentChallenge({
      accountId,
      continuationRef,
      to: "consented",
      correlationId,
      detail: { consent_receipt_id: consent.consentReceiptId },
      patch: { consentReceiptId: consent.consentReceiptId },
    });
  }
  const consentReceiptId = challenge.consentReceiptId;
  if (!consentReceiptId)
    return { kind: "refused", reason: "consent_not_recorded" };
  const confirmKey =
    challenge.confirmKey ??
    deterministicKey({
      a: accountId,
      c: connectionId,
      ref: continuationRef,
      r: consentReceiptId,
      confirm: true,
    });
  challenge = await setConfirmKey(accountId, continuationRef, confirmKey);
  try {
    const res = await client.call("disconnectBrokerageConnection", {
      path: { account_id: accountId, connection_id: connectionId },
      body: {
        continuation_ref: continuationRef,
        consent_receipt_id: consentReceiptId,
      },
      idempotencyKey: confirmKey,
    });
    await advanceAcknowledgmentChallenge({
      accountId,
      continuationRef,
      to: "confirmed",
      correlationId,
      detail: {
        disconnect_receipt_id: res.data.data.disconnect_receipt_id,
        backend_status: res.data.data.status,
      },
    });
    return {
      kind: "accepted",
      receipt: res.data.data,
      backendStatus: res.data.data.status,
      upstreamStatus: res.status,
    };
  } catch (err) {
    if (!(err instanceof InvestorApiError)) throw err;
    const out = partitionDisconnect(err);
    if (out.kind !== "retryable") {
      await advanceAcknowledgmentChallenge({
        accountId,
        continuationRef,
        to: "failed",
        correlationId,
        detail: { code: err.code, status: err.status },
      });
    }
    return out;
  }
}
