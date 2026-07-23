# Shell design-system application

**Status:** in progress · **Owner:** frontend · **Slots into:** integration roadmap
Track 2 (full-product surface), and is a prerequisite for any externally shared
`/us` link.

## Why this exists

The authoritative brand is the marketing site (`refi.trading`, source repo
`refi-landing-latest`). The SEC IA shell drifted from it: same _token names_
(`charcoal`, `mint`) but different _values_, and no logo. The visible result on
`https://refi-us-sec-ia-web.vercel.app/us` was a plain text wordmark on an
off-brand green-on-purple palette — recognisably not refi.trading. This work
re-anchors the shell to the authoritative palette and ships the brand lockup.

The gap was never on the plan; that is why it persisted while funnel/back-end
plumbing advanced. This doc puts it on the plan.

## Authoritative palette (source: refi-landing-latest/tailwind.config.js)

| Token           | Marketing value        | Meaning                                            |
| --------------- | ---------------------- | -------------------------------------------------- |
| mint            | `#0CD4A0`              | brand primary; byte-identical to the game phosphor |
| mint-dark       | `#0AB889`              | scale anchor                                       |
| mint-light      | `#4EEDC4`              | scale anchor                                       |
| charcoal        | `#101820`              | primary background (warm slate)                    |
| charcoal-deep   | `#0A0F14`              | deepest surface                                    |
| charcoal-light  | `#1E2A35`              | raised surface                                     |
| charcoal-border | `#2D3A47`              | borders / dividers                                 |
| font            | Inter / JetBrains Mono | already matched in the shell                       |

## Done (this branch)

- [x] Re-anchored `packages/config/tailwind/index.ts` `brandTokens`: `mint-400`
      is now `#0CD4A0` (was `#00B07E`); the mint scale is anchored on
      `#0AB889 / #0CD4A0 / #4EEDC4`; the charcoal scale is a warm slate anchored
      on `#0A0F14 / #101820 / #1E2A35 / #2D3A47` (was purple-tinted). Propagates
      to **every** shell surface (marketing `/us`, investor portal, admin) since
      all consume the shared config.
- [x] Shipped the ReFi mark: `apps/web/public/refi-logo.png` (from
      `refi-landing-latest/public/green-logo-only-square.png`).
- [x] Shared `BrandMark` lockup (`app/us/_components/BrandMark.tsx`): mark +
      `ReFi`.Trading wordmark, matching the marketing header.
- [x] Replaced the plain-text headers on `/us`, `/us/eligibility`,
      `/us/disclosures` with `BrandMark`.
- [x] `pnpm --filter @refi/web build` green.

## Backlog — "it goes deeper than the logo"

Ordered by visible signal. None of these are on other tracks; they belong here.

1. **Typographic scale + spacing rhythm** — the marketing site uses a tighter
   display scale and generous section spacing. The shell's hero/section spacing
   is functional but flat. Port the display sizes and section vertical rhythm.
2. **Hero treatment** — marketing has a gradient/graphic hero; the shell hero is
   text-only on flat charcoal. Add the marketing hero background treatment
   (respecting the buttoned-down, no-ASCII register — this is the hedge-fund
   surface, deliberately contrasting the retro game).
3. **Trust row / "how it works" cards** — align card styling (border, radius,
   hover) to the marketing component library rather than ad-hoc utility classes.
4. **Footer** — port the marketing footer lockup (mark + legal + nav) in place
   of the current text-only footer.
5. **`@refi/ui` audit** — confirm `Button`, `Card`, `Badge`, `StatusBanner`
   render on-brand with the re-anchored tokens; fix any component with
   hard-coded hex that bypasses the token layer.
6. **Investor portal + admin sweep** — the token change reaches these surfaces
   automatically, but they have not been visually reviewed against the brand.
   Walk each once tokens land.
7. **OG/favicon** — shell favicon + Open Graph image using the mark, matching
   the game's `public/favicon.svg` / `og-image.svg` treatment for the shell
   register.

## Non-goals

- No ASCII/retro styling on the shell. That register is the game's, on purpose.
- No change to copy or regulatory language (counsel-owned).
