# Incident response — conformance summary

Status: IMPLEMENTED (evidence cited)

The operative incident-response procedure is the existing runbook at
**`docs/incident-response-runbook.md`** (owner: Zeshan; living document;
reviewed at each phase gate and after any drill). This document does not
replace it. It maps the runbook to the elements a vendor questionnaire asks
about and records where the runbook is silent. The customer-notification
decision criteria in §3 were added to the runbook (§4a) by the same change
that created this pack.

## 1. Conformance matrix

| Element                           | Runbook coverage                                                                                                                                            | Assessment                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Detection                         | Sources named in §3 (platform request logs on Vercel/Cloud Run, Sentry events, correlation ids); CI gitleaks and dependency scan feed §2.4/§2.5.            | Covered. No automated alerting is described; migration plan §14 defines Cloud Monitoring uptime checks (planned). |
| Triage / severity                 | §0 severity table (SEV1/2/3) with a first move per level.                                                                                                   | Covered.                                                                                                          |
| Containment                       | §1 kill switches (env-driven fail-closed, secret rotation, flag off, take offline, roll back); §2 playbooks lead with "Contain".                            | Covered.                                                                                                          |
| Eradication                       | §2 playbooks: root cause, fix behind a regression test, purge leaked secrets from history.                                                                  | Covered.                                                                                                          |
| Recovery                          | §2: redeploy then restore the surface; §1 rollback levers; §3 forbids redeploying over the affected build before evidence capture.                          | Covered.                                                                                                          |
| Evidence preservation             | §3: deployed SHA and deployment id, store snapshots, platform logs, Sentry, correlation ids, env names only, retention per records posture.                 | Covered.                                                                                                          |
| Incident owner                    | Header and §4: Zeshan owns; always notified on SEV1/SEV2.                                                                                                   | Covered.                                                                                                          |
| Escalation                        | §4 notification tree: owner → counsel → backend on-call (`refinity-main`) → game on-call.                                                                   | Covered.                                                                                                          |
| External / customer communication | §4: counsel decides regulatory-notification obligations. Criteria for when a customer is notified were absent.                                              | **Gap closed by runbook §4a** (see §3 below).                                                                     |
| Emergency contact                 | §4 names the owner's contact.                                                                                                                               | Covered. No second contact / backup is named — single-person dependency; state this on questionnaires.            |
| Postmortem                        | §5: blameless postmortem with timeline, root cause, blast radius, evidence, remediation, regression test; follow-ups linked; threat-model register updated. | Covered.                                                                                                          |
| Drills                            | §6: tabletop of §2.1 and §2.2 at each phase gate; kill-switch verification in staging.                                                                      | Prescribed. **No drill record exists in the repository.**                                                         |

## 2. Socure-specific additions (policy; to be folded into the runbook when the integration lands)

- A suspected exposure of Socure credentials (`SOCURE_API_KEY`) is SEV1 under
  §2.4: rotate in the Socure dashboard first, then redeploy with the new
  Secret Manager version, then investigate.
- A suspected exposure of applicant PII, identity documents, or DocV session
  data is SEV1 under §2.1 (treat it as cross-account data exposure of
  RESTRICTED data). Notify Socure through its security contact as well as
  counsel, because Socure is the processor of record for that data.
- Webhook forgery or replay against a future Socure callback is SEV2 under the
  §2.3 pattern (rotate the webhook secret, inspect consumed-event ids).

## 3. Customer-notification decision criteria

Recorded in the runbook as §4a and repeated here for the questionnaire.

Counsel makes the final determination of any legal notification duty. The
following criteria decide whether the owner escalates a customer-notification
decision to counsel and prepares a draft notice, so that the decision is made
on facts rather than defaulting to silence:

1. **Confirmed unauthorized access to, or disclosure of, RESTRICTED data**
   (authentication secrets that protect customer accounts, SSN/national ID,
   KYC applicant PII, identity documents, biometrics) belonging to an
   identifiable customer or applicant → escalate to counsel within 24 hours
   of confirmation; prepare a notice.
2. **Confirmed cross-account exposure** of CONFIDENTIAL records (one investor
   seeing another's records) → escalate; notice to the affected investors
   unless counsel determines otherwise.
3. **Suspected but unconfirmed exposure** → no customer notice yet; counsel
   informed; evidence collection continues with a 72-hour checkpoint to
   confirm or close.
4. **Secret leak with no evidence of access** (rotated before any use is
   observed) → no customer notice by default; documented in the postmortem.
5. **Vendor-side incident** (Socure, Stytch, Google Cloud, Vercel) affecting
   ReFi data → treated under criteria 1–3 once the vendor's report is
   received; ReFi does not wait for the vendor's own customer notice.
6. **Regulatory triggers** (state breach-notification statutes, Reg S-P
   requirements as applicable) are evaluated by counsel in every case above;
   the owner supplies the evidence package from runbook §3.

Content of a notice: what happened, what data, when, what ReFi did, what the
customer should do, and how to reach ReFi. No speculation; no data of other
customers.
