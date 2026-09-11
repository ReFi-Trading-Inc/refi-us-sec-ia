/**
 * The connected sign-in chain, in the mandated order (§5D; alpha.3 step 5):
 *
 *   provider-verified identity + durable ReFi opaque subject (CompletedLogin)
 *   → identity bridge assertion (separate ES256 key, ≤300 s, closed claims)
 *   → durable EXCHANGE ATTEMPT holding the exact request (one per login)
 *   → Daniel's `exchangeIdentity` (frozen client, Google bearer)
 *   → closed verification + binding of the backend identity result,
 *     result jti consumed once BEFORE any session
 *   → durable connected session under the result's sid (putIfAbsent)
 *   → reference cookie.
 *
 * Recovery: a lost/ambiguous exchange answer leaves the attempt `sent`;
 * `recoverConnectedSession` re-sends the identical stored request while the
 * assertion is valid. It never mints a new assertion, never accepts other
 * bindings, and never creates a second session: the session is keyed by the
 * result's `sid` (proved equal to the bridge sid), so a recovered result
 * that already produced a session simply returns that session.
 */
import {
  createConnectedSession,
  getActiveConnectedSession,
  newSessionId,
  type ConnectedSessionRecord,
} from "../connected-store/session";
import {
  getExchangeAttempt,
  openExchangeAttempt,
  sameBindings,
  updateExchangeAttempt,
  type ExchangeAttemptRecord,
} from "../connected-store/exchange-attempt";
import { consumeJtiOnce } from "../connected-store/replay";
import type {
  EstablishConnectedSession,
  EstablishedConnectedSession,
} from "./connected-session";
import { IdentityExchangeUnavailableError } from "./connected-session";
import {
  BridgeConfigurationError,
  BridgeInputError,
  mintBridgeAssertion,
} from "./identity-bridge";
import {
  IdentityExchangeLostResponseError,
  IdentityResultRejectedError,
  sendIdentityExchange,
  verifyIdentityResult,
} from "./identity-exchange";
import { LoginRefusedError } from "./login-flow";
import { mintConnectedSessionCookie } from "./session-cookie";

/** Same-origin destination after a connected sign-in. */
export const CONNECTED_CONTINUE_PATH = "/us/app/home";

/** Raised when the exchange answer is unknown; the login stays recoverable. */
export class ConnectedSessionRecoverableError extends IdentityExchangeUnavailableError {
  readonly recoverable = true as const;
  constructor(
    readonly loginId: string,
    reason: string,
  ) {
    super(reason);
    this.name = "ConnectedSessionRecoverableError";
  }
}

async function finish(
  attempt: ExchangeAttemptRecord,
  correlationId: string,
): Promise<EstablishedConnectedSession> {
  // Send the stored request EXACTLY; classify the answer.
  let token: string;
  try {
    await updateExchangeAttempt(attempt.loginId, {
      attempts: attempt.attempts + 1,
    });
    token = await sendIdentityExchange(attempt);
  } catch (err) {
    if (err instanceof IdentityExchangeLostResponseError) {
      throw new ConnectedSessionRecoverableError(attempt.loginId, err.message);
    }
    if (err instanceof IdentityResultRejectedError) {
      await updateExchangeAttempt(attempt.loginId, {
        status: "failed",
        failureReason: err.reason,
      });
      throw new LoginRefusedError("identity_result_rejected");
    }
    if (err instanceof IdentityExchangeUnavailableError) {
      // Definitive local failure (no upstream, misconfiguration): nothing
      // was sent, so there is nothing to recover; the login is spent.
      await updateExchangeAttempt(attempt.loginId, {
        status: "failed",
        failureReason: err.message,
      });
    }
    throw err;
  }
  let result;
  try {
    result = await verifyIdentityResult({
      token,
      binding: {
        email: attempt.email,
        authTime: attempt.authTime,
        sid: attempt.sid,
      },
      correlationId,
    });
  } catch (err) {
    if (err instanceof IdentityResultRejectedError) {
      if (err.reason === "jti replay") {
        // The same result was already consumed (a recovery raced or the
        // backend replayed its answer): at most ONE session may exist for it.
        const existing = await getActiveConnectedSession(attempt.sid);
        if (existing && existing.identityResultJti) {
          await updateExchangeAttempt(attempt.loginId, { status: "completed" });
          return await cookieFor(existing, attempt);
        }
      }
      await updateExchangeAttempt(attempt.loginId, {
        status: "failed",
        failureReason: err.reason,
      });
      throw new LoginRefusedError("identity_result_rejected");
    }
    throw err;
  }
  // The bridge assertion has now done its one job; record it so it is never
  // re-presented after success (the backend enforces its own replay control).
  await consumeJtiOnce("bridge-assertion-jti", {
    jti: attempt.bridgeJti,
    sub: attempt.sub,
    exp: attempt.bridgeExp,
    correlationId,
  });
  // One session per result: keyed by the result's sid (=== bridge sid).
  let session: ConnectedSessionRecord;
  const already = await getActiveConnectedSession(result.sid);
  if (already) {
    session = already;
  } else {
    session = await createConnectedSession({
      sid: result.sid,
      sub: result.sub,
      authTime: result.authTime,
      ...(result.amr ? { amr: result.amr } : {}),
      identityResultJti: result.jti,
      correlationId,
    });
  }
  await updateExchangeAttempt(attempt.loginId, {
    status: "completed",
    identityResultJti: result.jti,
  });
  return await cookieFor(session, attempt);
}

async function cookieFor(
  session: ConnectedSessionRecord,
  attempt: ExchangeAttemptRecord,
): Promise<EstablishedConnectedSession> {
  const cookie = await mintConnectedSessionCookie(session, {
    secure: attempt.request.redirect_uri.startsWith("https://"),
  });
  return { continuePath: CONNECTED_CONTINUE_PATH, cookies: [cookie] };
}

export const establishConnectedSessionViaExchange: EstablishConnectedSession =
  async ({ completed, correlationId }) => {
    const sid = newSessionId();
    let bridge;
    try {
      bridge = await mintBridgeAssertion({
        identity: completed.identity,
        sub: completed.sub,
        sid,
      });
    } catch (err) {
      if (err instanceof BridgeConfigurationError) {
        throw new IdentityExchangeUnavailableError(err.message);
      }
      if (err instanceof BridgeInputError) {
        throw new LoginRefusedError("bridge_input");
      }
      throw err;
    }
    const request = {
      identity_assertion: bridge.token,
      state: completed.login.state,
      challenge: completed.login.challenge,
      nonce: completed.login.nonce,
      redirect_uri: completed.login.redirectUri,
      network_context: completed.login.networkContext,
    };
    const { record, created } = await openExchangeAttempt({
      loginId: completed.login.loginId,
      state: completed.login.state,
      sub: completed.sub,
      sid,
      bridgeJti: bridge.jti,
      bridgeExp: bridge.exp,
      email: completed.identity.email,
      authTime: completed.identity.authTime,
      amr: [...completed.identity.amr],
      request,
      correlationId,
    });
    if (!created) {
      // A login is exchanged once; a second completion continues the FIRST
      // attempt only if it is byte-identical — otherwise it is refused.
      return recoverAttempt(record, request, correlationId);
    }
    return finish(record, correlationId);
  };

async function recoverAttempt(
  attempt: ExchangeAttemptRecord,
  presented: ExchangeAttemptRecord["request"] | null,
  correlationId: string,
): Promise<EstablishedConnectedSession> {
  if (presented && !sameBindings(attempt.request, presented)) {
    throw new LoginRefusedError("state_mismatch");
  }
  if (attempt.status === "completed") {
    const existing = await getActiveConnectedSession(attempt.sid);
    if (!existing) throw new LoginRefusedError("already_consumed");
    return cookieFor(existing, attempt);
  }
  if (attempt.status === "failed")
    throw new LoginRefusedError("already_consumed");
  if (attempt.bridgeExp <= Math.floor(Date.now() / 1000)) {
    await updateExchangeAttempt(attempt.loginId, {
      status: "failed",
      failureReason: "assertion expired before recovery",
    });
    throw new LoginRefusedError("expired");
  }
  return finish(attempt, correlationId);
}

/**
 * Recover a login whose exchange answer was lost: the browser presents the
 * same login cookie (loginId + state); the identical stored request is
 * re-sent. Nothing else about the request can change.
 */
export async function recoverConnectedSession(args: {
  loginId: string;
  state: string;
  correlationId: string;
}): Promise<EstablishedConnectedSession | null> {
  const attempt = await getExchangeAttempt(args.loginId);
  if (!attempt) return null;
  if (attempt.state !== args.state)
    throw new LoginRefusedError("state_mismatch");
  return recoverAttempt(attempt, null, args.correlationId);
}
