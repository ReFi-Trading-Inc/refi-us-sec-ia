import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@app/_lib/rateLimit";

// MIG-P2.5-23: categorized intake. Schema accepts the classifier output so
// the server can re-validate the boundary and route the ticket. Analytics
// only emits `{category, blocked, boundary_rule_id}` — never the prompt
// text, per SEC Rule 203A-2(e)(3) compliance posture.

const limiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });

const SUPPORT_CATEGORY = z.enum([
  "allowed_technical",
  "allowed_broker_connection",
  "allowed_document_explanation",
  "allowed_billing",
  "allowed_general_platform",
  "blocked_buy_sell_advice",
  "blocked_recommendation_approval",
  "blocked_portfolio_change",
  "blocked_custom_strategy",
  "blocked_model_override",
  "complaint",
]);

const bodySchema = z.object({
  subject: z.string().min(1).max(200),
  category: SUPPORT_CATEGORY,
  message: z.string().min(10).max(4000),
  classification: z.object({
    confidence: z.number().min(0).max(1),
    matched_patterns: z.array(z.string()).max(32),
  }),
  blocked: z.boolean(),
  boundary_rule_id: z.string().nullable(),
  correlation_id: z.string().min(1).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const { allowed } = limiter(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many support requests. Please wait before trying again." },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Server-side re-validation of the boundary. If the client claims a
  // blocked classification or selected a blocked category, reject before
  // forwarding anywhere downstream.
  if (parsed.data.blocked || parsed.data.category.startsWith("blocked_")) {
    return NextResponse.json(
      {
        code: "BLOCKED_BY_POLICY",
        message:
          "Ticket category was rejected by the server-side support boundary classifier.",
        boundary_rule_id: parsed.data.boundary_rule_id,
      },
      { status: 422 },
    );
  }

  // Forward to internal support system. In production, route to Zendesk or
  // a managed support platform. Ticket ID is synthetic until backend wires up.
  const ticketId = `tkt_${Date.now()}`;

  // Analytics scrub: NEVER log prompt text. Only category, boundary_rule_id,
  // and identifiers. (PostHog / OTel wiring lands in MIG-P2.5-18.)
  console.info(
    JSON.stringify({
      event: "support_ticket_created",
      ticket_id: ticketId,
      category: parsed.data.category,
      boundary_rule_id: parsed.data.boundary_rule_id,
      correlation_id: parsed.data.correlation_id,
    }),
  );

  return NextResponse.json({ ok: true, ticket_id: ticketId });
}
