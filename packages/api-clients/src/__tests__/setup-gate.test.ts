/**
 * Setup gate — general account access and economic actions are SEPARATE.
 *
 * The previous version of this file pinned the old model, including a case
 * named "there is no input that grants the dashboard without AUTHORIZED".
 * That expectation contradicted the confirmed lifecycle:
 *
 *   ADMISSION → GENERAL ACCOUNT ACCESS → BROKERAGE (may be later)
 *             → SYNC → ACCOUNT AUTHORIZATION → ECONOMIC ACTIONS
 *
 * `AccountAuthorization` sits AFTER brokerage, so an admitted investor who has
 * not connected one legitimately reports `DENIED` /
 * `BROKER_CONNECTION_MISSING`. Requiring `AUTHORIZED` for the dashboard
 * stranded that investor permanently. Under the source-of-truth hierarchy a
 * test contradicting approved architecture is a stale test, not truth — so it
 * is replaced here rather than preserved.
 */
import { describe, expect, test } from "vitest";
import {
  setupGate,
  type SetupGateInput,
} from "../../../../apps/web/app/us/onboarding/_lib/setup-gate";

const ALL_STEPS = { identity: true, profile: true, broker: true };
const NO_BROKER = { identity: true, profile: true, broker: false };

function gate(over: Partial<SetupGateInput> = {}) {
  return setupGate({
    onboardingState: "READY",
    authorizationStatus: "AUTHORIZED",
    steps: ALL_STEPS,
    ...over,
  });
}

describe("general account access", () => {
  test("READY + identity + profile → access, with no brokerage at all", () => {
    // The regression this whole change exists to prevent.
    const g = gate({ steps: NO_BROKER, authorizationStatus: "DENIED" });
    expect(g.accountAccess).toBe(true);
    expect(g.accountAccessReason).toBe("ready");
  });

  test.each(["PENDING", "DENIED", "SUSPENDED", "UNKNOWN", null])(
    "account access does not depend on authorization (%s)",
    (status) => {
      expect(
        gate({ authorizationStatus: status, steps: NO_BROKER }).accountAccess,
      ).toBe(true);
    },
  );

  test("onboarding not READY → no access", () => {
    for (const state of ["PENDING", "IN_REVIEW", "BLOCKED", null]) {
      const g = gate({ onboardingState: state });
      expect(g.accountAccess).toBe(false);
      expect(g.accountAccessReason).toBe("onboarding_not_ready");
    }
  });

  test("identity or profile incomplete → no access", () => {
    for (const steps of [
      { identity: false, profile: true, broker: true },
      { identity: true, profile: false, broker: true },
    ]) {
      const g = gate({ steps });
      expect(g.accountAccess).toBe(false);
      expect(g.accountAccessReason).toBe("identity_or_profile_incomplete");
    }
  });

  test("access is never granted by step completion alone", () => {
    // Steps are investor-owned and not an admission signal. Without the
    // backend saying READY, completing every step grants nothing.
    expect(
      gate({ onboardingState: null, steps: ALL_STEPS }).accountAccess,
    ).toBe(false);
  });
});

describe("economic actions", () => {
  test("READY + all steps + AUTHORIZED → permitted", () => {
    const g = gate();
    expect(g.economicActions).toBe(true);
    expect(g.economicActionsReason).toBe("ready");
  });

  test.each([
    ["PENDING", "authorization_pending"],
    ["DENIED", "authorization_denied"],
    ["SUSPENDED", "authorization_suspended"],
    ["WEIRD", "authorization_unknown"],
    [null, "authorization_unknown"],
  ])("authorization %s → denied (%s)", (status, reason) => {
    const g = gate({ authorizationStatus: status });
    expect(g.economicActions).toBe(false);
    expect(g.economicActionsReason).toBe(reason);
  });

  test("no input permits economic actions without AUTHORIZED", () => {
    // The invariant the old AUTHORIZED test was reaching for — kept, but
    // attached to economic permission rather than to reading a dashboard.
    for (const state of ["READY", "PENDING", null]) {
      for (const steps of [ALL_STEPS, NO_BROKER]) {
        for (const status of ["PENDING", "DENIED", "SUSPENDED", null]) {
          expect(
            gate({ onboardingState: state, steps, authorizationStatus: status })
              .economicActions,
          ).toBe(false);
        }
      }
    }
  });

  test("economic actions are strictly narrower than account access", () => {
    // There is no combination that permits an economic action while refusing
    // account access.
    for (const state of ["READY", "PENDING", null]) {
      for (const steps of [ALL_STEPS, NO_BROKER]) {
        for (const status of ["AUTHORIZED", "DENIED", null]) {
          const g = gate({
            onboardingState: state,
            steps,
            authorizationStatus: status,
          });
          if (g.economicActions) expect(g.accountAccess).toBe(true);
        }
      }
    }
  });

  test("access without authorization is the expected deferred-brokerage state", () => {
    const g = gate({ steps: NO_BROKER, authorizationStatus: "DENIED" });
    expect(g.accountAccess).toBe(true);
    expect(g.economicActions).toBe(false);
    expect(g.economicActionsReason).toBe("authorization_denied");
  });
});
