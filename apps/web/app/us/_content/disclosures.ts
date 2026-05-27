// Q1 resolved: Option A (digital adviser path, Internet Adviser Exemption rule 203A-2(e))
// Document names are final. Content, versions, hashes, and effective dates
// are pending SEC registration and counsel drafting.
//
// Schema (MIG-P2.5-06):
//   - `requiredForActivation` is the *only* signal the activation gate reads.
//   - `version`, `effectiveDate`, `hash` stay null until counsel publishes;
//     UI renders "Pending registration" everywhere they're null.
//   - `unlockCondition` documents *why* the doc is currently unavailable —
//     surfaces as customer copy in the per-doc card.
//   - `customerNote` is the calm, plain-language sentence shown to clients.
//   - `internalNote` is engineering/counsel context. Rendered only when
//     NEXT_PUBLIC_REFI_ENV !== "prod"; never reaches end users.

export type DisclosureUnlockCondition =
  | "sec-registration"
  | "counsel-approval"
  | "agreement-terms";

export type DisclosureDocument = {
  id: string;
  name: string;
  description: string;
  status: "pending" | "published";
  /** True when activation requires this doc to be acknowledged. */
  requiredForActivation: boolean;
  /** null until counsel publishes the doc. */
  version: string | null;
  effectiveDate: string | null;
  hash: string | null;
  unlockCondition: DisclosureUnlockCondition;
  /** Calm, customer-facing explanation of the current blocked state. */
  customerNote: string;
  /** Engineering/counsel-only context. Hidden from end users. */
  internalNote: string;
};

const PENDING_REGISTRATION_NOTE =
  "This document is required before Managed Execution Activation. It will become available after registration and counsel approval.";

const RECOMMENDED_PENDING_NOTE =
  "This document will be available after registration and counsel approval. It is recommended reading but not required for activation.";

export const disclosureDocuments: readonly DisclosureDocument[] = [
  {
    id: "form-crs",
    name: "Form CRS",
    description:
      "Client Relationship Summary — required disclosure for retail investors.",
    status: "pending",
    requiredForActivation: true,
    version: null,
    effectiveDate: null,
    hash: null,
    unlockCondition: "sec-registration",
    customerNote: PENDING_REGISTRATION_NOTE,
    internalNote:
      "Drafted in coordination with outside counsel; awaits SEC registration before publication.",
  },
  {
    id: "adv-part-2a",
    name: "ADV Part 2A",
    description:
      "Firm brochure disclosing investment strategies, fees, and conflicts of interest.",
    status: "pending",
    requiredForActivation: true,
    version: null,
    effectiveDate: null,
    hash: null,
    unlockCondition: "sec-registration",
    customerNote: PENDING_REGISTRATION_NOTE,
    internalNote:
      "Tracks the SEC IA filing. Counsel review with outside firm in progress.",
  },
  {
    id: "advisory-agreement",
    name: "Investment Advisory Agreement",
    description: "The client agreement governing the advisory relationship.",
    status: "pending",
    requiredForActivation: true,
    version: null,
    effectiveDate: null,
    hash: null,
    unlockCondition: "counsel-approval",
    customerNote: PENDING_REGISTRATION_NOTE,
    internalNote:
      "Master template with counsel; awaiting final form before publication.",
  },
  {
    id: "privacy-notice",
    name: "Privacy Notice",
    description: "How ReFi collects, uses, and protects your information.",
    status: "pending",
    requiredForActivation: false,
    version: null,
    effectiveDate: null,
    hash: null,
    unlockCondition: "counsel-approval",
    customerNote: RECOMMENDED_PENDING_NOTE,
    internalNote: "Drafted; awaiting counsel sign-off.",
  },
  {
    id: "e-delivery-consent",
    name: "E-Delivery Consent",
    description: "Consent to receive required documents electronically.",
    status: "pending",
    requiredForActivation: true,
    version: null,
    effectiveDate: null,
    hash: null,
    unlockCondition: "sec-registration",
    customerNote: PENDING_REGISTRATION_NOTE,
    internalNote: "Bundled with Form CRS publication.",
  },
  {
    id: "fee-schedule",
    name: "Fee Schedule",
    description: "Description of fees charged for advisory services.",
    status: "pending",
    requiredForActivation: false,
    version: null,
    effectiveDate: null,
    hash: null,
    unlockCondition: "counsel-approval",
    customerNote: RECOMMENDED_PENDING_NOTE,
    internalNote: "Tied to commercial finalization; not registration-blocking.",
  },
  {
    id: "managed-execution-acknowledgment",
    name: "Managed Execution Acknowledgment",
    description:
      "Acknowledgment that all investment advisory services are provided exclusively through the ReFi platform. Advisory personnel do not generate, modify, or expand client-specific investment advice.",
    status: "pending",
    requiredForActivation: true,
    version: null,
    effectiveDate: null,
    hash: null,
    unlockCondition: "agreement-terms",
    customerNote: PENDING_REGISTRATION_NOTE,
    internalNote:
      "Implements the Rule 203A-2(e)(3) advisory-personnel-boundary requirement.",
  },
];

export type DisclosureDocumentId = (typeof disclosureDocuments)[number]["id"];

/** Required-for-activation doc ids. The activation gate counts ack against this set. */
export const REQUIRED_FOR_ACTIVATION_IDS = disclosureDocuments
  .filter((d) => d.requiredForActivation)
  .map((d) => d.id);
