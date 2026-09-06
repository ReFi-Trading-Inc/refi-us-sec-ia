/**
 * Setup-surface gate — pure, framework-free, unit-tested.
 *
 * Two DISTINCT backend words are read and never conflated:
 *   - `OnboardingStatus.state`       (application / Alpha onboarding);
 *   - `AccountAuthorization.status`  (account authorization).
 * Neither alone means "human Alpha admission" — the operator write that
 * records admission is outside the public Investor API. The dashboard
 * continuation is offered only when the backend says onboarding is READY AND
 * the account is AUTHORIZED AND the investor-owned setup steps are complete.
 * Anything else renders the exact backend state with pending/refusal copy.
 * No control here changes any of it.
 */
export type SetupStepKey = "identity" | "profile" | "broker";

export interface SetupGateInput {
  onboardingState: string | null;
  authorizationStatus: string | null;
  steps: Record<SetupStepKey, boolean>;
}

export type SetupGateReason =
  | "ready"
  | "steps_incomplete"
  | "onboarding_not_ready"
  | "authorization_pending"
  | "authorization_denied"
  | "authorization_suspended"
  | "authorization_unknown";

export interface SetupGate {
  /** The dashboard continuation may be offered. */
  dashboard: boolean;
  reason: SetupGateReason;
}

export const READY_ONBOARDING_STATE = "READY";
export const AUTHORIZED_STATUS = "AUTHORIZED";

export function setupGate(input: SetupGateInput): SetupGate {
  const stepsDone = Object.values(input.steps).every(Boolean);
  const authz = input.authorizationStatus;
  if (authz !== AUTHORIZED_STATUS) {
    const reason: SetupGateReason =
      authz === "PENDING"
        ? "authorization_pending"
        : authz === "DENIED"
          ? "authorization_denied"
          : authz === "SUSPENDED"
            ? "authorization_suspended"
            : "authorization_unknown";
    return { dashboard: false, reason };
  }
  if (input.onboardingState !== READY_ONBOARDING_STATE) {
    return { dashboard: false, reason: "onboarding_not_ready" };
  }
  if (!stepsDone) return { dashboard: false, reason: "steps_incomplete" };
  return { dashboard: true, reason: "ready" };
}
