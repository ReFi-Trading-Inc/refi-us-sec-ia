# Incident Response Runbook — refi-us-sec-ia

Status: living document. Owner: Zeshan. Review: each phase gate and after any drill.

Purpose: a concrete, do-this-now procedure for security incidents affecting the
investor shell — with emphasis on the incident classes this system is most exposed
to today: cross-account data exposure, auth bypass, and handoff-token abuse.

Scope: `apps/web` (shell + BFF). Broker/exec incidents route to the `refinity-main`
on-call. Where an incident spans both, both on-calls are paged.

---

## 0. Severity & first move

| Sev  | Definition                                                                            | First move                                                            |
| ---- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| SEV1 | Confirmed cross-account data exposure, auth bypass in a reachable env, or secret leak | Page owner + counsel immediately; begin containment before root-cause |
| SEV2 | Suspected exposure/bypass, or a control regressed (e.g. CSRF/origin off)              | Page owner; contain the affected surface                              |
| SEV3 | Vulnerability with no evidence of exploitation                                        | Open issue, schedule fix                                              |

**Golden rule:** contain and preserve evidence _before_ debugging. Do not delete
logs, store files, or redeploy over the affected build until evidence is captured
(§3).

---

## 1. Kill switches (fastest containment)

Applied via environment + redeploy (Vercel/Cloud Run) unless noted. These are the
current levers on `main`:

| Lever                                              | Effect                                                  | How                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `REFI_ENV=staging`/`prod`                          | Disables the auth dev-fallback (fail closed)            | env var; redeploy                                                                       |
| `FLAG_ALPHA_CLAIM_ROUTE` unset/≠`on`               | 404s the game handoff route immediately                 | env var; redeploy                                                                       |
| Rotate `SESSION_JWT_SECRET`                        | Invalidates all existing sessions (forces re-auth)      | env var; redeploy                                                                       |
| Rotate `ALPHA_HANDOFF_PUBLIC_KEY_JWK`              | Rejects all in-flight handoff tokens                    | env var; coordinate with game                                                           |
| Rotate `IP_HASH_SECRET` / `ELIGIBILITY_JWT_SECRET` | Invalidates eligibility cookies + audit-hash continuity | env var; redeploy                                                                       |
| Take the deploy offline                            | Full stop                                               | Vercel: disable/rollback deployment; Cloud Run: route traffic to a maintenance revision |
| Roll back to prior revision                        | Revert a bad build                                      | Vercel: promote previous deployment; Cloud Run: `update-traffic` to prior revision      |

> When feature flags become a module (Phase 2.6), per-route kill switches replace
> some of the above. Update this table when that lands.

---

## 2. Playbooks

### 2.1 Suspected cross-account data exposure (SEV1)

1. Contain: take the affected route/surface offline (rollback or flag). If the leak
   vector is the outbound proxy (Phase 2.6), disable that route.
2. Preserve evidence (§3) — especially `RecordAccessLog` and `InvestorActionReceipt`
   entries around the window.
3. Scope: from access logs, enumerate which `authId`/`accountId` pairs saw data not
   their own. Determine record classes involved.
4. Notify: owner + counsel (§4). Cross-account exposure of a regulated account is a
   potential regulatory/notification event — counsel decides on obligations.
5. Root cause, fix behind a test, redeploy, then restore the surface.

### 2.2 Auth bypass / impersonation (SEV1)

1. Contain: set `REFI_ENV=prod`, rotate `SESSION_JWT_SECRET` (invalidates sessions),
   redeploy. Confirm the reachable env is not in `dev` mode.
2. Verify the fail-closed controls (#23/#31) are present in the running build
   (check the deployed commit).
3. Preserve evidence; enumerate sessions active during the window.
4. Notify owner + counsel. Fix + regression test before restoring normal auth TTLs.

### 2.3 Handoff-token abuse (SEV2)

1. Rotate `ALPHA_HANDOFF_PUBLIC_KEY_JWK` (coordinate with the game's mint) and/or set
   `FLAG_ALPHA_CLAIM_ROUTE` off to stop claims.
2. Inspect the consumed-jti store for replays / anomalous volume.
3. If forgery is suspected (signature failures spiking), treat the game's private key
   as potentially compromised — page the game on-call.

### 2.4 Secret leak in repo/build (SEV1)

1. Rotate the leaked secret immediately (see §1). Assume it is compromised.
2. Purge from history if committed; confirm `gitleaks` CI gate is active (#29).
3. Notify owner + counsel if the secret protected regulated data.

### 2.5 Dependency/supply-chain advisory (SEV3→ escalate if exploited)

1. Triage via the CI dependency scan (#29) / Dependabot.
2. Patch via Renovate PR; if actively exploited, treat as SEV1 and contain.

---

## 3. Evidence preservation

Before any redeploy/rollback that would replace the affected build:

- Record the **deployed commit SHA** and the Vercel/Cloud Run deployment id.
- Snapshot the prototype/durable store state for the affected entities (receipts,
  record-access-log, decision records) — do not mutate them.
- Capture platform request logs for the window (Vercel/Cloud Run) and any Sentry
  events. Note `correlation_id`s — they thread the BFF audit spine.
- Save the exact env-var configuration (names only; never paste secret values into
  tickets).
- Store all of the above in the incident ticket; retain per the records-retention
  posture. Records that are Rule 204-2 books-and-records must not be deleted.

---

## 4. Notification tree

1. **Owner / security:** Zeshan (zeshan@refi.trading) — always, all SEV1/SEV2.
2. **Counsel:** engaged for any confirmed/suspected exposure of regulated data,
   cross-account leak, or secret leak protecting such data. Counsel decides
   regulatory-notification obligations.
3. **Backend on-call (`refinity-main`):** for any incident touching the proxy seam,
   broker path, or Spanner records.
4. **Game on-call (`refi-man-vs-machine`):** for handoff-token forgery / key
   compromise.

---

## 5. Post-incident

- Write a blameless post-mortem: timeline, root cause, blast radius, evidence,
  remediation, and the regression test that now prevents recurrence.
- File follow-up issues; link them here.
- If a control was missing, add it to the [threat model](security-threat-model.md)
  risk register.
- Schedule the next drill (§6).

## 6. Drills

Run a tabletop of §2.1 (cross-account exposure) and §2.2 (auth bypass) at least once
per phase gate. Verify each kill switch in §1 actually works in staging (rotate a
secret, confirm sessions invalidate; flip the handoff flag, confirm 404).
