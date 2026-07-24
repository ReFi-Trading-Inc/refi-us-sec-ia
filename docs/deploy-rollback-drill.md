# Deploy Rollback Drill

**Version:** v1 (2026-07-14), Sprint 6 alpha-gate deliverable per Sprint Plan v3.
**Cadence:** quarterly, plus after any change to `deploy-prod.yml` or
Cloud Run traffic routing.
**Owner:** engineering lead (Zeshan). Second reviewer: on-call.

The drill proves that if a bad production revision ships we can put
traffic back on the previous revision within the SEV-1 response window
(§1 of the incident-response runbook: 30 minutes end-to-end). A drill
that reveals we cannot is itself a SEV-2 — file a ticket, land the
fix, re-run the drill.

Drills run against **staging** by default (`refi-us-web-staging`) so a
mistake in the drill doesn't cause a real outage. Once a quarter the
drill runs against production immediately after a low-traffic-window
deploy, with the on-call already engaged.

---

## Pre-drill checklist

- [ ] `gcloud auth application-default login` current on the runner
- [ ] `gcloud config get-value project` matches the target
- [ ] Incident channel notified: "starting quarterly rollback drill,
      expect blip"
- [ ] Alpha-gate checklist §7 (rate limits active) and §5 (records
      retention) reviewed as recently as this quarter

## Drill procedure

### Step 1 — pick the two revisions (target: 2 min)

Identify the current serving revision and the immediately previous
one. Both must be healthy per Cloud Run's own health status; a drill
that rolls back to an unhealthy revision does not prove anything.

```
gcloud run revisions list \
  --service $SERVICE \
  --region $REGION \
  --format="table(name, deployed, active, status.conditions[0].status)"
```

Record both revision names in the drill log.

### Step 2 — capture pre-rollback observables (target: 3 min)

Grab a baseline snapshot so the post-rollback checks have something
to compare against:

- Current revision name + image tag
- `curl -si https://<host>/api/health` — expect 200
- `curl -si https://<host>/api/v1/investor/session` with a seeded
  cookie — expect the shape the current release advertises
- Flags snapshot: `curl -si https://<host>/api/health/flags`
  (or scrape from Cloud Run env) — record which flags are `on`
- Structured log tail (Cloud Logging query): last 100 lines with
  `event="bff.request"`. Save as `pre-rollback.jsonl`.

### Step 3 — execute the rollback (target: 5 min)

Shift 100% of traffic to the previous revision:

```
gcloud run services update-traffic $SERVICE \
  --region $REGION \
  --to-revisions=<previous_revision>=100
```

The command returns synchronously once traffic is routed. Cloud Run
does not restart instances — the previous revision's instances are
kept warm for exactly this case.

### Step 4 — post-rollback verification (target: 10 min)

Every check below must pass. A failure aborts the drill and files a
SEV-2 ticket describing which check failed and why.

- [ ] `/api/health` returns 200 within 10 seconds
- [ ] `/api/v1/investor/session` returns the previous release's shape
- [ ] Feature flags survived: the same flags that were `on` before
      the rollback are still `on` (flags live in env vars, which are
      per-revision — a rollback that also silently reverts a flag
      change is a bug this check surfaces)
- [ ] Durable records intact: a spot-check query against the Firestore
      `receipt` and `record-access-log` collections shows entries
      from before and after the drill window, no gaps. Rollback does
      not touch the durable driver, so a gap means the pre-rollback
      revision was writing to a different collection than the target
      revision — a separate SEV-2
- [ ] Auth still fails closed: a curl with a forged JWT gets a 401
      (the auth.spec.ts assertion, run manually against the live host)
- [ ] Rate limiting still active: `for i in {1..25}; do curl ... ; done`
      against a mutating route sees a 429 after 20 admissions
- [ ] Structured log format unchanged: the last 100 lines from Cloud
      Logging still parse cleanly against the log-shape assertion
      that landed with Sprint 6 (`scripts/contract-assertions.ts`
      "BFF request log emits the stable field set")

### Step 5 — roll forward (target: 3 min)

Once verification passes, restore traffic to the newer revision:

```
gcloud run services update-traffic $SERVICE \
  --region $REGION \
  --to-revisions=<current_revision>=100
```

Post to the incident channel: "rollback drill complete, traffic
restored, no findings" (or "rollback drill complete, N findings, see
ticket #X").

### Step 6 — close out (same day)

- [ ] Drill log filed to `artifacts/rollback-drills/<yyyymmdd>.md`
      with the two revision names, timestamps for each step, the
      pass/fail row for each §Step 4 check, and any observations
- [ ] Alpha-gate checklist §6 (IR runbook reviewed) touched in the
      same PR that files the drill log

## Findings taxonomy

| Finding class                           | Severity | Action                                                                                                  |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| Rollback command failed / took >5 min   | SEV-1    | Page on-call; the drill just proved we cannot recover from a bad deploy. Investigate before next deploy |
| Verification check failed (any §4 row)  | SEV-2    | File a ticket; land the fix; re-run drill within one week                                               |
| Flag or record drift observed           | SEV-2    | Investigate root cause; do not deploy until reproduced under test                                       |
| Latency regression noticed during drill | SEV-3    | Ticket only                                                                                             |
| No findings                             | ok       | Log the drill, move on                                                                                  |

## Non-goals

- **Database rollback.** Firestore is durable and additive; a code
  rollback does not roll back written data. If a deploy introduced a
  bad write path, the data written under it stays — the runbook §3
  cross-account-leak procedure covers evidence preservation, not
  reversal.
- **Third-party rollback.** Rolling back the shell does not roll back
  Daniel's Admin Portal, PostHog, Sentry, or Firestore. This drill
  proves only the shell's own recovery.
- **DNS rollback.** DNS is out of scope; the drill uses whatever
  `<host>` currently routes to Cloud Run.

## Reference commands

Full rollback in one shell (drill script):

```
#!/usr/bin/env bash
set -euo pipefail
SERVICE=refi-us-web
REGION=us-central1

# Step 1 — enumerate
gcloud run revisions list \
  --service $SERVICE \
  --region $REGION \
  --limit 5 \
  --format="value(name)"

# Step 3 — rollback
gcloud run services update-traffic $SERVICE \
  --region $REGION \
  --to-revisions=${PREV}=100

# Verify
curl -sfI https://<host>/api/health
```

Runbook drift: this document is updated within the same PR as any
change to `.github/workflows/deploy-prod.yml`, any change to the
Cloud Run service definition, or any change to the auth or rate-limit
gating logic. A drill that runs against a stale runbook is a stale
drill.
