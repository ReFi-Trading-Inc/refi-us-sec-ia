/**
 * Setup-surface gate — pure, framework-free, unit-tested.
 *
 * This gate expresses TWO distinct decisions that the previous model conflated
 * into one. The confirmed lifecycle is:
 *
 *   ADMISSION → GENERAL REFI ACCOUNT ACCESS → BROKERAGE (may be later)
 *             → BROKER SYNC → ACCOUNT AUTHORIZATION → ECONOMIC ACTIONS
 *
 * `AccountAuthorization` therefore sits AFTER brokerage, and an admitted
 * investor who has not yet connected a brokerage legitimately reports
 * `DENIED` with `BROKER_CONNECTION_MISSING`. The previous gate required
 * `AUTHORIZED` (and a connected broker) before offering general account
 * access, which inverted the lifecycle and stranded exactly that investor:
 * they could never reach the dashboard, even though the architecture grants
 * them general account and history access at that point.
 *
 * So:
 *
 *   accountAccess    general ReFi account access — dashboard, history.
 *                    Does NOT require brokerage, and does NOT require
 *                    AccountAuthorization.
 *   economicActions  join a strategy, change allocation. DOES require
 *                    `AUTHORIZED`, which the backend grants only once the
 *                    brokerage account is connected and synced.
 *
 * Three backend words are read and never conflated:
 *   - `OnboardingStatus.state`       application / Alpha onboarding;
 *   - `AccountAuthorization.status`  account authorization;
 *   - human Alpha admission          canonical, backend-owned.
 *
 * No control here changes any of them.
 *
 * KNOWN GAP — `BLOCKED — DANIEL CONTRACT DECISION REQUIRED` (Lane C).
 * The correct authority for `accountAccess` is the canonical backend admission
 * projection, which the issued contract does not yet expose. Until it does,
 * this gate uses `OnboardingStatus.state === READY` as the nearest available
 * backend-stated signal. That is a PROXY, deliberately not a redefinition:
 * this module does not decide admission, does not infer it from step
 * completion, and must be re-pointed at the admission projection the moment
 * Daniel issues it. It is never widened beyond what the backend already says.
 */
export type SetupStepKey = "identity" | "profile" | "broker";

export interface SetupGateInput {
  onboardingState: string | null;
  authorizationStatus: string | null;
  steps: Record<SetupStepKey, boolean>;
}

/** Why general account access is or is not offered. */
export type AccountAccessReason =
  "ready" | "identity_or_profile_incomplete" | "onboarding_not_ready";

/** Why economic actions are or are not permitted. */
export type EconomicActionsReason =
  | "ready"
  | "no_account_access"
  | "authorization_pending"
  | "authorization_denied"
  | "authorization_suspended"
  | "authorization_unknown";

export interface SetupGate {
  /** General ReFi account access — dashboard and history. */
  accountAccess: boolean;
  accountAccessReason: AccountAccessReason;
  /** Economic actions — strategy subscription, allocation changes. */
  economicActions: boolean;
  economicActionsReason: EconomicActionsReason;
}

export const READY_ONBOARDING_STATE = "READY";
export const AUTHORIZED_STATUS = "AUTHORIZED";

function authorizationReason(status: string | null): EconomicActionsReason {
  switch (status) {
    case "PENDING":
      return "authorization_pending";
    case "DENIED":
      return "authorization_denied";
    case "SUSPENDED":
      return "authorization_suspended";
    default:
      return "authorization_unknown";
  }
}

export function setupGate(input: SetupGateInput): SetupGate {
  // ── General account access ────────────────────────────────────────────────
  // Brokerage is deliberately excluded: it may be connected later, and
  // requiring it here is what stranded the deferring investor.
  const identityAndProfileDone = input.steps.identity && input.steps.profile;

  let accountAccessReason: AccountAccessReason;
  if (input.onboardingState !== READY_ONBOARDING_STATE) {
    accountAccessReason = "onboarding_not_ready";
  } else if (!identityAndProfileDone) {
    accountAccessReason = "identity_or_profile_incomplete";
  } else {
    accountAccessReason = "ready";
  }
  const accountAccess = accountAccessReason === "ready";

  // ── Economic actions ──────────────────────────────────────────────────────
  // Strictly narrower than account access: everything above, PLUS an
  // authorization the backend only grants after brokerage connect + sync.
  let economicActionsReason: EconomicActionsReason;
  if (!accountAccess) {
    economicActionsReason = "no_account_access";
  } else if (input.authorizationStatus !== AUTHORIZED_STATUS) {
    economicActionsReason = authorizationReason(input.authorizationStatus);
  } else {
    economicActionsReason = "ready";
  }
  const economicActions = economicActionsReason === "ready";

  return {
    accountAccess,
    accountAccessReason,
    economicActions,
    economicActionsReason,
  };
}
