# Investor product (P1) — design-system and architecture decisions

**Status:** DECIDED (founder, 2026-09-12) · **Applies to:** the P1A/P1B/P1C
investor product track · **Owner:** frontend

Every entry here is an accepted, deliberate position. None is an accidental
deviation. Items marked **POST-DEMO** are scheduled work, not open questions —
the September demo window (NEXTAI 2026-09-15, ALL IN 2026-09-16) is a freeze in
which only presenter-safe change is permitted.

---

## 1. Design-system generation — the workstation register

The authoritative canvas (`ReFi.Trading Design System`, project
`79789eca-2bad-4917-b5e2-fd55f668a62e`) contains **two generations**:

|                    | `colors_and_type.css`             | `ui_kits/trading-app/app.css` |
| ------------------ | --------------------------------- | ----------------------------- |
| application ground | `#08110D` (green-tinted terminal) | `#101820`                     |
| card / panel       | `#12211A`                         | `#2D3A47`                     |
| buttons            | 2px                               | **4px**                       |
| cards / panels     | 3px                               | **6px**                       |
| inputs / badges    | 2px                               | **2px**                       |
| warning / error    | `#D6A647` / `#D94C4C`             | `#F59E0B` / `#EF4444`         |

**Decision:** this release uses the `ui_kits/trading-app/app.css` **workstation
register**. It is what this repository's palette already encodes, so there is
three-way agreement between the kit, the repo and the founder directive.

Preserved for this release: charcoal `#101820` application ground, the existing
workstation charcoal ladder, 4px buttons, 6px cards/panels, 2px inputs/badges,
the current workstation semantic colours, and the newly added shadow, type-scale
and motion tokens.

**POST-DEMO DESIGN SYSTEM MIGRATION REVIEW** — the newer `colors_and_type.css`
green-terminal generation is a separate, planned migration. Do **not** mix
generations opportunistically: adopting its palette without its radii (or the
reverse) produces a surface that matches neither.

## 2. Typography — Inter retained

Both canvas generations specify **DM Sans**, and `colors_and_type.css` states it
explicitly ("replaces the v1.0 'Inter' spec"). The application loads Inter.

**Decision:** no font change before the demo.

**DESIGN DEBT — AUTHORITATIVE CANVAS SPECIFIES DM SANS.** The change itself is
small (`apps/web/app/layout.tsx`, via `next/font/google`) but it propagates
through the shared `fontFamily.sans` token to _every_ application surface —
marketing, portal and admin included. It is not required for functional P1
completion, so it is scheduled as an isolated visual-regression migration after
2026-09-16, not folded into a feature PR.

Mono is unchanged: the canvas specifies `"JetBrains Mono", "DM Mono"`, and the
repo already loads JetBrains Mono.

## 3. Shared `@refi/ui` — divergence recorded, not fixed here

`@refi/ui` also backs the marketing site, the investor portal and admin. Several
of its primitives predate the current design system:

| Primitive      | `@refi/ui` today      | Workstation register |
| -------------- | --------------------- | -------------------- |
| `Button`       | `rounded-md` (6px)    | 4px                  |
| `Input`        | `rounded-md` (6px)    | 2px                  |
| `Badge`        | `rounded-full` (pill) | 2px                  |
| `Card`         | `rounded-lg` (8px)    | 6px                  |
| `Card` padding | `p-6` (24px)          | 16px                 |

**Decision:** shared `@refi/ui` is **not modified** in this track. The
product-scoped primitives in `apps/web/app/_components/product/primitives.tsx`
are an accepted **containment strategy** for this release: the product surfaces
are design-system-correct without repainting unrelated surfaces inside the
freeze.

**POST-DEMO** — evaluate convergence of the shared primitives separately, with
full visual-regression coverage across marketing, portal and admin.

## 4. Card border — intentional repository adaptation

The canvas kit names the card border `--g700 #374151`, a **stock grey**. This
repository deliberately replaced stock greys with the brand-owned charcoal
ladder (see `shell-design-system-application.md`), and the canvas's own newer
token file agrees the neutral ramp is brand-owned rather than a grey scale.

**Decision:** the product panel border uses `charcoal-400` from the ReFi ramp
rather than reintroducing `#374151`. This preserves the kit's _relationship_ —
border one step lighter than the panel — while staying inside the established
brand palette. Hierarchy and contrast are preserved and asserted
(`investor-product-design.spec.ts`).

This is an **intentional repository adaptation, not an accidental deviation.**

## 5. Route architecture — `/us/product/*` is a successor path

**TEMPORARY ADAPTER-DRIVEN SUCCESSOR PATH.**

| Route family       | Role                                       |
| ------------------ | ------------------------------------------ |
| `/us/onboarding/*` | current BFF-wired / demo path              |
| `/us/product/*`    | adapter-driven future path (fixture-first) |

`/us/product/*` exists so the investor journey can be built and demonstrated
against `InvestorProductAdapter` while Daniel's membership/admission/brokerage
contracts are unfinished. It is **accepted for fixture-first development only.**

It must **not** evolve into a second permanent investor onboarding
architecture. Once Daniel's transport implementation satisfies
`InvestorProductAdapter`:

1. map his backend contract into the adapter;
2. converge the product UX into the canonical `/us/onboarding/*` route
   structure;
3. retire the duplicate route behaviour.

**Do not independently evolve both route families.** A change to the investor
journey belongs in one of them, with the other converging — never in both.

## 6. Runtime tier gate — server-side `REFI_ENV`

The fixture/transport decision reads the **server-only `REFI_ENV`**, handed down
by the `/us/product` layout (which is `force-dynamic` for exactly this reason),
not the build-time `NEXT_PUBLIC_REFI_ENV`.

**Decision:** approved as the correct security boundary. Two reasons:

- it follows this repository's standing rule (`src/lib/config/env.ts`): the
  public constant exists so the UI can _label_ an environment, while security
  gates read the server-only tier;
- `NEXT_PUBLIC_*` is baked at build time, so a single artifact promoted across
  tiers would carry a stale verdict. `REFI_ENV` is evaluated per request on the
  tier actually serving.

Invariants that must hold: production + fixture adapter **fails closed**; no
hostname inference; no client-side environment value is ever authority.

## 7. UX positions accepted

- **No auto-advance after connecting.** The investor must see the connected
  account, its environment, the connection state, and retain the ability to
  disconnect or correct, before continuing. Auto-advancing hid the one state in
  which a mistaken account is cheap to fix.
- **Disabled primary renders as a neutral fill**, not faded mint. A dimmed
  primary still reads as _the_ action, which is the wrong signal on a gated
  control such as Confirm Subscription.
- **`Num` forwards props**, so financial values can carry test and data
  attributes.
- **Late async responses are cancelled.** Both product panels fetch inside the
  effect and discard responses that land after unmount or a newer run.

## 8. Boundaries this track does not cross

Unchanged and not negotiable within P1: no Alpaca activation, no real brokerage
credentials, LIVE disabled by capability authority, no Production Socure
traffic, no Production alerting change, and no invented Daniel backend
contracts. Frontend displays projected state only; admission, membership,
`AccountAuthorization`, brokerage and subscription persistence remain
backend-owned. F/G remain superseded — no frontend `setAdmitted`, no
onboarding-status cohort inference, no local canonical admission, no local
trading authorization.
