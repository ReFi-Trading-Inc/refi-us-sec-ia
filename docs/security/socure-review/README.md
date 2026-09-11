# Socure vendor-security review pack — index

Status: POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING

(Pack-level status; each document carries its own.)

Owner: Zeshan (security). Prepared: 2026-09-10 against `main @ 57a336d`.
Review: before submitting any vendor questionnaire, and at each phase gate.

## Purpose

This directory is the evidence pack ReFi uses to answer third-party security
questionnaires — first Socure's vendor security review (KYC + Fraud + Watchlist,
DocV Step Up, "Build Your Own UI"), and afterwards any enterprise diligence
that asks the same questions. Each document states what is actually
implemented (with a file, gate, or API result cited), what is adopted as
policy but not yet carried out, and what is simply not in place. The pack is
written so an answer of "NO" is as easy to give as "YES".

**Rule for every document here:** an answer is only "YES" if a reader can
follow the citation to a real artifact in this repository or to a read-only
API result recorded here. Cloud-provider certifications are provider facts and
never ReFi certifications.

## Socure integration state (read this first)

- Socure has been selected by the founder as the KYC provider; Socure account
  verification is pending. **The integration is NOT active:** no Socure
  credentials exist, no Socure environment variable exists in
  `apps/web/.env.example` or `apps/web/src/lib/config/env.ts`, and no traffic
  has been sent. The env-variable placement described in
  `secrets-management.md` is planned, not provisioned.
- **Record to reconcile (lead / founder):** the repository's current
  decision record,
  `docs/releases/2026-09-signal/connected-dev/decision-kyc-model.md`
  (2026-09-10, merged in PR #107), states that ReFi integrates no separate
  identity-verification provider for the initial Alpha (Alpaca-owned KYC/CIP)
  and names Socure among the providers not integrated. The same statement is
  repeated in `founder-activation-actions.md`, `daniel-dependency-packet.md`
  and `docs/decisions/DECISION_LOG.md`. This pack follows the founder mandate
  that selected Socure; the decision record has not been edited by this PR
  and must be updated separately before the two statements are read by an
  outside reviewer.
- A blocking contract assertion (`scripts/contract-assertions.ts`, section
  "kyc: the frontend boundary is provider-neutral") fails CI if a vendor name
  (including `socure`) appears in the files under `apps/web/src/lib/kyc/` and
  the KYC routes/pages it lists. Implementation of the Socure adapter will
  have to revise that gate deliberately; this pack does not touch it.

## Documents

| Document                                                                       | What it answers                                                    | Status                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------- |
| [`data-classification-policy.md`](data-classification-policy.md)               | Data classes, storage, transmission, access, logging, retention    | POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING |
| [`data-handling-standard.md`](data-handling-standard.md)                       | Day-to-day handling rules, vendor processors, incident reporting   | POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING |
| [`security-awareness-policy.md`](security-awareness-policy.md)                 | Training requirement and topics                                    | POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING |
| [`security-training-record-template.md`](security-training-record-template.md) | Completion record (empty)                                          | NOT IMPLEMENTED                               |
| [`endpoint-security-baseline.md`](endpoint-security-baseline.md)               | Device requirements                                                | POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING |
| [`endpoint-checklist-template.md`](endpoint-checklist-template.md)             | Per-device verification (empty)                                    | NOT IMPLEMENTED                               |
| [`incident-response.md`](incident-response.md)                                 | Conformance summary of the existing runbook; notification criteria | IMPLEMENTED (evidence cited)                  |
| [`change-management.md`](change-management.md)                                 | Branch protection, CI gates, review, deploy, rollback              | IMPLEMENTED (evidence cited)                  |
| [`encryption-architecture.md`](encryption-architecture.md)                     | In transit, at rest, key custody, known exceptions                 | IMPLEMENTED (evidence cited)                  |
| [`secrets-management.md`](secrets-management.md)                               | Where secrets live, how code reads them, rotation, scanning        | IMPLEMENTED (evidence cited)                  |
| [`access-control-overview.md`](access-control-overview.md)                     | GitHub, GCP IAM, Vercel, Stytch, Socure access; MFA; offboarding   | POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING |
| [`threat-model.md`](threat-model.md)                                           | Pointer to the existing threat model; KYC/PII trust boundary       | IMPLEMENTED (evidence cited)                  |
| [`background-checks.md`](background-checks.md)                                 | Personnel screening                                                | NOT IMPLEMENTED                               |
| [`certifications.md`](certifications.md)                                       | SOC 2 / ISO 27001 / PCI DSS                                        | NOT IMPLEMENTED                               |
| [`vulnerability-scan.md`](vulnerability-scan.md)                               | Scan report (stub; populated by the scan run)                      | NOT IMPLEMENTED                               |

## Questionnaire answer matrix

| Control area                     | Answer                  | Evidence document                                            | Caveat (say this, do not soften it)                                                                                                                                      |
| -------------------------------- | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Third-party certification        | **NO**                  | `certifications.md`                                          | No SOC 2, ISO 27001 or PCI DSS. Google Cloud and Vercel attestations are theirs, not ReFi's.                                                                             |
| Encryption in transit            | **YES**                 | `encryption-architecture.md`                                 | Managed TLS on Vercel and Cloud Run; HSTS set by `apps/web/proxy.ts` (SH-01).                                                                                            |
| Encryption at rest               | **YES**, with exception | `encryption-architecture.md` §4                              | Google-managed encryption for Firestore / Secret Manager / Artifact Registry; Vercel env encryption. Exception: the prototype filesystem store on demo tiers (non-prod). |
| Data classification / handling   | **YES**                 | `data-classification-policy.md`, `data-handling-standard.md` | Policy adopted 2026-09-10; personnel acknowledgment not yet recorded.                                                                                                    |
| Background checks                | **NO**                  | `background-checks.md`                                       | Policy statement only; nothing performed, no evidence.                                                                                                                   |
| Security awareness training      | **YES (policy)**        | `security-awareness-policy.md`, record template              | Training is NOT COMPLETE until the record template carries a completed row per person.                                                                                   |
| Incident response                | **YES**                 | `incident-response.md`, `docs/incident-response-runbook.md`  | Runbook exists and is owned; drills are prescribed, no drill record is in the repo.                                                                                      |
| Change management                | **YES**                 | `change-management.md`                                       | PRs required and four blocking checks enforced on `main` (API-verified); approval count is 0 (single maintainer); signatures not GitHub-enforced.                        |
| Endpoint security                | **YES once verified**   | `endpoint-security-baseline.md`, checklist template          | Organizational control NOT YET VERIFIED — no device row completed.                                                                                                       |
| Vulnerability scanning           | **YES once completed**  | `vulnerability-scan.md` (stub)                               | Dependency audit runs in CI report-only; gitleaks is blocking. No scan report exists yet.                                                                                |
| Access control / least privilege | **YES (design)**        | `access-control-overview.md`                                 | GCP IAM design is in Terraform and activation docs; the connected project is not created. MFA on GitHub/Vercel/Stytch is an expectation, not evidenced here.             |
| Secrets management               | **YES**                 | `secrets-management.md`                                      | No Socure secret exists; rotation is manual.                                                                                                                             |
| Threat model                     | **YES**                 | `threat-model.md`                                            | The existing model predates the Socure decision; the KYC boundary is summarized in the pack, not yet added to the model.                                                 |

## Not supportable yet

Do not answer these with "YES" or any partial-credit phrasing:

1. **Third-party certification — NO.** None held, none in progress.
2. **Background checks — NO.** No provider, no records, no consent process.
3. **Endpoint security — pending device verification.** The baseline is
   written; `endpoint-checklist-template.md` has no completed rows.
4. **Security awareness training — pending completion.** The policy and the
   record template exist; no person has a completion row.
5. **Vulnerability scan — pending report.** `vulnerability-scan.md` is a stub
   until the scan run populates it.

## No secrets, no customer PII

This pack contains no secret values, no key material, no credentials, no
customer or applicant personal data, and no example data derived from real
people. Environment variables are referred to by **name only**. Anyone adding
to this directory must keep it that way; `gitleaks` runs on every push and
blocks CI (`.github/workflows/ci.yml`, job "Security scans"), and the
pre-commit hook runs `lint-staged` only, so secret hygiene in docs is a review
responsibility as well as a scanner responsibility.

## Related evidence outside this directory

- `compliance/CONTROL_MATRIX.md` — control ids cited throughout (AC-, CS-, SH-, IB-, RB-, DP-, CM-).
- `docs/security-threat-model.md`, `docs/incident-response-runbook.md`,
  `docs/security/RUNBOOK-bff-assertion-signing-key.md`.
- `infra/terraform/**`, `infra/cloudrun/README.md`,
  `docs/releases/2026-09-signal/gcp-bff-migration-plan.md`.
- `docs/releases/2026-09-signal/connected-dev/founder-activation-actions.md`
  and `decision-gcp-project.md` (GCP project `refi-us-connected-investor`).
