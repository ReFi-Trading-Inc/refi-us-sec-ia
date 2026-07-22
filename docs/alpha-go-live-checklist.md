# US Alpha go-live readiness checklist

Status of the game→shell alpha funnel against a US SEC-registered-adviser
launch. **Counsel owns the final gate** — the ⚖️ items are legal determinations,
not engineering tasks. Nothing here is legal advice.

Legend: ✅ done & live · 🟡 built, not activated · 🔴 not built / open · ⚖️ counsel

Repos: **shell** = `refi-us-sec-ia` (SEC investor product) · **game** =
`refi-man-vs-machine` · **backend** = `refinity-main` (Daniel).

---

## A. Compliance-critical controls (the guardrails) — largely ✅

These are the controls that make the funnel defensible; they are built and tested.

- ✅ **Investor/admin boundary** enforced in types + the `tripwire` CI gate; no per-trade affordance. (shell)
- ✅ **Behavioral-data firewall (§6.6):** alpha-claim's strict claim allowlist provably rejects the ten DimensionCode scores / any unknown claim. Tested. (shell, PR #16)
- ✅ **Auth fails closed** + same-origin CSRF on mutations. (shell, PR #31)
- ✅ **Threat model + incident-response runbook** present. (shell, PR #32; `docs/`)
- ✅ **Handoff token discipline:** ES256, iss/aud pinned, strict claims, single-use jti (idempotent). (shell PR #16 + game PR #3)

---

## B. Engineering / infra items

### B1. Shell (BFF)

| Status | Item                                                                                                                      | Owner        | Ref              |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------- |
| ✅     | alpha-claim route live, fail-closed, verified on prod                                                                     | eng          | PR #16           |
| ✅     | auth fail-closed; CSRF on mutating routes                                                                                 | eng          | PR #31           |
| 🟡     | **durable books-and-records store** (Firestore) — built; **not activated** (backing still `prototype` = ephemeral `/tmp`) | you (infra)  | PR #36 / #18,#27 |
| 🟡     | shell `ALPHA_HANDOFF_PUBLIC_KEY_JWK` = the game's **real** public key                                                     | you (infra)  | —                |
| 🔴     | reused-jti status decision (§2.3 409 vs §2.7 idempotent)                                                                  | you + eng    | #17              |
| 🔴     | rate limiting on investor routes (distributed)                                                                            | eng+infra    | #19, #26         |
| 🔴     | `exp ≤ 10 min` max-age check on the token                                                                                 | eng          | #21              |
| 🔴     | server-side `handoff.claimed` + PostHog identity stitch                                                                   | eng          | #20              |
| 🔴     | onboarding past eligibility (email-native; resolve SIWE **wallet wall / D8**)                                             | you + Daniel | D8               |
| 🟡     | close stale issues fixed by #31 (#24, #25, #26-CSRF)                                                                      | eng          | #24,#25          |
| 🔴     | CSP `connect-src` allowlist + wallet code-split                                                                           | eng          | #30              |
| 🟡     | CI security gates (secret scan + audit landed; **E2E-in-CI** deferred)                                                    | eng          | #29              |

### B2. Game

| Status | Item                                                                                                                                    | Owner       | Ref        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 🟡     | retro/ASCII landing (labeled sims, meta/OG, a11y) — PR open, **not merged/deployed**                                                    | you         | game PR #4 |
| 🟡     | handoff mint service (Cloud Run) + client CTA — PR open, **not deployed**                                                               | you (infra) | game PR #3 |
| 🟡     | verified Firebase identity as `sub` — PR open; needs Firebase project + `REQUIRE_VERIFIED_IDENTITY=true`                                | you (infra) | game PR #5 |
| 🔴     | RLS owner-scoping (currently `USING(true)` — anon can read/write any row)                                                               | eng         | game       |
| 🔴     | §62 result-category labels on **all** performance visuals (landing done; rest pending) + backtest framing on real-performance game copy | eng + ⚖️    | game       |
| 🔴     | G0 typecheck debt (`covidArena.ts` etc., spec §3.3)                                                                                     | eng         | game       |
| 🔴     | anon→magic-link email upgrade; key **progress by uid** (CRUD migration off Supabase)                                                    | eng         | game       |

### B3. Handoff / deploy (activates the funnel end-to-end)

| Status | Item                                                                    | Owner     |
| ------ | ----------------------------------------------------------------------- | --------- |
| 🔴     | ES256 key exchange: private → Cloud Run secret; public → shell env      | you       |
| 🔴     | Deploy Cloud Run mint service (`terraform apply`, image, DB URL secret) | you       |
| 🔴     | Provision Postgres (Neon → Cloud SQL) + `DATABASE_URL`                  | you       |
| 🔴     | Set game `VITE_HANDOFF_URL` + `VITE_FIREBASE_*`; deploy the game        | you       |
| 🔴     | One real end-to-end run on prod (play → claim → 201 → eligibility)      | you + eng |

### B4. Backend (Daniel) — compatible, not integrated

| Status | Item                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Alpha funnel respects the hard boundary; no collision with Daniel's trade contracts                                                |
| 🔴     | Admin Portal proxy (live investor data) is on the **unmerged Phase 2.6 branch** — shell is mock/fixture on `main`                  |
| 🔴     | Daniel dependencies for live mode: staging URL+creds (D4), canonical AccountPrefs writer + parity (D6), account-auth decision (D8) |

---

## C. Counsel / legal gate ⚖️ (not engineering)

- ⚖️ Adviser **registration / ADV status** confirmed for the states in scope.
- ⚖️ **Marketing Rule** review of every advisory-service claim on any public/investor-facing surface (the funnel becomes an examinable advertisement).
- ⚖️ **Hypothetical-performance** treatment: the game's simulation results + any RF/RL pipeline figures need documented HYPOTHETICAL/BACKTEST framing + disclosures (Machine Ladder L3–5 per spec).
- ⚖️ **TACO likeness** flag (`FLAG_TACO_LIKENESS`, spec §6.5) — right-of-publicity sign-off before enabling.
- ⚖️ **Privacy / deletion** (§2.8): CCPA/CPRA delete cascade (game + waitlist + analytics) vs Rule 204-2 retention line documented.
- ⚖️ **Data residency:** confirm US-region for player + waitlist data (Firestore `nam5` set; game DB TBD).

---

## D. Minimum gate to a real (invited) alpha

1. **Activate durability** (B1 #27) — no launch while signups persist to ephemeral `/tmp`.
2. **Deploy + key-exchange the handoff** (B3) and run one verified end-to-end.
3. **Turn on verified identity** (game PR #5) so `sub` is a real user.
4. **Game compliance pass** (B2: RLS owner-scoping + §62 labels/backtest framing).
5. **Resolve the onboarding path** past eligibility (D8) — else claimed users dead-end.
6. **Counsel sign-off** on Section C.

Until 1–6, treat this as _alpha infrastructure in progress_, not a launch-ready product.
