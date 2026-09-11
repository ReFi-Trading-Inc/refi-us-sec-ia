/**
 * POST /api/webhooks/kyc/provider — provider → ReFi asynchronous KYC result.
 *
 * Unauthenticated by session (the sender is the provider, not a browser).
 * Controls, in order: dark (404) unless the Socure adapter is selected;
 * per-IP rate limit; optional documented sender-IP allowlist
 * (SOCURE_WEBHOOK_ENFORCE_SENDER_IP=1 — defense in depth only, never the
 * primary control; disabled until the runtime network exposes the original
 * source address reliably, since forwarded headers are client-settable);
 * body-size cap; constant-time Bearer credential validation (founder
 * decision 2026-09-10; credential comparison, not payload signing; unset
 * token → 401, fail closed);
 * schema validation; exactly-once application by event id; every delivery
 * audited. Only an authenticated `evaluation_completed` for a known
 * evaluation whose `data.id` matches our stored request id can change a
 * user's state — and never regress a terminal one. Browser-submitted
 * "final decisions" have no path here: the route ignores session cookies.
 *
 * Relative imports so the contract-assertion harness can load the route.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerEnv } from "../../../../../src/lib/config/env";
import { correlationIdFrom } from "../../../../../src/lib/bff/correlation";
import { getKycProvider } from "../../../../../src/lib/kyc";
import { SocureKycProvider } from "../../../../../src/lib/kyc/socure/adapter";
import {
  isDocumentedSocureSender,
  verifySocureWebhookAuthorization,
} from "../../../../../src/lib/kyc/socure/webhook-auth";
import { socureWebhookEventSchema } from "../../../../../src/lib/kyc/socure/schemas";
import { noteIgnoredWebhookEvent } from "../../../../../src/lib/prototype-store/entities/kyc-evaluation";
import { createRateLimiter } from "../../../../_lib/rateLimit";

const limiter = createRateLimiter({ windowMs: 60_000, max: 120 });
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  const env = getServerEnv();
  if (env.REFI_KYC_PROVIDER !== "socure") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ip = clientIp(req);
  if (!limiter(ip).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (
    env.SOCURE_WEBHOOK_ENFORCE_SENDER_IP === "1" &&
    !isDocumentedSocureSender(ip, env.SOCURE_ENV)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const auth = verifySocureWebhookAuthorization(
    req.headers.get("authorization"),
    env.SOCURE_WEBHOOK_BEARER_TOKEN,
  );
  if (!auth.ok) {
    // Never say which part failed; never log the presented credential.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const text = await req.text().catch(() => "");
  if (text.length > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Malformed" }, { status: 400 });
  }
  const generic = socureWebhookEventSchema.safeParse(payload);
  if (!generic.success) {
    return NextResponse.json({ error: "Malformed" }, { status: 400 });
  }
  const provider = getKycProvider();
  if (!(provider instanceof SocureKycProvider)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const applied = await provider.applyWebhook(payload, correlationId);
  if (!applied.handled) {
    if (applied.reason === "ignored_event_type") {
      const audit = await noteIgnoredWebhookEvent({
        eventId: generic.data.event_id,
        eventType: generic.data.event_type,
        providerEvaluationId: generic.data.data.eval_id,
      });
      return NextResponse.json(
        {
          received: true,
          outcome: audit === "recorded" ? "ignored" : "duplicate",
        },
        { status: 200 },
      );
    }
    if (applied.reason === "environment_mismatch") {
      return NextResponse.json(
        { error: "Environment mismatch" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Malformed" }, { status: 400 });
  }
  // The durable record (event marker + state change) is written by
  // applyWebhook BEFORE this response; 2xx is returned only after that, and
  // no heavier work runs inside the request.
  return NextResponse.json(
    { received: true, outcome: applied.outcome },
    { status: 200 },
  );
}
