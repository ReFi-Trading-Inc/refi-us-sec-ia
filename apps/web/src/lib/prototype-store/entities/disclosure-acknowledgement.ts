/**
 * DisclosureAcknowledgement (G-005).
 *
 * Idempotent append per (user_id, doc_id, version). Carries IP/UA hashes for
 * audit evidence. The document registry lives in disclosure-document.ts.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export interface DisclosureAcknowledgement {
  userId: string;
  docId: string;
  version: string;
  /**
   * The registry `contentHash` this acknowledgment was made against.
   *
   * Daniel 2026-08-17 §1/§4: the disclosure registry keys on document key,
   * version, AND content hash, and the `409 ACKNOWLEDGMENT_REQUIRED` payload
   * returns all three together. Recording only (docId, version) cannot prove
   * WHICH content the investor saw if a version is ever re-published, so the
   * hash is captured at acknowledgment time.
   *
   * Optional only because interim records predate the field; the backend
   * projection makes it mandatory.
   */
  contentHash?: string;
  ackedAt: string;
  acceptanceSource: "web" | "recovery";
  ipHash: string;
  userAgentHash: string;
  meta: PrototypeMeta;
}

const acks = kvStore<DisclosureAcknowledgement>("disclosure-acks");

function ackKey(userId: string, docId: string, version: string): string {
  return `${userId}__${docId}__${version}`;
}

export async function getDisclosureAck(
  userId: string,
  docId: string,
  version: string,
): Promise<DisclosureAcknowledgement | null> {
  return acks.get(ackKey(userId, docId, version));
}

export async function listDisclosureAcksForUser(
  userId: string,
): Promise<DisclosureAcknowledgement[]> {
  const all = await acks.list(`${userId}__`);
  return all.map((e) => e.value);
}

export async function appendDisclosureAck(args: {
  userId: string;
  docId: string;
  version: string;
  /** Registry content hash the investor actually acknowledged. */
  contentHash?: string;
  acceptanceSource: "web" | "recovery";
  ipHash: string;
  userAgentHash: string;
  correlationId: string;
}): Promise<{ ack: DisclosureAcknowledgement; created: boolean }> {
  const key = ackKey(args.userId, args.docId, args.version);
  const ack: DisclosureAcknowledgement = {
    userId: args.userId,
    docId: args.docId,
    version: args.version,
    ...(args.contentHash ? { contentHash: args.contentHash } : {}),
    ackedAt: new Date().toISOString(),
    acceptanceSource: args.acceptanceSource,
    ipHash: args.ipHash,
    userAgentHash: args.userAgentHash,
    meta: makePrototypeMeta(args.correlationId),
  };
  const created = await acks.putIfAbsent(key, ack);
  if (!created) {
    const existing = await acks.get(key);
    if (!existing) {
      throw new Error(`disclosure ack ${key} missing after putIfAbsent`);
    }
    return { ack: existing, created: false };
  }
  return { ack, created: true };
}
