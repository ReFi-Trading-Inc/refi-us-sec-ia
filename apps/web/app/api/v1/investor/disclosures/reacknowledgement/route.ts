/**
 * GET /api/v1/investor/disclosures/reacknowledgement
 *
 * Computes the investor's disclosure re-acknowledgement eligibility view by
 * comparing the disclosure versions pinned in the active ExecutionPolicy
 * against the latest `available` versions in the registry.
 *
 * This route never mutates state. It is read-only and emits no receipt.
 *
 * Re-acknowledgement is a separate concept from activation: the active
 * ExecutionPolicy version is preserved when only disclosure versions change.
 * A document version change alone does not imply a new policy version, and
 * never implies any per-trade acceptance.
 */
import { bffRead } from "@lib/bff/handler";
import {
  getDisclosureAck,
  getLatestExecutionPolicy,
  listDisclosureDocuments,
} from "@lib/prototype-store";

export interface StaleDisclosure {
  docId: string;
  previousVersion: string;
  currentVersion: string;
  kind: string;
  effectiveAt: string | null;
  alreadyAcknowledged: boolean;
}

export interface DisclosureReacknowledgementView {
  activePolicyVersion: number | null;
  requiresReacknowledgement: boolean;
  staleDisclosures: StaleDisclosure[];
}

export const GET = bffRead<DisclosureReacknowledgementView>({
  source: "prototype-bff",
  upstreamGap: ["G-005", "G-006"],
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth || !ctx.auth.accountId) {
      return {
        activePolicyVersion: null,
        requiresReacknowledgement: false,
        staleDisclosures: [],
      };
    }
    const policy = await getLatestExecutionPolicy(ctx.auth.accountId);
    if (!policy) {
      return {
        activePolicyVersion: null,
        requiresReacknowledgement: false,
        staleDisclosures: [],
      };
    }

    const allDocs = await listDisclosureDocuments();
    // Group available versions by docId, picking the newest by effectiveAt.
    const latestByDocId = new Map<string, (typeof allDocs)[number]>();
    for (const doc of allDocs) {
      if (doc.displayStatus !== "available") continue;
      const existing = latestByDocId.get(doc.docId);
      if (!existing) {
        latestByDocId.set(doc.docId, doc);
        continue;
      }
      const a = existing.effectiveAt ?? "";
      const b = doc.effectiveAt ?? "";
      if (b.localeCompare(a) > 0) latestByDocId.set(doc.docId, doc);
    }

    const stale: StaleDisclosure[] = [];
    for (const pinned of policy.disclosureVersions) {
      const latest = latestByDocId.get(pinned.docId);
      if (!latest) continue; // registry has no available version; ignore
      if (latest.version === pinned.version) continue;
      const userAck = await getDisclosureAck(
        ctx.auth.authId,
        pinned.docId,
        latest.version,
      );
      stale.push({
        docId: pinned.docId,
        previousVersion: pinned.version,
        currentVersion: latest.version,
        kind: latest.kind,
        effectiveAt: latest.effectiveAt,
        alreadyAcknowledged: !!userAck,
      });
    }

    // "Requires reack" only when at least one stale row is also unack'd by
    // the user. If every stale row is already acknowledged, the user has
    // done their part — the policy just hasn't been re-activated yet.
    const requiresReacknowledgement = stale.some((s) => !s.alreadyAcknowledged);

    return {
      activePolicyVersion: policy.policyVersion,
      requiresReacknowledgement,
      staleDisclosures: stale,
    };
  },
});
