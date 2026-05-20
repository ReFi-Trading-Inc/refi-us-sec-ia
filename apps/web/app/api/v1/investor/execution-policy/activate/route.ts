/**
 * POST /api/v1/investor/execution-policy/activate
 *
 * The legal/product fulcrum: the investor signs an execution policy version,
 * the lifecycle flips to `active`, and managed execution state flips to
 * `active`.
 *
 * Activation MUST fail closed unless every precondition is met. Per
 * docs/sec203a-product-boundary.md, the receipt records the full provenance
 * set (profile version, disclosure versions, advisory agreement version,
 * broker connection id, strategy id, guardrail/restrictions hashes, signed-at,
 * hashed IP + device fingerprint, correlation id).
 */
import { z } from "zod";
import { createHmac } from "node:crypto";
import { bffMutate } from "@lib/bff/handler";
import {
  appendExecutionPolicy,
  getLatestProfileSnapshot,
  getSubscriptionMode,
  getBrokerageConnection,
  isExecutionReady,
  setManagedExecutionState,
  transitionLifecycle,
  getDisclosureDocument,
  getDisclosureAck,
} from "@lib/prototype-store";
import {
  decimalStringRefiner,
  decimalStringMessage,
} from "@lib/sec203a/decimal";

const activateBody = z.object({
  strategyId: z.string().min(1),
  accountScope: z.string().min(1),
  assetUniverse: z.array(z.string().min(1)).min(1),
  driftThreshold: z
    .string()
    .refine(decimalStringRefiner, decimalStringMessage("driftThreshold"))
    .optional(),
  rebalanceFrequency: z.string().optional(),
  maxOrderSize: z
    .string()
    .refine(decimalStringRefiner, decimalStringMessage("maxOrderSize"))
    .optional(),
  maxTurnover: z
    .string()
    .refine(decimalStringRefiner, decimalStringMessage("maxTurnover"))
    .optional(),
  pauseRules: z.array(z.string()).default([]),
  notificationPreferences: z.array(z.string()).default([]),
  restrictionsHash: z.string().min(1),
  riskGuardrailHash: z.string().min(1),
  advisoryAgreementVersion: z.string().min(1),
  acknowledgedDisclosures: z
    .array(z.object({ docId: z.string().min(1), version: z.string().min(1) }))
    .min(1),
  clientAttestation: z.literal(true),
  deviceFingerprint: z.string().min(1),
});

type ActivateBody = z.infer<typeof activateBody>;

function safeHash(input: string | null | undefined): string {
  const secret = process.env["IP_HASH_SECRET"] ?? "dev-hash-secret";
  return createHmac("sha256", secret)
    .update(input ?? "")
    .digest("hex");
}

interface ActivationBlock {
  reason:
    | "account_not_linked"
    | "profile_required"
    | "mode_must_be_managed"
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

    // Fail-closed precondition checks.

    const [profile, mode, broker] = await Promise.all([
      getLatestProfileSnapshot(accountId),
      getSubscriptionMode(accountId),
      getBrokerageConnection(accountId),
    ]);

    if (!profile) {
      const block: ActivationBlock = { reason: "profile_required" };
      return {
        data: { ok: false, ...block },
        outcome: "blocked" as const,
        reasonCode: block.reason,
        status: 412,
      };
    }
    if (mode?.mode !== "managed") {
      const block: ActivationBlock = { reason: "mode_must_be_managed" };
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

    // Every claimed disclosure ack must (a) reference an available document
    // version and (b) have a real ack on record.
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

    // All preconditions green. Sign + commit + flip runtime state.

    const ip = ctx.req.headers.get("x-real-ip") ?? "unknown";
    const policy = await appendExecutionPolicy({
      policy: {
        accountId,
        strategyId: ctx.input.strategyId,
        accountScope: ctx.input.accountScope,
        assetUniverse: ctx.input.assetUniverse,
        ...(ctx.input.driftThreshold
          ? {
              driftThreshold: ctx.input.driftThreshold as unknown as string & {
                readonly __brand: "DecimalString";
              },
            }
          : {}),
        ...(ctx.input.rebalanceFrequency
          ? { rebalanceFrequency: ctx.input.rebalanceFrequency }
          : {}),
        ...(ctx.input.maxOrderSize
          ? {
              maxOrderSize: ctx.input.maxOrderSize as unknown as string & {
                readonly __brand: "DecimalString";
              },
            }
          : {}),
        ...(ctx.input.maxTurnover
          ? {
              maxTurnover: ctx.input.maxTurnover as unknown as string & {
                readonly __brand: "DecimalString";
              },
            }
          : {}),
        riskGuardrailHash: ctx.input.riskGuardrailHash,
        restrictionsHash: ctx.input.restrictionsHash,
        pauseRules: ctx.input.pauseRules,
        notificationPreferences: ctx.input.notificationPreferences,
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

    const [lifecycle, mes] = await Promise.all([
      transitionLifecycle({
        accountId,
        to: "active",
        reason: "execution_policy_activated",
        correlationId: ctx.correlationId,
      }),
      setManagedExecutionState({
        accountId,
        executionPolicyVersion: policy.policyVersion,
        status: "active",
        changedBy: "user",
        correlationId: ctx.correlationId,
      }),
    ]);

    return {
      data: { policy, lifecycle, managedExecutionState: mes },
      references: [
        `execution-policy:${policy.policyId}/v${policy.policyVersion}`,
        `advisory-profile:${accountId}/v${profile.profileVersion}`,
        `broker-connection:${broker!.connectionId}`,
        `lifecycle:${accountId}`,
        `managed-execution-state:${accountId}`,
        ...ctx.input.acknowledgedDisclosures.map(
          (d) => `disclosure-ack:${d.docId}/${d.version}`,
        ),
      ],
      status: 201,
    };
  },
});
