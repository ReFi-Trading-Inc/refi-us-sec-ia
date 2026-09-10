/**
 * ComplianceProfileAttestation submission — the frontend's own durable record
 * of WHERE a given decision is in the attestation chain (mandate: distinct
 * states; Daniel step 6).
 *
 * States are strictly ordered and every transition is recorded with its
 * time and correlation id, so evidence of the chain is reconstructible:
 *
 *   disclosure_delivered   the effective disclosure set was listed by the
 *                          backend and shown (delivery is a backend fact)
 *   consent_accepted       an ACTIVE ACCEPT consent receipt exists for every
 *                          effective disclosure (backend `listConsents`)
 *   attestation_constructed the closed request body was built from pinned
 *                          authority (`attestation-mapping.ts`)
 *   submitted              `createComplianceProfileAttestation` was CALLED
 *                          (recorded before the call, with the idempotency
 *                          key, so an in-flight call is never invisible)
 *   acknowledged           the backend answered 201 with the attestation
 *
 * Terminal side states: `blocked` (the chain cannot proceed; reasons named)
 * and `rejected` (the backend refused; contract code named). Neither is ever
 * relabelled as `acknowledged`. Only an `acknowledged` record is backend
 * evidence; every other state is the frontend's own bookkeeping.
 *
 * Keyed by (account, attestation_id) — the attestation id is deterministic
 * per decision, so a retry of the same decision continues the same record.
 */
import { resolveKvStore } from "../../store";
import { makePrototypeMeta, type PrototypeMeta } from "../store";

export const ATTESTATION_SUBMISSION_STATES = [
  "disclosure_delivered",
  "consent_accepted",
  "attestation_constructed",
  "submitted",
  "acknowledged",
  "blocked",
  "rejected",
] as const;
export type AttestationSubmissionState =
  (typeof ATTESTATION_SUBMISSION_STATES)[number];

/** Forward chain; `blocked`/`rejected` may follow any non-terminal state. */
const NEXT: Readonly<
  Record<AttestationSubmissionState, readonly AttestationSubmissionState[]>
> = {
  disclosure_delivered: ["consent_accepted", "blocked"],
  consent_accepted: ["attestation_constructed", "blocked"],
  attestation_constructed: ["submitted", "blocked"],
  submitted: ["acknowledged", "rejected"],
  acknowledged: [],
  blocked: [],
  rejected: [],
};

export interface AttestationSubmissionEvent {
  state: AttestationSubmissionState;
  at: string;
  correlationId: string;
  /** Machine detail for the transition (reason codes, ids); never PII. */
  detail?: Record<string, string | number | boolean | string[]>;
}

export interface AttestationSubmissionRecord {
  accountId: string;
  attestationId: string;
  state: AttestationSubmissionState;
  history: AttestationSubmissionEvent[];
  /** Set at `attestation_constructed`. */
  evidenceSha256?: string;
  decisionVersion?: string;
  decisionSequence?: number;
  /** Set at `submitted`. Deterministic; reused on a retry of the same decision. */
  idempotencyKey?: string;
  /** Set at `acknowledged` (backend authorization projection is NOT copied here). */
  backendAttestationId?: string;
  acknowledgedAt?: string;
  meta: PrototypeMeta;
}

export class AttestationTransitionError extends Error {
  constructor(
    readonly from: AttestationSubmissionState,
    readonly to: AttestationSubmissionState,
  ) {
    super(`attestation submission: illegal transition ${from} → ${to}`);
    this.name = "AttestationTransitionError";
  }
}

const store = () =>
  resolveKvStore<AttestationSubmissionRecord>(
    "attestation-submission",
    "attestation-submissions",
  );

function key(accountId: string, attestationId: string): string {
  return `${accountId}__${attestationId}`;
}

export async function getAttestationSubmission(
  accountId: string,
  attestationId: string,
): Promise<AttestationSubmissionRecord | null> {
  return store().get(key(accountId, attestationId));
}

export async function listAttestationSubmissions(
  accountId: string,
): Promise<AttestationSubmissionRecord[]> {
  const all = await store().list(`${accountId}__`);
  return all.map((e) => e.value);
}

/** Create (state `disclosure_delivered`) or return the existing record. */
export async function openAttestationSubmission(args: {
  accountId: string;
  attestationId: string;
  correlationId: string;
  detail?: AttestationSubmissionEvent["detail"];
}): Promise<AttestationSubmissionRecord> {
  const k = key(args.accountId, args.attestationId);
  const existing = await store().get(k);
  if (existing) return existing;
  const now = new Date().toISOString();
  const record: AttestationSubmissionRecord = {
    accountId: args.accountId,
    attestationId: args.attestationId,
    state: "disclosure_delivered",
    history: [
      {
        state: "disclosure_delivered",
        at: now,
        correlationId: args.correlationId,
        ...(args.detail ? { detail: args.detail } : {}),
      },
    ],
    meta: makePrototypeMeta(args.correlationId),
  };
  const created = await store().putIfAbsent(k, record);
  if (created) return record;
  const raced = await store().get(k);
  if (!raced) throw new Error("attestation submission create/read race");
  return raced;
}

/**
 * Advance one step. Illegal transitions throw; the record is never rewritten
 * backwards and a terminal state never changes.
 */
export async function advanceAttestationSubmission(args: {
  accountId: string;
  attestationId: string;
  to: AttestationSubmissionState;
  correlationId: string;
  detail?: AttestationSubmissionEvent["detail"];
  patch?: Partial<
    Pick<
      AttestationSubmissionRecord,
      | "evidenceSha256"
      | "decisionVersion"
      | "decisionSequence"
      | "idempotencyKey"
      | "backendAttestationId"
      | "acknowledgedAt"
    >
  >;
}): Promise<AttestationSubmissionRecord> {
  const k = key(args.accountId, args.attestationId);
  const current = await store().get(k);
  if (!current) throw new Error("attestation submission not open");
  if (!NEXT[current.state].includes(args.to)) {
    throw new AttestationTransitionError(current.state, args.to);
  }
  const next: AttestationSubmissionRecord = {
    ...current,
    ...args.patch,
    state: args.to,
    history: [
      ...current.history,
      {
        state: args.to,
        at: new Date().toISOString(),
        correlationId: args.correlationId,
        ...(args.detail ? { detail: args.detail } : {}),
      },
    ],
  };
  await store().put(k, next);
  return next;
}
