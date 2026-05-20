/**
 * Disclosure document registry (G-005).
 *
 * Immutable per (doc_id, version). Acknowledgements live in a separate
 * entity (disclosure-acknowledgement.ts) so the document registry is
 * append-only-by-version and never mixed with per-user state.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export type DisclosureKind =
  | "crs"
  | "adv_2a"
  | "advisory_agreement"
  | "privacy_notice"
  | "algorithm_disclosure";

export type DisclosureStatus =
  | "pending_registration"
  | "available"
  | "superseded";

export interface DisclosureDocument {
  docId: string;
  version: string;
  kind: DisclosureKind;
  effectiveAt: string | null;
  contentHash: string | null;
  displayStatus: DisclosureStatus;
  supersedesVersion?: string;
  requiresReackReason?: string;
  meta: PrototypeMeta;
}

const docs = kvStore<DisclosureDocument>("disclosure-documents");

function docKey(docId: string, version: string): string {
  return `${docId}__${version}`;
}

export async function listDisclosureDocuments(): Promise<DisclosureDocument[]> {
  const all = await docs.list();
  return all.map((e) => e.value);
}

export async function getDisclosureDocument(
  docId: string,
  version: string,
): Promise<DisclosureDocument | null> {
  return docs.get(docKey(docId, version));
}

export async function upsertDisclosureDocument(
  doc: Omit<DisclosureDocument, "meta"> & { correlationId: string },
): Promise<DisclosureDocument> {
  const stored: DisclosureDocument = {
    ...doc,
    meta: makePrototypeMeta(doc.correlationId),
  };
  await docs.put(docKey(doc.docId, doc.version), stored);
  return stored;
}
