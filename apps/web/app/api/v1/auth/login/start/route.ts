/**
 * POST /api/v1/auth/login/start — begin an email-first login (Stytch, headless).
 *
 * Body: `{ email, method: "email_link" | "email_otp" }`. Unauthenticated by
 * design (there is no session yet); same-origin browser POST only; per-IP
 * rate limited. Dark (404) unless `REFI_AUTH_PROVIDER=stytch`, so the demo
 * and prototype tiers never call a provider.
 *
 * Creates the durable pending login (state / challenge / nonce, exact https
 * redirect, stable network_context), asks the provider to send the link or
 * code, and returns only `{ loginId, method, expiresAt }`. The `state` that
 * binds this browser to the pending login travels in an HttpOnly cookie —
 * never in the response body, never in the magic link.
 *
 * No secret, no email, no provider identifier is echoed. Relative imports so
 * the contract-assertion harness can load the route.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "../../../../../../src/lib/config/env";
import { requestOrigin } from "../../../../../../src/lib/bff/origin";
import { correlationIdFrom } from "../../../../../../src/lib/bff/correlation";
import {
  LoginInputError,
  startEmailLogin,
} from "../../../../../../src/lib/auth/login-flow";
import { AuthProviderUnavailableError } from "../../../../../../src/lib/auth/stytch";
import { createRateLimiter } from "../../../../../_lib/rateLimit";

export const LOGIN_COOKIE = "us_login_v1";
const LOGIN_COOKIE_MAX_AGE = 15 * 60;

const bodySchema = z
  .object({
    email: z.string().min(3).max(320),
    method: z.enum(["email_link", "email_otp"]),
  })
  .strict();

const limiter = createRateLimiter({ windowMs: 10 * 60_000, max: 10 });

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function encodeLoginCookie(loginId: string, state: string): string {
  return `${loginId}.${state}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  if (getServerEnv().REFI_AUTH_PROVIDER !== "stytch") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const origin = req.headers.get("origin");
  if (!origin || origin === "null" || origin !== requestOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!limiter(clientIp(req)).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const json: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body must be { email, method: email_link | email_otp }" },
      { status: 400 },
    );
  }
  try {
    const started = await startEmailLogin({
      email: parsed.data.email,
      method: parsed.data.method,
      clientIp: clientIp(req),
      correlationId,
    });
    const res = NextResponse.json(
      {
        data: {
          loginId: started.loginId,
          method: started.method,
          expiresAt: started.expiresAt,
        },
        correlationId,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
    res.cookies.set(
      LOGIN_COOKIE,
      encodeLoginCookie(started.loginId, started.state),
      {
        httpOnly: true,
        secure: requestOrigin(req).startsWith("https://"),
        sameSite: "lax",
        path: "/",
        maxAge: LOGIN_COOKIE_MAX_AGE,
      },
    );
    return res;
  } catch (err) {
    if (err instanceof LoginInputError) {
      return NextResponse.json(
        { error: `Invalid ${err.field}`, correlationId },
        { status: 400 },
      );
    }
    if (err instanceof AuthProviderUnavailableError) {
      return NextResponse.json(
        { error: "Email sign-in is not available right now.", correlationId },
        { status: 503 },
      );
    }
    // Provider or store failure: fail closed, say nothing specific.
    return NextResponse.json(
      { error: "Email sign-in is not available right now.", correlationId },
      { status: 503 },
    );
  }
}
