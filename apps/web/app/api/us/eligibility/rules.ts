// Eligibility rules. Data only — no component code. Evaluated in order;
// the first matching rule wins. Update WAITLIST_STATES to open new states.

export const WAITLIST_STATES = ["AK", "HI", "NY"] as const;

export type EligibilityResult = "eligible" | "waitlist" | "ineligible";

export type EligibilityRule = {
  id: string;
  result: EligibilityResult;
  reason: string;
  matches: (input: {
    isUsPerson: boolean;
    age: number;
    state: string;
  }) => boolean;
};

export const eligibilityRules: readonly EligibilityRule[] = [
  {
    id: "us-person-required",
    result: "ineligible",
    reason: "US residents only",
    matches: (i) => !i.isUsPerson,
  },
  {
    id: "age-required",
    result: "ineligible",
    reason: "Must be 18 or older",
    matches: (i) => i.age < 18,
  },
  {
    id: "state-waitlist",
    result: "waitlist",
    reason: "State availability coming soon",
    matches: (i) =>
      (WAITLIST_STATES as readonly string[]).includes(i.state.toUpperCase()),
  },
  {
    id: "default-eligible",
    result: "eligible",
    reason: "",
    matches: () => true,
  },
];

export const RULE_VERSION = "1";
