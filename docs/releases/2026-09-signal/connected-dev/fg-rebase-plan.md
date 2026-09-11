# PR F (#114) / PR G (#115) plan — REVISED after Daniel's 2026-09-11 response

**Daniel answered (see `daniel-response-2026-09-11.md`).** The interim six-state cohort allowlist is rejected in favour of a backend-owned membership object, and the backend will persist the canonical admission itself. F/G therefore cannot be rebased and merged as written. Revised path:

1. Founder decision F1: (a) re-scope F/G into a non-authoritative admission-readiness projection kept until the backend exposes its admission state, or (b) close F/G and re-implement against the addendum. Either way, G's atomic `KVStore.update` remains reusable.
2. Wait for the contract addendum: membership object (positive states, expiry, revocation), backend admission projection (state, reasons, rule version, evidence history), and the confirmation that `createComplianceProfileAttestation` with provider = Socure + evidence ref is the KYC evidence path.
3. Bind the cohort prerequisite to the membership object; delete `ALPHA_COHORT_POSITIVE_STATES`.
4. Replace the ReFi admission record's authority with the backend projection; keep at most a read-side mirror and the trigger points (KYC result, consent, profile) that submit evidence.
5. Rebase → protected CI → founder review → merge, F then G (or the re-implemented replacement).

Original plan (superseded, retained for history):

Held heads: F `133f6a5`, G `8e5eaee`. Do not rebase or merge before both answers exist.

1. Take Daniel's cohort-authority answer. If a dedicated membership object/field is provided, replace the interim `ALPHA_COHORT_POSITIVE_STATES` allowlist with that positive field (still fail-closed); if he CONFIRMs the six onboarding states, keep the allowlist and record the addendum reference in `alpha-admission.ts`.
2. Modify F/G accordingly; keep the enum pin assertion or replace it with a pin on the new field.
3. Take Daniel's canonical-admission answer. If the backend persists admission, add the service-to-service write adapter (new contract version/addendum) and keep the ReFi record as the product-side mirror; if the attestation + onboarding state is sufficient, record that explicitly and remove the "unknown" wording.
4. Remove obsolete assumptions from `decision-alpha-admission-automatic.md`, readiness rows, CONTROL_MATRIX IB-20, packet 9a/9b.
5. Retarget F to `main`, rebase on current main, push → protected CI on the exact head.
6. Merge F only after founder review and green checks.
7. Retarget G to `main`, rebase on the new main, push → protected CI on the exact head.
8. Merge G only after founder review and green checks.
9. Decide the brokerage-connection hard deny for non-admitted users in connected-native mode (demo stays isolated) as a separate small PR after G.
10. Re-run the full E2E lanes on the resulting main.
