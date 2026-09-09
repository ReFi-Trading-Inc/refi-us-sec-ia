/**
 * POST /api/demo/handoff — SIMULATED game handoff, demo tier only.
 *
 * The acquisition funnel is: play the ReFi Alpha game → the game mints an
 * ES256 AlphaHandoffToken → /us/alpha-claim consumes it → eligibility. The
 * deployed game cannot mint yet (LINK mode; see demo-tier.md §6), so the demo
 * tier mints an equivalent token itself, with a DEMO key pair, and sends the
 * presenter through the REAL claim page and claim route. Nothing in the claim
 * path is bypassed or special-cased: the token is verified exactly as a
 * game-minted one would be.
 *
 * Dark unless ALL of: REFI_ENV=demo, DEMO_HANDOFF_PRIVATE_KEY_JWK set, and
 * FLAG_ALPHA_CLAIM_ROUTE=on (otherwise the token could not be claimed). On
 * every other tier it answers 404. Same-origin browser POST; session
 * required (a presenter signs in as a persona first, exactly as the story
 * requires: game lineage never replaces sign-in).
 *
 * The token's `sub` is a fixed demo player id. Per demo-tier.md §5 it is
 * acquisition lineage only: it never becomes an investor identity, KYC
 * identity, admission, account ownership, or any authority.
 *
 * Imports are relative so the repo-root contract-assertion harness can load
 * this route directly.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { importJWK, SignJWT } from "jose";
import { getServerEnv } from "../../../../src/lib/config/env";
import { getAuthContext } from "../../../../src/lib/bff/auth";
import { requestOrigin } from "../../../../src/lib/bff/origin";

/** Fixed demo player subject — a label, never an identity. */
export const DEMO_GAME_PLAYER_ID = "demo-game-player-01";
/** Shorter than the claim route's 10-minute maximum. */
const TOKEN_TTL_SECONDS = 300;
export const DEMO_HANDOFF_CAMPAIGN_SOURCE = "demo-tier-simulated-handoff";

const bodySchema = z.object({}).strict();

export function isDemoHandoffEnabled(): boolean {
  const env = getServerEnv();
  return (
    env.REFI_ENV === "demo" &&
    env.DEMO_HANDOFF_PRIVATE_KEY_JWK !== undefined &&
    process.env["FLAG_ALPHA_CLAIM_ROUTE"] === "on"
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isDemoHandoffEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const origin = req.headers.get("origin");
  if (!origin || origin === "null" || origin !== requestOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const auth = await getAuthContext(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const json: unknown = await req.json().catch(() => ({}));
  if (!bodySchema.safeParse(json ?? {}).success) {
    return NextResponse.json({ error: "Body must be {}" }, { status: 400 });
  }

  const env = getServerEnv();
  let key: Awaited<ReturnType<typeof importJWK>>;
  try {
    const jwk = JSON.parse(env.DEMO_HANDOFF_PRIVATE_KEY_JWK ?? "") as Record<
      string,
      unknown
    >;
    key = await importJWK(jwk, "ES256");
  } catch {
    return NextResponse.json(
      { error: "Demo handoff key is not a valid private JWK" },
      { status: 500 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  // Every claim below is in the claim route's strict schema; nothing else.
  const token = await new SignJWT({
    progressSnapshotId: `demo-snapshot-${crypto.randomUUID()}`,
    completedArenas: [
      "arena-01-momentum",
      "arena-02-drawdown",
      "arena-03-regime",
    ],
    machineBuilderUnlocked: true,
    machineVersionCount: 3,
    machineBeatRate: 0.62,
    campaignSource: DEMO_HANDOFF_CAMPAIGN_SOURCE,
    intendedDestination: "ELIGIBILITY",
  })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(env.ALPHA_HANDOFF_ISSUER)
    .setAudience(env.ALPHA_HANDOFF_AUDIENCE)
    .setSubject(DEMO_GAME_PLAYER_ID)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(key);

  return NextResponse.json(
    {
      data: {
        simulated: true,
        // The same shape the game produces: the claim page reads `?token=`.
        claimPath: `/us/alpha-claim?token=${encodeURIComponent(token)}`,
        expiresInSeconds: TOKEN_TTL_SECONDS,
        // Explicit: a handoff is acquisition lineage, never authority.
        authorityAsserted: false,
      },
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
