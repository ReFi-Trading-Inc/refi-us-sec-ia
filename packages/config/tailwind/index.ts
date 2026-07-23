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
} satisfies Partial<Config["theme"]>;

export const sharedConfig: Omit<Config, "content"> = {
  theme: {
    extend: brandTokens,
  },
  plugins: [],
};
