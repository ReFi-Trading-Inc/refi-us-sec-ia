/**
 * Establish a connected BFF session from a completed email login.
 *
 * Required order (founder continuation 2026-09-10 §5D, Daniel step 5):
 *   provider-verified identity + durable ReFi opaque subject
 *   → frontend identity bridge assertion (separate ES256 key)
 *   → Daniel's `exchangeIdentity`
 *   → authoritative backend identity result (verified, jti consumed once)
 *   → durable connected session
 *
 * This module is the seam between the Stytch slice and the identity-bridge /
 * exchange slice. In this slice the seam fails closed: no bridge, no
 * exchange and therefore NO session can be created from provider state
 * alone. The bridge/exchange slice replaces `establishConnectedSession`'s
 * body; its contract (input, output, error) is fixed here so the login
 * routes and their tests do not change.
 */
import type { CompletedLogin } from "./login-flow";

export class IdentityExchangeUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Connected sign-in cannot be completed: ${reason}. No session is created from provider state alone.`,
    );
    this.name = "IdentityExchangeUnavailableError";
  }
}

export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "strict";
    path: string;
    maxAge: number;
  };
}

export interface EstablishedConnectedSession {
  /** Where the browser continues after sign-in (same-origin path). */
  continuePath: string;
  cookies: SessionCookie[];
}

export type EstablishConnectedSession = (args: {
  completed: CompletedLogin;
  correlationId: string;
}) => Promise<EstablishedConnectedSession>;

let implementation: EstablishConnectedSession | null = null;

/** Wired by the identity-bridge / exchange slice; tests may inject a fake. */
export function setConnectedSessionEstablisher(
  impl: EstablishConnectedSession | null,
): void {
  implementation = impl;
}

export async function establishConnectedSession(args: {
  completed: CompletedLogin;
  correlationId: string;
}): Promise<EstablishedConnectedSession> {
  if (!implementation) {
    throw new IdentityExchangeUnavailableError(
      "identity bridge and backend identity exchange are not wired",
    );
  }
  return implementation(args);
}
