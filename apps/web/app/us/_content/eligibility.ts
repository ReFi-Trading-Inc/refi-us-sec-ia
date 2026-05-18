export const eligibilityCopy = {
  heading: "Check your eligibility",
  subheading: "Confirm your state of residence and status before connecting.",
  fields: {
    state: { label: "State of residence", placeholder: "Select your state" },
    ageConfirmation: { label: "I am at least 18 years old" },
    usPersonConfirmation: { label: "I am a US person or US tax resident" },
    accountPurpose: {
      label: "Account purpose",
      options: ["Personal", "Family", "Household"],
    },
    dob: { label: "Date of birth" },
    usPerson: { label: "Are you a US person or US tax resident?" },
    yes: "Yes",
    no: "No",
  },
  submit: "Check eligibility",
  emailCapture: {
    label: "Email (optional)",
    placeholder: "you@example.com",
    helper:
      "Provide an email and we'll notify you when ReFi.Trading opens in your state.",
    submit: "Notify me",
  },
  results: {
    eligible: {
      badge: "Eligible",
      heading: "Check eligibility passed",
      body: "You're eligible to proceed. Connect your wallet to continue.",
      cta: "Continue to wallet connect",
    },
    waitlist: {
      badge: "Waitlist",
      heading: "Coming soon to your state",
      body: "We'll notify you when ReFi.Trading opens in your state.",
      cta: "Join waitlist",
    },
    ineligible: {
      badge: "Not eligible",
      heading: "We can't open an account for you today",
      body: "Based on the information provided, you're not eligible to use ReFi.Trading at this time.",
    },
    unsupported: {
      badge: "Not available",
      heading: "ReFi is not available in your state",
      body: "ReFi.Trading is not currently available in your state of residence.",
    },
  },
  disclaimer:
    "This eligibility check is not investment advice or a suitability assessment. It determines only whether the platform is available in your state.",
} as const;
