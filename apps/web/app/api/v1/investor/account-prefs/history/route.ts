/**
 * GET /api/v1/investor/account-prefs/history
 *
 * AccountPrefs edit history for the caller's account. Emits a
 * RecordAccessLog entry on every read (S4c completeness).
 *
 * Dark behind FLAG_ACCOUNT_CONTROLS_CENTER.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bffReadWithAccessLog } from "@lib/bff/handler";
import { correlationIdFrom } from "@lib/bff/correlation";
import { getAuthContext } from "@lib/bff/auth";
import { isEnabled } from "@lib/feature-flags";
import { listPrefsHistory } from "@lib/prototype-store/entities/account-prefs-history";

const wrapped = bffReadWithAccessLog({
  action: "viewRecord",
  source: "prototype-bff",
  recordRef: (ctx) => `account-prefs-history:${ctx.auth.accountId ?? "none"}`,
  fetch: async (ctx) => {
    if (!ctx.auth.accountId) return { entries: [] };
    return { entries: await listPrefsHistory(ctx.auth.accountId) };
  },
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  if (!isEnabled("FLAG_ACCOUNT_CONTROLS_CENTER")) {
    return NextResponse.json(
      { error: { code: "flag_off" }, correlationId },
      { status: 404 },
    );
  }
  const auth = await getAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { data: { entries: [] }, source: "prototype-bff", correlationId },
      { status: 200 },
    );
  }
  return wrapped(req);
}
