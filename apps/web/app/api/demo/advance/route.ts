/**
 * POST /api/demo/advance — presenter control, demo tier only.
 *
 * Forces the demo world's next scheduled order fills to happen now so a
 * walkthrough can show the execution chain progressing on cue (order.updated →
 * fill.recorded → reconciliation.updated on the event stream). 404 on every
 * tier except REFI_ENV=demo; same-origin browser POST; session required; the
 * only effect is on the in-process demo world — nothing reaches a broker.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "../../../../src/lib/config/env";
import { getAuthContext } from "../../../../src/lib/bff/auth";
import {
  advanceDemoWorld,
  resetDemoWorld,
} from "../../../../src/lib/investor-api/demo-client";

const bodySchema = z
  .object({
    fills: z.number().int().min(1).max(6).optional(),
    /** Rebuild the caller's demo world from its seed (re-run a walkthrough). */
    reset: z.literal(true).optional(),
  })
  .strict();

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (getServerEnv().REFI_ENV !== "demo") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const origin = req.headers.get("origin");
  if (!origin || origin === "null" || origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const auth = await getAuthContext(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const json: unknown = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success)
    return NextResponse.json(
      { error: "Body must be { fills?: 1..6, reset?: true }" },
      { status: 400 },
    );
  const result = parsed.data.reset
    ? { ...resetDemoWorld(auth.authId), filled: 0, events: 0 }
    : advanceDemoWorld(auth.authId, { fills: parsed.data.fills ?? 1 });
  return NextResponse.json(
    { data: result },
    { headers: { "cache-control": "private, no-store" } },
  );
}
