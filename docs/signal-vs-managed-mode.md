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

## Test implication

- **Vitest:** BFF rejects any execution-bound call (e.g. `POST /api/v1/execution-policy/activate`, `pause`, `resume`) when `mode === "signal"`.
- **Vitest:** mode-switch endpoint rejects switches that violate the precondition matrix.
- **Playwright (Signal):** end-to-end flow proves no execution path is reachable; recommendation interactions are limited to save/dismiss; no order/fill UI ever renders.
- **Playwright (Managed):** end-to-end flow proves no Accept-Recommendation button; pause/resume cycle works; user-side exception resolution works only for allowed categories.
- **Playwright (Switch):** Managed → Signal requires pause first; Signal → Managed requires full precondition set.
