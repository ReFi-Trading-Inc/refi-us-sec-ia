# Third-party certifications

Status: NOT IMPLEMENTED

Questionnaire answer: **NO.** ReFi holds no SOC 2 (Type I or II), no
ISO/IEC 27001, and no PCI DSS attestation, and none is in progress. ReFi
does not process cardholder data.

## Provider attestations (provider facts, not ReFi's)

The infrastructure and service providers ReFi uses publish their own
attestations. They describe the provider's controls over its platform; they
do not certify ReFi's configuration, code, people, or processes, and must
never be presented as ReFi certifications.

| Provider     | Role for ReFi                                                | Where the provider publishes its attestations |
| ------------ | ------------------------------------------------------------ | --------------------------------------------- |
| Google Cloud | Cloud Run, Firestore, Secret Manager, KMS, Artifact Registry | Google Cloud compliance resource center       |
| Vercel       | Web hosting, environment storage                             | Vercel security / trust page                  |
| GitHub       | Source control, CI                                           | GitHub trust center                           |
| Stytch       | Authentication (selected; not yet active)                    | Stytch trust page                             |
| Socure       | KYC / fraud / watchlist (selected; not yet active)           | Socure's own vendor documentation             |

When a questionnaire asks for reports, state: "ReFi has no certification of
its own. Provider reports are available from each provider under its own
NDA process."

## What it would take to change this answer

A scoped readiness assessment, a chosen auditor, an observation period (for
SOC 2 Type II), and evidence of the organizational controls this pack still
marks as pending (training completion, endpoint verification, background
checks, drill records). None of that has started.
