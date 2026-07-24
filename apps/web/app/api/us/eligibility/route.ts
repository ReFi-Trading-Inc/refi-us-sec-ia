// POST /api/us/eligibility — evaluates eligibility rules, signs a JWT, and
// sets the us_eligibility_v1 cookie. Returns only non-PII decision metadata.
import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { SignJWT } from "jose";
import { z } from "zod";
import { getServerEnv } from "@lib/config/env";
import { correlationIdFrom } from "@lib/bff/correlation";
import { enforceCsrfOrigin } from "@lib/bff/csrf";
import { createRateLimiter } from "@app/_lib/rateLimit";
import {
  eligibilityRules,
  RULE_VERSION,
  type EligibilityResult,
} from "./rules";

const limiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 });

const bodySchema = z.object({
  state: z
    .string()
    .length(2, "State must be a 2-letter code")
    .transform((s) => s.toUpperCase()),
  isUsPerson: z.boolean(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
});

function ageFromDob(dob: string): number {
  const [y, m, d] = dob.split("-").map((n) => Number(n));
  if (!y || !m || !d) return 0;
  const birth = new Date(Date.UTC(y, m - 1, d));
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function hmac(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfReject = enforceCsrfOrigin(request, correlationIdFrom(request));
  if (csrfReject) return csrfReject;

  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const { allowed } = limiter(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429 },
    );
  }

  const env = getServerEnv();

  const json: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { state, isUsPerson, dob } = parsed.data;
  const age = ageFromDob(dob);

  const rule =
    eligibilityRules.find((r) => r.matches({ state, isUsPerson, age })) ??
    eligibilityRules[eligibilityRules.length - 1];
  if (!rule) {
    return NextResponse.json({ error: "No rule matched" }, { status: 500 });
  }
  const result: EligibilityResult = rule.result;

  const ua = request.headers.get("user-agent") ?? "";
  const ip_hash = hmac(env.IP_HASH_SECRET, ip);
  const ua_hash = hmac(env.IP_HASH_SECRET, ua);

  const jwtSecret = new TextEncoder().encode(env.ELIGIBILITY_JWT_SECRET);
  const token = await new SignJWT({
    result,
    state,
    rule_id: rule.id,
    ip_hash,
    ua_hash,
    rule_version: RULE_VERSION,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(jwtSecret);

  // PostHog telemetry placeholder. No PII; never log dob or raw IP.
  if (typeof console !== "undefined") {
    console.info(
      JSON.stringify({
        event: "us_eligibility_decision",
        result,
        state,
        rule_id: rule.id,
      }),
    );
  }

  const response = NextResponse.json({ result, state, ruleId: rule.id });
  response.cookies.set("us_eligibility_v1", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/us",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
