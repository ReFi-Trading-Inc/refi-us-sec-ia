"use client";

// Client-side acknowledgment state for disclosure documents.
//
// Acknowledgments are kept in localStorage under `refi_doc_acks_v1` until
// the Document Registry ships (MIG-P2.5-04 / `06-backend-contract-map.md` §6).
// Persistence is per-browser, which is appropriate while disclosures cannot
// actually be acknowledged (every doc is `version: null`). Cross-tab updates
// fire via a `storage` event listener.
//
// Acks are keyed by `${docId}@${version}` so an ack against version 1 does
// not survive into version 2. When `version: null` we fall back to the
// special token `__pending__` so dev/staging can simulate ack flow before
// real versions exist.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  disclosureDocuments,
  REQUIRED_FOR_ACTIVATION_IDS,
  type DisclosureDocumentId,
} from "../_content/disclosures";

const STORAGE_KEY = "refi_doc_acks_v1";
const PENDING_VERSION = "__pending__";

type AckState = Record<string, string>;

function readState(): AckState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as AckState;
    }
  } catch {
    /* malformed — treat as empty */
  }
  return {};
}

function writeState(next: AckState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // Same-tab updates need an explicit dispatch since `storage` only fires
  // cross-tab. useSyncExternalStore subscribes to both.
  window.dispatchEvent(new Event("refi:doc-acks-changed"));
}

function ackKey(docId: DisclosureDocumentId, version: string | null): string {
  return `${docId}@${version ?? PENDING_VERSION}`;
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  const onLocal = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener("refi:doc-acks-changed", onLocal);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("refi:doc-acks-changed", onLocal);
  };
}

let cachedSnapshot: AckState | null = null;
let cachedSnapshotJson = "";

function getSnapshot(): AckState {
  const next = readState();
  const json = JSON.stringify(next);
  if (json === cachedSnapshotJson && cachedSnapshot) return cachedSnapshot;
  cachedSnapshot = next;
  cachedSnapshotJson = json;
  return next;
}

function getServerSnapshot(): AckState {
  return {};
}

export type DocumentAckStatus = {
  acked: boolean;
  ackedAt: string | null;
  /** Whether the ack can be performed (doc published or dev override). */
  canAck: boolean;
};

export type UseDocumentAcksResult = {
  isHydrated: boolean;
  status: Record<DisclosureDocumentId, DocumentAckStatus>;
  /** Count of required-for-activation docs currently acknowledged. */
  requiredAckedCount: number;
  requiredTotal: number;
  allRequiredAcked: boolean;
  acknowledge: (docIds: DisclosureDocumentId[]) => void;
  reset: () => void;
};

export function useDocumentAcks(): UseDocumentAcksResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isHydrated = typeof window !== "undefined";

  const envIsProd =
    process.env["NEXT_PUBLIC_REFI_ENV"] === "prod" ||
    process.env["NEXT_PUBLIC_REFI_ENV"] === "production";

  const status = Object.fromEntries(
    disclosureDocuments.map((d) => {
      const key = ackKey(d.id, d.version);
      const ackedAt = state[key] ?? null;
      // In prod, an ack requires a published version. In dev/staging we
      // allow simulating the flow against the synthetic __pending__ key so
      // the dashboard / activation gate render real numbers.
      const canAck = d.version !== null || !envIsProd;
      return [d.id, { acked: Boolean(ackedAt), ackedAt, canAck }];
    }),
  ) as Record<DisclosureDocumentId, DocumentAckStatus>;

  const requiredAckedCount = REQUIRED_FOR_ACTIVATION_IDS.reduce(
    (sum, id) => sum + (status[id as DisclosureDocumentId]?.acked ? 1 : 0),
    0,
  );

  const acknowledge = useCallback(
    (docIds: DisclosureDocumentId[]) => {
      const now = new Date().toISOString();
      const current = readState();
      const next: AckState = { ...current };
      for (const id of docIds) {
        const doc = disclosureDocuments.find((d) => d.id === id);
        if (!doc) continue;
        // Honor the prod-only-version-ack rule.
        if (doc.version === null && envIsProd) continue;
        next[ackKey(id, doc.version)] = now;
      }
      writeState(next);
    },
    [envIsProd],
  );

  const reset = useCallback(() => writeState({}), []);

  // Light defense against legacy cached values: bump snapshot once on mount.
  useEffect(() => {
    if (typeof window !== "undefined") cachedSnapshotJson = "";
  }, []);

  return {
    isHydrated,
    status,
    requiredAckedCount,
    requiredTotal: REQUIRED_FOR_ACTIVATION_IDS.length,
    allRequiredAcked: requiredAckedCount === REQUIRED_FOR_ACTIVATION_IDS.length,
    acknowledge,
    reset,
  };
}
