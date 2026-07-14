# Incident Response Runbook (S7)

**Version:** v1 (2026-07-13), Sprint 4 doc deliverable per Sprint Plan v3.
**Scope:** operational procedures for a security or compliance incident
against `refi-us-sec-ia` and its dependencies.

This runbook is a diligence asset for institutional clients and the
eventual SEC exam. It matches the threat model at
`docs/security-threat-model.md`; every named surface in this runbook
maps to a section there.

**Rule of thumb:** stop the bleeding first (flag kill-switches),
preserve evidence second (durable-driver snapshot + Cloud Run log
export), notify third (tree below), reconstruct fourth (correlation
spine + receipts + access log).

---

## 1. Notification tree

| Role                         | Person                          | Reachable via                               |
| ---------------------------- | ------------------------------- | ------------------------------------------- |
| Product engineering owner    | Zeshan Ahmad                    | founder Slack DM, then phone                |
| Backend + broker integration | Daniel                          | GitLab issue on `refinity-main`, then Slack |
| Outside counsel              | (per current engagement letter) | counsel Slack channel, then phone           |
| Compliance advisor           | (per current engagement letter) | email + Slack                               |
| Founder / CEO                | Zeshan Ahmad                    | (self)                                      |

**Notification thresholds:**

| Severity                                                                                      | Who to notify             | When                              |
| --------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------- |
| SEV-1 (confirmed cross-account leak, credential compromise, or public exposure of NPII)       | All rows above            | within 30 minutes of confirmation |
| SEV-2 (probable leak, fail-closed spec turned red, upstream contract drift the schema caught) | Zeshan + Daniel + counsel | within 2 hours                    |
| SEV-3 (dependency CVE with a fix, single failed CI gate that gates a merge)                   | Zeshan + Daniel           | next business day                 |

Every SEV-1 or SEV-2 opens a numbered incident ticket in the same
tracker as GAP-IDs so the follow-up path is uniform.

---

## 2. Flag kill-switches

Every new surface ships behind a feature flag defined in
`apps/web/src/lib/feature-flags/index.ts`. Flipping a flag from `on` to
`off` is the fastest rollback path — no revert, no redeploy, no cache
invalidation.

| Surface                           | Flag                                                       | Effect when flipped off                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin-portal proxy (per-endpoint) | `FLAG_ADMIN_PROXY_*` (14)                                  | The route returns an empty projection with no upstream call.                                                                                       |
| SSE bridge                        | `FLAG_ADMIN_PROXY_STREAM`                                  | `/api/v1/investor/stream` returns 404.                                                                                                             |
| F-track on-domain signup          | `FLAG_ALPHA_APPLICATION_ROUTE`                             | Signup returns 404; the old form URL redirects, so acquisition is degraded but not broken.                                                         |
| Alpha claim (G-track sync 1)      | `FLAG_ALPHA_CLAIM_ROUTE`                                   | `/alpha-claim` returns 404. Game-side handoffs land on a friendly "please contact support" page.                                                   |
| Account Controls Center (PR-F)    | `FLAG_ACCOUNT_CONTROLS_CENTER`, `FLAG_ACCOUNT_PREFS_PATCH` | Surface 4 becomes read-preview; edits return 404. Prevents further prefs writes but does not roll back accepted ones — history + receipts survive. |
| Records Center spine (PR-G)       | `FLAG_RECORDS_CENTER_SPINE`                                | Lineage route returns the historical preview shape.                                                                                                |
| Exception Review reframe (PR-H)   | `FLAG_EXCEPTION_REVIEW_REFRAME`                            | Legacy composition path continues.                                                                                                                 |

**How to flip:**

1. Set the env var on the running Cloud Run service:
   ```
   gcloud run services update refi-us-sec-ia \
     --update-env-vars FLAG_ADMIN_PROXY_STREAM=off
   ```
2. Cloud Run redeploys a new revision in seconds. Verify:
   ```
   curl -si https://<host>/api/v1/investor/stream | head
   ```
3. Post the flag name + timestamp in the incident channel.

**Do not** flip a flag as an emergency measure without opening an
incident ticket. Flag flips are also audit events.

---

## 3. Suspected cross-account leak

The most severe class. If a report claims an investor saw another
account's data:

### Step 1 — confirm or dismiss (target: 15 min)

- Grab the reporter's `correlation_id` and account id from Sentry or
  the report.
- Query Cloud Logging for:
  ```
  event="admin_portal_proxy.acl_violation"
    correlation_id="<theirs>"
  ```
  If the ACL layer fired, this is a caught event, not a leak — file as
  SEV-2 (the belt-and-braces control worked). Otherwise continue.
- Pull the last 15 min of the reporter's request log. Any route
  returning data with `account_id !=` their session-bound account id
  in the response body is a confirmed leak.

### Step 2 — stop the bleeding (target: 30 min from confirmation)

- Flip `FLAG_ADMIN_PROXY_*` for the offending route class to `off`
  (see §2).
- If the leak was via SSE, flip `FLAG_ADMIN_PROXY_STREAM` to `off`.
- Notify per the SEV-1 row of §1.

### Step 3 — preserve evidence (target: 1 hour)

- Export the affected Cloud Logging query to a durable bucket:
  ```
  gcloud logging read '...' --format=json > incident-<id>.json
  ```
- Snapshot the durable driver's `receipt` + `record-access-log`
  collections for the affected account and any account whose data the
  leak may have touched. Firestore export:
  ```
  gcloud firestore export gs://refi-audit/incident-<id>/
  ```
- Attach both to the incident ticket.

### Step 4 — reconstruct (target: 24 hours)

- Walk the correlation spine from the leaked data back to its origin:
  `correlation_id` → `action_id` → `intent_id` → `plan_id` → `order_id`.
- If the origin is upstream (Admin Portal / Daniel), open a GitLab
  issue on `refinity-main` with the same correlation id.
- If the origin is the BFF (a schema drift, a projection bug, a
  cache-key collision), open a Gap Register V3 entry and write the
  contract assertion that would have caught it _before_ landing the
  fix.

### Step 5 — communicate

- Draft a factual notification to affected users (counsel approves
  first).
- Publish a post-mortem to the internal wiki within one business week.
  Public post-mortems for institutional clients follow the engagement
  agreement.

---

## 4. Credential compromise

If a session secret, service token, or signing key may be exposed:

| Credential                                                   | Location       | Rotation procedure                                                                                                                                                                                       |
| ------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_JWT_SECRET`                                         | Secret Manager | Rotate; all existing sessions invalidated on next request. Users re-authenticate.                                                                                                                        |
| `ADMIN_PORTAL_SERVICE_TOKEN`                                 | Secret Manager | Rotate + notify Daniel to reissue the corresponding upstream credential in the same window.                                                                                                              |
| `ALPHA_HANDOFF_PUBLIC_KEY_JWK`                               | Cloud Run env  | Rotate on the game side first (Edge Function secret store), then update the BFF env. Any in-flight tokens signed with the old key are 401 during the swap window (acceptable per §2.3 friendly re-mint). |
| `SESSION_SECRET`, `IP_HASH_SECRET`, `ELIGIBILITY_JWT_SECRET` | Secret Manager | Rotate; users re-authenticate; hashed IP audit trail resets (documented in the incident ticket).                                                                                                         |

**After every rotation:** run the full E2E suite against the rotated
credentials in staging before shifting production traffic.

---

## 5. Upstream contract drift

If Daniel's Admin Portal ships a change that our strict schema rejects
(fail-closed 500s):

1. The affected proxy route surface is already returning 500 with a
   named error field, so investors see a clean "temporarily
   unavailable" state, not a leak.
2. Grab the failing field name from the log; add it to the endpoint
   module's schema (either accept the new field into the projection,
   or add it to `WIRE_ADMIN_FIELDS` for redaction). Same PR updates
   the JSON Schema artifact (`pnpm export-schemas`).
3. Notify Daniel with the schema diff so his D7 job flips green on
   the same landing.
4. If drift is unexpected (Daniel did not announce), open a Gap
   Register V3 entry — a contract change without notice is itself an
   incident.

**Do not** loosen the schema to `.passthrough()` or `.strip()` as a
shortcut. That reopens the S4a fail-closed guarantee and every
downstream consumer inherits the new field silently. The correct fix
is always: name the field, decide its class (investor or admin),
project or redact accordingly.

---

## 6. CI gate failure

The four enforcement gates are typecheck, lint, tripwire,
contract-test — plus the security additions: proxy-redaction-fuzz,
export-schemas, route-manifest, gitleaks, osv-scanner. Every merge
requires all green.

If a gate turns red on `main` (not just a feature branch):

1. Revert the offending commit. Do **not** disable the gate.
2. Open a Gap Register V3 entry describing why the gate was insufficient
   to catch the class of change that broke it.
3. Land the fix as a new commit with the gate re-passing.

---

## 7. Post-incident checklist

Every SEV-1 or SEV-2 close-out delivers:

- [ ] Post-mortem doc in the internal wiki (blameless, factual).
- [ ] At least one new automated check (contract assertion, e2e,
      fuzz case, gate) that would have caught the incident.
- [ ] Gap Register V3 entry updated with the incident id.
- [ ] Notification tree revisited — did the right people learn about it
      in the right window?
- [ ] Any tooling gap (log query, dashboard, kill-switch) filed as an
      infrastructure ticket.

Post-mortems are read by counsel and by the eventual SEC examiner.
Write for both audiences.

---

## 8. Runbook maintenance

- Reviewed quarterly during the Sprint 6 alpha-gate cycle.
- Updated within the same PR that adds a new external dependency,
  a new secret, a new flag surface, or a new mutating investor route.
- The doc's `Version` header + `updated` marker at the top track
  every substantive change.
