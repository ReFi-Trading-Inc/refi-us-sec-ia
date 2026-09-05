# Design-system alignment — scope (measure-only)

**Status:** SCOPING. Nothing in the product or the design system has been
changed by this document. Every "decision" below is a question for Zeshan;
none is pre-decided.

**Sources measured (2026-09-05):**

- Claude Design project **ReFi.Trading Design System**
  (`79789eca-2bad-4917-b5e2-fd55f668a62e`, type design-system, owner Zeshan,
  updated 2026-09-05): `README.md`, `SKILL.md`, `colors_and_type.css`,
  `styles.css`, `_ds_manifest.json` (namespace `ReFiTradingDesignSystem_79789e`),
  `components/{Badge,Button,Card,Gauge,Metric,Sparkline}` (`.jsx` + `.d.ts`),
  `assets/` (9 logo files incl. `mark-green.svg`, `logo-full.svg`), `fonts/`
  (DM Sans/Mono/Serif, Friz Quadrata), 24 `preview/` cards, two UI kits.
- Repo: `packages/config/tailwind/index.ts` (shared theme), `packages/ui`
  (14 components: Badge, Button, Card, Checkbox, Gauge, Input, ModeBadge,
  Radio, Select, Skeleton, StatusBanner, Table, Toast + index; curated Lucide
  re-exports), `apps/web/app/layout.tsx` (next/font), `globals.css`,
  `us/_components/BrandMark.tsx`, `public/refi-logo.png`, `opengraph-image.tsx`.

## 1. Gap register (design system → repo)

| Area                                                                            | Design system (authoritative brand)                                                                                            | Repo today                                                                                                                                                           | Gap class                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sans font                                                                       | **DM Sans** 400–800 (self-hosted `.ttf`); README flags v1.0 PDF said Inter                                                     | **Inter** via `next/font/google`, CSS var `--font-inter`                                                                                                             | **DECISION D1** — the system's own README asks for confirmation                                                                                                                     |
| Mono font                                                                       | `--font-mono: "JetBrains Mono", "DM Mono"`; README body text says DM Mono for numbers; manifest reports DM Mono `unreferenced` | **JetBrains Mono** via next/font, `--font-jetbrains-mono`                                                                                                            | Internally inconsistent in the system; repo matches the token as written. **D1**                                                                                                    |
| Page / surface backgrounds                                                      | Green-tinted terminal ladder `#050806 / #08110D / #0C1712 / #12211A`, border `#1C3A2E`                                         | Warm slate `charcoal-950 #0A0F14 … 500 #2D3A47`; page `bg-charcoal-900 #101820`, cards `charcoal-800 #16212C`                                                        | **Divergent palette** — README calls the green tint "the single highest-leverage thing"; repo comment calls its slate "authoritative refi.trading palette (marketing site)". **D2** |
| Neutral text ramp                                                               | Green-tinted `gray-50…900` (`#EFFAF5 … #0C1712`), primary text `#D8EEE5`                                                       | Slate `charcoal-50…400` (`#EDF1F5 … #47566A`) used as text; primary `charcoal-50`                                                                                    | Same as D2                                                                                                                                                                          |
| Accent                                                                          | `#0CD4A0` phosphor; hover `#0AB889`; light `#4EEDC4`; logo tint `#43D4A0`; 5-step phosphor ladder                              | `mint-400 #0CD4A0`, `mint-500 #0AB889`, `mint-200 #4EEDC4` — **matches**; no phosphor-dim/hot/paper-green, no `mint-logo`                                            | Additive only                                                                                                                                                                       |
| Status                                                                          | success `#10B981`, warning `#D6A647`, error `#D94C4C`; **no info/blue**; purple/indigo/violet forbidden                        | `status.active/approved #0CD4A0`, `rejected #E5534B`, `warning #D08700`, `expired #6B7A8C`, `system #4D9FE0` (blue)                                                  | Values differ; repo has an extra blue "system/info" color the system does not define. **D3**                                                                                        |
| Radius                                                                          | Sharp: 2px controls, 3px panels/cards (app ceiling), 4px web max; "nothing exceeds 4px"                                        | Tailwind defaults: buttons/inputs `rounded-md` 6px, cards/tables/toasts `rounded-lg` 8px, badges `rounded-full` pills; 22 further `rounded-*` uses in `apps/web/app` | **Systematic** — a theme-level radius override fixes primitives; pills need a per-site decision. **D4**                                                                             |
| Shadow                                                                          | Flat at rest; `shadow-card 0 1px 3px`, `shadow-modal`, `shadow-dropdown`; no glow on investor surfaces beyond one hero moment  | Toast uses `shadow-lg`; cards flat                                                                                                                                   | Small                                                                                                                                                                               |
| Focus ring                                                                      | 2px mint, 30% alpha                                                                                                            | `ring-2 ring-mint-400` + offset                                                                                                                                      | Near-match                                                                                                                                                                          |
| Motion                                                                          | ≤300ms; 150ms state, 200ms panel; reduced-motion respected                                                                     | `transition-colors`, shimmer 1500ms                                                                                                                                  | Near-match; add reduced-motion rule                                                                                                                                                 |
| Badge vocabulary                                                                | `active · buy · sell · pending · neutral`                                                                                      | `active · approved · rejected · warning · expired · system · neutral · mint`; live uses: warning 8, neutral 4, active 2, rejected 1                                  | Vocabularies differ. **`buy`/`sell` must NOT enter the Signal product** (no per-trade semantics; tripwire + E2E forbid BUY/SELL controls). **D5**                                   |
| Button                                                                          | `primary · secondary · tertiary · danger`, sizes `sm · md`                                                                     | Same four variants, sizes `sm · md · lg`, plus `loading`                                                                                                             | Match; `lg` is a repo extension                                                                                                                                                     |
| Card                                                                            | `title`, `right` slot, `hoverable`, `pad`                                                                                      | `Card/CardContent/…` composition                                                                                                                                     | Structural only                                                                                                                                                                     |
| Gauge                                                                           | `pct` 0–100, thresholds mint <50 / amber 50–79 / red ≥80                                                                       | `Gauge.tsx` exists — thresholds to compare                                                                                                                           | Verify                                                                                                                                                                              |
| Metric, Sparkline                                                               | Present in system                                                                                                              | Absent in repo                                                                                                                                                       | Additive (only if a page needs them)                                                                                                                                                |
| Input, Select, Checkbox, Radio, Table, Toast, Skeleton, StatusBanner, ModeBadge | Only Inputs/Table/Toast exist as preview specimens, no React source                                                            | Full React implementations                                                                                                                                           | **Repo is richer** — candidate for reverse sync (repo → system)                                                                                                                     |
| Icons                                                                           | Lucide only, no emoji                                                                                                          | `lucide-react` curated re-exports                                                                                                                                    | Match                                                                                                                                                                               |
| Logo                                                                            | `assets/mark-green.svg` (+ PNG lockups); clear space ≥50% height; never recolor                                                | `public/refi-logo.png` (63 KB PNG, provenance undocumented) in `BrandMark` and OG image; wordmark rendered as two-color text                                         | Replace PNG with the system's SVG mark; confirm the two-color CSS wordmark matches `preview/brand-wordmark.html`. **D6**                                                            |
| Voice / casing                                                                  | Title Case buttons, UPPERCASE only for short badges, no emoji, numbers in mono                                                 | Largely followed; `.font-numeric` helper exists                                                                                                                      | Audit only; compliance copy (`scan-copy`) is unaffected by styling                                                                                                                  |

## 2. Decisions needed before any code (exact questions)

- **D1 Fonts.** Adopt DM Sans for all verbal text? And for numerics: JetBrains
  Mono (token as written) or DM Mono (README prose)? The system's own README
  asks for this confirmation. Self-host the `.ttf` files from the system or
  use `next/font/google` (DM Sans/DM Mono are on Google Fonts)?
- **D2 Palette.** Replace the repo's warm-slate charcoal ramp with the
  green-tinted terminal ladder and neutral ramp? This touches every page
  (29 files reference `charcoal-*`/`mint-*` classes) but is a **token-value**
  change: class names stay, values change, so the blast radius is visual, not
  structural.
- **D3 Status colors.** Adopt `#10B981 / #D6A647 / #D94C4C` and drop the blue
  `status.system` (used by `StatusBanner variant="info"`)? If an info color is
  still wanted, the system must define one first (blue is not forbidden, but
  it is not in the system).
- **D4 Radius.** Cap at the system's 2/3/4 px? Badges are `rounded-full`
  pills today; the system's badge specimen decides whether pills survive.
- **D5 Badge vocabulary.** Keep the repo's compliance-oriented set
  (`approved/rejected/warning/expired`) and map colors to the system's
  status trio, rather than importing `buy/sell`. Recommended: never import
  `buy`/`sell` into the Signal app.
- **D6 Logo.** Replace `public/refi-logo.png` with `assets/mark-green.svg`
  (keeping its baked `#43D4A0`), and re-render the OG image from it?
- **D7 Direction of sync.** (a) system → repo for tokens/brand (this doc's
  default), and (b) repo → system for the 8 React components the system lacks,
  via the `/design-sync` flow (incremental, per component, never wholesale).
  Do both, or only (a) for now?

## 3. Proposed slices (each its own PR, standard gate set, stop before merge)

1. **Tokens (D1–D4).** `packages/config/tailwind`: charcoal/gray/mint/phosphor/
   status values, `borderRadius` overrides, shadows, font families;
   `layout.tsx` fonts; `globals.css` reduced-motion + `.mono`. No component
   API change. Add a **token-parity test** that reads the system's
   `colors_and_type.css` snapshot (vendored under `packages/config/design-system/`
   with its hash) and asserts the Tailwind values match — the same
   "vendored + hashed" pattern used for Daniel's contract package.
2. **Primitives.** `packages/ui` Badge/Button/Card/Input/Select/Table/Toast/
   Skeleton radius and color classes to the new tokens; Gauge thresholds
   verified against the system's `Gauge.jsx`. Storybook is absent; verify via
   the existing E2E (which has **zero** style assertions today, so visual
   regressions are not caught — add a small Playwright screenshot check for
   one page per surface if wanted).
3. **Brand assets (D6).** SVG mark, `BrandMark`, OG image, favicon audit.
4. **Page-level radius/pill cleanup (D4)** across the 7 files listed by the
   measurement, plus `SimulatedDataBadge`.
5. **Reverse sync (D7b).** Push repo-only components into the system through
   `/design-sync`, one component at a time, after 1–2 land so the pushed code
   already speaks the system's tokens.

**Out of scope / unaffected:** copy (`scan-copy` content files), route
manifest, tripwire boundary, compliance assertions, BFF/contract code, E2E
test ids. No `buy`/`sell` semantics enter the Signal product.

## 4. Risks

- The repo's shared theme comment claims its slate palette is "authoritative
  refi.trading (marketing site)". The design system says the opposite and
  dates itself June 2026 with a 2026-09-05 update. **D2 must be an explicit
  call**, not inferred from either comment.
- Self-hosting fonts adds ~1 MB of `.ttf` to `public/`; `next/font/google`
  avoids that but the system's `.ttf` are the reference glyphs.
- The system's `SKILL.md` and `ui_kits/trading-app/README.md` still say
  "≤6px radius" while `colors_and_type.css` and the README say ≤4px; the
  tokens file is treated as authoritative here.
