/**
 * Durable identity-exchange attempt (alpha.3 step 5): the EXACT exchange
 * request for one login attempt, so a transport-lost or ambiguous response
 * can be recovered "using the identical still-valid exchange request", and
 * so "changed binding fields with the same upstream JTI are rejected" and
 * "never create two sessions from a recovered result" are enforceable across
 * instances and restarts.
 *
 * Keyed by the pending login id (one attempt per login). The bridge
 * assertion is stored as sent; it is never re-minted for a recovery, and the
 * stored bindings are the only bindings that may accompany it.
 */
import { connectedKvStore, nowIso } from "./index";

export type ExchangeAttemptStatus = "sent" | "completed" | "failed";

export interface ExchangeRequestBindings {
  identity_assertion: string;
  state: string;
  challenge: string;
  nonce: string;
  redirect_uri: string;
  network_context: string;
}

export interface ExchangeAttemptRecord {
  loginId: string;
  /** The pending login's state; the browser's cookie must still present it. */
  state: string;
  /** Durable ReFi opaque subject the bridge assertion carries. */
  sub: string;
  /** The bridge assertion's sid; the identity result must retain it. */
  sid: string;
  bridgeJti: string;
  /** Unix seconds; recovery is impossible after this. */
  bridgeExp: number;
  /** Provider-verified facts the result is bound to. */
  email: string;
  authTime: number;
  amr: string[];
  request: ExchangeRequestBindings;
  status: ExchangeAttemptStatus;
  attempts: number;
  identityResultJti?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  correlationId: string;
}

const store = () => connectedKvStore<ExchangeAttemptRecord>("exchange-attempt");

export async function getExchangeAttempt(
  loginId: string,
): Promise<ExchangeAttemptRecord | null> {
  return store().get(loginId);
}

/** Create the attempt once; the existing record wins a race. */
export async function openExchangeAttempt(
  input: Omit<
    ExchangeAttemptRecord,
    "status" | "attempts" | "createdAt" | "updatedAt"
  >,
): Promise<{ record: ExchangeAttemptRecord; created: boolean }> {
  const now = nowIso();
  const record: ExchangeAttemptRecord = {
    ...input,
    status: "sent",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  const created = await store().putIfAbsent(input.loginId, record);
  if (created) return { record, created: true };
  const existing = await store().get(input.loginId);
  if (!existing) throw new Error("exchange attempt create/read race");
  return { record: existing, created: false };
}

export async function updateExchangeAttempt(
  loginId: string,
  patch: Partial<
    Pick<
      ExchangeAttemptRecord,
      "status" | "attempts" | "identityResultJti" | "failureReason"
    >
  >,
): Promise<ExchangeAttemptRecord> {
  const current = await store().get(loginId);
  if (!current) throw new Error("exchange attempt missing");
  const next = { ...current, ...patch, updatedAt: nowIso() };
  await store().put(loginId, next);
  return next;
}

/**
 * Exact equality of the LOGIN binding fields. A later completion of the same
 * login necessarily mints a fresh assertion (which is discarded: only the
 * stored one is ever sent), so the assertion bytes are not part of the
 * comparison; state, challenge, nonce, redirect_uri and network_context must
 * be identical or the request is refused.
 */
export function sameBindings(
  a: ExchangeRequestBindings,
  b: ExchangeRequestBindings,
): boolean {
  return (
    a.state === b.state &&
    a.challenge === b.challenge &&
    a.nonce === b.nonce &&
    a.redirect_uri === b.redirect_uri &&
    a.network_context === b.network_context
  );
}
