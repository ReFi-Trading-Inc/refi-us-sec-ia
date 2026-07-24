/**
 * AlphaApplication — F-track on-domain waitlist entity (Sprint 2).
 *
 * Contract sources:
 *   - Sprint Plan v3 §Sprint 2 F-track (on-domain two-step signup)
 *   - ReFi Alpha USA Build & Integration Spec §2.4 (nullable game fields
 *     so Sprint 3's `/alpha-claim` route is purely additive)
 *
 * Storage is keyed by email (the canonical join key across game +
 * waitlist + product per spec §2.7). Two-step semantics live in the
 * shape: step 1 sets `email` + `capturedAt` + attribution; step 2
 * fills the qualification set. `handoffClaimedAt` and the game fields
 * are nullable and only populated by the Sprint 3 claim route.
 *
 * Scoring is computed on write per Sprint Plan v3 Sprint 3 rubric:
 * arena completion (top-weighted), machineBuilderUnlocked (second),
 * primary broker Alpaca, US person, portfolio band, automation
 * experience, feedback commitment; Fair Match beat rate is a
 * tiebreaker only and never a suitability signal.
 */
import { resolveKvStore } from "../../store";

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
  // Qualification (step 2)
  primaryBroker?: string;
  isUsPerson?: boolean;
  portfolioBand?: string;
  automationExperience?: string;
  feedbackCommitment?: boolean;
  // Game handoff (§2.4) — nullable at intake; set by /alpha-claim
  alphaPlayerId?: string;
  progressSnapshotId?: string;
  completedArenas?: string[];
  machineBuilderUnlocked?: boolean;
  machineVersionCount?: number;
  machineBeatRate?: number | null;
  campaignSource?: string;
  handoffClaimedAt?: string;
  // Waitlist rubric — recomputed on every write
  score: number;
  scoreBreakdown: Record<string, number>;
}

const store = resolveKvStore<AlphaApplication>(
  "alpha-application",
  "alpha-applications",
);

/**
 * Deterministic email → storage key. Lower-cased, trimmed, and any `+`
 * subaddress collapsed so that `a+alpha@x.com` and `a@x.com` dedupe.
 * Not a hash: the raw email is stored on the record, and the store is
 * server-only. The key is only used to prevent accidental duplicates
 * from case or subaddress differences.
 */
export function emailKey(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return normalized;
  const base = local.split("+")[0] ?? local;
  return `${base}@${domain}`;
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

export async function upsertStep1(args: {
  email: string;
  utm?: AlphaApplication["utm"];
}): Promise<AlphaApplication> {
  const key = emailKey(args.email);
  const existing = await store.get(key);
  const now = new Date().toISOString();
  const merged: AlphaApplication = existing
    ? {
        ...existing,
        email: existing.email,
        updatedAt: now,
        ...(args.utm ? { utm: { ...existing.utm, ...args.utm } } : {}),
        score: existing.score,
        scoreBreakdown: existing.scoreBreakdown,
      }
    : {
        email: args.email.trim().toLowerCase(),
        capturedAt: now,
        updatedAt: now,
        ...(args.utm ? { utm: args.utm } : {}),
        score: 0,
        scoreBreakdown: {},
      };
  const { score, breakdown } = scoreApplication(merged);
  merged.score = score;
  merged.scoreBreakdown = breakdown;
  await store.put(key, merged);
  return merged;
}

export async function upsertStep2(args: {
  email: string;
  primaryBroker?: string;
  isUsPerson?: boolean;
  portfolioBand?: string;
  automationExperience?: string;
  feedbackCommitment?: boolean;
}): Promise<AlphaApplication | null> {
  const key = emailKey(args.email);
  const existing = await store.get(key);
  if (!existing) return null;
  const now = new Date().toISOString();
  const merged: AlphaApplication = {
    ...existing,
    updatedAt: now,
    ...(args.primaryBroker !== undefined
      ? { primaryBroker: args.primaryBroker }
      : {}),
    ...(args.isUsPerson !== undefined ? { isUsPerson: args.isUsPerson } : {}),
    ...(args.portfolioBand !== undefined
      ? { portfolioBand: args.portfolioBand }
      : {}),
    ...(args.automationExperience !== undefined
      ? { automationExperience: args.automationExperience }
      : {}),
    ...(args.feedbackCommitment !== undefined
      ? { feedbackCommitment: args.feedbackCommitment }
      : {}),
  };
  const { score, breakdown } = scoreApplication(merged);
  merged.score = score;
  merged.scoreBreakdown = breakdown;
  await store.put(key, merged);
  return merged;
}

export async function listApplications(): Promise<AlphaApplication[]> {
  const rows = await store.list();
  return rows.map((r) => r.value);
}

/**
 * Player-keyed storage key for game-first entrants who have not yet
 * supplied an email. When the claim route arrives with a valid handoff
 * token before step 1 of the funnel has been completed, we stash the
 * game fields under `player:<alphaPlayerId>` so step 2 can merge on
 * email later without losing the game context (§2.7 merge semantics).
 */
export function playerKey(alphaPlayerId: string): string {
  return `player:${alphaPlayerId}`;
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
 * Bind the game handoff to an application. Idempotent by design:
 *   - If an existing row already carries `alphaPlayerId`, its identity
 *     is preserved (one-to-one, permanent per §2.7).
 *   - If not, we create a `player:<id>` stub row that later step-2
 *     qualification can be merged into via email at the application
 *     layer.
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
    // Refresh game fields but do not change the row's storage key nor
    // any qualification data; the token is authoritative only for the
    // fields it carries.
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
    // Placeholder email; will be replaced when step 1/2 supplies one.
    // Kept empty-string rather than undefined so downstream Zod
    // shapes stay uniform.
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
