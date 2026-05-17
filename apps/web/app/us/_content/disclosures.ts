// Q1 resolved: Option A (digital adviser path, Internet Adviser Exemption rule 203A-2(e))
// Document names are final. Content is pending SEC registration and counsel drafting.
export const disclosureDocuments = [
  {
    id: 'form-crs',
    name: 'Form CRS',
    description: 'Client Relationship Summary — required disclosure for retail investors.',
    status: 'pending' as const,
  },
  {
    id: 'adv-part-2a',
    name: 'ADV Part 2A',
    description: 'Firm brochure disclosing investment strategies, fees, and conflicts of interest.',
    status: 'pending' as const,
  },
  {
    id: 'advisory-agreement',
    name: 'Investment Advisory Agreement',
    description: 'The client agreement governing the advisory relationship.',
    status: 'pending' as const,
  },
  {
    id: 'privacy-notice',
    name: 'Privacy Notice',
    description: 'How ReFi collects, uses, and protects your information.',
    status: 'pending' as const,
  },
  {
    id: 'e-delivery-consent',
    name: 'E-Delivery Consent',
    description: 'Consent to receive required documents electronically.',
    status: 'pending' as const,
  },
  {
    id: 'fee-schedule',
    name: 'Fee Schedule',
    description: 'Description of fees charged for advisory services.',
    status: 'pending' as const,
  },
  {
    id: 'managed-execution-acknowledgment',
    name: 'Managed Execution Acknowledgment',
    description:
      'Acknowledgment that all investment advisory services are provided exclusively through the ReFi platform. Advisory personnel do not generate, modify, or expand client-specific investment advice.',
    status: 'pending' as const,
  },
] as const;

export type DisclosureDocumentId = (typeof disclosureDocuments)[number]['id'];
