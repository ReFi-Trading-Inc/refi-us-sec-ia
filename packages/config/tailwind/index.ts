import type { Config } from "tailwindcss";

/**
 * Brand tokens — mirrors the ReFi.Trading Design System
 * (packages/config/design-system/colors_and_type.css, vendored + hashed from
 * Claude Design project 79789eca-2bad-4917-b5e2-fd55f668a62e).
 * `scripts/design-token-parity.ts` fails CI if these values drift from that
 * file or if any documented text/surface pair falls below WCAG AA (4.5:1).
 *
 * Mapping (design-system name → Tailwind name):
 *   gray-50…700 → charcoal-50…700 (text ramp; 700 = default borders)
 *   charcoal-lighter #12211A → charcoal-800 (cards/panels)
 *   charcoal-light   #0C1712 → charcoal-850 (hover rows, zebra, table header)
 *   charcoal         #08110D → charcoal-900 (page)
 *   charcoal-deep    #050806 → charcoal-950 (deepest, overlays)
 *   mint / mint-dark / mint-light → mint-400 / mint-500 / mint-200
 *   phosphor ladder → phosphor.{dim,mid,DEFAULT,hot,paper}
 *   success / warning / error → status.approved / status.warning / status.rejected
 *
 * Accessibility adjustments (documented in docs/design/design-system-alignment-scope.md):
 *   - `status.rejected-text` #E56868: the brand error red #D94C4C measures
 *     4.04:1 on cards — below AA for small text — so text uses the lighter
 *     tint while fills/borders keep the brand value.
 *   - `status.expired` uses gray-400 (#7FA595, 6.1:1), not gray-500 (3.98:1).
 *   - `status.system` (informational) is the neutral gray-300: the design
 *     system defines no info hue and forbids purple/indigo/violet.
 */
export const brandTokens = {
  colors: {
    charcoal: {
      50: "#EFFAF5",
      100: "#DCEFE7",
      200: "#BFDCD0",
      300: "#A8C7BA",
      400: "#7FA595",
      500: "#5C8474",
      600: "#3E6153",
      700: "#24463A",
      800: "#12211A",
      850: "#0C1712",
      900: "#08110D",
      950: "#050806",
    },
    mint: {
      950: "#002419",
      900: "#00382A",
      800: "#004D3A",
      700: "#067050",
      600: "#099C74",
      500: "#0AB889",
      400: "#0CD4A0",
      300: "#2FE0B3",
      200: "#4EEDC4",
      100: "#99F4DC",
      50: "#DFFAF2",
      logo: "#43D4A0",
    },
    phosphor: {
      dim: "#27634E",
      mid: "#0A8F68",
      DEFAULT: "#0CD4A0",
      hot: "#79FFD7",
      paper: "#B8FFD9",
    },
    status: {
      active: "#0CD4A0",
      approved: "#10B981",
      rejected: "#D94C4C",
      "rejected-text": "#E56868",
      warning: "#D6A647",
      expired: "#7FA595",
      system: "#A8C7BA",
    },
  },
  fontFamily: {
    sans: ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
    mono: [
      "var(--font-jetbrains-mono)",
      "JetBrains Mono",
      "DM Mono",
      "ui-monospace",
      "monospace",
    ],
  },
  // Terminal-sharp: nothing exceeds 4px (design system radius scale).
  borderRadius: {
    none: "0px",
    sm: "2px",
    DEFAULT: "2px",
    md: "3px",
    lg: "4px",
    xl: "4px",
    "2xl": "4px",
    "3xl": "4px",
    full: "9999px",
  },
  boxShadow: {
    card: "0 1px 3px rgba(0,0,0,0.30)",
    modal: "0 4px 16px rgba(0,0,0,0.50)",
    dropdown: "0 2px 8px rgba(0,0,0,0.40)",
    glow: "0 0 4px rgba(12,212,160,0.22), 0 0 12px rgba(12,212,160,0.08)",
    none: "none",
  },
  transitionDuration: {
    state: "150ms",
    panel: "200ms",
  },
} satisfies Partial<Config["theme"]>;

export const sharedConfig: Omit<Config, "content"> = {
  theme: {
    extend: brandTokens,
  },
  plugins: [],
};
