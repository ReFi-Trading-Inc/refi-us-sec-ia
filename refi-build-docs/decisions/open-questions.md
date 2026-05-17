# Open Questions

**Purpose:** track the decisions Zeshan and Daniel owe before Claude Code starts.

**Status:** all five open as of 2026-05-17.

Decisions are recorded here once made, with date and rationale. The build plan in `spec-current/02-phase-2-build-plan.md` references these questions by number.

---

## 1. Regulatory framing for `/us`

**Asked of:** Zeshan, with US legal counsel
**Asked on:** 2026-05-17
**Status:** RESOLVED — 2026-05-17
**Blocks:** ~~Landing copy, disclosures content, compliance language throughout `/us`, fee schedule wording~~ (unblocked)

### Context

The earlier ChatGPT-generated build spec framed `/us` as a "software-based digital investment adviser" with Form CRS, ADV Part 2A, and an advisory agreement. This framing requires US adviser registration (state-by-state and/or SEC depending on AUM). Currently no US registration exists; the entities are ReFi Trading Inc. (Canada, CBCA) and ReFinity LLC (Qatar, QFC).

Zeshan's overall positioning treats ReFi as a non-regulated technology/FinTech services provider. This conflicts with the digital-adviser framing.

Until counsel decides, the UI cannot ship copy that uses "advisor," "adviser," "investment management," "managed account," or that implies an ongoing fiduciary relationship.

### Options

**Option A — Digital adviser path.**
Pursue US adviser registration (likely state-by-state to start, or SEC registration if AUM thresholds are met). Form CRS and ADV Part 2A become real documents. Advisory agreement is signed at activation. "Recommendations" and "managed execution" are usable terms. Performance- or AUM-linked fees become possible later. Longer timeline (months for registration), higher legal cost, but unlocks the regulated product surface.

**Option B — Non-advisory technology platform.**
No advisory language anywhere on `/us`. Broker holds custody. User retains all decision authority. ReFi provides software signals and execution routing as a technology tool, not investment advice. Fees must be technology-consumption based (per user, per feature, per API call) — not AUM, not performance. Aligns with GCC posture. Shorter timeline to market. Constrains future revenue model.

### Implications for the build

| Item | Option A | Option B |
|---|---|---|
| Landing headline | "Personalized investing built around your brokerage" | "Investment automation software for your brokerage" |
| `/us/disclosures` content | Form CRS, ADV 2A, advisory agreement, privacy, e-delivery consent, fee schedule, managed-execution acknowledgment | Terms of service, privacy notice, platform agreement (not advisory), software license, e-delivery consent, fee schedule (consumption-based), broker connection acknowledgment |
| Activation gating | Disclosures acknowledged + advisory agreement signed | Terms of service + platform agreement acknowledged |
| Legal entity copy | "[US advisory entity]" (real, registered) | "ReFi Trading Inc." (existing Canadian entity, US operations as non-advisory tech) |
| "Managed execution" usable | Yes | Reframe as "automated execution" or "routed execution" — counsel to confirm acceptable terminology |
| Performance disclosures | Possible with ADV-compliant context | Strictly hypothetical; clear "not a recommendation" framing |
| Subscription pricing | Can be AUM-linked or performance-linked (with regulated status) | Must be consumption-based |

### What to do until decided

`/us/disclosures` renders a "Coming soon" state with no fake documents. Landing copy uses neutral placeholders. The brand config uses `[Legal entity to be confirmed]` and `[Regulatory status to be confirmed]`. Build proceeds on everything that does not depend on this decision (eligibility flow, SIWE auth, KYC, broker connect, recommendations list, activity, account, support — all buildable in parallel).

### Decision

**Decided by:** Zeshan Ahmad (CEO)
**Decided on:** 2026-05-17
**Decision:** Option A — Digital adviser path, specifically the Internet Adviser Exemption under rule 203A-2(e) of the Investment Advisers Act of 1940 (SEC Release IA-6578, as amended effective July 8, 2024, compliance date March 31, 2025). ReFi will register with the SEC as an investment adviser. The product is a digital investment adviser: software-based RL models generate personalized recommendations from personal information each client supplies through the operational interactive website, delivered to all clients exclusively through that website. Required disclosure documents are Form CRS, ADV Part 2A, and an Investment Advisory Agreement. These will appear in the UI in "Document in preparation" status until the SEC grants registration and counsel delivers final documents.
**Rationale:** The Internet Adviser Exemption was effectively designed for this product architecture. Daniel's inference engine generating per-user recommendations through a web platform, delivered exclusively through the platform, maps word-for-word to the SEC's definition of a digital investment advisory service under 203A-2(e). The exemption permits federal (SEC) registration without the $100M AUM threshold, avoiding state-by-state registration. Option B (non-advisory tech platform) would constrain the revenue model and require reframing language that accurately reflects the advisory function. The structural fit with Daniel's architecture is sufficiently clear to commit now; formal counsel sign-off on entity, timing, and ADV drafting proceeds in parallel with the Phase 2 build.
**Implications for the build:**
- "Form CRS," "ADV Part 2A," "Investment Advisory Agreement" strings are correct terminology — retain them; render in "Document in preparation" status until registration is granted and documents exist.
- "Investment adviser," "digital investment adviser," "investment advisory services," "managed execution," and "advisory agreement" are now **approved** terms (not blocked).
- The AutomationCenter.tsx disclosure ("All investment advisory services are delivered exclusively through the ReFi software platform") is substantively correct. Refine to mirror rule 203A-2(e) language: software-based models generate the advice; advisory personnel do not generate, modify, or expand client-specific advice outside the platform.
- Landing page headline copy is unblocked. Draft options are now available for counsel sign-off; do not ship without counsel approval.
- Activation remains gated on acknowledgment of Form CRS, ADV Part 2A, and advisory agreement — those checklist items stay red until documents exist.
- Support boundary hard guardrails (no staff giving client-specific investment advice) are now a **regulatory requirement** under 203A-2(e)(3), not only a product preference.
- Fee model: AUM-linked or performance-based fees are permitted under Option A. Technology-consumption pricing is also permitted. Counsel to confirm fee structure before fee schedule is drafted.
- US legal entity: pending counsel confirmation of whether to register under ReFi Trading Inc. directly (with US business address) or a new US subsidiary. Placeholder `[Legal entity — counsel to confirm]` remains until this is resolved.
- **Start Form ADV filing now**, in parallel with Phase 2 build. Rule 203A-2(c) 120-day rule allows registration in anticipation of eligibility. This puts registration in hand approximately when Phase 2 exits. Waiting until build completion adds two to three months of idle product.
**Linked artifacts:** SEC Release IA-6578 (Internet Adviser Exemption, 2024 amendments to rule 203A-2(e)). Counsel engagement in progress.

---

## 2. OpenAPI publication path

**Asked of:** Daniel
**Asked on:** 2026-05-17
**Status:** PROCEEDING WITH HAND-WRITTEN SKELETONS — unblocked 2026-05-17
**Blocks:** ~~Ticket MIG-P1-06 (api-clients package)~~ (unblocked)

### Context

The `packages/api-clients` package generates TypeScript SDKs from OpenAPI specs published by Daniel's Phase 1 services. The architecture overview names roughly 15 endpoint groups the UI will consume.

If Daniel's services already expose OpenAPI via FastAPI's automatic schema, that's the source. If not, we need either Daniel to publish specs or hand-written skeletons we reconcile later.

### Questions

1. Do Daniel's Phase 1 Cloud Run services expose OpenAPI (`/openapi.json` or equivalent)?
2. If yes, what's the canonical URL to fetch each, and how are versions managed?
3. If no, is publishing them feasible in the next sprint, or should the UI team hand-write skeleton specs based on `00-architecture-overview.md`?
4. Where do the SIWE service, CCID integration, and Compliance Adapter specs live? Same monorepo as Phase 1 services, or separate?
5. Are the named contracts (`OrderPreviewResult`, `RouteDecision`, `PolicyDecision`, etc.) defined as Pydantic models with stable schemas?

### Recommended path

Daniel publishes OpenAPI JSON for each Phase 1 service to a known location (e.g., `https://api-staging.refi.trading/v1/openapi.json`). The CI in the UI monorepo fetches the latest on a schedule, regenerates clients, and opens a PR if the schema has drifted. UI team reviews and merges.

If publication is delayed, UI team hand-writes skeleton specs against the contracts in `00-architecture-overview.md`. These specs live in `packages/api-clients/openapi/` and are reconciled with real specs when they land — drift between hand-written and real is caught in CI integration tests against staging.

### Decision

**Decided by:** Zeshan Ahmad (CEO)
**Decided on:** 2026-05-17
**Decision:** Proceed with hand-written skeleton specs. MIG-P1-06 is unblocked. Claude Code will hand-write OpenAPI YAML for each of the ~7 endpoint groups derived from the named contracts in `00-architecture-overview.md` (`AuthSession`, `OrderPreviewResult`, `ComplianceVerdict`, `BrokerConnection`, `KycStatus`, etc.), generate TypeScript clients via `openapi-typescript`, and build MSW handlers against those types. When Daniel's real specs land, `pnpm -F api-clients generate` reruns and TypeScript compile errors identify every schema drift. Nothing is hardcoded against wrong shapes.
**Rationale:** The Bolt repo has no API client layer at all — `packages/api-clients` is built from scratch regardless. Hand-written skeletons typed against the architecture overview contracts give the same type-safety benefits as generated ones and let the build proceed now. The reconciliation cost is bounded to type-error fixes at the point real specs land.
**Implications:** Risk of reconciliation effort is mitigated by syncing with Daniel on the JSON shapes of the two most critical contracts (`AuthSession` and `OrderPreviewResult`) before MIG-P1-06 ships — even informally. Full OpenAPI spec from Daniel is not required to start. When real specs do land, they replace the hand-written YAML in `packages/api-clients/openapi/` and the generator is rerun.
**Linked artifacts:** Named contracts in `spec-current/00-architecture-overview.md` section "Data contracts the UI consumes."

---

## 3. Monorepo tooling

**Asked of:** Zeshan and Daniel
**Asked on:** 2026-05-17
**Status:** RESOLVED — 2026-05-17
**Blocks:** ~~Ticket MIG-P1-01 (monorepo bootstrap)~~ (unblocked)

### Context

Daniel's V2 PDF specifies a monorepo layout but does not name the tooling. Two main options for a JavaScript/TypeScript monorepo at this stage.

### Options

**pnpm + Turborepo (recommended).**
- pnpm workspaces for package linking and dependency hoisting (efficient, fast).
- Turborepo for build caching, parallel task execution, remote cache via Vercel Remote Cache or self-hosted.
- Light footprint, well-documented, widely used.
- Easy onboarding for new engineers.
- Works well with Next.js out of the box.

**Nx.**
- More opinionated. Generators, dependency graph visualization, affected-only builds.
- Better if the monorepo will host many apps and many shared libraries long-term.
- Steeper learning curve.
- Heavier configuration.

### Recommendation

**pnpm + Turborepo** unless there's a strategic reason to invest in Nx now. The repo has one app (`apps/web`) and three packages at the moment. pnpm + Turborepo handles this well. If the org adds 5+ apps later (e.g., a separate admin app, mobile app, design system docs site), revisit.

### Decision

**Decided by:** Zeshan Ahmad (CEO)
**Decided on:** 2026-05-17
**Decision:** pnpm workspaces + Turborepo.
**Rationale:** Recommended option. One app, three packages — pnpm + Turborepo is the right size. Light footprint, well-documented, works with Next.js out of the box. Revisit Nx if the repo grows to 5+ apps.
**Implications:** MIG-P1-01 is unblocked. Claude Code proceeds with `pnpm-workspace.yaml`, `turbo.json`, and the root `package.json` workspaces config as specified in the ticket.

---

## 4. Broker connect UX

**Asked of:** Zeshan and Daniel
**Asked on:** 2026-05-17
**Status:** OPEN
**Blocks:** Ticket MIG-P2-04 (onboarding wizard — broker step)

### Context

Alpaca exposes two APIs that ReFi could integrate against:

**Alpaca Broker API** (B2B). White-label broker accounts opened on Alpaca's books. Requires Alpaca onboarding partnership. KYC handled by Alpaca on ReFi's behalf. User experience is more integrated (no leaving ReFi to connect). Requires ReFi to be an Alpaca Broker API partner.

**Alpaca Trading API** (B2C). User opens their own Alpaca account directly. To connect to ReFi, the user generates API keys in Alpaca's dashboard and pastes them into ReFi, or completes an OAuth flow if Alpaca supports it for the user's account type. Less integrated, but no partnership needed.

Per Zeshan's memory, ReFi is non-custodial — assets stay at the user's broker. Both options support this, but they imply different user flows and different account-opening responsibilities.

IBKR and Tradier have similar choices when their drivers come online.

### Questions

1. Which Alpaca API has Daniel built the muxxer against?
2. If Broker API: is the Alpaca partnership in place?
3. If Trading API: OAuth or API-key entry?
4. Either way, what does the UI need to render at `/us/onboarding/broker`?

### Implications for the build

- **Broker API path:** UI initiates account opening via Alpaca's onboarding embed or redirect. Steps: ReFi asks for Alpaca account details → Alpaca handles KYC (overlapping with CCID? clarify) → broker connection established. UI surface: account-opening wizard.

- **Trading API + OAuth:** UI redirects user to Alpaca's OAuth consent screen. On return, ReFi stores OAuth tokens (server-side, encrypted) and treats them as the broker connection. UI surface: "Connect with Alpaca" button.

- **Trading API + API keys:** UI shows instructions for the user to generate keys in Alpaca's dashboard, paste them in ReFi, ReFi validates. UI surface: keypair entry form with validation.

The third option (API keys) is the least friendly UX and tends to surface as "looks unprofessional" feedback from non-technical users. Prefer OAuth or Broker API where possible.

### Decision

(To be filled in)

---

## 5. WalletConnect project ID

**Asked of:** Zeshan or whoever administers the Anthropic/dev secret store
**Asked on:** 2026-05-17
**Status:** OPEN
**Blocks:** Ticket MIG-P1-05 (wallet provider scaffolding)

### Context

RainbowKit and wagmi require a WalletConnect Cloud project ID to enable WalletConnect-compatible wallets (which is most mobile wallets including Trust, Rainbow, Argent, and the WalletConnect-bridged versions of MetaMask Mobile).

A project ID is free to obtain at https://cloud.walletconnect.com (now called Reown Cloud).

### Questions

1. Does ReFi have an existing WalletConnect Cloud account?
2. If yes, what's the project ID for the `refi.trading` domain?
3. If no, who creates the account? Zeshan or Daniel?
4. Where is the project ID stored — GCP Secret Manager, repo `.env.example`, or both?

### Recommended path

Zeshan or Daniel creates a WalletConnect Cloud project named "ReFi.Trading" with allowed origins `https://refi.trading`, `https://staging.refi.trading`, `http://localhost:3000` (dev). The project ID is non-secret (it's a public client ID) and goes in `apps/web/.env.example` with the real value injected at deploy time via Secret Manager.

### Decision

(To be filled in)

---

## Decision log template

When a question is answered, fill in:

```
### Decision

**Decided by:** [name]
**Decided on:** [YYYY-MM-DD]
**Decision:** [one-paragraph summary]
**Rationale:** [why this choice over alternatives]
**Implications:** [what this means for the build]
**Linked artifacts:** [PRs, design docs, counsel memos]
```

Move answered questions to the bottom of this file under a "Resolved" section, with the decision filled in. Keep open questions at the top so the file is a live to-do list.
