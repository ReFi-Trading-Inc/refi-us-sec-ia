/**
 * AlphaApplication — on-domain waitlist entity, game-handoff binding half.
 *
 * Narrow manual port onto current main. The behavioral contract is commit
 * 6dbeb7c (feat(handoff): s3 alpha-claim route + jti consumed-set); this
 * file reproduces only the `/alpha-claim` binding surface and is adapted to
 * the current-main filesystem `kvStore`. The Phase 2.6 backing resolver
 * (`resolveKvStore`), the two-step signup funnel writers, and the durable
 * store are intentionally NOT ported.
 *
 * Storage is keyed by email when known (the canonical join key across game +
 * waitlist + product), or by `player:<alphaPlayerId>` for a game-first
 * entrant who has not yet supplied an email. Game fields are nullable at
 * intake and only populated by the claim route, so the binding is purely
 * additive over a future email-first row.
 */
import { kvStore } from "../store";

export interface AlphaApplication {
  email: string;
  capturedAt: string;
  updatedAt: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
    referrer?: string;
  };
  // Qualification (supplied later by the signup funnel; nullable here).
  primaryBroker?: string;
  isUsPerson?: boolean;
  portfolioBand?: string;
  automationExperience?: string;
  feedbackCommitment?: boolean;
  // Game handoff (§2.4) — nullable at intake; set by /alpha-claim.
  alphaPlayerId?: string;
  progressSnapshotId?: string;
  completedArenas?: string[];
  machineBuilderUnlocked?: boolean;
  machineVersionCount?: number;
  machineBeatRate?: number | null;
  campaignSource?: string;
  handoffClaimedAt?: string;
  // Waitlist rubric — recomputed on every write.
  score: number;
  scoreBreakdown: Record<string, number>;
}

const store = kvStore<AlphaApplication>("alpha-applications");

/**
 * Deterministic email → storage key. Lower-cased, trimmed, and any `+`
 * subaddress collapsed so that `a+alpha@x.com` and `a@x.com` dedupe. Not a
 * hash: the raw email is stored on the record and the store is server-only.
 */
export function emailKey(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return normalized;
  const base = local.split("+")[0] ?? local;
  return `${base}@${domain}`;
}

/**
 * Player-keyed storage key for game-first entrants without an email yet.
 * The claim route stashes game fields under `player:<alphaPlayerId>` so a
 * later email-keyed signup can merge on email without losing game context.
 */
export function playerKey(alphaPlayerId: string): string {
  return `player:${alphaPlayerId}`;
}

export function scoreApplication(app: AlphaApplication): {
  score: number;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {
    completedArenas: (app.completedArenas?.length ?? 0) * 10,
    machineBuilderUnlocked: app.machineBuilderUnlocked ? 25 : 0,
    alpacaPrimary:
      app.primaryBroker && app.primaryBroker.toLowerCase() === "alpaca"
        ? 15
        : 0,
    isUsPerson: app.isUsPerson === true ? 10 : 0,
    portfolioBand: app.portfolioBand ? 5 : 0,
    automationExperience: app.automationExperience ? 5 : 0,
    feedbackCommitment: app.feedbackCommitment === true ? 5 : 0,
    // Fair Match beat rate: tiebreaker only, never a suitability signal.
    // Scaled into 0..2 so it cannot outweigh any qualification signal.
    beatRateTiebreaker:
      app.machineBeatRate !== undefined && app.machineBeatRate !== null
        ? Math.min(2, Math.max(0, app.machineBeatRate * 2))
        : 0,
  };
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, breakdown };
}

export async function getApplication(
  email: string,
): Promise<AlphaApplication | null> {
  return store.get(emailKey(email));
}

export async function findByAlphaPlayerId(
  alphaPlayerId: string,
): Promise<AlphaApplication | null> {
  // Fast path: the direct player-keyed stub row.
  const byPlayer = await store.get(playerKey(alphaPlayerId));
  if (byPlayer) return byPlayer;
  // Slow path: an email-keyed row that has already been bound.
  const rows = await store.list();
  for (const { value } of rows) {
    if (value.alphaPlayerId === alphaPlayerId) return value;
  }
  return null;
}

/**
 * Bind the game handoff to an application. Idempotent by alphaPlayerId:
 *   - If a row for this player already exists, its identity and storage key
 *     are preserved (one player → one application, permanent). Game progress
 *     fields and `updatedAt` are refreshed; `handoffClaimedAt` is preserved
 *     from the first successful handoff. No second application is created.
 *   - If not, a `player:<id>` stub row is created that a later email-keyed
 *     signup can merge into.
 */
export async function bindHandoff(args: {
  alphaPlayerId: string;
  progressSnapshotId: string;
  completedArenas: string[];
  machineBuilderUnlocked: boolean;
  machineVersionCount: number;
  machineBeatRate: number | null;
  campaignSource?: string;
}): Promise<{ application: AlphaApplication; storageKey: string }> {
  const existing = await findByAlphaPlayerId(args.alphaPlayerId);
  const now = new Date().toISOString();
  if (existing) {
    const merged: AlphaApplication = {
      ...existing,
      alphaPlayerId: args.alphaPlayerId,
      progressSnapshotId: args.progressSnapshotId,
      completedArenas: args.completedArenas,
      machineBuilderUnlocked: args.machineBuilderUnlocked,
      machineVersionCount: args.machineVersionCount,
      machineBeatRate: args.machineBeatRate,
      ...(args.campaignSource !== undefined
        ? { campaignSource: args.campaignSource }
        : {}),
      // Preserve the first successful handoff timestamp across replays and
      // subsequent (new-jti) claims for the same player.
      handoffClaimedAt: existing.handoffClaimedAt ?? now,
      updatedAt: now,
    };
    const { score, breakdown } = scoreApplication(merged);
    merged.score = score;
    merged.scoreBreakdown = breakdown;
    const key = existing.email
      ? emailKey(existing.email)
      : playerKey(args.alphaPlayerId);
    await store.put(key, merged);
    return { application: merged, storageKey: key };
  }
  const stub: AlphaApplication = {
    // Placeholder email; replaced when the signup funnel supplies one. Kept
    // as empty-string rather than undefined so downstream shapes stay uniform.
    email: "",
    capturedAt: now,
    updatedAt: now,
    alphaPlayerId: args.alphaPlayerId,
    progressSnapshotId: args.progressSnapshotId,
    completedArenas: args.completedArenas,
    machineBuilderUnlocked: args.machineBuilderUnlocked,
    machineVersionCount: args.machineVersionCount,
    machineBeatRate: args.machineBeatRate,
    ...(args.campaignSource !== undefined
      ? { campaignSource: args.campaignSource }
      : {}),
    handoffClaimedAt: now,
    score: 0,
    scoreBreakdown: {},
  };
  const { score, breakdown } = scoreApplication(stub);
  stub.score = score;
  stub.scoreBreakdown = breakdown;
  const key = playerKey(args.alphaPlayerId);
  await store.put(key, stub);
  return { application: stub, storageKey: key };
}
