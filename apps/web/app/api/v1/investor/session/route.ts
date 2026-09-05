/**
 * GET /api/v1/investor/session
 *
 * Returns the current session projection. Authoritative SIWE session lives
 * upstream (G-002 Bucket A); this projection is what the UI consumes.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bffRead } from "@lib/bff/handler";
import { getSession, putSession } from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-002",
  fetch: async (ctx) => {
    if (!ctx.auth) return null;
    const existing = await getSession(ctx.auth.authId);
    if (existing) return existing;
    return putSession({
      authId: ctx.auth.authId,
      ...(ctx.auth.accountId ? { accountId: ctx.auth.accountId } : {}),
      correlationId: ctx.correlationId,
    });
  },
});

/**
 * DELETE /api/v1/investor/session — sign out.
 *
 * Clears the BFF session cookie (and the eligibility/demo cookies) for this
 * browser. Same-origin browser request only (CSRF fingerprint check); no
 * session is required, so a stale or already-expired cookie can always be
 * cleared. Nothing is written upstream: the BFF cookie is the only session.
 */
export function DELETE(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null" || origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const res = NextResponse.json(
    { data: { ok: true } },
    { headers: { "cache-control": "private, no-store" } },
  );
  // Raw Set-Cookie appends: `res.cookies` is keyed by name, so clearing the
  // same cookie on two paths needs two headers, not two `set` calls.
  const secure = req.nextUrl.protocol === "https:" ? "; Secure" : "";
  for (const [name, path] of [
    ["us_session_v1", "/"],
    ["us_session_v1", "/us"],
    ["us_eligibility_v1", "/us"],
    ["us_demo_persona", "/"],
  ] as const) {
    res.headers.append(
      "set-cookie",
      `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
    );
  }
  return res;
}
