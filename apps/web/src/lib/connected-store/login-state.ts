/**
 * Pending login state — the server-side half of an email magic-link / OTP
 * login, and Daniel's exchange bindings.
 *
 * One login attempt = one record: independent cryptographically random
 * `state`, `challenge` and `nonce` (22–128 base64url chars per Daniel), the
 * exact allowed `redirectUri`, and a STABLE protected `networkContext` (a
 * rate-limit identity, never a per-retry random). The record is single-use:
 * consumption is an atomic `putIfAbsent` on a separate consumed-marker
 * collection, so two instances racing on the same callback cannot both win,
 * and a replayed callback after a restart is refused.
 */
import { randomBytes } from "node:crypto";
import { connectedKvStore, isExpired, nowIso } from "./index";

export const LOGIN_BINDING_MIN = 22;
export const LOGIN_BINDING_MAX = 128;
export const LOGIN_BINDING_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
export const DEFAULT_LOGIN_TTL_SECONDS = 10 * 60;

export interface PendingLoginRecord {
  loginId: string;
  state: string;
  challenge: string;
  nonce: string;
  redirectUri: string;
  networkContext: string;
  createdAt: string;
  expiresAt: string;
  correlationId: string;
}

interface ConsumedMarker {
  loginId: string;
  consumedAt: string;
  correlationId: string;
}

function pending() {
  return connectedKvStore<PendingLoginRecord>("login-state");
}
function consumed() {
  return connectedKvStore<ConsumedMarker>("login-consumed");
}

/** 32 random bytes → 43 base64url chars: inside Daniel's 22–128 window. */
export function newLoginBinding(): string {
  const v = randomBytes(32).toString("base64url");
  if (!LOGIN_BINDING_PATTERN.test(v)) throw new Error("binding out of range");
  return v;
}

export function isValidLoginBinding(v: unknown): v is string {
  return typeof v === "string" && LOGIN_BINDING_PATTERN.test(v);
}

export async function createPendingLogin(args: {
  redirectUri: string;
  networkContext: string;
  ttlSeconds?: number;
  correlationId: string;
}): Promise<PendingLoginRecord> {
  if (!/^https:\/\//.test(args.redirectUri)) {
    throw new Error("redirectUri must be an absolute https URI");
  }
  if (!isValidLoginBinding(args.networkContext)) {
    throw new Error("networkContext must be a stable protected opaque id");
  }
  const created = new Date();
  const record: PendingLoginRecord = {
    loginId: newLoginBinding(),
    state: newLoginBinding(),
    challenge: newLoginBinding(),
    nonce: newLoginBinding(),
    redirectUri: args.redirectUri,
    networkContext: args.networkContext,
    createdAt: created.toISOString(),
    expiresAt: new Date(
      created.getTime() + (args.ttlSeconds ?? DEFAULT_LOGIN_TTL_SECONDS) * 1000,
    ).toISOString(),
    correlationId: args.correlationId,
  };
  const ok = await pending().putIfAbsent(record.loginId, record);
  if (!ok) throw new Error("login id collision");
  return record;
}

export type ConsumePendingLoginResult =
  | { ok: true; login: PendingLoginRecord }
  | {
      ok: false;
      reason: "unknown" | "expired" | "state_mismatch" | "already_consumed";
    };

/**
 * Consume exactly once. Order matters: the state check happens BEFORE the
 * marker write so a wrong-state probe cannot burn a valid pending login, and
 * the marker is an atomic create so only one caller ever gets `ok: true`.
 */
export async function consumePendingLogin(args: {
  loginId: string;
  state: string;
  correlationId: string;
  now?: Date;
}): Promise<ConsumePendingLoginResult> {
  if (!isValidLoginBinding(args.loginId) || !isValidLoginBinding(args.state)) {
    return { ok: false, reason: "unknown" };
  }
  const login = await pending().get(args.loginId);
  if (!login) return { ok: false, reason: "unknown" };
  if (login.state !== args.state)
    return { ok: false, reason: "state_mismatch" };
  if (isExpired(login.expiresAt, args.now))
    return { ok: false, reason: "expired" };
  const first = await consumed().putIfAbsent(args.loginId, {
    loginId: args.loginId,
    consumedAt: nowIso(),
    correlationId: args.correlationId,
  });
  if (!first) return { ok: false, reason: "already_consumed" };
  return { ok: true, login };
}
