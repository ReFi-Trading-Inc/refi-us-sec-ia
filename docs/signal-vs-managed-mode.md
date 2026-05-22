# Signal Mode vs Managed Mode

**Date:** 2026-05-20
**Purpose:** Define the two operating modes of the investor product and the rules that prevent them from leaking into each other.

---

## Mode definitions

### Signal mode

The investor sees software-generated recommendations and may save or dismiss them. **No execution occurs.** ReFi does not submit orders to the broker on behalf of the investor in Signal mode.

The investor's relationship is advisory only; execution is the investor's own responsibility, undertaken outside this product (e.g. directly in their broker app). The product still keeps a record that the recommendation was generated and delivered.

### Managed mode

The investor activates the digital advisory program: profile, disclosures, broker connection, account preferences, risk limits, and automation policy. After activation, software-generated account intents move through backend risk, compliance, execution planning, and broker execution automatically.

**There is no per-trade Accept button.** Authorization happened once, at activation. The investor's ongoing controls are program-level: pause, resume, update preferences, refresh profile, disconnect broker, resolve user-side exceptions.

---

## Allowed actions per mode

(Subset of `investor-action-taxonomy.md`; this view shows the mode boundary explicitly.)

| Action                                           |       Signal       |                  Managed                   |
| ------------------------------------------------ | :----------------: | :----------------------------------------: |
| `refreshProfile`                                 |         ✅         |                     ✅                     |
| `acknowledgeDisclosure`                          |         ✅         |                     ✅                     |
| `connectBroker`                                  |         ✅         |                     ✅                     |
| `disconnectBroker`                               |         ✅         |      ✅ (must pause first if active)       |
| `updateAccountPrefs`                             |         ✅         |                     ✅                     |
| `viewRecord` / `downloadRecord` / `exportRecord` |         ✅         |                     ✅                     |
| `dismissSignal` / `saveSignal`                   |         ✅         |                     ❌                     |
| `activateExecutionPolicy`                        | (mode switch only) |                     ✅                     |
| `updateExecutionPolicy`                          |         ❌         |                     ✅                     |
| `pauseManaged` / `resumeManaged`                 |         ❌         |                     ✅                     |
| `resolveException`                               |         ❌         | ✅ (`ExceptionResolution` categories only) |
| `acceptRecommendation` / `approveTrade`          |         ❌         |                     ❌                     |

---

## Execution boundary

| Concern                        | Signal                                                       | Managed                                                                                    |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Backend chain reached          | `AccountIntents` (advisory only) — never submitted to broker | Full lifecycle: `AccountIntents` → `RiskSnapshots` → `ExecutionPlans` → `Orders` → `Fills` |
| Order submission               | Never                                                        | Automatic, per activated policy                                                            |
| Investor per-trade involvement | Save / dismiss notifications only                            | None for normal flow; user-side exception resolution only when blocked                     |
| Records produced               | Recommendation projection + signal-view log                  | Full advisory chain projection + execution + broker records                                |

**Critical:** the absence of an execution path in Signal mode is enforced at the BFF, not at the UI. Code under `apps/web/app/api/v1/*` rejects any execution-bound call when `InvestorModeState.mode === "signal"`.

---

## Mode selection & transition

- Mode is selected at `/us/mode` (post-onboarding) or as part of `/us/onboarding/activation`.
- Default after eligibility + auth: no mode set; investor sees mode chooser.
- Switching Signal → Managed requires the full activation precondition set (profile snapshot, all required disclosures acked, broker connected and fresh, prefs saved, KYC verified).
- Switching Managed → Signal requires `pauseAutomation` first, then explicit mode switch. Records of the switch are preserved.

---

## UI branching rules

- A single shared layout for `/us/app/*`. Mode-specific surfaces are gated by `useTier()`/`useMode()`, not by separate route trees.
- `/us/app/recommendations` renders two variants:
  - **Signal:** save / dismiss controls; no execution status; "Acting on this is up to you" guidance.
  - **Managed:** read-only software-generated activity; no per-item action controls; status reflects backend lifecycle.
- `/us/app/settings/automation` exists only when `mode === "managed"`.
- `/us/app/exceptions` exists only when `mode === "managed"`.
- `/us/app/activity`, `/us/app/portfolio`, `/us/app/records`, `/us/app/account`, `/us/app/documents`, `/us/app/support` exist in both modes with appropriate variants.

---

## Allowed actions (this doc)

- Implement `InvestorModeState` per `bff-prototype-state-contract.md`.
- Implement mode chooser at `/us/mode`.
- Branch existing screens by `useMode()` rather than duplicating route trees.
- Enforce mode-conditional actions at the BFF.

## Prohibited actions (this doc)

- Adding an execution path under Signal mode anywhere in the codebase.
- Adding per-trade investor approval to Managed mode (`acceptRecommendation`-style buttons).
- Conflating mode with tier — `useTier()` already returns `"signal" | "managed" | "admin"`; "admin" is operator role and **never an investor mode** (admin lives in Daniel's repo). Rename in code where ambiguous.
- Allowing a stealth mode-switch (any path that changes `InvestorModeState.mode` outside the explicit mode chooser).

## Backend source of truth

- **Signal mode:** Daniel's signals + portfolio engine produce advisory output. The product reads (projects), never writes execution.
- **Managed mode:** Daniel's full execution lifecycle is the system of record. The product activates, pauses, resumes; backend does the rest.
- `InvestorModeState` is Bucket B prototype-bff today; migrates to backend when Daniel models account mode (likely `Accounts.mode` or `AccountSettings.mode`).

## Temporary BFF-owned state

- `InvestorModeState` (prototype-bff).
- `ManagedPolicyState` (prototype-bff for the policy fields; pause/resume effect will dual-read backend `TradingControlStates` once wired).

## Record requirement

- Mode selection emits `InvestorActionReceipt(action: "activateManagedPolicy" | <mode_switch>)`.
- Pause/resume each emit a receipt.
- Signal save/dismiss each emit a receipt (lightweight; rate-limited to prevent spam).
- Records Center surfaces a "Mode & policy history" section.

## UI implication

- Mode chooser shows a clear comparison: what each mode does, what records each produces, what the investor's role is in each, the responsibility difference.
- Managed activation screen exhaustively shows preconditions and their status; activation is a single, deliberate moment.
- Signal mode never shows execution status, broker order detail, or fills tied to the investor's recommendations.

## Implementation status — Surface 1 (Phase 2, 2026-05-22)

Surface 1 lands the **read-only mode foundation**. It does not include the switching UI, acknowledgments, guardrail confirmation, or the activate-managed flow — those belong to Surface 3 (ReFi Managed Activation).

What ships in Surface 1:

- `useSubscriptionMode()` and `useInvestorRecommendations()` in `@refi/api-clients` read the BFF routes `/api/v1/investor/subscription-mode` and `/api/v1/investor/recommendations` and unwrap the BFF envelope.
- `<ModeBadge>` in `@refi/ui` shows `ReFi Signal | ReFi Managed | Mode not set` with stable `data-mode` attribute.
- `<ModeStatusStrip>` on `/us/app/home` shows the current mode with an explainer.
- `/us/app/recommendations` branches per mode:
  - **Signal:** upgrade CTA, plus per-card affordances `Review details · Save · Dismiss · Act manually` (Save and Dismiss are visually present but disabled until Surface 5 wires them).
  - **Managed:** posture banner, posture labels per card (`Pending policy check · Submitted to broker · Executed · Skipped by policy · Held for review · Blocked by guardrail`), and an `Open in Exception Review` CTA on review-required items.
- `/us/app/recommendations/[id]` hides the Signal order-entry block in Managed mode and surfaces a managed-execution banner that links to Exception Review. Signal mode keeps the order-entry block, with the prior `"Approve for execution"` button renamed to `"Place order manually"`.
- `/us/app/exceptions` is a placeholder route so Managed CTAs resolve; Surface 6 will populate it.

Boundary enforcement (new in Surface 1):

- Tripwire blocks per-trade Accept variants: `AcceptButton`, `accept_trade`, `investor-accept` (action IDs) and `"approve for execution"`, `"accept and execute"` (labels). Existing `acceptRecommendation`/`approveRecommendation` etc. unchanged.
- Tripwire skip-dirs now include `playwright-report` and `test-results` so per-run artifacts don't trigger false positives.

BFF dev-fallback (new in Surface 1):

- `apps/web/src/lib/bff/auth.ts` `devFallback` now resolves `accountId` from `AuthSessionLink` when present. Without this, dev/test users that never go through SIWE could not exercise account-scoped BFF routes. Symmetric with the JWT path that already did the link lookup.

E2E (new in Surface 1):

- `apps/web/e2e/global-setup.ts` seeds two test users (Signal and Managed) into a pinned `.refi-prototype-store-e2e` directory. Each user gets an `AuthSessionLink`, a `SubscriptionMode`, and recommendation projections. Cookie hash (FNV-1a) matches the dev-fallback in `auth.ts`.
- `apps/web/e2e/mode-branching.spec.ts` runs two specs against `data-testid` selectors only; no legal/compliance copy regex.
- E2E disables browser MSW (`NEXT_PUBLIC_REFI_DATA_ADAPTER=live` in webServer.env) so the QueryClient provider mounts immediately without waiting for service-worker registration in headless Chromium.

Known surface-1 limitations:

- The detail page recommendation lookup is still on the MSW path (`/v1/recommendations/[id]`). With browser MSW disabled in e2e, the Managed-detail banner is not asserted directly; the spec instead asserts the _absence_ of the Signal order-entry block on the detail page (the actual boundary check). Surface 5 will migrate the detail page to a BFF projection.
- Surface 1 e2e leaves the 16 other stale specs untouched; they remain documented as B-006 in `current-gaps-register.md` and will be realigned surface-by-surface.

## Test implication

- **Vitest:** BFF rejects any execution-bound call (e.g. `POST /api/v1/execution-policy/activate`, `pause`, `resume`) when `mode === "signal"`.
- **Vitest:** mode-switch endpoint rejects switches that violate the precondition matrix.
- **Playwright (Signal):** end-to-end flow proves no execution path is reachable; recommendation interactions are limited to save/dismiss; no order/fill UI ever renders.
- **Playwright (Managed):** end-to-end flow proves no Accept-Recommendation button; pause/resume cycle works; user-side exception resolution works only for allowed categories.
- **Playwright (Switch):** Managed → Signal requires pause first; Signal → Managed requires full precondition set.
