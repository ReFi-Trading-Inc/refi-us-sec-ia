import type { Config } from 'tailwindcss';
import { sharedConfig } from '../../packages/config/tailwind/index';

const config: Config = {
  ...sharedConfig,
  content: [
    './app/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
