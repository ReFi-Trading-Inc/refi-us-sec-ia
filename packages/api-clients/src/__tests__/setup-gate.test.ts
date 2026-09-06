/**
 * The setup surface offers the dashboard only when the backend reports
 * OnboardingStatus READY AND AccountAuthorization AUTHORIZED AND the investor-
 * owned steps are complete. Neither backend word alone is "admission".
 */
import { describe, expect, test } from "vitest";
import { setupGate } from "../../../../apps/web/app/us/onboarding/_lib/setup-gate";

const ALL = { identity: true, profile: true, broker: true };

describe("setupGate", () => {
  test("READY + AUTHORIZED + all setup → dashboard", () => {
    expect(
      setupGate({
        onboardingState: "READY",
        authorizationStatus: "AUTHORIZED",
        steps: ALL,
      }),
    ).toEqual({ dashboard: true, reason: "ready" });
  });
  test.each([
    ["PENDING", "authorization_pending"],
    ["DENIED", "authorization_denied"],
    ["SUSPENDED", "authorization_suspended"],
  ])("READY + %s authorization → no dashboard (%s)", (status, reason) => {
    expect(
      setupGate({
        onboardingState: "READY",
        authorizationStatus: status,
        steps: ALL,
      }),
    ).toEqual({ dashboard: false, reason });
  });
  test.each([
    "WAITLISTED",
    "INELIGIBLE",
    "SUSPENDED",
    "INVITED",
    "PROFILE_REQUIRED",
  ])(
    "onboarding %s + AUTHORIZED → no dashboard (onboarding_not_ready)",
    (state) => {
      expect(
        setupGate({
          onboardingState: state,
          authorizationStatus: "AUTHORIZED",
          steps: ALL,
        }),
      ).toEqual({ dashboard: false, reason: "onboarding_not_ready" });
    },
  );
  test("READY + AUTHORIZED but a step incomplete → no dashboard", () => {
    expect(
      setupGate({
        onboardingState: "READY",
        authorizationStatus: "AUTHORIZED",
        steps: { ...ALL, broker: false },
      }),
    ).toEqual({ dashboard: false, reason: "steps_incomplete" });
  });
  test("no account (authorization null, e.g. WAITLISTED applicant) → no dashboard, unknown authorization", () => {
    expect(
      setupGate({
        onboardingState: "WAITLISTED",
        authorizationStatus: null,
        steps: { identity: false, profile: false, broker: false },
      }),
    ).toEqual({ dashboard: false, reason: "authorization_unknown" });
  });
  test("there is no input that grants the dashboard without AUTHORIZED", () => {
    for (const state of ["READY", "INVITED", "WAITLISTED"]) {
      for (const authz of [
        "PENDING",
        "DENIED",
        "SUSPENDED",
        null,
        "authorized",
      ]) {
        expect(
          setupGate({
            onboardingState: state,
            authorizationStatus: authz,
            steps: ALL,
          }).dashboard,
        ).toBe(false);
      }
    }
  });
});
