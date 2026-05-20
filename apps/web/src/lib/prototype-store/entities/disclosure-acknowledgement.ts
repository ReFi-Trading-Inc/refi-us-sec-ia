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
    ackedAt: new Date().toISOString(),
    acceptanceSource: args.acceptanceSource,
    ipHash: args.ipHash,
    userAgentHash: args.userAgentHash,
    meta: makePrototypeMeta(args.correlationId),
  };
  const created = await acks.putIfAbsent(key, ack);
  if (!created) {
    const existing = await acks.get(key);
    return { ack: existing!, created: false };
  }
  return { ack, created: true };
}
