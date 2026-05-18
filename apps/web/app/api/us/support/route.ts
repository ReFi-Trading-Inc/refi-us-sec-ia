import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@app/_lib/rateLimit";

const limiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });

const bodySchema = z.object({
  subject: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  message: z.string().min(10).max(4000),
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

  // Forward to internal support system. In production, route to Zendesk or
  // a managed support platform. Ticket ID is synthetic until backend wires up.
  const ticketId = `tkt_${Date.now()}`;

  console.info(
    JSON.stringify({
      event: "support_ticket_created",
      ticket_id: ticketId,
      category: parsed.data.category,
    }),
  );

  return NextResponse.json({ ok: true, ticket_id: ticketId });
}
