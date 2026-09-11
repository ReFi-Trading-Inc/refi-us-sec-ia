/**
 * POST /api/v1/auth/login/complete — finish an email-first login.
 *
 * Body: `{ token }` (magic link, from the callback page's URL) or `{ code }`
 * (email OTP). The pending login is identified by the HttpOnly login cookie
 * set at start (`loginId.state`), so the browser that started the login is
 * the one that can complete it and the exact registered redirect URI never
 * carries state.
 *
 * Order (mandate §5D; nothing here creates a session from provider state):
 *   consume pending login once → provider authenticate (server-side) →
 *   normalise verified identity → durable opaque subject →
 *   `establishConnectedSession` (identity bridge → Daniel's exchange →
 *   connected session). Until the bridge/exchange slice is wired, that last
 *   step fails closed with 503 and no session cookie is ever set.
 *
 * Unauthenticated by design, same-origin, rate limited, dark unless
 * `REFI_AUTH_PROVIDER=stytch`. Never echoes email, token, code, provider ids
 * or the reason a provider rejected.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "../../../../../../src/lib/config/env";
import { requestOrigin } from "../../../../../../src/lib/bff/origin";
import { correlationIdFrom } from "../../../../../../src/lib/bff/correlation";
import {
  completeEmailLogin,
  LoginInputError,
  LoginRefusedError,
} from "../../../../../../src/lib/auth/login-flow";
import {
  establishConnectedSession,
  IdentityExchangeUnavailableError,
} from "../../../../../../src/lib/auth/connected-session";
import { AuthProviderUnavailableError } from "../../../../../../src/lib/auth/stytch";
import { createRateLimiter } from "../../../../../_lib/rateLimit";

export const LOGIN_COOKIE = "us_login_v1";

const bodySchema = z.union([
  z.object({ token: z.string().min(16).max(4096) }).strict(),
  z.object({ code: z.string().regex(/^\d{4,10}$/) }).strict(),
]);

const limiter = createRateLimiter({ windowMs: 10 * 60_000, max: 20 });

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function decodeLoginCookie(
  value: string | undefined,
): { loginId: string; state: string } | null {
  if (!value) return null;
  const i = value.indexOf(".");
  if (i <= 0) return null;
  return { loginId: value.slice(0, i), state: value.slice(i + 1) };
}

function clearLoginCookie(res: NextResponse, secure: boolean): NextResponse {
  res.cookies.set(LOGIN_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
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
  const secure = requestOrigin(req).startsWith("https://");
  const binding = decodeLoginCookie(req.cookies.get(LOGIN_COOKIE)?.value);
  if (!binding) {
    return NextResponse.json(
      { error: "No sign-in in progress on this browser.", correlationId },
      { status: 400 },
    );
  }
  const json: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body must be { token } or { code }", correlationId },
      { status: 400 },
    );
  }
  try {
    const completed = await completeEmailLogin({
      loginId: binding.loginId,
      state: binding.state,
      ...("token" in parsed.data ? { token: parsed.data.token } : {}),
      ...("code" in parsed.data ? { code: parsed.data.code } : {}),
      correlationId,
    });
    // The login cookie is single-use regardless of what happens next.
    const session = await establishConnectedSession({
      completed,
      correlationId,
    });
    const res = NextResponse.json(
      { data: { ok: true, continuePath: session.continuePath }, correlationId },
      { headers: { "cache-control": "private, no-store" } },
    );
    clearLoginCookie(res, secure);
    for (const c of session.cookies)
      res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (err) {
    if (err instanceof LoginInputError) {
      return clearLoginCookie(
        NextResponse.json(
          { error: `Invalid ${err.field}`, correlationId },
          { status: 400 },
        ),
        secure,
      );
    }
    if (err instanceof LoginRefusedError) {
      // One neutral message for every refusal: replay, expiry, mismatch and
      // provider rejection are indistinguishable to the browser.
      return clearLoginCookie(
        NextResponse.json(
          {
            error: "This sign-in link or code is no longer valid.",
            code: "login_refused",
            correlationId,
          },
          { status: 401 },
        ),
        secure,
      );
    }
    if (
      err instanceof IdentityExchangeUnavailableError ||
      err instanceof AuthProviderUnavailableError
    ) {
      return clearLoginCookie(
        NextResponse.json(
          {
            error: "Sign-in cannot be completed right now.",
            code: "exchange_unavailable",
            correlationId,
          },
          { status: 503 },
        ),
        secure,
      );
    }
    return clearLoginCookie(
      NextResponse.json(
        { error: "Sign-in cannot be completed right now.", correlationId },
        { status: 503 },
      ),
      secure,
    );
  }
}
