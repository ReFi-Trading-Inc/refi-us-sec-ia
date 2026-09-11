/**
 * Email-first login orchestration (Stytch, headless) — server-owned.
 *
 *   start:    validate email → create the durable pending login (independent
 *             random state / challenge / nonce, exact https redirect URI,
 *             stable protected network_context) → ask the provider to send
 *             the magic link or OTP → return ONLY safe state to the browser.
 *   complete: bind the browser to the pending login (loginId + state from an
 *             HttpOnly cookie) → consume it EXACTLY ONCE (atomic, durable) →
 *             authenticate the token/code with the provider server-side →
 *             normalise the verified result → map the provider user id to
 *             the durable ReFi opaque subject.
 *
 * The output of `complete` is a `ProviderVerifiedIdentity` plus the ReFi
 * subject and the pending-login bindings. It is NOT a session. The next
 * stage (identity bridge assertion → Daniel's identity exchange → connected
 * session) consumes it; nothing here grants any authority.
 *
 * An email address alone is never proof of authentication; only the
 * provider's verified factor is.
 */
import { createHmac } from "node:crypto";
import { getServerEnv } from "../config/env";
import {
  attachProviderMethodId,
  consumePendingLogin,
  createPendingLogin,
  isValidLoginBinding,
  type LoginMethod,
  type PendingLoginRecord,
} from "../connected-store/login-state";
import { getOrCreateOpaqueSubject } from "../connected-store/subject-map";
import {
  getStytchClient,
  normalizeStytchAuthentication,
  ProviderResultRejectedError,
  type ProviderVerifiedIdentity,
} from "./stytch";

export const MAGIC_LINK_EXPIRY_MINUTES = 15;
export const OTP_EXPIRY_MINUTES = 10;
/** The provider session is only a vehicle for the verified result; it is short. */
const PROVIDER_SESSION_MINUTES = 5;

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new LoginInputError("email");
  }
  return email;
}

/** HMAC of the normalised email; binds a pending login to an address without storing it. */
export function emailBindingHash(email: string): string {
  const env = getServerEnv();
  return createHmac("sha256", env.IP_HASH_SECRET)
    .update(`login-email:${email}`)
    .digest("hex");
}

/** Stable protected rate-limit context (Daniel: not a per-retry random). */
export function networkContextFor(clientIp: string): string {
  const env = getServerEnv();
  return createHmac("sha256", env.IP_HASH_SECRET)
    .update(`network-context:${clientIp}`)
    .digest("base64url"); // 43 chars, inside Daniel's 22–128 window
}

export class LoginInputError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`invalid login input: ${field}`);
    this.name = "LoginInputError";
    this.field = field;
  }
}

export class LoginRefusedError extends Error {
  readonly reason:
    | "unknown"
    | "expired"
    | "state_mismatch"
    | "already_consumed"
    | "method_mismatch"
    | "provider_rejected"
    | "bridge_input"
    | "identity_result_rejected";
  constructor(reason: LoginRefusedError["reason"]) {
    super(`login refused: ${reason}`);
    this.name = "LoginRefusedError";
    this.reason = reason;
  }
}

export interface StartLoginResult {
  loginId: string;
  /** Kept in an HttpOnly cookie by the route; never in the page. */
  state: string;
  method: LoginMethod;
  expiresAt: string;
}

export async function startEmailLogin(args: {
  email: string;
  method: LoginMethod;
  clientIp: string;
  correlationId: string;
}): Promise<StartLoginResult> {
  const env = getServerEnv();
  const email = normalizeEmail(args.email);
  const callback = env.REFI_AUTH_CALLBACK_URL;
  if (!callback) throw new LoginInputError("callback_url_unconfigured");
  const login = await createPendingLogin({
    redirectUri: callback,
    networkContext: networkContextFor(args.clientIp),
    method: args.method,
    emailHash: emailBindingHash(email),
    ttlSeconds:
      (args.method === "email_link"
        ? MAGIC_LINK_EXPIRY_MINUTES
        : OTP_EXPIRY_MINUTES) * 60,
    correlationId: args.correlationId,
  });
  const client = await getStytchClient();
  if (args.method === "email_link") {
    // The registered redirect is EXACT; login id and state travel in the
    // HttpOnly login cookie, never in the link.
    await client.magicLinks.email.loginOrCreate({
      email,
      login_magic_link_url: callback,
      signup_magic_link_url: callback,
      login_expiration_minutes: MAGIC_LINK_EXPIRY_MINUTES,
      signup_expiration_minutes: MAGIC_LINK_EXPIRY_MINUTES,
    });
  } else {
    const sent = await client.otps.email.loginOrCreate({
      email,
      expiration_minutes: OTP_EXPIRY_MINUTES,
    });
    await attachProviderMethodId(login.loginId, sent.email_id);
  }
  return {
    loginId: login.loginId,
    state: login.state,
    method: login.method,
    expiresAt: login.expiresAt,
  };
}

export interface CompletedLogin {
  identity: ProviderVerifiedIdentity;
  /** ReFi opaque subject (durable map), the upstream assertion `sub`. */
  sub: string;
  subjectCreated: boolean;
  /** Daniel's exchange bindings, exactly as created at start. */
  login: PendingLoginRecord;
}

export async function completeEmailLogin(args: {
  loginId: string;
  state: string;
  /** Magic-link token from the callback URL (email_link) … */
  token?: string;
  /** … or the OTP code (email_otp). Exactly one must be present. */
  code?: string;
  correlationId: string;
  now?: () => number;
}): Promise<CompletedLogin> {
  if (!isValidLoginBinding(args.loginId) || !isValidLoginBinding(args.state)) {
    throw new LoginRefusedError("unknown");
  }
  const hasToken = typeof args.token === "string" && args.token.length > 0;
  const hasCode = typeof args.code === "string" && /^\d{4,10}$/.test(args.code);
  if (hasToken === hasCode) throw new LoginInputError("token_or_code");

  // Single-use, state-bound, expiry-bound, atomic across instances. Consumed
  // BEFORE the provider call so a replayed callback can never reach the
  // provider twice.
  const consumed = await consumePendingLogin({
    loginId: args.loginId,
    state: args.state,
    correlationId: args.correlationId,
  });
  if (!consumed.ok) throw new LoginRefusedError(consumed.reason);
  const login = consumed.login;
  if (
    (login.method === "email_link" && !hasToken) ||
    (login.method === "email_otp" && !hasCode)
  ) {
    throw new LoginRefusedError("method_mismatch");
  }

  const client = await getStytchClient();
  let raw;
  try {
    raw =
      login.method === "email_link"
        ? await client.magicLinks.authenticate({
            token: args.token as string,
            session_duration_minutes: PROVIDER_SESSION_MINUTES,
          })
        : await client.otps.authenticate({
            method_id: login.providerMethodId ?? "",
            code: args.code as string,
            session_duration_minutes: PROVIDER_SESSION_MINUTES,
          });
  } catch {
    // The provider's reason is not surfaced to the browser.
    throw new LoginRefusedError("provider_rejected");
  }
  let identity: ProviderVerifiedIdentity;
  try {
    identity = normalizeStytchAuthentication(raw, {
      method: login.method,
      ...(args.now ? { now: args.now } : {}),
    });
  } catch (err) {
    if (err instanceof ProviderResultRejectedError) {
      throw new LoginRefusedError("provider_rejected");
    }
    throw err;
  }
  // The address that authenticated must be the address this login was
  // started for.
  if (emailBindingHash(identity.email) !== login.emailHash) {
    throw new LoginRefusedError("provider_rejected");
  }
  const mapped = await getOrCreateOpaqueSubject({
    provider: "stytch",
    providerUserId: identity.providerUserId,
    correlationId: args.correlationId,
  });
  return {
    identity,
    sub: mapped.record.sub,
    subjectCreated: mapped.created,
    login,
  };
}
