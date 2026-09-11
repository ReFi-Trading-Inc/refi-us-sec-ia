/**
 * Stytch Consumer Authentication — provider adapter (founder decision
 * 2026-09-09: headless, email magic link primary, email OTP fallback).
 *
 * Program phase: US Investor Integration Foundation; consumed by the US
 * Connected Identity Alpha path. The provider authenticates the person; it
 * does NOT create a ReFi session, a ReFi subject, an account, or any
 * authority. Its verified result is normalised here into exactly what the
 * identity bridge needs and nothing else:
 *   - the provider's stable opaque `user_id` (mapped to a ReFi `sub` by
 *     connected-store/subject-map.ts — never used as `sub` directly),
 *   - the verified email (Daniel's `email` / `email_verified=true`),
 *   - the GENUINE authentication time (factor `last_authenticated_at`, else
 *     the session `started_at`; never "now"),
 *   - the authentication method (`amr`: email_link | email_otp).
 *
 * Secrets: `STYTCH_PROJECT_ID` / `STYTCH_SECRET` are server env only. The
 * real client is a lazy dynamic import of the `stytch` SDK; tests inject a
 * fake through `setStytchClientForTests` and never need a credential. No
 * genuine Stytch traffic is sent unless `REFI_AUTH_PROVIDER=stytch` and the
 * credentials are configured.
 */
import { getServerEnv } from "../config/env";

// ─── The narrow SDK surface this code depends on ────────────────────────────

export interface StytchEmailFactor {
  email_id: string;
  email_address: string;
}
export interface StytchAuthenticationFactor {
  type: string;
  delivery_method: string;
  last_authenticated_at?: string;
  email_factor?: StytchEmailFactor;
}
export interface StytchSession {
  session_id: string;
  user_id: string;
  authentication_factors: StytchAuthenticationFactor[];
  started_at?: string;
}
export interface StytchUser {
  user_id: string;
  emails: Array<{ email_id: string; email: string; verified: boolean }>;
}
export interface StytchAuthenticateResponse {
  request_id: string;
  user_id: string;
  method_id: string;
  user: StytchUser;
  session?: StytchSession;
  status_code: number;
}

export interface StytchClientLike {
  magicLinks: {
    email: {
      loginOrCreate(req: {
        email: string;
        login_magic_link_url: string;
        signup_magic_link_url: string;
        login_expiration_minutes: number;
        signup_expiration_minutes: number;
      }): Promise<{ request_id: string; user_id: string; email_id: string }>;
    };
    authenticate(req: {
      token: string;
      session_duration_minutes: number;
    }): Promise<StytchAuthenticateResponse>;
  };
  otps: {
    email: {
      loginOrCreate(req: {
        email: string;
        expiration_minutes: number;
      }): Promise<{ request_id: string; user_id: string; email_id: string }>;
    };
    authenticate(req: {
      method_id: string;
      code: string;
      session_duration_minutes: number;
    }): Promise<StytchAuthenticateResponse>;
  };
}

// ─── Client resolution ──────────────────────────────────────────────────────

export class AuthProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Email authentication is unavailable: ${reason}. No fallback provider is used.`,
    );
    this.name = "AuthProviderUnavailableError";
  }
}

let testClient: StytchClientLike | null = null;
let cachedClient: StytchClientLike | null = null;

/** Test seam: a fake provider; production never reaches the SDK when set. */
export function setStytchClientForTests(client: StytchClientLike | null): void {
  testClient = client;
  cachedClient = null;
}

export async function getStytchClient(): Promise<StytchClientLike> {
  if (testClient) return testClient;
  if (cachedClient) return cachedClient;
  const env = getServerEnv();
  if (env.REFI_AUTH_PROVIDER !== "stytch") {
    throw new AuthProviderUnavailableError("REFI_AUTH_PROVIDER is not stytch");
  }
  if (!env.STYTCH_PROJECT_ID || !env.STYTCH_SECRET) {
    throw new AuthProviderUnavailableError(
      "STYTCH_PROJECT_ID / STYTCH_SECRET are not configured",
    );
  }
  const stytch = await import("stytch");
  cachedClient = new stytch.Client({
    project_id: env.STYTCH_PROJECT_ID,
    secret: env.STYTCH_SECRET,
    env: env.STYTCH_ENV === "live" ? stytch.envs.live : stytch.envs.test,
  });
  return cachedClient;
}

// ─── Normalisation of a verified authentication ─────────────────────────────

export const PROVIDER_USER_ID_PATTERN = /^user-[A-Za-z0-9-]{8,200}$/;
export const AUTH_METHODS = ["email_link", "email_otp"] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

/** What the bridge is allowed to learn from the provider. Nothing else. */
export interface ProviderVerifiedIdentity {
  provider: "stytch";
  providerUserId: string;
  email: string;
  emailVerified: true;
  /** Unix seconds of the GENUINE authentication event. */
  authTime: number;
  amr: [AuthMethod];
  providerSessionId: string;
}

export class ProviderResultRejectedError extends Error {
  constructor(reason: string) {
    super(`Provider authentication result rejected: ${reason}`);
    this.name = "ProviderResultRejectedError";
  }
}

function toUnixSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

/**
 * Turn a provider response into a verified identity or throw. An email
 * address alone is never proof of authentication: the response must carry a
 * matching authentication factor of the expected method, the email must be
 * verified on the user record, and the authentication time must come from
 * the provider's own evidence.
 */
export function normalizeStytchAuthentication(
  res: StytchAuthenticateResponse,
  expected: { method: AuthMethod; now?: () => number },
): ProviderVerifiedIdentity {
  if (!PROVIDER_USER_ID_PATTERN.test(res.user_id)) {
    throw new ProviderResultRejectedError("malformed provider user id");
  }
  if (!res.session) {
    throw new ProviderResultRejectedError("no provider session in result");
  }
  if (res.session.user_id !== res.user_id) {
    throw new ProviderResultRejectedError("session/user mismatch");
  }
  const wantType = expected.method === "email_link" ? "magic_link" : "otp";
  const factor = res.session.authentication_factors.find(
    (f) =>
      (f.type === wantType || (wantType === "otp" && f.type === "email_otp")) &&
      f.delivery_method === "email" &&
      f.email_factor !== undefined,
  );
  if (!factor?.email_factor) {
    throw new ProviderResultRejectedError(
      `no ${expected.method} email factor in the provider session`,
    );
  }
  const email = factor.email_factor.email_address.trim().toLowerCase();
  const record = res.user.emails.find(
    (e) => e.email_id === factor.email_factor?.email_id,
  );
  if (!record || record.email.trim().toLowerCase() !== email) {
    throw new ProviderResultRejectedError("factor email is not on the user");
  }
  if (!record.verified) {
    throw new ProviderResultRejectedError("email is not verified");
  }
  const authTime =
    toUnixSeconds(factor.last_authenticated_at) ??
    toUnixSeconds(res.session.started_at);
  if (authTime === null) {
    throw new ProviderResultRejectedError(
      "no authentication time evidence in the provider result",
    );
  }
  const now = expected.now ? expected.now() : Math.floor(Date.now() / 1000);
  if (authTime > now + 30) {
    throw new ProviderResultRejectedError(
      "authentication time is in the future",
    );
  }
  return {
    provider: "stytch",
    providerUserId: res.user_id,
    email,
    emailVerified: true,
    authTime,
    amr: [expected.method],
    providerSessionId: res.session.session_id,
  };
}
