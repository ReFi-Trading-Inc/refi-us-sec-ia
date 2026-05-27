# Phase 2.5 Replacement E2E Backlog

**Owner of this backlog:** `phase2-5-wip-rebase` branch.
**Sibling doc:** `docs/phase2-5-post-rebase-checkpoint.md`.
**Status:** 16 e2e tests suspended (`test.skip(...)`) pending the replacement coverage below. The branch **does not merge** until §A–§D land as passing specs.

---

## Why this backlog exists

During the Phase 2.5 → post-Surface-7 rebase, two existing Phase 2.5 e2e suites bound to affordances that no longer exist:

- `compliance-fail-closed.spec.ts` (11 tests) bound to a per-rec "Approve for execution" button rendered by `apps/web/app/us/app/_components/CompliancePreview.tsx`. The component and the button were removed in Phase 2.5R-19. Phase 2 Surface 1 + Surface 7 took the same boundary further: the tripwire (`scripts/tripwire-investor-boundary.ts`) now blocks the `approve for execution` label entirely.
- `persona-switch.spec.ts` (5 of 6 tests) bound to literal copy strings (`"connected — fresh"`, `"data is stale"`, `"0 of 5 acknowledged"`, `"acknowledge regulatory disclosures"`, the removed `REVIEW_TAX_IMPACT` badge) that the new Dashboard / BrokerStatusBanner components no longer surface as exact text.

We are intentionally **not** restoring the removed affordances. Doing so would reintroduce the per-trade Accept boundary breach that Surface 1 + Surface 7 explicitly prohibit. Instead we are committing to replacement coverage that:

- proves the fail-closed compliance behavior **structurally** (no per-trade Approve path can exist),
- proves compliance verdict states still drive non-executing UI without a per-trade button,
- replaces brittle copy assertions with stable `data-testid` attribute assertions, and
- confirms support remains non-advisory.

---

## Hard rules (carry forward from the rebase)

- **Do not** reintroduce `CompliancePreview.tsx`.
- **Do not** reintroduce an "Approve for execution" / "Submit" / per-rec "Accept" button on investor recommendation detail.
- **Do not** reintroduce `accept_trade`, `investor-accept`, `approve_exception`, `reject_exception` in any user-facing context.
- **Do not** add staff / founder / admin / operator review affordances.
- **Do not** delete the suspended tests until their replacements ship — they act as a checklist.
- **Do not** weaken the tripwire's `FORBIDDEN_ACTION_IDS` or `FORBIDDEN_LABELS` lists.
- **Do not** touch Daniel's backend repo.

---

## §A — Structural fail-closed compliance test

**Goal.** Prove there is no per-trade submit / approve / accept path on investor recommendation detail, regardless of compliance verdict.

**File.** `apps/web/e2e/compliance-fail-closed-structural.spec.ts` (new). When this spec lands, delete or fully rewrite `apps/web/e2e/compliance-fail-closed.spec.ts`.

**Required test cases (stable data-testid only):**

1. **Managed recommendation detail does not render any of the legacy per-trade controls.**
   For a Managed-tier persona on `/us/app/recommendations/<id>`:
   - `getByTestId("signal-place-order-button")` → `toHaveCount(0)`
   - `getByTestId("signal-order-entry")` → `toHaveCount(0)`
   - `getByTestId("managed-place-order-button")` → `toHaveCount(0)`
   - `getByTestId("order-submit-button")` → `toHaveCount(0)`
   - `getByTestId("investor-accept")` → `toHaveCount(0)`
   - `getByTestId("accept-trade-button")` → `toHaveCount(0)`
   - `getByTestId("approve-trade-button")` → `toHaveCount(0)`
   - `getByTestId("approve-recommendation-button")` → `toHaveCount(0)`
2. **Managed recommendation detail does not render the legacy copy.**
   Same page, for each of `Accept Recommendation`, `Approve Trade`, `Approve Recommendation`, `Accept and Execute`, `Approve for Execution`, `Manual Rebalance`, `accept_trade`, `approve_exception`, `reject_exception`, `execute exception`, `override guardrail`, `override risk`, `investor accept`, `investor-accept`:
   - `getByText(<phrase>, { exact: false })` → `toHaveCount(0)`.
3. **Signal recommendation detail does not render broker order submission.**
   For a Signal-tier persona on `/us/app/recommendations/<id>`:
   - Same testid + copy assertions as (1) and (2).
4. **Review-required recommendation routes to Exception Review only.**
   For a Managed-tier persona with a recommendation flagged review-required:
   - Detail page renders an "Open Exception Review" link/CTA with stable testid (e.g., `getByTestId("recommendation-detail-exception-cta")`).
   - Following the CTA navigates to `/us/app/exceptions` (URL assertion).
5. **Exception Review resolution never submits a broker order directly.**
   For a Managed-tier persona on `/us/app/exceptions`:
   - Resolving any exception (dismiss, pause Managed, route to profile / disclosure / broker) does NOT cause any `POST /v1/orders` or `POST /orders` or `POST /api/v1/investor/orders` network call. Verify via `page.on("request", …)` or by intercepting and asserting zero matching requests after each resolution.

---

## §B — Compliance verdict visibility replacement

**Goal.** Surface eligibility / review / exception information on recommendation detail **without** bringing back a per-trade Approve button.

**File.** `apps/web/e2e/compliance-verdict-visibility.spec.ts` (new).

**Required test cases:**

1. **Recommendation detail shows eligibility posture (or its absence).**
   For a Managed-tier persona on `/us/app/recommendations/<id>`:
   - `getByTestId("recommendation-detail-eligibility")` is visible.
   - `data-eligibility` attribute is one of `"eligible" | "review" | "deny" | "unavailable" | "loading"`.
2. **REVIEW verdict produces non-executing UI.**
   For a Managed-tier persona, scenario `?scenario=review_tax_impact` (or whatever the post-CompliancePreview replacement scenario id becomes):
   - `data-eligibility="review"`.
   - `getByTestId("recommendation-detail-review-reason")` is visible.
   - The detail page MUST NOT render any of the per-trade controls listed in §A.1.
3. **DENY verdict produces non-executing UI.**
   For a Managed-tier persona, scenario `?scenario=deny_*`:
   - `data-eligibility="deny"`.
   - `getByTestId("recommendation-detail-deny-reason")` is visible.
   - Same per-trade-control absence as (2).
4. **ALLOW state in Managed mode shows managed status, not a per-trade Accept button.**
   For a Managed-tier persona, scenario `?scenario=allow`:
   - `data-eligibility="eligible"`.
   - `getByTestId("recommendation-detail-managed-status")` is visible.
   - Same per-trade-control absence as (2).
5. **Loading state is non-executing.**
   For a Managed-tier persona before MSW responds:
   - `data-eligibility="loading"`.
   - Same per-trade-control absence as (2).

**Implementation note.** Adding these tests will require giving `apps/web/app/us/app/recommendations/[id]/page.tsx` stable `data-testid` and `data-eligibility` attributes on the eligibility / review / deny / managed-status blocks. The page already renders the data; only the test handles are missing.

---

## §C — Persona-switch replacement tests

**Goal.** Replace brittle copy regex assertions with stable `data-testid` + `data-*` attribute assertions on the Phase 2.5 BrokerStatusBanner and disclosure card.

**File.** `apps/web/e2e/persona-switch-stable.spec.ts` (new). When this spec lands, the five suspended cases in `apps/web/e2e/persona-switch.spec.ts` can be deleted.

**Required component changes (small, additive):**

- `apps/web/app/us/app/_components/BrokerStatusBanner.tsx` MUST expose:
  - `data-testid="broker-status-banner"`
  - `data-status` ∈ `"connected" | "stale" | "disconnected" | "loading"`
  - `data-freshness` ∈ `"fresh" | "stale" | "unknown"`
- The disclosure card on `/us/app/home` MUST expose:
  - `data-testid="disclosure-ack-card"`
  - `data-ack-count` (integer, count of acknowledged disclosures)
  - `data-total-count` (integer, total required disclosures)

These attributes are dev-tool affordances only; they do not change render output.

**Required test cases:**

1. **Maya (default) — broker is connected and fresh.**
   - `data-testid="broker-status-banner"` → `data-status="connected"`, `data-freshness="fresh"`.
2. **Sarah — broker stale.**
   - `data-testid="broker-status-banner"` → `data-status="stale"` OR `data-freshness="stale"`.
3. **David — no broker connection.**
   - `data-testid="broker-status-banner"` → `data-status="disconnected"`.
4. **Maya — disclosure card 0 of 5.**
   - `data-testid="disclosure-ack-card"` → `data-ack-count="0"`, `data-total-count="5"`.
5. **Persona switch updates stable attributes.**
   - Switch from Maya → Sarah via the persona cookie (`PERSONA_COOKIE`).
   - Re-read `data-testid="broker-status-banner"` `data-status`; assert it changed.
   - Re-read `data-testid="disclosure-ack-card"` `data-ack-count`; assert it changed.

---

## §D — Support-boundary preservation

**Goal.** Confirm support remains non-advisory and cannot mutate policy / exception / recommendation / execution state. The existing `apps/web/e2e/support-boundary.spec.ts` is already green; this section extends it.

**File.** Extend `apps/web/e2e/support-boundary.spec.ts` (do not create a new file).

**Required additional test cases:**

1. **Support route never exposes personalized recommendation language.**
   On `/us/app/support`:
   - `getByText(<phrase>, { exact: false })` → `toHaveCount(0)` for each of: `Buy this`, `Sell this`, `you should buy`, `you should sell`, `recommended for you`, `our advisor recommends`, `we recommend`, `Accept Recommendation`, `Approve Trade`.
2. **Support flow cannot alter the Execution Policy.**
   - On `/us/app/support`, intercept all outgoing requests.
   - Submit a support ticket (any path that triggers the support submission).
   - Assert zero `POST` requests to `/api/v1/investor/execution-policy*`.
3. **Support flow cannot resolve an exception.**
   - Same intercept.
   - Assert zero `POST` requests to `/api/v1/investor/exceptions/*/resolve`.
4. **Support flow cannot mutate recommendation state.**
   - Same intercept.
   - Assert zero `POST` / `PATCH` requests to `/v1/recommendations/*`.
5. **Support flow cannot mutate managed execution state.**
   - Same intercept.
   - Assert zero `POST` requests to `/api/v1/investor/managed/pause` or `/managed/resume`.

---

## Mapping from suspended tests to replacements

| Suspended test                                                                           | Backlog category | Replacement spec                                                                      |
| ---------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `compliance-fail-closed.spec.ts` (all 11)                                                | §A + §B          | `compliance-fail-closed-structural.spec.ts`, `compliance-verdict-visibility.spec.ts`  |
| `persona-switch.spec.ts` :: "Maya (default) — dashboard shows broker connected fresh"    | §C               | `persona-switch-stable.spec.ts` case 1                                                |
| `persona-switch.spec.ts` :: "Sarah — broker stale banner visible on home"                | §C               | `persona-switch-stable.spec.ts` case 2                                                |
| `persona-switch.spec.ts` :: "Sarah — recommendation rec_s_001 sits in compliance REVIEW" | §A + §B          | `compliance-fail-closed-structural.spec.ts` + `compliance-verdict-visibility.spec.ts` |
| `persona-switch.spec.ts` :: "Maya — disclosure card shows 0 of 5"                        | §C               | `persona-switch-stable.spec.ts` case 4                                                |
| `persona-switch.spec.ts` :: "Maya — Next action surfaces disclosure acknowledgment"      | §C               | `persona-switch-stable.spec.ts` case 4 / case 5                                       |

---

## Gate after replacements

Before the next merge request from `phase2-5-wip-rebase` is considered ready:

```
pnpm tripwire
pnpm --filter @refi/web typecheck
pnpm contract-test
pnpm test
pnpm --filter @refi/web build
pnpm e2e compliance-fail-closed-structural.spec.ts
pnpm e2e compliance-verdict-visibility.spec.ts
pnpm e2e persona-switch-stable.spec.ts
pnpm e2e support-boundary.spec.ts
pnpm e2e (all Phase 2 Surface 1–7 specs as well)
```

All must pass. Suspended Phase-2.5 specs can be deleted at that point.
