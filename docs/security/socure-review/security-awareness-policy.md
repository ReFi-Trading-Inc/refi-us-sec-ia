# Security awareness training policy

Status: POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING

Owner: Zeshan. Adopted: 2026-09-10.

**Training is NOT COMPLETE.** No person has a completion entry in
`security-training-record-template.md`. Until a row exists for each person
with access, the questionnaire answer is "policy adopted; completion pending",
never "training completed".

## 1. Who and when

- Every person granted access to the repository, a cloud project, a Vercel
  project, the Stytch dashboard, or (in future) the Socure dashboard.
- On access grant, before the first production or vendor-dashboard access is
  used; then annually; and after any material change to this policy or a
  SEV1/SEV2 incident whose postmortem calls for it.

## 2. Topics (each must be covered and attested)

1. Phishing and social engineering — including vendor-impersonation and
   "urgent key rotation" pretexts.
2. Passwords, passkeys, and MFA — unique credentials per service; passkeys or
   TOTP; SMS as a last resort; no credential reuse.
3. Secrets management — `secrets-management.md`: where secrets live, why
   nothing goes in git or chat, how to use `.env.local`, what to do on a
   suspected leak (rotate first).
4. Handling RESTRICTED data — `data-classification-policy.md` §2; never store,
   never log, never share the value.
5. KYC / PII handling — Socure holds applicant PII, documents, and biometrics;
   ReFi keeps reference ids and decisions; no applicant data in tickets,
   screenshots, test fixtures, or logs; test data is synthetic only.
6. Device security — `endpoint-security-baseline.md`.
7. Incident reporting — `docs/incident-response-runbook.md` §0 and §4:
   report immediately, contain and preserve evidence before debugging.
8. Safe development practices — branch protection and required checks
   (`change-management.md`), never bypass gates, no `NEXT_PUBLIC_` secrets,
   server-only env, fail-closed defaults, the investor-boundary tripwire.

## 3. Delivery and attestation

- Delivery may be self-study of the documents in this pack plus a short
  walkthrough by the owner; a commercial course is not required.
- Completion is attested by the person and recorded in
  `security-training-record-template.md` with the date, topics covered, and
  next due date. The record is kept in the repository (INTERNAL).
- Missing or overdue training is a reason to suspend the affected access until
  completed.

## 4. Review

Reviewed annually and after any SEV1/SEV2 postmortem.
