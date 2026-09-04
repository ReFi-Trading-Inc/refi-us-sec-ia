/**
 * MOCK KYC provider adapter — TEST / DEVELOPMENT ONLY.
 *
 * This is not identity verification. It verifies nothing, contacts no vendor,
 * collects no document and no PII, and produces no external evidence. It is a
 * deterministic state machine behind the provider-neutral interface so the
 * public onboarding flow can be built and tested before a vendor is selected.
 * Every session it creates is labelled `mock-kyc-adapter`, and its normalized
 * result carries `provider: "mock-kyc-adapter"`, so nothing it emits can be
 * mistaken for production KYC evidence.
 *
 * Determinism: the ONLY way a mock session changes state is an explicit,
 * server-side transition — `start()` (not_started | additional_info_required |
 * failed → in_progress) or `advance()` (a test control, exposed by a BFF route
 * that is enabled solely by REFI_KYC_MOCK_CONTROLS=1 and never in a production
 * tier). Nothing advances on a timer or on read, so an unattended mock session
 * stays `in_progress` forever: the mock can never self-approve anyone.
 */
import {
  kvStore,
  makePrototypeMeta,
  type PrototypeMeta,
} from "../prototype-store/store";
import {
  TERMINAL_KYC_STATES,
  type KycLifecycleState,
  type KycProviderAdapter,
  type KycStartResult,
  type KycSubject,
  type KycVerificationSession,
} from "./provider";

interface MockKycRecord extends KycVerificationSession {
  authId: string;
  meta: PrototypeMeta;
}

const sessions = kvStore<MockKycRecord>("kyc-mock-sessions");
const HISTORY_LIMIT = 32;

/** Transitions the mock control may perform, by current state. */
export const MOCK_ADVANCE_TRANSITIONS: Readonly<
  Record<KycLifecycleState, readonly KycLifecycleState[]>
> = {
  not_started: [],
  in_progress: ["additional_info_required", "under_review", "passed", "failed"],
  additional_info_required: [],
  under_review: ["passed", "failed"],
  passed: [],
  failed: [],
};

/** States from which `start()` (re)opens a journey. */
const STARTABLE: ReadonlySet<KycLifecycleState> = new Set([
  "not_started",
  "additional_info_required",
  "failed",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function fresh(authId: string): MockKycRecord {
  const at = nowIso();
  return {
    authId,
    referenceId: `mock-kyc-${crypto.randomUUID()}`,
    state: "not_started",
    startedAt: null,
    updatedAt: at,
    history: [{ state: "not_started", at }],
    meta: makePrototypeMeta("mock-kyc"),
  };
}

function withState(
  record: MockKycRecord,
  state: KycLifecycleState,
  correlationId: string,
): MockKycRecord {
  const at = nowIso();
  return {
    ...record,
    state,
    startedAt: record.startedAt ?? (state === "in_progress" ? at : null),
    updatedAt: at,
    history: [...record.history, { state, at }].slice(-HISTORY_LIMIT),
    meta: makePrototypeMeta(correlationId),
  };
}

function view(record: MockKycRecord): KycVerificationSession {
  const { authId: _authId, meta: _meta, ...session } = record;
  return session;
}

export class MockKycProvider implements KycProviderAdapter {
  readonly kind = "mock" as const;

  async getSession(subject: KycSubject): Promise<KycVerificationSession> {
    return view((await sessions.get(subject.authId)) ?? fresh(subject.authId));
  }

  async start(
    subject: KycSubject,
    correlationId = "mock-kyc",
  ): Promise<KycStartResult> {
    const current =
      (await sessions.get(subject.authId)) ?? fresh(subject.authId);
    if (TERMINAL_KYC_STATES.has(current.state) && current.state === "passed") {
      return {
        accepted: false,
        reason: "already_terminal",
        session: view(current),
      };
    }
    if (current.state === "in_progress" || current.state === "under_review") {
      // Idempotent resume: nothing to change.
      return { accepted: true, session: view(current), continuePath: null };
    }
    if (!STARTABLE.has(current.state)) {
      return {
        accepted: false,
        reason: "already_terminal",
        session: view(current),
      };
    }
    const next = withState(current, "in_progress", correlationId);
    await sessions.put(subject.authId, next);
    // The mock has no vendor hosted flow to send the user to; the journey
    // continues on the same page.
    return { accepted: true, session: view(next), continuePath: null };
  }

  /**
   * TEST CONTROL. Move the mock session along one allowed transition. Refuses
   * anything not in MOCK_ADVANCE_TRANSITIONS so tests cannot fabricate an
   * impossible history (e.g. not_started → passed).
   */
  async advance(
    subject: KycSubject,
    to: KycLifecycleState,
    correlationId = "mock-kyc-control",
  ): Promise<
    | { ok: true; session: KycVerificationSession }
    | { ok: false; reason: "invalid_transition"; from: KycLifecycleState }
  > {
    const current =
      (await sessions.get(subject.authId)) ?? fresh(subject.authId);
    if (!MOCK_ADVANCE_TRANSITIONS[current.state].includes(to)) {
      return { ok: false, reason: "invalid_transition", from: current.state };
    }
    const next = withState(current, to, correlationId);
    await sessions.put(subject.authId, next);
    return { ok: true, session: view(next) };
  }

  /** TEST CONTROL. Forget the mock session so a journey can be replayed from not_started. */
  async reset(subject: KycSubject): Promise<void> {
    await sessions.delete(subject.authId);
  }
}
