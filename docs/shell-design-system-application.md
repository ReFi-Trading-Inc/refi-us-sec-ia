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
- [x] **Typographic scale + spacing rhythm** — hero h1 now uses the marketing
      display scale (`text-4xl/5xl/6xl font-bold tracking-tight`), section
      headings use `text-3xl md:text-4xl font-bold tracking-tight`
      (marketing `.section-title`), sections use `py-20 md:py-24` rhythm.
- [x] **Hero treatment** — ported the marketing background treatment in the
      buttoned-down register: `.grid-pattern` dot grid (mint at 15% alpha, from
      marketing `index.css`) + charcoal gradient + soft mint glow blurs. No
      photo, no animation — deliberately quieter than refi.trading's hero.
- [x] **Trust row / "how it works" cards** — both grids now use the marketing
      card treatment: `rounded-lg border-charcoal-500/60 bg-charcoal-700/40 p-6`
      with `hover:border-mint-400/30` (from marketing `.card` / `FeaturePill`).
- [x] **Footer** — shared `SiteFooter` lockup (`_components/SiteFooter.tsx`):
      BrandMark + entity/status line + nav + the disclaimer in a bordered panel
      (marketing footer's compliance-box treatment). Applied on `/us`,
      `/us/eligibility`, `/us/disclosures`; copy unchanged (counsel-owned).
- [x] **`@refi/ui` audit** — grepped `packages/ui/src` for hard-coded hex:
      none. All components go through the token layer, so the re-anchored
      palette reaches them automatically.
- [x] **Investor portal sweep (code level)** — grepped `apps/web/app` for
      hard-coded hex and off-token Tailwind palette classes; fixed everything
      found: chart colors on `/us/app/home` + `/us/app/portfolio` (emerald/zinc
      → mint/charcoal tokens), `text-rose-*` P&L colors → `text-status-rejected`,
      the disconnect-confirm panel on `/us/app/account`, the amber
      `SimulatedDataBadge` → `status-warning`, `text-red-400` on the alpha-claim
      error state, and the RainbowKit wallet-modal accent (was old teal
      `#2dd4bf` → `#0CD4A0` on `#0A0F14`).
- [x] **OG/favicon** — `app/icon.png` (mark at 128px, Next app-router favicon
      convention) and `app/opengraph-image.tsx` (1200×630 via `next/og`: mark +
      wordmark + counsel-confirmed hero headline on charcoal with the dot
      grid). The game's SVG assets weren't reachable from this repo, so the
      shell's treatment is authored from the same tokens instead.

## Backlog — "it goes deeper than the logo"

1. **Investor portal + admin visual walk** — the token fixes above are
   code-level; each portal/admin screen still needs one human visual pass
   against the brand once deployed.

## Non-goals

- No ASCII/retro styling on the shell. That register is the game's, on purpose.
- No change to copy or regulatory language (counsel-owned).
