/**
 * PostHog server-side capture (Sprint 6 F-track).
 *
 * Zero-dep helper — POSTs to PostHog's public capture endpoint via
 * fetch. Avoids adding `posthog-node` for the small set of server
 * events we emit (handoff claim, alpha-application step transitions,
 * activation). posthog-js on the browser handles client-side capture.
 *
 * Identity stitching (ReFi Alpha spec §7):
 *   - Game boots with anonymous distinct_id = Supabase anonymous uid
 *   - identify() fires at magic-link save
 *   - Investor shell aliases the same person on handoff claim via
 *     alphaPlayerId, so one PostHog funnel spans acquisition → game →
 *     application → activation
 *
 * The alias event is a first-class PostHog event of type "$create_alias".
 * All other events use the standard capture shape.
 *
 * Failure is silent: PostHog outage must never break a BFF response.
 * The fetch is fire-and-forget with a short timeout; misses become
 * missing data points in the funnel, not user-visible errors.
 */

const POSTHOG_HOST = "https://us.i.posthog.com";
const CAPTURE_TIMEOUT_MS = 2000;

interface CaptureArgs {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

interface AliasArgs {
  /** The identifier already known to PostHog (game's anon uid). */
  previousId: string;
  /** The identifier we want to unify onto (investor-shell authId or email). */
  distinctId: string;
}

function apiKey(): string | null {
  const key = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
  if (!key || key === "phc_prototype_disabled") return null;
  return key;
}

function host(): string {
  return process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? POSTHOG_HOST;
}

/**
 * Emit an event server-side. Never throws. Returns true if the request
 * was dispatched (not necessarily accepted upstream); false if PostHog
 * is disabled by config.
 */
export async function captureServerEvent(args: CaptureArgs): Promise<boolean> {
  const key = apiKey();
  if (!key) return false;
  try {
    await fetch(`${host()}/capture/`, {
      method: "POST",
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: args.event,
        distinct_id: args.distinctId,
        timestamp: args.timestamp ?? new Date().toISOString(),
        properties: {
          $lib: "refi-us-sec-ia-bff",
          ...args.properties,
        },
      }),
    });
    return true;
  } catch {
    // Fire-and-forget — a PostHog blip must not surface as a 500.
    return false;
  }
}

/**
 * Emit a `$create_alias` event so PostHog treats `previousId` and
 * `distinctId` as the same person. Used on `/alpha-claim` to stitch
 * the game's anonymous uid to the investor-shell auth identity.
 */
export async function aliasServer(args: AliasArgs): Promise<boolean> {
  return captureServerEvent({
    distinctId: args.distinctId,
    event: "$create_alias",
    properties: {
      alias: args.previousId,
    },
  });
}

/**
 * Build the PostHog properties payload for the onboarding funnel
 * event set (§7 / §63). Kept as a helper so route call sites do not
 * hand-assemble the shape and the contract assertion in
 * scripts/contract-assertions.ts can pin it.
 */
export function handoffClaimedProperties(args: {
  alphaPlayerId: string;
  progressSnapshotId?: string;
  completedArenas?: string[];
  machineBuilderUnlocked?: boolean;
  machineVersionCount?: number;
  machineBeatRate?: number | null;
  campaignSource?: string;
}): Record<string, unknown> {
  const props: Record<string, unknown> = {
    alpha_player_id: args.alphaPlayerId,
  };
  if (args.progressSnapshotId)
    props["progress_snapshot_id"] = args.progressSnapshotId;
  if (args.completedArenas) props["completed_arenas"] = args.completedArenas;
  if (args.machineBuilderUnlocked !== undefined)
    props["machine_builder_unlocked"] = args.machineBuilderUnlocked;
  if (args.machineVersionCount !== undefined)
    props["machine_version_count"] = args.machineVersionCount;
  if (args.machineBeatRate !== undefined && args.machineBeatRate !== null)
    props["machine_beat_rate"] = args.machineBeatRate;
  if (args.campaignSource) props["campaign_source"] = args.campaignSource;
  // Explicit exclusions per §6.6: no behavioral dimensions of any
  // kind. This is a shape assertion, not a runtime check — the strict
  // Zod schema on the handoff token already rejects them at ingress.
  return props;
}
