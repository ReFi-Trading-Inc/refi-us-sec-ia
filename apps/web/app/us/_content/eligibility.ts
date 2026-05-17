export const eligibilityCopy = {
  heading: 'Check your eligibility',
  subheading: 'Confirm your state of residence and status before connecting.',
  fields: {
    state: { label: 'State of residence', placeholder: 'Select your state' },
    ageConfirmation: { label: 'I am at least 18 years old' },
    usPersonConfirmation: { label: 'I am a US person or US tax resident' },
    accountPurpose: {
      label: 'Account purpose',
      options: ['Personal', 'Family', 'Household'],
    },
  },
  results: {
    eligible: {
      badge: 'Eligible',
      heading: 'You\'re eligible to continue',
      body: 'Based on your state and status, you can proceed to connect your wallet.',
      cta: 'Continue to wallet connect',
    },
    waitlist: {
      badge: 'Waitlist',
      heading: 'We\'re not available in your state yet',
      body: 'We\'re working to expand availability. Join the waitlist to be notified when your state opens.',
      cta: 'Join waitlist',
    },
    unsupported: {
      badge: 'Not available',
      heading: 'ReFi is not available in your state',
      body: 'ReFi.Trading is not currently available in your state of residence.',
    },
  },
  disclaimer:
    'This eligibility check is not investment advice or a suitability assessment. It determines only whether the platform is available in your state.',
} as const;
