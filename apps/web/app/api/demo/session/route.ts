/**
 * /api/demo/session — demo-tier persona sign-in.
 *
 * EXISTS ONLY WHEN REFI_ENV=demo. Every method answers 404 on any other tier
 * (dev, staging, prod), so production cannot invoke it and nothing here can
 * weaken a non-demo deployment.
 *
 *   GET    → { tier: "demo", persona } for the environment indicator.
 *   POST   → { persona: "applicant" | "admitted" } mints the SAME HS256
 *            `us_session_v1` cookie the BFF already verifies (SESSION_JWT_SECRET),
 *            for a FIXED persona subject. The admitted persona also receives an
 *            eligibility decision cookie (same HS256 shape the eligibility route
 *            mints) so the demo can start inside the product.
 *   DELETE → clears the demo cookies.
 *
 * Security properties (tested):
 *   - closed persona enum; strict body — extra keys, ids, emails are rejected;
 *   - no query-string or header impersonation path;
 *   - same-origin browser POST only (Origin must equal the request origin);
 *   - the display cookie `us_demo_persona` is not read by any BFF auth path;
 *   - no account id is minted or linked here: account scope comes from the
 *     BFF/backend/simulator (`resolveAccountScope`), and admission state from
 *     backend projections. A persona is a label, never an authority.
 *
 * Imports are relative so the repo-root contract-assertion harness (no @lib
 * alias) can load and exercise this route directly.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SignJWT } from "jose";
import { getServerEnv } from "../../../../src/lib/config/env";
import {
  DEMO_PERSONA_COOKIE,
  DEMO_PERSONA_PROFILES,
  DEMO_PERSONAS,
  isDemoPersona,
} from "../../../../src/lib/demo/personas";

const SESSION_COOKIE = "us_session_v1";
const ELIGIBILITY_COOKIE = "us_eligibility_v1";
const SESSION_TTL = "2h";

const bodySchema = z.object({ persona: z.enum(DEMO_PERSONAS) }).strict();

function isDemoTier(): boolean {
  return getServerEnv().REFI_ENV === "demo";
}

function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  return origin !== null && origin !== "null" && origin === req.nextUrl.origin;
}

export function GET(req: NextRequest): NextResponse {
  if (!isDemoTier()) return notFound();
  const raw = req.cookies.get(DEMO_PERSONA_COOKIE)?.value ?? null;
  const persona = isDemoPersona(raw) ? raw : null;
  return NextResponse.json(
    { data: { tier: "demo", persona } },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isDemoTier()) return notFound();
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const json: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body must be exactly { persona: 'applicant' | 'admitted' }" },
      { status: 400 },
    );
  }
  const profile = DEMO_PERSONA_PROFILES[parsed.data.persona];
  const env = getServerEnv();

  const session = await new SignJWT({ demo_persona: profile.key })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(profile.authId)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(new TextEncoder().encode(env.SESSION_JWT_SECRET));

  const res = NextResponse.json(
    {
      data: {
        persona: profile.key,
        label: profile.label,
        entryPath: profile.entryPath,
        // Explicit: nothing about admission, accounts, or trading is asserted
        // by this response. Those are backend projections.
        authorityAsserted: false,
      },
    },
    { headers: { "cache-control": "private, no-store" } },
  );
  const secure = req.nextUrl.protocol === "https:";
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
  if (profile.issuesEligibility) {
    const eligibility = await new SignJWT({
      result: "eligible",
      state: "CA",
      rule_id: "demo-persona",
      ip_hash: "demo",
      ua_hash: "demo",
      rule_version: "demo",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(new TextEncoder().encode(env.ELIGIBILITY_JWT_SECRET));
    res.cookies.set(ELIGIBILITY_COOKIE, eligibility, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/us",
      maxAge: 60 * 60 * 24,
    });
  } else {
    res.cookies.set(ELIGIBILITY_COOKIE, "", { path: "/us", maxAge: 0 });
  }
  // Display-only label for the environment indicator. Not HttpOnly on purpose:
  // it carries no authority and the BFF never reads it.
  res.cookies.set(DEMO_PERSONA_COOKIE, profile.key, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
  return res;
}

export function DELETE(req: NextRequest): NextResponse {
  if (!isDemoTier()) return notFound();
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(ELIGIBILITY_COOKIE, "", { path: "/us", maxAge: 0 });
  res.cookies.set(DEMO_PERSONA_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
