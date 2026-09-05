/**
 * Demo-tier personas — a CLOSED registry, server-only.
 *
 * The demo tier (REFI_ENV=demo) lets a presenter sign in as one of exactly
 * these personas. Persona ids are fixed constants: the browser chooses a
 * persona KEY from this enum and nothing else — no user id, no account id, no
 * email, no admission flag. Account scope is still resolved by the BFF against
 * backend/simulator authority (`resolveAccountScope`), and admission state is
 * still read from backend projections. A persona is a story label, not an
 * authority.
 *
 *  - applicant: the public applicant walking eligibility → onboarding → pending
 *    internal review. Signs in WITHOUT an eligibility decision so the public
 *    screening step is exercised for real.
 *  - admitted: a person whose human Alpha admission has ALREADY occurred in the
 *    backend of record (the demo backend/simulator projection asserts it; this
 *    registry does not). Signs in with an eligibility decision so the demo can
 *    start inside the product. Nothing here grants trading, broker, or
 *    subscription authority.
 */
export const DEMO_PERSONAS = ["applicant", "admitted"] as const;
export type DemoPersona = (typeof DEMO_PERSONAS)[number];

export function isDemoPersona(v: unknown): v is DemoPersona {
  return (
    typeof v === "string" && (DEMO_PERSONAS as readonly string[]).includes(v)
  );
}

export interface DemoPersonaProfile {
  key: DemoPersona;
  /** Stable BFF session subject. Never a wallet, email, or backend user id. */
  authId: string;
  label: string;
  /** Whether sign-in also issues an eligibility decision cookie. */
  issuesEligibility: boolean;
  /** Where the demo page sends the presenter after sign-in. */
  entryPath: string;
}

export const DEMO_PERSONA_PROFILES: Readonly<
  Record<DemoPersona, DemoPersonaProfile>
> = {
  applicant: {
    key: "applicant",
    authId: "demo-applicant-01",
    label: "Applicant — public application, pending internal review",
    issuesEligibility: false,
    entryPath: "/us/eligibility",
  },
  admitted: {
    key: "admitted",
    authId: "demo-admitted-01",
    label:
      "Admitted Alpha investor — admission recorded in the backend of record",
    issuesEligibility: true,
    entryPath: "/us/app/home",
  },
};

/** Display-only cookie naming the persona; the BFF never reads it for authority. */
export const DEMO_PERSONA_COOKIE = "us_demo_persona";
