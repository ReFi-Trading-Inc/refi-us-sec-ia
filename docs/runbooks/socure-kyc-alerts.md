# Socure KYC alert runbooks (Sandbox `refi-socure-sandbox`, Production `refi-socure-prod`)

Every alert policy links here by anchor. Primary webhook security is the Bearer credential; sender-IP allowlisting is defense in depth. Never paste tokens, keys, eval ids of real people, or PII into an incident thread. Evidence to retain for every incident: alert name, window, Cloud Run revision, correlation ids from the response `meta`, the Firestore audit records involved (ids only), and the action taken.

## health-unavailable

**Means:** `/api/health` failed the uptime check for 5 minutes → the service is down or unreachable. Production: PAGE.
**Immediate check:** `gcloud run services describe <service> --region us-central1` (Ready condition, latest revision), then the revision logs for startup errors ("Invalid server environment" = configuration fail-closed).
**Dependencies:** Cloud Run, Secret Manager (secret versions disabled/deleted break boot), Firestore (durable store).
**Safe mitigation:** roll traffic back to the last Ready revision: `gcloud run services update-traffic <service> --to-revisions <prev>=100`. Do not change env values in a hurry; a wrong Socure value can silently point at the wrong environment.
**Escalation:** founder; if Google Cloud incident, status.cloud.google.com.
**Do not retry:** never redeploy repeatedly with guessed configuration.

## sustained-5xx

**Means:** more than 5 responses with status ≥ 500 in 5 minutes across the service.
**Immediate check:** logs filtered to `httpRequest.status>=500`; split by path. Evaluation-route 5xx → see below; other paths → application error.
**Dependencies:** Firestore, Secret Manager, the provider.
**Safe mitigation:** rollback revision if it started with a deploy; otherwise investigate. No data changes.
**Do not retry:** do not replay webhooks manually.

## evaluation-5xx

**Means:** `POST /api/v1/investor/kyc/evaluation` returned 5xx more than 3 times in 10 minutes. The route returns 502 when the provider call fails; the record stays `in_progress` (retryable) and no evidence is created.
**Immediate check:** `jsonPayload.refi_signal="kyc.provider.error"` with its `kind`: `auth_config` (API key or host wrong: check the secret version and `SOCURE_API_BASE_URL`), `rate_limited` (429: back off, check TPS), `provider_unavailable`/`timeout` (Socure incident), `invalid_request` (contract drift: stop and inspect the schema).
**Dependencies:** Socure RiskOS, Secret Manager version state, egress.
**Safe mitigation:** for `auth_config` verify the enabled secret version; for `rate_limited` reduce concurrency; for provider outage wait, users can retry. Never install a key from chat.
**Escalation:** Socure support (support@socure.com) with eval/request ids, never PII.
**Do not retry:** do not re-submit evaluations on the user's behalf.

## webhook-auth-denied

**Means:** more than 20 webhook 401/403 in 10 minutes. Normal internet noise is far lower. Either Socure's credential/rotation broke (all deliveries 401) or someone is probing.
**Immediate check:** are genuine Socure deliveries succeeding (`kyc_webhook_accepted` metric)? If accepted stays 0 while denied climbs → credential or sender-IP mismatch: compare the enabled bearer secret version with the RiskOS webhook configuration; check the sender-IP ranges if enforcement is on.
**Safe mitigation:** if enforcement is the cause, set `SOCURE_WEBHOOK_ENFORCE_SENDER_IP=0` (Bearer remains the boundary) and redeploy; do not disable Bearer authentication.
**Do not retry:** do not rotate the bearer under pressure without updating RiskOS in the same window.

## envelope-rejected

**Means:** more than 5 webhook 400s in 30 minutes: authenticated deliveries the envelope schema refused. Each is audited in Firestore `kyc-webhook-events` as `rejected:<correlationId>` with a values-free diagnostic (key shape and issue paths).
**Immediate check:** read the latest `envelope_rejected` diagnostics; a new field or changed type means a provider contract change.
**Safe mitigation:** none in production; open a schema PR with fixtures from the diagnostic. Deliveries are retried by Socure for up to 10 attempts, so a quick fix recovers them.
**Do not retry:** do not loosen the schema to "accept anything".

## conflict_flagged (signal, dashboard; alert when B is live)

**Means:** a terminal record received a contradicting terminal decision. State is protected; the conflict marker is recorded. One is an investigation; a rate is a provider or replay problem.
**Check:** the record's `conflict` field and the two event ids; confirm whether Socure re-ran the evaluation (`evaluation_rerun`).
**Mitigation:** none automatic; compliance review decides. Never overwrite the terminal state by hand.
