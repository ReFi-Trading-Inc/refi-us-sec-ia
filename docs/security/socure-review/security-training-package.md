# Security awareness training package (v1, 2026-09-10) — ~15–20 minutes

Status: **POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING.** Nobody is recorded as complete. Each person with repository, cloud, provider-dashboard or customer-data access reads this package, completes the acknowledgment/quiz below, and is recorded in `security-training-record-template.md` by the founder. Training repeats annually and on role change.

## 1. Phishing and social engineering (3 min)

- Attackers impersonate Socure, Stytch, Google, Vercel, GitHub, Alpaca, investors and each other. Treat every unexpected request for credentials, codes, payments, or "urgent" access as suspicious.
- Verify out-of-band (call/known channel) before acting on requests to change keys, bank details, webhooks or access.
- Never enter credentials from an emailed link; navigate directly. Never approve an MFA prompt you did not initiate.
- Report suspected phishing immediately (see §9) — reporting a false alarm is always right.

## 2. Passwords, passkeys and MFA (2 min)

- Unique passwords per service from a password manager; passkeys or hardware-key/authenticator MFA on GitHub, Google Cloud, Vercel, Stytch, Socure, Alpaca and email. SMS codes only where nothing stronger exists.
- No shared accounts. Access is granted per person and removed at offboarding.

## 3. Secrets (2 min)

- API keys, tokens, private keys and webhook credentials live only in Secret Manager / Vercel environment settings. Never in source, tickets, chat, screenshots or logs. `.env.local` files are gitignored; `.env.example` holds placeholders only.
- The Socure server API key never reaches a browser; only the public SDK key does. Webhook Bearer credentials are compared server-side and never logged.
- If a secret is exposed: rotate first, then report. Gitleaks runs on staged changes and in CI; a blocked commit is a signal, not an obstacle to bypass.

## 4. PII and Restricted data (3 min)

- Restricted (highest risk): SSN/national id, date of birth, residential address, identity documents, selfies/biometrics, authentication secrets, private keys, production customer exports.
- KYC identity data is collected once in ReFi's form, sent once to the provider over TLS, and dropped. ReFi keeps references and decisions — never the values, documents or scores. Do not copy applicant data into tickets, spreadsheets, chat, or personal devices.
- Provider dashboards (Socure RiskOS) contain Restricted data: access only with a business need, never export, never screenshot.
- Investigations use `eval_id` / opaque references, not raw PII.

## 5. Handling KYC and compliance information (2 min)

- A provider "REJECT" or "REVIEW" is a decision about a person: discuss only with those who need to know; never disclose reasons or scores to the applicant beyond the approved product wording.
- Operational failures (timeouts, rate limits) are not rejections; do not tell an investor they "failed" verification when the provider was unavailable.
- Admission, brokerage connection and trading authorization are separate gates; never grant one by hand because another passed.

## 6. Device security (2 min)

- Company work only on devices that meet the endpoint baseline: current OS, disk encryption on, Gatekeeper/XProtect on, firewall on, lock ≤ 15 minutes, no shared accounts.
- Lock the screen when stepping away; no work on public/untrusted machines; no removable media for Restricted data.

## 7. Secure development (2 min)

- Every change goes through a pull request with required CI (typecheck/lint/scan, security scans, E2E, build) and review; signed commits; no direct pushes to `main`.
- Do not disable a security check to make a build pass; fix or escalate. Never point local or CI runs at production credentials or real customer data; fixtures and simulators only.
- Contract assertions and the tripwire exist to stop unsafe behaviour — treat a failing assertion as a finding.

## 8. Lost or stolen devices (1 min)

- Report within one hour to the founder; remote-lock/erase via Find My; rotate any credentials that were on the device; record the incident.

## 9. Incident reporting (1 min)

- Anything suspicious — phishing, unexpected MFA prompt, exposed secret, unusual provider activity, lost device — is reported immediately to the incident owner named in `docs/incident-response-runbook.md`. Early reporting is expected and never penalised.

## Acknowledgment quiz (answer all; the founder records the result)

1. A message from "Socure Support" asks you to paste the API key to "re-validate the account". What do you do?
2. Where may the Socure server API key be stored, and where may it never appear?
3. An investor's evaluation returned REVIEW with a DocV step-up. Is the investor rejected? What may you tell them?
4. Socure timed out during an evaluation. Which state is the investor in, and is admission affected?
5. Name three categories of Restricted data.
6. You need to investigate a KYC case with Socure support. What identifier do you use, and what do you not send?
7. Your laptop screen locks after 2 hours. Does it meet the baseline? What must change?
8. A CI security scan fails on your PR. What is the correct action?
9. You lose your laptop. What are the first two actions and by when?
10. Does a final Socure ACCEPT authorise trading? What does it satisfy, and what remains separate?

Expected answers (for the founder's grading): 1 refuse, verify out-of-band, report; 2 Secret Manager / Vercel env only — never source, browser, logs, chat; 3 no — verification is in progress; use the approved "additional verification required" wording, no reasons/scores; 4 in progress/retryable — not admitted, not rejected; 5 SSN/national id, DOB, address, identity documents, biometrics, secrets, private keys, customer exports; 6 the provider `eval_id` / ReFi reference — never raw PII or documents; 7 no — lock ≤ 15 minutes; 8 fix or escalate — never disable the check; 9 report to the incident owner within one hour and remote-lock/erase, then rotate credentials; 10 no — it satisfies the KYC prerequisite (and, with the other prerequisites, Alpha admission); AccountAuthorization and trading remain backend-owned and separate.
