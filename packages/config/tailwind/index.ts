import type { Config } from "tailwindcss";

// Anchored on the authoritative refi.trading palette (marketing site):
//   mint  #0CD4A0 (brand primary / game phosphor, byte-identical),
//         #0AB889 (dark) and #4EEDC4 (light) as scale anchors;
//   charcoal is a warm slate anchored on #0A0F14 / #101820 / #1E2A35 / #2D3A47.
// This intentionally replaces the earlier purple-tinted charcoal and teal mint
// so every shell surface renders in the same green-on-black as refi.trading.
export const brandTokens = {
  colors: {
    charcoal: {
      950: "#0A0F14",
      900: "#101820",
      800: "#16212C",
      700: "#1E2A35",
      600: "#253340",
      500: "#2D3A47",
      400: "#47566A",
      300: "#6B7A8C",
      200: "#9AA7B5",
      100: "#C7D0D9",
      50: "#EDF1F5",
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
    },
    status: {
      active: "#0CD4A0",
      approved: "#0CD4A0",
      rejected: "#E5534B",
      warning: "#D08700",
      expired: "#6B7A8C",
      system: "#4D9FE0",
    },
  },
  fontFamily: {
    sans: ["var(--font-inter)", "system-ui", "sans-serif"],
    mono: ["var(--font-jetbrains-mono)", "Menlo", "monospace"],
  },

  // ─── Trading-application register ─────────────────────────────────────────
  //
  // Source: the "ReFi.Trading Design System" canvas, `ui_kits/trading-app`
  // (app.css) — the dense workstation surface, as distinct from the marketing
  // site. Every key below is ADDITIVE: no existing utility changes meaning, so
  // adding these cannot regress the marketing, portal or admin surfaces.
  //
  // The canvas's newer `colors_and_type.css` moves the charcoal ladder to a
  // green-tinted terminal palette (#08110D/#12211A) and sharpens radii to
  // 2/3px. The trading-app kit has not absorbed that yet, and this repo's
  // palette matches the kit, so the kit's values are what we encode. Revisit
  // together when the kit catches up.

  borderRadius: {
    // Terminal-sharp geometry. `rounded-lg` (8px) stays reserved for the
    // landing page; nothing in the application register reaches it.
    "app-input": "2px", // inputs, badges
    "app-btn": "4px", // buttons, dropdowns
    "app-card": "6px", // cards, panels, modals — the app ceiling
  },

  boxShadow: {
    // Cards rest FLAT and elevate on hover only. No glows, no mint shadows.
    card: "0 1px 3px rgba(0,0,0,0.30)",
    modal: "0 4px 16px rgba(0,0,0,0.50)",
    dropdown: "0 2px 8px rgba(0,0,0,0.40)",
  },

  fontSize: {
    // Fixed (never fluid) workstation scale, 11-24px.
    "app-micro": ["11px", { lineHeight: "1.3" }], // fine print, disclosures
    "app-caption": ["12px", { lineHeight: "1.4" }], // metadata, badges
    "app-body-sm": ["13px", { lineHeight: "1.5" }], // compact/data body
    "app-body": ["14px", { lineHeight: "1.5" }], // prose
    "app-h3": ["14px", { lineHeight: "1.4" }], // minor heading (600)
    "app-h2": ["16px", { lineHeight: "1.3" }], // panel/card title (600)
    "app-h1": ["20px", { lineHeight: "1.3" }], // section heading (700)
    "app-value": ["24px", { lineHeight: "1.2" }], // headline financial value
  },

  transitionDuration: {
    state: "150ms", // hover / focus / active colour
    panel: "200ms", // panel + row movement
    "toast-in": "300ms",
    "toast-out": "200ms",
  },
} satisfies Partial<Config["theme"]>;

export const sharedConfig: Omit<Config, "content"> = {
  theme: {
    extend: brandTokens,
  },
  plugins: [],
};
