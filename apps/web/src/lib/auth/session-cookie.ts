/**
 * The connected session cookie (`us_session_v1`, connected form).
 *
 * The cookie is a REFERENCE to a durable connected session, not the session:
 * an HS256 JWT (SESSION_JWT_SECRET) carrying `sub`, `sid`, `auth_time`,
 * `amr`, `src: "connected"`. `getAuthContext` resolves the durable record by
 * `sid` on every request; revocation and expiry live in the store, so a
 * stolen-but-revoked cookie is dead on every instance at once, and
 * `auth_time` is read from the record (never re-stamped).
 */
import { SignJWT } from "jose";
import { getServerEnv } from "../config/env";
import type { ConnectedSessionRecord } from "../connected-store/session";
import type { SessionCookie } from "./connected-session";

export const SESSION_COOKIE = "us_session_v1";
export const CONNECTED_SESSION_SOURCE = "connected";

export async function mintConnectedSessionCookie(
  session: ConnectedSessionRecord,
  opts: { secure: boolean },
): Promise<SessionCookie> {
  const env = getServerEnv();
  const exp = Math.floor(Date.parse(session.expiresAt) / 1000);
  const iat = Math.floor(Date.parse(session.issuedAt) / 1000);
  const token = await new SignJWT({
    sid: session.sid,
    auth_time: session.authTime,
    ...(session.amr ? { amr: session.amr } : {}),
    src: CONNECTED_SESSION_SOURCE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.sub)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(env.SESSION_JWT_SECRET));
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: opts.secure,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, exp - iat),
    },
  };
}
