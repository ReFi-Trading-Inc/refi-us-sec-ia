# Runbook — Socure Sandbox activation and acceptance (operator; NOT executed)

Scope: activate the merged Socure foundation against the **Socure Sandbox** with **synthetic identities only**, and collect acceptance evidence. Automatic Alpha admission stays disabled (PR F/G held). Nothing here authorises production keys, real PII, real documents, connected GCP provisioning, Stytch/Daniel/Alpaca activation or live capital. Every step is a founder-approved, separately authorised action; this document is the procedure, not the approval.

Preconditions: `main` at or after `2051e80`; deployment target = the dedicated **Socure Sandbox Cloud Run service with Firestore backing** (`infra/gcp/socure-sandbox/`, project `refi-socure-sandbox`) — founder decision 2026-09-11: never the per-instance prototype store, never a local machine, never the connected investor environment (#98). Product: KYC + Fraud + Watchlist > DocV Step Up · Build Your Own UI · Sandbox only.

## A. Credentials (from zero)

1. **Sandbox account** — request via support@socure.com (Socure Launch, "KYC + Fraud + Watchlist > DocV Step-Up", Direct API + SDK path). Record who holds dashboard access (named person, MFA on).
2. **Sandbox API key** — RiskOS Dashboard → Developer Workbench → API Keys (Sandbox). Restricted. Never pasted into chat/tickets.
3. **Public SDK key** — Developer Workbench → SDK Keys. Public by design (reaches the browser).
4. **Workflow name** — Developer Workbench → Workflows: the environment-specific identifier of the selected KYC + Fraud + Watchlist > DocV Step-Up workflow.
5. **Webhook Bearer credential** — a cryptographically random **UUIDv4** generated outside chat (e.g. `uuidgen`), per RiskOS webhook configuration; separate values for Sandbox and Production; Restricted; stored only in Secret Manager; never printed, pasted or committed.
6. **Webhook subscription** — Developer Workbench → Webhooks → Add: URL `https://<bff-host>/api/webhooks/kyc/provider`, auth **Bearer** = the credential from step 5, events `evaluation_completed` (+ `evaluation_paused`, `workflow_execution_failed` for audit). Use the dashboard "Continue to Test" sample delivery only after step C.
7. **Sandbox base URL** — `https://riskos.sandbox.socure.com` (must match `SOCURE_ENV=sandbox`; the config invariant refuses any other host).

## B. Secrets and configuration (approved path only)

8. Store in Secret Manager of the connected project (or the deployment's secret store), never in source: `SOCURE_API_KEY`, `SOCURE_WEBHOOK_BEARER_TOKEN`. Non-secret config as environment: `REFI_KYC_PROVIDER=socure`, `SOCURE_API_BASE_URL`, `SOCURE_ENV=sandbox`, `SOCURE_WORKFLOW_NAME`, `NEXT_PUBLIC_SOCURE_SDK_KEY`, `SOCURE_WEBHOOK_ENFORCE_SENDER_IP=0` (defense in depth only; enable later if the runtime exposes the true source address). Keep `REFI_KYC_MOCK_CONTROLS=0`.
9. Deploy. Boot must succeed: the env schema fails closed on any missing SOCURE_* value or host/environment mismatch. Confirm `/api/v1/investor/kyc/verification` (authenticated) reports `available: true, adapter: "socure", collectsIdentity: true`.
10. **No secret reaches the browser**: view page source / network for the KYC page; only `NEXT_PUBLIC_SOCURE_SDK_KEY` may appear; `SOCURE_API_KEY` and the Bearer credential must not appear anywhere client-side (also asserted in CI).

## C. Synthetic acceptance runs (see `docs/security/socure-review/socure-acceptance-matrix.md`)

Use the approved synthetic test session: mint the standard session cookie for a synthetic `authId` with this environment's `SESSION_JWT_SECRET` exactly as `apps/web/e2e/session.ts` does (no Stytch, no dev fallback, no demo persona) and **synthetic** identity data only (no real SSN, DOB, address, documents).

11. **ACCEPT** — submit the identity form; expect `result: "evaluated"`, state `passed`; record `eval_id`, request id, workflow; verify the evidence record (`kyc-evaluations`) has `providerDecision=accept`, `providerDecisionFinal=true`, `decisionProvenance=provider_evaluation`, no PII/score fields; verify the attestation evidence module yields trusted `passed` (route `profile/v2/attestation` GET shows the chain no longer blocked on `KYC_EVIDENCE_MISSING`).
12. **REVIEW → DocV** — submit a synthetic identity the Sandbox routes to REVIEW; expect `stepUpRequired: true`, state `additional_info_required`, `GET /kyc/step-up` returns a token for this user only; launch capture (Sandbox test documents only); on completion expect `under_review`.
13. **Final webhook** — expect `evaluation_completed` delivery → state `passed` or `failed`; record `event_id`; verify the delivery was acknowledged 2xx after the durable record.
14. **REJECT** — synthetic reject identity → state `failed`; UI shows "We could not verify your identity"; no admission evaluation (F/G held).
15. **Replay** — resend the same webhook (dashboard re-send or curl with the Bearer credential) → 200 `duplicate_event`, no state or history change.
16. **Unknown eval_id** — send a well-formed event with an unknown `eval_id` → 200 `unknown_evaluation`, nothing created.
17. **Invalid credential** — send without / with a wrong Bearer → 401; no audit record.
18. **429** — if the Sandbox rate limit (1/s) can be triggered, expect `provider_error` with `retryable: true`, state stays `in_progress`.
19. **5xx / timeout** — cannot be forced against Socure; covered by the fake-client assertions; record as "fixture-proven".
20. **No operational failure becomes a rejection** — confirm every error case above left the record `in_progress` (never `failed`).
21. **Logs** — review Cloud Run / Vercel logs for the run window: no SSN, DOB, address, API key, Bearer credential, document or selfie payload (search terms in the acceptance matrix).
22. Collect evidence per the matrix into the acceptance packet (no synthetic SSNs, no images).

## C2. Restart acceptance (Firestore durability — required, not optional)

1. Create a synthetic Sandbox evaluation (Scenario A or B) and note the request id / `eval_id`.
2. Confirm the record exists in Firestore (`kyc-evaluations`, `kyc-evaluation-index`).
3. Redeploy or restart the Cloud Run service (new revision, or scale to zero and back).
4. Confirm `GET /api/v1/investor/kyc/verification` still resolves the same session/state for the test user.
5. Deliver the final webhook → state `passed` / `failed`; note `event_id`.
6. Restart again.
7. Replay the same webhook → 200 `duplicate_event`.
8. Verify no duplicate state or history (record history length unchanged; one `kyc-webhook-events` document).
9. Verify the terminal decision is unchanged and a Bearer-less replay is still 401 after the restart.

## C3. Multi-instance acceptance (correctness must not depend on one instance)

With `max-instances=2`: run Scenario B so the Evaluation request (instance A) and the webhook delivery (instance B, force by delivering during concurrent load or after a scale event) hit different instances; verify the webhook correlates to the same Firestore-backed record (`data.id` request id + `eval_id`) and the state transition is exactly once. Fire two concurrent replays of one webhook → one `applied`, one `duplicate_event`.

## D. Rollback

- Set `REFI_KYC_PROVIDER=unconfigured` and redeploy: the KYC page reports "not available yet" (never pending); the webhook route goes dark (404); no data is deleted.
- Rotate the webhook Bearer credential and the Sandbox API key in the dashboard and Secret Manager if either was exposed; redeploy.
- Evidence records created during acceptance are synthetic; delete the acceptance test users' `kyc-evaluations`, `kyc-evaluation-index` and `kyc-webhook-events` entries when the run is closed.
