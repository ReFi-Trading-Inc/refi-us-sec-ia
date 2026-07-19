/**
 * POST /api/v1/investor/execution-policy/activate
 *
 * The Phase 2 Surface 3 activation endpoint. Takes the investor's saved
 * Execution Policy Draft, runs every fail-closed precondition, signs a new
 * immutable ExecutionPolicy version, flips the lifecycle to `active`, sets
 * ManagedExecutionState.status to `active`, and ensures subscription mode is
 * `managed`. The receipt records the full provenance set documented in
 * docs/sec203a-product-boundary.md.
 *
 * Boundary preserved (per memory/rule_no_per_trade_accept.md):
 *   - No broker order is submitted here.
 *   - No per-trade Accept is created.
 *   - No staff/founder review is involved.
 *   - Activation is the only path that promotes a draft to a signed version.
 */
import { z } from "zod";
import { createHash, createHmac } from "node:crypto";
import { bffMutate } from "@lib/bff/handler";
import { getServerEnv } from "@lib/config/env";
import {
  appendExecutionPolicy,
  getActivationByIdempotencyKey,
  getExecutionPolicy,
  getExecutionPolicyDraft,
  getLatestProfileSnapshot,
  getManagedExecutionState,
  getSubscriptionMode,
  setSubscriptionMode,
  getBrokerageConnection,
  isExecutionReady,
  recordActivationIdempotency,
  setManagedExecutionState,
  transitionLifecycle,
  getDisclosureDocument,
  getDisclosureAck,
} from "@lib/prototype-store";

const activateBody = z.object({
  acknowledgedDisclosures: z
    .array(z.object({ docId: z.string().min(1), version: z.string().min(1) }))
    .min(1),
  advisoryAgreementVersion: z.string().min(1),
  clientAttestation: z.literal(true),
  deviceFingerprint: z.string().min(1),
});

type ActivateBody = z.infer<typeof activateBody>;

function safeHash(input: string | null | undefined): string {
  const secret = getServerEnv().IP_HASH_SECRET;
  return createHmac("sha256", secret)
    .update(input ?? "")
    .digest("hex");
}

/**
 * Stable hash over the subset of draft fields that define each guardrail set.
 * Sorted JSON keeps the hash deterministic across server restarts.
 */
function stableHash(payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(payload, Object.keys(payload).sort()))
    .digest("hex");
}

/**
 * Derive a deterministic idempotency key when the client did not supply an
 * `Idempotency-Key` header. The key binds the activation attempt to: the
 * exact draft snapshot (via updatedAt), the exact disclosure ack set, the
 * advisory agreement version, and the account. Network replays, double
 * clicks, refreshes, and React Query retries all collapse to the same key
 * until any one of those inputs changes.
 *
 * Device fingerprint is intentionally NOT in the key — a browser refresh
 * may rotate the userAgent fingerprint slightly and we still want the
 * replay to deduplicate.
 */
function deriveIdempotencyKey(args: {
  accountId: string;
  draftUpdatedAt: string;
  acknowledgedDisclosures: Array<{ docId: string; version: string }>;
  advisoryAgreementVersion: string;
}): string {
  const acks = [...args.acknowledgedDisclosures]
    .map((d) => `${d.docId}@${d.version}`)
    .sort();
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "activateExecutionPolicy",
        accountId: args.accountId,
        draftUpdatedAt: args.draftUpdatedAt,
        acks,
        advisoryAgreementVersion: args.advisoryAgreementVersion,
      }),
    )
    .digest("hex");
}

interface ActivationBlock {
  reason:
    | "account_not_linked"
    | "draft_required"
    | "profile_required"
    | "broker_not_ready"
    | "disclosure_unavailable"
    | "disclosure_not_acked";
  detail?: unknown;
}

export const POST = bffMutate<ActivateBody>({
  action: "activateExecutionPolicy",
  source: "prototype-bff",
  upstreamGap: ["G-003", "G-005", "G-006", "G-007"],
  parse: (body) => activateBody.parse(body),
  apply: async (ctx) => {
    const accountId = ctx.auth.accountId;
    if (!accountId) {
      const block: ActivationBlock = { reason: "account_not_linked" };
      return {
        data: { ok: false, ...block },
        outcome: "blocked" as const,
        reasonCode: block.reason,
        status: 412,
      };
    }

    // Fail-closed preconditions.
    const [draft, profile, mode, broker] = await Promise.all([
      getExecutionPolicyDraft(accountId),
      getLatestProfileSnapshot(accountId),
      getSubscriptionMode(accountId),
      getBrokerageConnection(accountId),
    ]);

    if (!draft) {
      const block: ActivationBlock = { reason: "draft_required" };
      return {
        data: { ok: false, ...block },
        outcome: "blocked" as const,
        reasonCode: block.reason,
        status: 412,
      };
    }
    if (!profile) {
      const block: ActivationBlock = { reason: "profile_required" };
      return {
        data: { ok: false, ...block },
        outcome: "blocked" as const,
        reasonCode: block.reason,
        status: 412,
      };
    }
    if (!isExecutionReady(broker)) {
      const block: ActivationBlock = {
        reason: "broker_not_ready",
        detail: { status: broker?.status ?? "missing" },
      };
      return {
        data: { ok: false, ...block },
        outcome: "blocked" as const,
        reasonCode: block.reason,
        status: 412,
      };
    }

    for (const claim of ctx.input.acknowledgedDisclosures) {
      const doc = await getDisclosureDocument(claim.docId, claim.version);
      if (!doc || doc.displayStatus !== "available") {
        const block: ActivationBlock = {
          reason: "disclosure_unavailable",
          detail: claim,
        };
        return {
          data: { ok: false, ...block },
          outcome: "blocked" as const,
          reasonCode: block.reason,
          status: 412,
        };
      }
      const ack = await getDisclosureAck(
        ctx.auth.authId,
        claim.docId,
        claim.version,
      );
      if (!ack) {
        const block: ActivationBlock = {
          reason: "disclosure_not_acked",
          detail: claim,
        };
        return {
          data: { ok: false, ...block },
          outcome: "blocked" as const,
          reasonCode: block.reason,
          status: 412,
        };
      }
    }

    // Idempotency guard. Runs AFTER fail-closed preconditions so any
    // material change to broker, profile, or disclosure state still blocks.
    // If the same activation attempt (same draft snapshot + same ack set +
    // same agreement version) already produced a signed policy, return that
    // result without appending a new ExecutionPolicy version or duplicate
    // evidence. Header-supplied keys take precedence so clients can supply
    // their own dedup scope when needed.
    const explicitKey = ctx.req.headers.get("idempotency-key")?.trim();
    const idempotencyKey =
      explicitKey && explicitKey.length > 0
        ? `header:${explicitKey}:${accountId}`
        : `derived:${deriveIdempotencyKey({
            accountId,
            draftUpdatedAt: draft.updatedAt,
            acknowledgedDisclosures: ctx.input.acknowledgedDisclosures,
            advisoryAgreementVersion: ctx.input.advisoryAgreementVersion,
          })}`;

    const existing = await getActivationByIdempotencyKey(idempotencyKey);
    if (existing && existing.accountId === accountId) {
      const [existingPolicy, existingMes] = await Promise.all([
        getExecutionPolicy(accountId, existing.policyVersion),
        getManagedExecutionState(accountId),
      ]);
      return {
        data: {
          policy: existingPolicy,
          managedExecutionState: existingMes,
          subscriptionModeFlipped: false,
          idempotentReplay: true,
          idempotencyKey,
        },
        references: [
          `execution-policy:${existing.policyId}/v${String(existing.policyVersion)}`,
          `activation-idempotency:${idempotencyKey}`,
        ],
        reasonCode: "idempotent_replay",
        // Stable 200 on replay (the original 201 belongs to the first attempt).
        status: 200,
      };
    }

    // Derive evidence hashes server-side from the draft. The draft is the
    // single source of truth; the client cannot smuggle different policy
    // contents through the activation body.
    const riskGuardrailHash = stableHash({
      maxSingleOrderUsd: draft.maxSingleOrderUsd,
      maxPositionSizeBps: draft.maxPositionSizeBps,
      minimumCashReserveBps: draft.minimumCashReserveBps,
      dailyOrderLimit: draft.dailyOrderLimit,
      dailyLossPauseBps: draft.dailyLossPauseBps,
      drawdownPauseBps: draft.drawdownPauseBps,
      maxOpenOrders: draft.maxOpenOrders,
      staleBrokerDataPauseAfter: draft.staleBrokerDataPauseAfter,
      staleProfilePauseAfter: draft.staleProfilePauseAfter,
    });
    const restrictionsHash = stableHash({
      restrictedSectors: [...draft.restrictedSectors].sort(),
      pauseOnDisclosureSuperseded: draft.pauseOnDisclosureSuperseded,
      pauseOnProfileSuperseded: draft.pauseOnProfileSuperseded,
    });
    const pauseRules: string[] = [];
    if (draft.pauseOnDisclosureSuperseded)
      pauseRules.push("disclosure_superseded");
    if (draft.pauseOnProfileSuperseded) pauseRules.push("profile_superseded");
    pauseRules.push(`stale_broker_${draft.staleBrokerDataPauseAfter}`);
    pauseRules.push(`stale_profile_${draft.staleProfilePauseAfter}`);

    const ip = ctx.req.headers.get("x-real-ip") ?? "unknown";
    const policy = await appendExecutionPolicy({
      policy: {
        accountId,
        strategyId: draft.strategyId,
        accountScope: draft.accountScope,
        assetUniverse: draft.assetUniverse,
        riskGuardrailHash,
        restrictionsHash,
        pauseRules,
        notificationPreferences: [],
        advisoryProfileVersion: profile.profileVersion,
        disclosureVersions: ctx.input.acknowledgedDisclosures,
        advisoryAgreementVersion: ctx.input.advisoryAgreementVersion,
        signedAt: new Date().toISOString(),
        signedByAuthId: ctx.auth.authId,
        signedIpHash: safeHash(ip),
        signedDeviceFingerprintHash: safeHash(ctx.input.deviceFingerprint),
        correlationId: ctx.correlationId,
      },
    });

    const lifecycle = await transitionLifecycle({
      accountId,
      to: "active",
      reason: "execution_policy_activated",
      correlationId: ctx.correlationId,
    });

    const mes = await setManagedExecutionState({
      accountId,
      executionPolicyVersion: policy.policyVersion,
      status: "active",
      changedBy: "user",
      correlationId: ctx.correlationId,
    });

    // isExecutionReady(broker) was true above, so broker is non-null here.
    // Narrow explicitly so the BFF reference list doesn't need a non-null !.
    if (!broker) {
      throw new Error("broker missing after isExecutionReady check");
    }

    // Activating an Execution Policy implies Managed mode. We flip the
    // subscription_mode projection here so Signal users transitioning to
    // Managed do not need a separate explicit mode-change step. If the
    // account is already Managed this is a no-op rewrite.
    const modeChanged = mode?.mode !== "managed";
    if (modeChanged) {
      await setSubscriptionMode({
        accountId,
        mode: "managed",
        correlationId: ctx.correlationId,
      });
    }

    // Persist the idempotency record AFTER all state writes so a partial
    // failure leaves no claim that this key already activated.
    await recordActivationIdempotency({
      idempotencyKey,
      accountId,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      correlationId: ctx.correlationId,
    });

    return {
      data: {
        policy,
        lifecycle,
        managedExecutionState: mes,
        subscriptionModeFlipped: modeChanged,
        idempotentReplay: false,
        idempotencyKey,
      },
      references: [
        `execution-policy:${policy.policyId}/v${String(policy.policyVersion)}`,
        `advisory-profile:${accountId}/v${String(profile.profileVersion)}`,
        `broker-connection:${broker.connectionId}`,
        `lifecycle:${accountId}`,
        `managed-execution-state:${accountId}`,
        `subscription-mode:${accountId}`,
        `activation-idempotency:${idempotencyKey}`,
        ...ctx.input.acknowledgedDisclosures.map(
          (d) => `disclosure-ack:${d.docId}/${d.version}`,
        ),
      ],
      status: 201,
    };
  },
});
