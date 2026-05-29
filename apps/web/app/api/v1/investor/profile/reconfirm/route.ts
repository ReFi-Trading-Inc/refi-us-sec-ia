/**
 * POST /api/v1/investor/profile/reconfirm
 *
 * Records that the investor reviewed and re-confirmed their advisory profile
 * at a specific version. Idempotent per (accountId, profileVersion): a second
 * confirmation of the same version is a no-op write that returns the original
 * record with `created: false`.
 *
 * Re-confirmation is an eligibility event, not a recommendation acceptance.
 *
 * Boundary preserved:
 *   - No per-trade Accept is involved.
 *   - No broker order is submitted.
 *   - The active ExecutionPolicy version is NEVER mutated by this route.
 *     A material change in the profile fields requires Surface 3 activation
 *     to mint a new policy version; this route rejects with
 *     `material_change_requires_policy_review` so the UI can route the user
 *     to the activation flow rather than silently glossing over the change.
 *   - ManagedExecutionState is restored to `active` only when status is
 *     currently `paused_by_system`, reasonCode starts with `stale_profile`,
 *     AND there is no other outstanding system-pause blocker.
 */
import { z } from "zod";
import { bffMutate } from "@lib/bff/handler";
import {
  appendProfileConfirmation,
  getDisclosureAck,
  getLatestExecutionPolicy,
  getLatestProfileConfirmation,
  getLatestProfileSnapshot,
  getManagedExecutionState,
  listDisclosureDocuments,
  listProfileSnapshots,
  setManagedExecutionState,
} from "@lib/prototype-store";

const STALE_PROFILE_REASON_PREFIX = "stale_profile";

const reconfirmBody = z.object({
  profileVersion: z.number().int().min(1),
  acknowledgeUnchanged: z.literal(true),
});

type ReconfirmBody = z.infer<typeof reconfirmBody>;

export const POST = bffMutate<ReconfirmBody>({
  action: "refreshProfile",
  source: "prototype-bff",
  upstreamGap: ["G-003", "G-006"],
  parse: (body) => reconfirmBody.parse(body),
  apply: async (ctx) => {
    const accountId = ctx.auth.accountId;
    if (!accountId) {
      return {
        data: { ok: false, reason: "account_not_linked" },
        outcome: "blocked" as const,
        reasonCode: "account_not_linked",
        status: 412,
      };
    }

    const [policy, latestSnapshot, _allSnapshots, mesBefore, lastConfirmation] =
      await Promise.all([
        getLatestExecutionPolicy(accountId),
        getLatestProfileSnapshot(accountId),
        listProfileSnapshots(accountId),
        getManagedExecutionState(accountId),
        getLatestProfileConfirmation(accountId),
      ]);

    if (!latestSnapshot) {
      return {
        data: { ok: false, reason: "no_profile" },
        outcome: "blocked" as const,
        reasonCode: "no_profile",
        status: 412,
      };
    }
    if (!policy) {
      return {
        data: { ok: false, reason: "no_active_policy" },
        outcome: "blocked" as const,
        reasonCode: "no_active_policy",
        status: 412,
      };
    }
    if (!mesBefore) {
      return {
        data: { ok: false, reason: "managed_state_missing" },
        outcome: "blocked" as const,
        reasonCode: "managed_state_missing",
        status: 412,
      };
    }
    if (ctx.input.profileVersion !== latestSnapshot.profileVersion) {
      return {
        data: { ok: false, reason: "profile_version_mismatch" },
        outcome: "rejected" as const,
        reasonCode: "profile_version_mismatch",
        status: 409,
      };
    }

    const materialChange =
      latestSnapshot.profileVersion > policy.advisoryProfileVersion;
    if (materialChange) {
      return {
        data: {
          ok: false,
          reason: "material_change_requires_policy_review",
          activeExecutionPolicyVersion: policy.policyVersion,
          pinnedProfileVersion: policy.advisoryProfileVersion,
          latestProfileVersion: latestSnapshot.profileVersion,
        },
        outcome: "blocked" as const,
        reasonCode: "material_change_requires_policy_review",
        status: 409,
      };
    }

    // No material change is possible here (we checked above), so changedFields
    // is empty by construction for the durable confirmation row.
    const { confirmation, created } = await appendProfileConfirmation({
      accountId,
      authId: ctx.auth.authId,
      profileVersion: latestSnapshot.profileVersion,
      previousConfirmedVersion: lastConfirmation?.profileVersion ?? null,
      materialChange: false,
      changedFields: [],
      managedExecutionStatusBefore: mesBefore.status,
      managedExecutionStatusAfter: mesBefore.status,
      reasonCodeCleared: null,
      activeExecutionPolicyVersion: policy.policyVersion,
      correlationId: ctx.correlationId,
    });

    // Decide whether MES auto-restores. Strict conditions:
    //   1. mesBefore.status === "paused_by_system"
    //   2. reasonCode starts with "stale_profile"
    //   3. No other outstanding system-pause blocker (stale disclosure)
    let mesAfterStatus = mesBefore.status;
    let reasonCodeCleared: string | null = null;
    if (
      mesBefore.status === "paused_by_system" &&
      mesBefore.reasonCode?.startsWith(STALE_PROFILE_REASON_PREFIX)
    ) {
      // Check for outstanding stale-disclosure blocker. We replicate the
      // eligibility computation here rather than calling another route so
      // the BFF stays self-contained.
      const allDocs = await listDisclosureDocuments();
      const latestByDocId = new Map<string, (typeof allDocs)[number]>();
      for (const d of allDocs) {
        if (d.displayStatus !== "available") continue;
        const existing = latestByDocId.get(d.docId);
        if (!existing) {
          latestByDocId.set(d.docId, d);
          continue;
        }
        const a = existing.effectiveAt ?? "";
        const b = d.effectiveAt ?? "";
        if (b.localeCompare(a) > 0) latestByDocId.set(d.docId, d);
      }
      let staleDisclosureRemains = false;
      for (const pinned of policy.disclosureVersions) {
        const latest = latestByDocId.get(pinned.docId);
        if (!latest || latest.version === pinned.version) continue;
        const acked = await getDisclosureAck(
          ctx.auth.authId,
          pinned.docId,
          latest.version,
        );
        if (!acked) {
          staleDisclosureRemains = true;
          break;
        }
      }
      if (!staleDisclosureRemains) {
        reasonCodeCleared = mesBefore.reasonCode ?? null;
        const next = await setManagedExecutionState({
          accountId,
          executionPolicyVersion: mesBefore.executionPolicyVersion,
          status: "active",
          changedBy: "system",
          correlationId: ctx.correlationId,
        });
        mesAfterStatus = next.status;
      }
    }

    return {
      data: {
        ok: true,
        created,
        confirmation,
        previousConfirmedVersion: lastConfirmation?.profileVersion ?? null,
        confirmedVersion: latestSnapshot.profileVersion,
        activeExecutionPolicyVersion: policy.policyVersion,
        managedExecutionStatusBefore: mesBefore.status,
        managedExecutionStatusAfter: mesAfterStatus,
        reasonCodeCleared,
      },
      references: [
        `profile-snapshot:${accountId}/v${String(latestSnapshot.profileVersion)}`,
        `profile-confirmation:${accountId}/v${String(latestSnapshot.profileVersion)}`,
        `execution-policy:${policy.policyId}/v${String(policy.policyVersion)}`,
        ...(reasonCodeCleared ? [`managed-execution-state:${accountId}`] : []),
      ],
      ...(reasonCodeCleared ? { reasonCode: "stale_profile_cleared" } : {}),
    };
  },
});
