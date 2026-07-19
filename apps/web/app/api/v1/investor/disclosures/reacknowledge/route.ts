/**
 * POST /api/v1/investor/disclosures/reacknowledge
 *
 * Re-acknowledges a disclosure document whose version has been superseded
 * since the active ExecutionPolicy was signed. Distinct from the plain
 * `/disclosures/[id]/acknowledge` route in two ways:
 *
 *   1. The server verifies the document is actually pinned in the active
 *      policy at an older version, so a client cannot inflate the audit
 *      trail by re-acknowledging arbitrary documents.
 *   2. If ManagedExecutionState is `paused_by_system` with a stale-disclosure
 *      reason code, and this acknowledgement clears every outstanding stale
 *      disclosure, the state automatically transitions back to `active`
 *      under the SAME ExecutionPolicy version. The active policy is never
 *      mutated by this route — a new policy version requires re-activation.
 *
 * The receipt carries the previous + current versions and the affected
 * policy version so the SEC 203A-2(e) evidence trail remains complete.
 */
import { z } from "zod";
import { createHmac } from "node:crypto";
import { bffMutate } from "@lib/bff/handler";
import { getServerEnv } from "@lib/config/env";
import {
  appendDisclosureAck,
  getDisclosureAck,
  getDisclosureDocument,
  getLatestExecutionPolicy,
  getManagedExecutionState,
  listDisclosureDocuments,
  setManagedExecutionState,
} from "@lib/prototype-store";

const STALE_DISCLOSURE_REASON_PREFIX = "stale_disclosure";

const reackBody = z.object({
  docId: z.string().min(1),
  version: z.string().min(1),
});

type ReackBody = z.infer<typeof reackBody>;

function safeHash(input: string | null | undefined): string {
  const secret = getServerEnv().IP_HASH_SECRET;
  return createHmac("sha256", secret)
    .update(input ?? "")
    .digest("hex");
}

export const POST = bffMutate<ReackBody>({
  action: "acknowledgeDisclosure",
  source: "prototype-bff",
  upstreamGap: ["G-005", "G-006"],
  parse: (body) => reackBody.parse(body),
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

    const policy = await getLatestExecutionPolicy(accountId);
    if (!policy) {
      return {
        data: { ok: false, reason: "no_active_policy" },
        outcome: "blocked" as const,
        reasonCode: "no_active_policy",
        status: 412,
      };
    }

    const pinned = policy.disclosureVersions.find(
      (d) => d.docId === ctx.input.docId,
    );
    if (!pinned) {
      return {
        data: { ok: false, reason: "disclosure_not_in_active_policy" },
        outcome: "rejected" as const,
        reasonCode: "disclosure_not_in_active_policy",
        status: 409,
      };
    }
    if (pinned.version === ctx.input.version) {
      return {
        data: { ok: false, reason: "version_matches_active_policy" },
        outcome: "rejected" as const,
        reasonCode: "version_matches_active_policy",
        status: 409,
      };
    }

    const doc = await getDisclosureDocument(ctx.input.docId, ctx.input.version);
    if (!doc) {
      return {
        data: { ok: false, reason: "document_not_found" },
        outcome: "rejected" as const,
        reasonCode: "document_not_found",
        status: 404,
      };
    }
    if (doc.displayStatus !== "available") {
      return {
        data: { ok: false, reason: "document_not_available" },
        outcome: "blocked" as const,
        reasonCode: "document_not_available",
        status: 409,
      };
    }

    const mesBefore = await getManagedExecutionState(accountId);

    const ip = ctx.req.headers.get("x-real-ip") ?? "unknown";
    const ua = ctx.req.headers.get("user-agent") ?? "";
    const { ack, created } = await appendDisclosureAck({
      userId: ctx.auth.authId,
      docId: ctx.input.docId,
      version: ctx.input.version,
      acceptanceSource: "web",
      ipHash: safeHash(ip),
      userAgentHash: safeHash(ua),
      correlationId: ctx.correlationId,
    });

    // Recompute the stale set AFTER recording the ack. If MES is system-
    // paused for stale disclosures and no stale entries remain, restore
    // `active` under the SAME ExecutionPolicy version. The lifecycle
    // transition and active policy version are intentionally untouched —
    // a new disclosure version does not mint a new policy version.
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
    let anyStillStale = false;
    for (const p of policy.disclosureVersions) {
      const latest = latestByDocId.get(p.docId);
      if (!latest || latest.version === p.version) continue;
      const acked = await getDisclosureAck(
        ctx.auth.authId,
        p.docId,
        latest.version,
      );
      if (!acked) {
        anyStillStale = true;
        break;
      }
    }

    let mesAfter = mesBefore;
    let reasonCodeCleared: string | undefined;
    if (
      mesBefore &&
      mesBefore.status === "paused_by_system" &&
      mesBefore.reasonCode?.startsWith(STALE_DISCLOSURE_REASON_PREFIX) &&
      !anyStillStale
    ) {
      reasonCodeCleared = mesBefore.reasonCode;
      mesAfter = await setManagedExecutionState({
        accountId,
        executionPolicyVersion: mesBefore.executionPolicyVersion,
        status: "active",
        changedBy: "system",
        correlationId: ctx.correlationId,
      });
    }

    return {
      data: {
        ok: true,
        created,
        ack,
        previousVersion: pinned.version,
        currentVersion: ctx.input.version,
        activePolicyVersion: policy.policyVersion,
        managedExecutionStatusBefore: mesBefore?.status ?? null,
        managedExecutionStatusAfter: mesAfter?.status ?? null,
        reasonCodeCleared: reasonCodeCleared ?? null,
      },
      references: [
        `disclosure-ack:${ctx.input.docId}/${ctx.input.version}`,
        `execution-policy:${policy.policyId}/v${String(policy.policyVersion)}`,
        ...(reasonCodeCleared ? [`managed-execution-state:${accountId}`] : []),
      ],
    };
  },
});
