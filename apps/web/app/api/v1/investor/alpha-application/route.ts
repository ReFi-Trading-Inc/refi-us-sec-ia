/**
 * POST   /api/v1/investor/alpha-application    step 1: email + UTM
 * PATCH  /api/v1/investor/alpha-application    step 2: qualification
 *
 * F-track two-step signup (Sprint 2). Public — no auth required, this is
 * a marketing-surface intake — but CSRF-protected by origin check and
 * dark behind FLAG_ALPHA_APPLICATION_ROUTE.
 *
 * Anti-abuse posture: no captcha at launch (per Sprint Plan v3 §Sprint 1
 * F-track); rate limiting arrives with the broader route limits in
 * Sprint 6. The waitlist scoring rubric absorbs quality filtering, so
 * spam intake is a scoring problem, not a security problem, at this
 * stage.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { correlationIdFrom } from "@lib/bff/correlation";
import { enforceCsrfOrigin } from "@lib/bff/csrf";
import { enforceRateLimit, ipKey } from "@lib/bff/rate-limit";
import { isEnabled } from "@lib/feature-flags";
import {
  upsertStep1,
  upsertStep2,
} from "@lib/prototype-store/entities/alpha-application";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(320)
  .refine((s) => s.includes("@"), "email must contain @");

const step1Schema = z
  .object({
    email: emailSchema,
    utm: z
      .object({
        source: z.string().max(256).optional(),
        medium: z.string().max(256).optional(),
        campaign: z.string().max(256).optional(),
        content: z.string().max(256).optional(),
        term: z.string().max(256).optional(),
        referrer: z.string().max(2048).optional(),
      })
      .optional(),
  })
  .strict();

const step2Schema = z
  .object({
    email: emailSchema,
    primaryBroker: z.string().max(64).optional(),
    isUsPerson: z.boolean().optional(),
    portfolioBand: z.string().max(64).optional(),
    automationExperience: z.string().max(64).optional(),
    feedbackCommitment: z.boolean().optional(),
  })
  .strict();

function disabled(correlationId: string): NextResponse {
  return NextResponse.json(
    {
      error: { code: "flag_off", message: "alpha application disabled" },
      correlationId,
    },
    { status: 404 },
  );
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  if (!isEnabled("FLAG_ALPHA_APPLICATION_ROUTE"))
    return disabled(correlationId);
  const csrf = enforceCsrfOrigin(req, correlationId);
  if (csrf) return csrf;
  // S6 signup class: 10/60s/hashed-IP. Absorbs mash-refresh; the
  // waitlist scoring rubric handles finer-grained quality signal.
  const rate = enforceRateLimit(req, "signup", ipKey(req));
  if (rate) return rate;
  const body = await readJson(req);
  const parsed = step1Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: { code: "invalid_input", message: parsed.error.message },
        correlationId,
      },
      { status: 400 },
    );
  }
  const app = await upsertStep1({
    email: parsed.data.email,
    ...(parsed.data.utm ? { utm: parsed.data.utm } : {}),
  });
  return NextResponse.json(
    {
      data: {
        email: app.email,
        capturedAt: app.capturedAt,
        step: "captured",
      },
      correlationId,
    },
    { status: 201 },
  );
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  if (!isEnabled("FLAG_ALPHA_APPLICATION_ROUTE"))
    return disabled(correlationId);
  const csrf = enforceCsrfOrigin(req, correlationId);
  if (csrf) return csrf;
  // S6 signup class: 10/60s/hashed-IP. Absorbs mash-refresh; the
  // waitlist scoring rubric handles finer-grained quality signal.
  const rate = enforceRateLimit(req, "signup", ipKey(req));
  if (rate) return rate;
  const body = await readJson(req);
  const parsed = step2Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: { code: "invalid_input", message: parsed.error.message },
        correlationId,
      },
      { status: 400 },
    );
  }
  const patch: Parameters<typeof upsertStep2>[0] = { email: parsed.data.email };
  if (parsed.data.primaryBroker !== undefined)
    patch.primaryBroker = parsed.data.primaryBroker;
  if (parsed.data.isUsPerson !== undefined)
    patch.isUsPerson = parsed.data.isUsPerson;
  if (parsed.data.portfolioBand !== undefined)
    patch.portfolioBand = parsed.data.portfolioBand;
  if (parsed.data.automationExperience !== undefined)
    patch.automationExperience = parsed.data.automationExperience;
  if (parsed.data.feedbackCommitment !== undefined)
    patch.feedbackCommitment = parsed.data.feedbackCommitment;
  const app = await upsertStep2(patch);
  if (!app) {
    return NextResponse.json(
      {
        error: {
          code: "not_found",
          message: "run step 1 (POST) before qualification (PATCH)",
        },
        correlationId,
      },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      data: {
        email: app.email,
        step: "qualified",
        score: app.score,
      },
      correlationId,
    },
    { status: 200 },
  );
}
