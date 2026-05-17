# 01 — US Overlay Specification

**Audience:** UI engineers, product, compliance
**Purpose:** define what the US product surface adds on top of Daniel's core platform
**Status:** ready for build — regulatory framing resolved 2026-05-17 (digital adviser path, Internet Adviser Exemption)

---

## Scope

This document covers **only** what is unique to the US product surface mounted at `/us`. Everything else (auth, KYC, compliance gating, broker abstraction, trading, audit) is inherited from the platform and specified in Daniel's V2 PDF. Do not duplicate that content here.

Five things are US-specific:

1. State-of-residence eligibility gate before authentication.
2. SEC-sensitive language rules applied to all `/us` copy.
3. US-eligible broker filter on the broker connect screen.
4. US regulatory disclosures (framing pending counsel — see open questions).
5. State-by-state feature availability.

## Route structure inside `apps/web/app/us/`

```
us/
├── page.tsx                        # /us — public landing for US users
├── eligibility/
│   └── page.tsx                    # /us/eligibility — state + age + US-person gate
├── onboarding/
│   ├── layout.tsx                  # wizard shell
│   ├── page.tsx                    # /us/onboarding — kickoff (post-SIWE, post-KYC start)
│   ├── profile/
│   │   └── page.tsx                # investor profile
│   ├── broker/
│   │   └── page.tsx                # broker connect (US-eligible filter)
│   ├── strategy/
│   │   └── page.tsx                # strategy review
│   └── activation/
│       └── page.tsx                # final activation checklist
├── disclosures/
│   └── page.tsx                    # /us/disclosures — regulatory documents
├── app/
│   ├── layout.tsx                  # authenticated client shell (SIWE + KYC + eligibility required)
│   ├── home/
│   │   └── page.tsx                # /us/app/home
│   ├── portfolio/
│   │   └── page.tsx
│   ├── recommendations/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   ├── activity/
│   │   └── page.tsx
│   ├── documents/
│   │   └── page.tsx
│   ├── account/
│   │   └── page.tsx
│   └── support/
│       └── page.tsx
└── _content/
    ├── landing.ts
    ├── eligibility.ts
    ├── onboarding.ts
    ├── disclosures.ts
    ├── app-copy.ts
    └── support-boundary.ts
```

**Note on dynamic routes:** Next.js 15+ and 16 treat `params` and `searchParams` as Promises. Every dynamic route page must declare them as such:

```tsx
export default async function RecommendationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ...
}
```

## 1. Eligibility gate

### Purpose
Before a user can connect a wallet (SIWE) on the US surface, they must declare their state of residence, age, and US-person status. This is the only US-specific precondition added to the platform auth flow.

### Flow

```
User visits /us
    │
    ▼
/us landing renders public copy + CTA "Check Eligibility"
    │
    ▼
User clicks CTA → /us/eligibility
    │
    ▼
Form: state dropdown, age confirmation, US-person confirmation
    │
    ▼
POST /api/us/eligibility  (Next.js route handler, server-side)
    │
    ▼
Backend returns EligibilityDecision
    │  - issues HTTP-only cookie us_eligibility_v1 with signed JWT
    │  - JWT claims: { state, age_confirmed, us_person, decision_id, rule_version, exp }
    │
    ▼
If decision allows: redirect to /us/onboarding (which routes to /auth/connect for SIWE)
If waitlist or unsupported: render result screen, do not allow SIWE
```

### Form fields
- **State of residence.** Dropdown of all 50 states + DC. Required.
- **Age confirmation.** Checkbox: "I am at least 18 years old." Required.
- **US-person confirmation.** Checkbox: "I am a US person or US tax resident." Required.
- **Account purpose.** Dropdown: "Personal", "Family", "Household". Required. Logged for advisory profile but not gating.

### Eligibility rules
Maintained in `apps/web/app/api/us/eligibility/rules.ts`. Rule version is incremented when the table changes. Every decision logs the rule version it was made under.

| State | Status at launch |
|---|---|
| All except NY, HI, AK | `eligible` (subject to KYC + counsel sign-off) |
| NY | `waitlist` (BitLicense considerations if any crypto exposure introduced later) |
| HI | `waitlist` (state advisory registration nuances) |
| AK | `waitlist` (low TAM, defer) |

The table is conservative at launch and broadened after counsel review. **The rule table is data, not code; engineers do not edit it without compliance sign-off.**

### Decision storage
Every eligibility decision is recorded in the backend (MongoDB) with:
- `decision_id` (UUID)
- `session_id` (from server-side session, even pre-SIWE)
- `state`, `age_confirmed`, `us_person`, `account_purpose`
- `result` (`eligible`, `waitlist`, `unsupported`)
- `rule_version`
- `ip_hash` (HMAC-SHA256 of client IP with `IP_HASH_SECRET`)
- `user_agent_hash`
- `created_at`

After SIWE completes, the decision is linked to the user account.

### UI states
- **Loading**: skeleton form.
- **Empty / fresh visit**: form ready.
- **Submitting**: disable form, show inline spinner on CTA.
- **Eligible result**: green badge, decision ID + timestamp + rule version visible, CTA "Continue to wallet connect".
- **Waitlist result**: amber badge, copy explaining waitlist, CTA "Join waitlist" leading to email capture.
- **Unsupported result**: gray badge, copy explaining the limitation, no CTA.
- **5xx error**: standard error state with retry.

### Eligibility check is not advisory advice
The eligibility check returns a binary decision based on state. It does not constitute investment advice, suitability assessment, or any judgment about whether the user should use ReFi. Copy must be neutral.

## 2. SEC-sensitive language rules

These rules apply to **all** copy rendered under `/us/*`, including dynamic content sourced from the backend (e.g., recommendation rationale strings).

### Approved primary language

Use these terms in `/us` copy:

- software-generated recommendations
- personalized investment recommendations
- investment adviser / digital investment adviser
- investment advisory services
- investment advice (generated by software)
- managed execution
- advisory agreement
- broker-held custody
- assets remain at your broker
- records and activity history
- disclosure package
- execution policy
- automation eligibility check
- support boundary

**Note on advisory terminology.** Regulatory framing is resolved as Option A (digital adviser path, Internet Adviser Exemption under rule 203A-2(e)). Terms like "investment adviser," "advisory services," "investment advice," and "advisory agreement" are now correct and required terminology — do not treat them as blocked. The blocked list below covers marketing-style, AI-bot, and performance-exaggeration language; it does not block precise regulatory language.

### Blocked language

Never use on `/us` customer-facing screens:

```
AI trading bot          autopilot              autonomous trading
signal feed             trade queue            alpha engine
quant terminal          low latency            founder reviewed
staff approved          guaranteed return      guaranteed risk reduction
SEC approved            beat the market        risk-free
auto-profit             robo-trading           black-box AI
```

### Replacement table

When migrating copy from the existing Bolt React build:

| Old term | Replacement |
|---|---|
| Signals | Recommendations |
| Trade Queue | Exception Review |
| Autopilot | Managed Execution |
| Audit Trail | Records |
| Risk Engine | Risk Guardrails |
| Trace | Decision Record |
| Dashboard | Home |
| Settings | Account |
| Trading Mode | Management Preference |
| Paper Mode | Simulation |
| Live Trading | Managed Execution Activation |

### Forward-looking and performance language

Do not publish in `/us` copy:
- Guaranteed returns
- Guaranteed loss reduction
- Specific CAGR, Sharpe, drawdown, or alpha claims **without** counsel-approved disclosure
- "SEC approved" or any implication of regulatory endorsement
- Selective backtest or simulation results without context disclosure

### Enforcement

A CI step runs the copy scanner (see `02-phase-2-build-plan.md`, Ticket 10) against `apps/web/app/us/**/*.{tsx,mdx}` and `apps/web/app/us/_content/**/*.ts`. The scanner reads the blocked-term list from `packages/config/blocked-terms.ts`. CI fails on any match unless an explicit allowlist comment is present (`// allow-blocked-term: "term" reason: "context-X"`).

## 3. Broker selection for US users

The broker connect screen at `/us/onboarding/broker` calls `GET /v1/brokers/supported` and filters the response by `capabilities.us_supported === true`. At launch:

- **Alpaca** — visible, status `available`
- **IBKR** — visible, status `coming_soon` (renders as disabled card with "Coming soon" badge)
- **Tradier** — visible, status `coming_soon`

When IBKR and Tradier muxxers come online, the backend flips their status and the UI updates without code changes.

### Required permission scopes shown to user

Independent of which broker the user selects, the connect screen must show the permissions ReFi requests:

- Read account profile
- Read balances
- Read holdings
- Read order status
- Submit orders eligible for managed execution (only after activation)
- **No withdrawal permissions**
- **No transfer permissions**
- No margin permissions (first scope)
- No options permissions (first scope)
- No crypto permissions (first scope)

These statements are user-facing copy. The actual permission grant happens through the broker's OAuth or API-key flow.

## 4. Regulatory disclosures

**Regulatory framing is resolved: Option A — digital adviser path, Internet Adviser Exemption (rule 203A-2(e)).** ReFi will register with the SEC as an investment adviser. The required disclosure documents are the Option A set below.

The disclosures screen `/us/disclosures` renders these document cards:
- Form CRS
- ADV Part 2A
- Investment Advisory Agreement
- Privacy notice
- E-delivery consent
- Fee schedule
- Managed execution acknowledgment

Each card shows: document name, version, effective date, "View" button, "Download" button, acknowledgment checkbox, accepted timestamp (when acknowledged), document hash (when available).

**Until SEC registration is granted and counsel delivers final documents**, each card renders in a "Document in preparation" status:
- Status badge: "Document in preparation" (amber, not "Coming soon")
- Effective date: "Pending registration"
- View / Download: disabled, with note "Available after registration"
- Acknowledgment checkbox: disabled

The document names ("Form CRS," "ADV Part 2A," "Investment Advisory Agreement") are the permanent final names — do not substitute generic placeholders. The names are correct; the content is pending.

**Activation of managed execution is blocked** until the user has acknowledged Form CRS, ADV Part 2A, and the Investment Advisory Agreement. These checklist items remain red until documents are available and acknowledged.

**Advisory personnel disclosure (required by rule 203A-2(e)(3)).** The platform must display a clear disclosure that advisory personnel do not generate, modify, or expand client-specific investment advice outside the platform. This appears:
1. On the disclosures screen as part of the managed-execution acknowledgment card text.
2. In the support boundary screen as a structural guardrail (see section on `/us/app/support`).

### Brand config

The brand config file `apps/web/app/us/_content/brand.ts` uses the following values:

```ts
export const usBrand = {
  productName: 'ReFi.Trading',
  productSurface: 'ReFi.Trading USA',
  legalEntityPlaceholder: '[Legal entity — counsel to confirm; US subsidiary or ReFi Trading Inc. with US address]',
  regulatoryStatus: 'SEC-registered investment adviser (registration pending)',
  domain: 'refi.trading',
  usPath: '/us',
} as const;
```

Do not hardcode a specific entity name until counsel confirms. `legalEntityPlaceholder` is intentionally a bracket string that the copy scanner will flag as unresolved in production builds until it is replaced with the real entity name.

## 5. State-by-state feature availability

Some product features may be enabled or disabled by state. The backend exposes this via the eligibility decision; the UI renders accordingly.

At launch, the only state-level variation is `eligible` vs `waitlist` (above). The framework is built to support finer granularity later (e.g., "managed execution disabled in state X", "broker A unavailable in state Y") without UI rework.

The UI reads `EligibilityDecision.feature_flags[]` from the cookie's JWT claims and applies them at render time. Disabled features render as locked with explanatory copy.

## Screen-by-screen requirements

### `/us` — public landing

**Purpose:** Explain ReFi to a US visitor and route them to eligibility check.

**Modules:**
- Hero with headline and subheadline (see content file)
- "How it works" three-step explainer
- Trust row (broker-held custody, software-generated recommendations, clear guardrails, full records)
- CTA "Check Eligibility" → `/us/eligibility`
- Secondary CTA "Explore Demo" → demo route (Phase 1 demo flow if available, else hidden)
- Footer with links to disclosures, support, privacy

**Acceptance:**
- No public CAGR, Sharpe, drawdown, or performance-led claims.
- No AI-trading-bot language.
- Passes blocked-term scanner.
- Mobile-first responsive (320px baseline).
- Lighthouse a11y ≥ 95, performance ≥ 80.

**Server vs client:**
- Page is a Server Component.
- CTA buttons are client (need navigation).
- Trust row icons are server-rendered.

### `/us/eligibility`

See section 1 above. Fully specified.

### `/us/onboarding` and sub-routes

Wizard structure with progress indicator. Steps:

1. **Profile** (`/us/onboarding/profile`). Investor profile form. Fields: goal, time horizon, income band, liquid net worth band, emergency savings, expected withdrawals, investment experience, risk tolerance, liquidity need, tax sensitivity, restricted securities/sectors, account purpose. Posts to backend; backend creates `AdvisoryProfile`.

2. **Broker connect** (`/us/onboarding/broker`). See section 3 above.

3. **Strategy review** (`/us/onboarding/strategy`). Read-only display of the strategy the backend has generated for this profile. Shows: strategy name, "why this fits you" rationale, target allocation, asset universe, risk guardrails, expected turnover, "what ReFi will not do", costs and fees summary, model version, generated timestamp. CTA: "Continue".

4. **Activation** (`/us/onboarding/activation`). Final checklist. Each item is a status row; some are auto-checked, some require user action.
   - State eligible (auto, from eligibility decision)
   - Wallet connected (auto, from SIWE)
   - KYC approved (auto, from CCID status)
   - Profile complete (auto, from advisory profile)
   - Broker connected (auto, from broker connection)
   - Disclosures acknowledged (user action, links to `/us/disclosures`)
   - Execution policy approved (user action, links to policy review)
   - Final activation acknowledgment (user action, checkbox)

   CTA: "Activate". Disabled until all items checked.

**Acceptance:**
- Each step is its own route (deep-linkable, browser back/forward works).
- Profile form uses `react-hook-form` + `zod` validation.
- Form submission failures surface field-level errors.
- Each step's completion is persisted server-side; user can leave and return.

### `/us/disclosures`

See section 4 above. Currently pending counsel.

### `/us/app/home`

**Purpose:** Logged-in landing for active US users.

**Modules:**
- Portfolio value (font-mono, JetBrains Mono)
- Goal progress
- Current strategy summary
- Management mode (Signal / Managed)
- Automation status (active / paused / locked)
- Broker connection status with last-sync time
- Next recommendation card
- Recent execution
- Open exception review count
- Recent activity (last 5 events)
- Disclosures status

**Data sources:** All from `packages/api-clients` hooks. Initial paint is Server Component fetch; interactive updates use TanStack Query polling at the intervals specified in the platform spec.

**Simulated Data badge:** Visible until passive feeds go live (Phase 2 keeps simulated; Phase 3+ may flip to live).

### `/us/app/portfolio`

Standard portfolio view. Holdings table, allocation chart, performance chart. All numeric values use font-mono.

### `/us/app/recommendations` and `/us/app/recommendations/[id]`

**List view (`/us/app/recommendations`):**
- Filter: status (all, new, eligible, executed, exception, expired)
- Table columns: title, type, account, generated, expires, profile fit, automation eligibility, status, record link
- Click row → detail page

**Detail view (`/us/app/recommendations/[id]`):**
- What we recommend
- Why now
- Why this fits your profile
- Portfolio impact
- Costs and taxes
- Risk guardrail check (renders the `GuardrailCheckList` component)
- Automation eligibility check
- Model factors (collapsed by default)
- Disclosure state
- Decision controls (save, accept, dismiss)
- Record preview (links to record on Explorer when Phase 3 lands)

**Compliance gating:** "Accept" or "Submit" buttons consult `useOrders.preview` and only enable on `ALLOW`. Non-ALLOW shows the verdict reasons inline. This is the **Phase 2 live integration point**.

**Note:** Recommendation IDs are sensitive — ownership is enforced server-side. Cross-user reads return 404, never 403.

### `/us/app/activity`

Customer-readable history of events: recommendations delivered, decisions made, broker submissions, fills, exceptions, disclosures accepted, profile updates. Sorted reverse chronological. Filterable by event type.

Each row links to the relevant detail page or record.

### `/us/app/documents`

Lists all disclosure documents and the user's acknowledgment status for each. See section 4.

### `/us/app/account`

Sections:
- Profile (read current advisory profile; CTA to update)
- Wallet (current SIWE wallet; revoke session)
- KYC status
- Broker connection (status, last sync, disconnect option)
- Notifications preferences
- Fee settings (pending pricing model)
- Security (active sessions, device-wide revoke)

### `/us/app/support`

**Support boundary screen.** Per the platform support-boundary rules:

> Support helps with the app, documents, broker connection, billing, and general explanations of how ReFi works. Support does not make client-specific investment decisions or change recommendations outside the product.

UI elements:
- Banner with support boundary statement (verbatim above).
- Contact form: category dropdown (app issue, document question, broker question, billing, general explanation, other), free-text description.
- Blocked-prompt detection: if the user types text matching client-specific advice patterns ("should I buy", "is X a good investment", "what should I do with", "tell me whether to"), the submit button disables and an inline message redirects to the appropriate self-service area or suggests rephrasing.
- Submit posts to backend; conversation ID returned and shown.

This screen does not implement live chat or AI assistance. It is a structured intake.

## Content files

All US copy lives under `apps/web/app/us/_content/`. Components import from these files; no copy is inlined in JSX.

Example structure for `landing.ts`:

```ts
export const landingCopy = {
  hero: {
    headline: '[Headline pending — see open questions]',
    subheadline: '[Subheadline pending — see open questions]',
    primaryCta: 'Check Eligibility',
    secondaryCta: 'Explore Demo',
  },
  trustRow: {
    items: [
      { title: 'Broker-held custody', description: '...' },
      { title: 'Software-generated recommendations', description: '...' },
      { title: 'Clear guardrails', description: '...' },
      { title: 'Full records', description: '...' },
    ],
  },
  // ...
} as const;
```

**Headlines and subheadlines are pending counsel** because they are the highest-risk copy. The file ships with bracket placeholders and the copy scanner allows them; counsel-approved copy replaces them before any external launch.

## Accessibility

Inherits platform requirements (WCAG AA, 4.5:1 text contrast, 3:1 UI contrast, keyboard nav, focus indicators, semantic HTML, `prefers-reduced-motion`).

US-specific additions:
- Eligibility form must be screen-reader-friendly. State dropdown uses a native `<select>` (not a custom div) for assistive technology compatibility.
- Disclosure acknowledgment checkboxes use the platform `Checkbox` primitive with linked label.
- All status badges have `aria-label` describing meaning beyond color.

## Observability

Inherits platform observability (Sentry, PostHog, OpenTelemetry, correlation IDs, Web Vitals).

US-specific events to emit:
- `us_eligibility_started`
- `us_eligibility_submitted` (with decision result, rule version)
- `us_eligibility_waitlisted`
- `us_onboarding_step_completed` (with step name)
- `us_activation_completed`
- `us_disclosure_acknowledged` (with document type, version)
- `us_support_boundary_triggered` (with blocked prompt category, never the prompt itself)

**Event names must pass the blocked-term scanner.** No `us_signal_*` or `us_alpha_*`.

## 6. Internet Adviser Exemption — operational requirements

**Audience:** engineering lead, product, compliance
**Authority:** Rule 203A-2(e), SEC Release IA-6578 (2024 amendments)

These requirements must be satisfied for ReFi to maintain its reliance on the Internet Adviser Exemption. They have product and engineering implications beyond documentation.

### 6.1 Operational interactive website

The platform must be operational and providing digital investment advisory services to more than one client at all times. Temporary outages of de minimis duration are permissible; sustained or repeated outages risk the exemption.

**Engineering implication:** Uptime SLAs are a compliance requirement, not only a UX requirement. Cloud Run min-instances must be ≥1 in staging and ≥2 in production. Alerting on downtime should be treated as compliance-relevant.

### 6.2 Software-generated advice exclusively

Investment advice must be generated by the platform's software-based models, algorithms, or applications based on personal information each client supplies through the platform. Advisory personnel may not generate, modify, or expand client-specific investment advice.

**Engineering implication:**
- Recommendation records must preserve which model version generated the recommendation and which personal inputs it was based on. This is already required by the audit chain (Phase 3) but is also a regulatory record-keeping requirement from Phase 2 onward.
- The support boundary screen (`/us/app/support`) guardrails against staff giving investment advice are a **regulatory requirement under 203A-2(e)(3)**, not only a product preference. The blocked-prompt detection must be present and cannot be disabled.
- No admin UI should permit a staff user to override, modify, or inject a client-specific recommendation. If an admin tool is built, its scope must be reviewed for compliance with this constraint.

### 6.3 Exclusive delivery through the platform

All clients must receive investment advisory services exclusively through the operational interactive website. There is no de minimis exception for off-platform advice delivery (this exception was eliminated by the 2024 amendments).

**Engineering implication:** There is no email, phone, or chat path through which ReFi staff delivers investment advice to a client. The support channel (`/us/app/support`) is for app issues, document questions, broker questions, billing, and general platform explanations only. Copy in that screen must remain consistent with this constraint.

### 6.4 Client count

The platform must serve more than one client receiving digital investment advisory services on an ongoing basis throughout the period of SEC registration.

**Engineering implication:** Alpha launch should onboard at least two real clients simultaneously. Sandbox or internal test accounts do not count. The 120-day rule (203A-2(c)) allows registration in anticipation of eligibility; onboarding two real clients during that window satisfies the ongoing-client requirement before the 120-day window closes.

### 6.5 Form ADV and ongoing compliance obligations

Operating as a registered investment adviser under the Advisers Act requires:
- Form ADV (Parts 1A, 1B, 2A, 2B) filed with the SEC and updated annually or more frequently for material changes.
- Form CRS delivered to new retail investors before or at the time of entering the advisory relationship.
- Written policies and procedures (compliance manual).
- Compliance officer designation.
- Code of ethics.
- Books and records maintenance (Rule 204-2): including records of recommendations, client profiles, advisory agreements, and communications.
- Marketing Rule (Rule 206(4)-1) compliance for all advertising, including the landing page.
- Custody Rule (Rule 206(4)-2): broker-held custody is the architecture; this satisfies custody rule requirements if structured correctly — counsel to confirm.

**Engineering implication:** Records of every recommendation, client profile snapshot at recommendation time, and compliance verdict must be retained. This is structurally what the Audit Writer (Phase 3) provides, but the record-keeping obligation begins at Phase 2 activation for any real client. Until Phase 3 ships, records should be stored in MongoDB with sufficient fidelity to reconstruct the recommendation rationale.

---

## Open questions remaining

**Resolved:** Q1 (regulatory framing) — resolved 2026-05-17 as Option A (digital adviser, Internet Adviser Exemption).

**Still open (from `decisions/open-questions.md`):**
2. **OpenAPI publication path.** Drives all data fetching in `/us/app/*`.
3. **Monorepo tooling.** Drives MIG-P1-01.
4. **Broker connect UX (OAuth vs API keys).** Drives the broker connect screen in `/us/onboarding/broker`.
5. **WalletConnect project ID.** Drives MIG-P1-05.

Sections that are buildable now:
- Eligibility gate (section 1) — buildable
- SEC-sensitive language rules and blocked-term scanner (section 2) — buildable
- Broker filtering logic (section 3) — buildable (UI stable regardless of connect UX)
- Disclosures screen (section 4) — **now buildable** with "Document in preparation" status; document names and structure are final
- Landing page structure — **now buildable**; hero copy drafts are available for counsel sign-off
- Account, activity, support routes — buildable
- Most of `/us/app/home` with simulated data — buildable

Still waiting on open questions:
- Recommendation detail compliance gating → waiting on Q2 (OpenAPI) for `useOrders.preview` types
- Broker connect form → waiting on Q4 (OAuth vs API-keys decision)
