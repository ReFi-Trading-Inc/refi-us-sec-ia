import type { Config } from 'tailwindcss';

export const brandTokens = {
  colors: {
    charcoal: {
      950: '#08080F',
      900: '#0F0F1A',
      800: '#161623',
      700: '#1E1E2D',
      600: '#272738',
      500: '#343449',
      400: '#4D4D6B',
      300: '#72728F',
      200: '#9F9FBB',
      100: '#CBCBDC',
      50: '#EDEDF5',
    },
    mint: {
      950: '#002419',
      900: '#003826',
      800: '#004D34',
      700: '#006344',
      600: '#007A54',
      500: '#009468',
      400: '#00B07E',
      300: '#00CC94',
      200: '#4DDDB0',
      100: '#99EDD0',
      50: '#DFFAF2',
    },
    status: {
      active: '#00CC94',
      approved: '#00CC94',
      rejected: '#E5534B',
      warning: '#D08700',
      expired: '#72728F',
      system: '#4D9FE0',
    },
  },
  fontFamily: {
    sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
    mono: ['var(--font-jetbrains-mono)', 'Menlo', 'monospace'],
  },
} satisfies Partial<Config['theme']>;

export const sharedConfig: Omit<Config, 'content'> = {
  theme: {
    extend: brandTokens,
  },
  plugins: [],
};
