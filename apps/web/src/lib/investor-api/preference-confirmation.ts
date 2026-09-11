/**
 * Preference change with alpha.3 acknowledgment confirmation
 * (`updateAccountPreferences`, profile `preference_mutation`). See
 * `acknowledgment.ts` for the discipline. The investor's intended values are
 * captured at the initial request and are the ONLY values the confirmation
 * may carry.
 */
import {
  InvestorApiError,
  type OperationResponse,
} from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";
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

export interface PreferencePatch {
  drift_threshold?: string;
  min_order?: string;
  excluded_assets?: string[];
  fractional_enabled?: boolean;
}
export type PreferenceReceipt =
  OperationResponse<"updateAccountPreferences">["data"];
export type Preferences = OperationResponse<"getAccountPreferences">["data"];

export type PreferenceChangeOutcome =
  | {
      kind: "applied";
      receipt: PreferenceReceipt;
      backendStatus: PreferenceReceipt["status"];
      preferences: Preferences | null;
    }
  | {
      kind: "acknowledgment_required";
      challenge: AcknowledgmentChallengeRecord;
    }
  | { kind: "stale_version"; status: 409 }
  | { kind: "authorization_required"; status: 403 }
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

function normalisePatch(p: PreferencePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.drift_threshold !== undefined)
    out["drift_threshold"] = p.drift_threshold;
  if (p.min_order !== undefined) out["min_order"] = p.min_order;
  if (p.excluded_assets !== undefined)
    out["excluded_assets"] = [...p.excluded_assets];
  if (p.fractional_enabled !== undefined)
    out["fractional_enabled"] = p.fractional_enabled;
  return out;
}
function samePatch(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function reread(
  client: InvestorApiReadClient,
  accountId: string,
): Promise<Preferences | null> {
  try {
    const res = await client.call("getAccountPreferences", {
      path: { account_id: accountId },
    });
    return res.data.data;
  } catch {
    return null; // the write is already acknowledged; the read is informational
  }
}

function partition(err: InvestorApiError): PreferenceChangeOutcome {
  if (isRetryable(err)) {
    return {
      kind: "retryable",
      status: err.status,
      code: err.code,
      retryAfterSeconds: err.retryAfterSeconds,
    };
  }
  if (err.status === 403 && err.code === "ACCOUNT_AUTHORIZATION_REQUIRED") {
    return { kind: "authorization_required", status: 403 };
  }
  if (err.status === 409 && err.code === "VERSION_CONFLICT")
    return { kind: "stale_version", status: 409 };
  return {
    kind: "rejected",
    status: err.status,
    code: err.code,
    correlationId: err.correlationId,
  };
}

/** Step 1: the ordinary PATCH (key A). A challenge is NOT a completed mutation. */
export async function startPreferenceChange(
  client: InvestorApiReadClient,
  args: {
    accountId: string;
    expectedVersion: number;
    patch: PreferencePatch;
    correlationId: string;
  },
): Promise<PreferenceChangeOutcome> {
  const patch = normalisePatch(args.patch);
  const initialKey = deterministicKey({
    a: args.accountId,
    v: args.expectedVersion,
    p: patch,
  });
  try {
    const res = await client.call("updateAccountPreferences", {
      path: { account_id: args.accountId },
      body: patch,
      ifMatch: String(args.expectedVersion),
      idempotencyKey: initialKey,
    });
    return {
      kind: "applied",
      receipt: res.data.data,
      backendStatus: res.data.data.status,
      preferences: await reread(client, args.accountId),
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
        accountId: args.accountId,
        kind: "preference",
        continuation: err.continuation,
        intent: {
          kind: "preference",
          expectedVersion: args.expectedVersion,
          patch,
        },
        initialKey,
        correlationId: args.correlationId,
      });
      return { kind: "acknowledgment_required", challenge };
    }
    return partition(err);
  }
}

export type ConfirmRefusal =
  | "unknown_continuation"
  | "wrong_kind"
  | "changed_intent"
  | "stale_expected_version"
  | "continuation_expired"
  | "already_confirmed"
  | "challenge_failed"
  | "consent_not_recorded";

export type PreferenceConfirmOutcome =
  | PreferenceChangeOutcome
  | { kind: "refused"; reason: ConfirmRefusal; detail?: string };

/**
 * Step 2: explicit confirmation. Bound to the retained challenge: same
 * intent, same expected version, valid continuation, consent recorded for
 * exactly the required disclosure, NEW key B. Never reuses key A.
 */
export async function confirmPreferenceChange(
  client: InvestorApiReadClient,
  args: {
    accountId: string;
    continuationRef: string;
    expectedVersion: number;
    patch: PreferencePatch;
    correlationId: string;
  },
): Promise<PreferenceConfirmOutcome> {
  let challenge = await getAcknowledgmentChallenge(
    args.accountId,
    args.continuationRef,
  );
  if (!challenge) return { kind: "refused", reason: "unknown_continuation" };
  if (
    challenge.kind !== "preference" ||
    challenge.intent.kind !== "preference"
  ) {
    return { kind: "refused", reason: "wrong_kind" };
  }
  if (challenge.state === "confirmed")
    return { kind: "refused", reason: "already_confirmed" };
  if (challenge.state === "failed")
    return { kind: "refused", reason: "challenge_failed" };
  const patch = normalisePatch(args.patch);
  if (!samePatch(patch, challenge.intent.patch))
    return { kind: "refused", reason: "changed_intent" };
  if (args.expectedVersion !== challenge.intent.expectedVersion) {
    return { kind: "refused", reason: "stale_expected_version" };
  }
  const check = checkContinuation(challenge.continuation);
  if (!check.ok) {
    await advanceAcknowledgmentChallenge({
      accountId: args.accountId,
      continuationRef: args.continuationRef,
      to: "failed",
      correlationId: args.correlationId,
      detail: { reason: check.reason },
    });
    return {
      kind: "refused",
      reason: "continuation_expired",
      detail: check.reason,
    };
  }
  // Consent for EXACTLY the required disclosure tuple (recorded once).
  if (challenge.state === "challenged") {
    const consent = await recordConsentForContinuation(
      client,
      args.accountId,
      challenge.continuation,
    );
    if (!consent.ok) {
      return {
        kind: "refused",
        reason: "consent_not_recorded",
        detail: consent.reason,
      };
    }
    challenge = await advanceAcknowledgmentChallenge({
      accountId: args.accountId,
      continuationRef: args.continuationRef,
      to: "consented",
      correlationId: args.correlationId,
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
      a: args.accountId,
      v: args.expectedVersion,
      p: patch,
      c: args.continuationRef,
      r: consentReceiptId,
      confirm: true,
    });
  if (confirmKey === challenge.initialKey)
    throw new Error("confirmation key collided with the initial key");
  challenge = await setConfirmKey(
    args.accountId,
    args.continuationRef,
    confirmKey,
  );
  try {
    const res = await client.call("updateAccountPreferences", {
      path: { account_id: args.accountId },
      body: {
        ...patch,
        continuation_ref: args.continuationRef,
        consent_receipt_id: consentReceiptId,
      },
      ifMatch: String(args.expectedVersion),
      idempotencyKey: confirmKey,
    });
    await advanceAcknowledgmentChallenge({
      accountId: args.accountId,
      continuationRef: args.continuationRef,
      to: "confirmed",
      correlationId: args.correlationId,
      detail: {
        action_receipt_id: res.data.data.action_receipt_id,
        backend_status: res.data.data.status,
      },
    });
    return {
      kind: "applied",
      receipt: res.data.data,
      backendStatus: res.data.data.status,
      preferences: await reread(client, args.accountId),
    };
  } catch (err) {
    if (!(err instanceof InvestorApiError)) throw err;
    const out = partition(err);
    if (out.kind !== "retryable") {
      // A definitive backend answer to the confirmation ends the challenge.
      await advanceAcknowledgmentChallenge({
        accountId: args.accountId,
        continuationRef: args.continuationRef,
        to: "failed",
        correlationId: args.correlationId,
        detail: { code: err.code, status: err.status },
      });
    }
    return out; // retryable: challenge stays consented with key B for identical recovery
  }
}
