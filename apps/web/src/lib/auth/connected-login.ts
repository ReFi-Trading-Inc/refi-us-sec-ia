/**
 * The connected sign-in chain, in the mandated order (§5D; Daniel step 5):
 *
 *   provider-verified identity + durable ReFi opaque subject (CompletedLogin)
 *   → identity bridge assertion (separate ES256 key, ≤300 s, closed claims)
 *   → Daniel's `exchangeIdentity` (frozen client, Google bearer)
 *   → verified backend identity result (pinned JWKS, jti consumed once)
 *   → durable connected session (putIfAbsent) → session cookie.
 *
 * No step may be skipped or reordered; no session exists before the backend
 * result is verified; nothing here reads provider state after the bridge.
 */
import {
  createConnectedSession,
  newSessionId,
} from "../connected-store/session";
import type { EstablishConnectedSession } from "./connected-session";
import { IdentityExchangeUnavailableError } from "./connected-session";
import {
  BridgeConfigurationError,
  BridgeInputError,
  mintBridgeAssertion,
} from "./identity-bridge";
import {
  exchangeIdentity,
  IdentityResultRejectedError,
} from "./identity-exchange";
import { LoginRefusedError } from "./login-flow";
import { mintConnectedSessionCookie } from "./session-cookie";

/** Same-origin destination after a connected sign-in. */
export const CONNECTED_CONTINUE_PATH = "/us/app/home";

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
    let result;
    try {
      result = await exchangeIdentity({
        bridge,
        bridgeSub: completed.sub,
        login: completed.login,
        email: completed.identity.email,
        correlationId,
      });
    } catch (err) {
      if (err instanceof IdentityResultRejectedError) {
        throw new LoginRefusedError("identity_result_rejected");
      }
      throw err;
    }
    const session = await createConnectedSession({
      sid,
      sub: result.sub,
      authTime: result.authTime,
      ...(result.amr ? { amr: result.amr } : {}),
      identityResultJti: result.jti,
      correlationId,
    });
    const cookie = await mintConnectedSessionCookie(session, {
      secure: completed.login.redirectUri.startsWith("https://"),
    });
    return { continuePath: CONNECTED_CONTINUE_PATH, cookies: [cookie] };
  };
