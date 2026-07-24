# Daniel Dependency Ledger (Phase 2.6)

**Anchor:** Sprint Plan v3, 2026-07-09
**Owner:** Zeshan (this repo) tracks, Daniel (refinity-main) resolves.
**Cadence:** review in weekly sync; escalate via the README integration scoreboard once Sprint 2 is in flight; final escalation is Daniel's own CI failing against the contract schemas (D7).

This ledger enumerates every open dependency on Daniel's side that gates
either a merge, a live-mode flip, or an Alpha 1 scope decision on this
side. Requested-by dates are the point at which the item becomes
scoreboard-visible, not the point at which we stop shipping — the
fixture-first operating principle means construction never blocks on
Daniel; only _flipping to live_ does.

## Legend

- **Blocks merge** — PR-D, PR-E, PR-F, PR-G, PR-H cannot ship without this.
- **Blocks live flip** — the surface is built and tested against fixtures;
  flipping the backing from `msw` / `prototype` to `backend` is the gated
  moment.
- **Alpha 1 scope** — the item does not gate this repo's work, but it
  shapes the funnel or the broker path that Alpha 1 rides.

## Items

### D1 — AccountPrefs History Contract ratification

- **Requested by:** 2026-07-24
- **Status:** Open
- **Gates:** PR-D merge, PR-F, PR-F live flip (via D6)
- **Ask:** Ratify the DDL, write procedure, retention scope, and material-change list documented in `docs/phase2-6-account-prefs-history-contract.md`. Architecture Option 3c was ratified 2026-05-30; this is the operational contract that follows.
- **Escalation:** If not ratified by Jul 24, PR-D ships behind a feature flag on the interim durable store (Firestore, per D3 decision doc) and the ledger item becomes the first scoreboard row.

### D2 — Admin Portal consumption map route-by-route ratification

- **Requested by:** 2026-07-17
- **Status:** Open
- **Gates:** PR-E merge (proxy core + endpoint modules)
- **Ask:** Route-by-route ratification of the 65-row consumption map in `docs/phase2-6-admin-portal-api-consumption-map.md`. For each row: confirm the upstream shape, TTL, allow-list of investor-visible fields, and any admin-only fields to redact. Disputed rows can ship with the route flagged and the row annotated in the map.
- **Escalation:** Merge PR-E on the ratified subset if D2 slips past Jul 27 (end of Sprint 1); disputed routes remain dark and appear on the scoreboard.

### D3 — `reduce_only` backend-state mapping

- **Requested by:** 2026-08-04 (Sprint 4 kickoff)
- **Status:** Open
- **Gates:** PR-H `reduce_only` toggle (one control only; the rest of PR-H ships without it)
- **Ask:** Confirm how `reduce_only` maps to the TradingControlStates row on the backend — is it a distinct control kind, a modifier on `pause_autopilot`, or a policy-scoped flag? Also confirm the resume semantics.
- **Escalation:** Ship PR-H with the `reduce_only` toggle stubbed and flagged dark until resolved.

### D4 — Staging Admin Portal base URL + service-to-service auth credentials

- **Requested by:** 2026-08-11 (Sprint 5 start)
- **Status:** Open
- **Gates:** Sprint 5 live flip on read-only projections
- **Ask:** Terraform-output values: `ADMIN_PORTAL_BASE_URL` (staging), the service account credential our BFF uses to authenticate to the admin portal, and the account-scoping header contract (`x-investor-account-id` or equivalent).
- **Escalation:** No fallback; without D4, the scoreboard stays red on every live-mode row.

### D5 — Sample payloads from staging for parity validation

- **Requested by:** 2026-08-11 (Sprint 5 start)
- **Status:** Open
- **Gates:** Sprint 5 conformance suite
- **Ask:** One representative payload per Contract V3 projection: intents, risk decisions, orders (lifecycle), fills, control states, reconciliation. Raw upstream shapes, not post-BFF.
- **Escalation:** Any drift found by the strict Zod schemas becomes a ledger item with file:line evidence; the scoreboard names the exact unexpected field.

### D6 — Canonical AccountPrefs writer in `apps/common` + parity fixture set

- **Requested by:** 2026-08-11 (Sprint 5 target for live flip)
- **Status:** Open
- **Gates:** AccountPrefs live-mode flip (PR-F merges without this — ships on the interim durable driver)
- **Ask:** Land the canonical writer in `apps/common` per Contract V3 §13.1, plus a parity fixture set our conformance suite can validate our TS port against.
- **Escalation:** PR-F stays on the durable Firestore driver behind a flag; scoreboard row is amber until D6 lands.

### D7 — CI job in refinity-main validating Admin Portal responses against Contract V3 JSON Schemas

- **Requested by:** 2026-07-17 (framed as scope-reduction; no hard date)
- **Status:** Open
- **Gates:** Nothing on our side; converts human pressure to automated pressure
- **Ask:** Add one job to the GitLab pipeline that validates his Admin Portal responses against the versioned JSON Schemas this repo publishes as a CI artifact (Sprint 2 deliverable). Snippet will be provided.
- **Escalation:** Not a merge blocker. If declined, the scoreboard's live-mode rows still catch drift on our side; D7 just catches it on his side too, before we do.

### D8 — Wallet-decoupled account auth

- **Requested by:** 2026-07-17 (bundled with D2 email)
- **Status:** Open
- **Gates:** Alpha 1 conversion UX and the game-to-product funnel; blocks no merges in this repo
- **Ask:** Decouple product account identity from the wallet. Email (magic link or passkey) creates the product account and carries the user through eligibility, KYC, advisory profile, and Signal mode. Wallet is linked at the ExecutionPolicy signing step where it has a function. Fallback if `auth-siwe` cannot support this by alpha: embedded wallet creation via the existing WalletConnect stack so the connect step requires no extension install.
- **Framing for Daniel:** This is scope _reduction_ for his Alpha 1 blocking surface, not scope addition. Signal-mode alpha under the decoupled design requires no wallet from him at all; Managed-mode is where the wallet re-enters. It also removes the extension-install friction from the top of the funnel — which is where the ReFi Alpha USA Build and Integration Specification's game hand-off lands people.
- **Escalation:** Not a merge blocker. If D8 is declined, the game→product funnel eats a wallet-connect step per user and we lose the option of magic-link-only Signal-mode alpha.

## Summary table

| #   | Item                                        | Blocks                              | Requested-by | Status |
| --- | ------------------------------------------- | ----------------------------------- | ------------ | ------ |
| D1  | AccountPrefs History Contract ratification  | PR-D merge, PR-F live flip          | 2026-07-24   | Open   |
| D2  | Consumption map route-by-route ratification | PR-E merge                          | 2026-07-17   | Open   |
| D3  | `reduce_only` backend-state mapping         | PR-H reduce-only toggle             | 2026-08-04   | Open   |
| D4  | Staging Admin Portal URL + service auth     | Sprint 5 live flip                  | 2026-08-11   | Open   |
| D5  | Sample payloads per projection              | Sprint 5 conformance                | 2026-08-11   | Open   |
| D6  | Canonical AccountPrefs writer + fixtures    | AccountPrefs live flip only         | 2026-08-11   | Open   |
| D7  | Contract-schema CI job in refinity-main     | Nothing on our side (bidirectional) | 2026-07-17   | Open   |
| D8  | Wallet-decoupled account auth               | Alpha 1 UX and funnel; no merges    | 2026-07-17   | Open   |

D1 and D2 are the only items that gate merges on this side. D4 through D6
gate live mode only. D7 is a request, not a blocker. D8 is a strategic
decision that changes the Alpha 1 blocking surface on Daniel's side.
