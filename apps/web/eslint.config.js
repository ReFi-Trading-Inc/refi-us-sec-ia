import { nextConfig } from "../../packages/config/eslint/index.js";

const config = [
  ...nextConfig,
  {
    // Generated artifacts: Playwright HTML traces and the MSW service worker
    // bundle. These are not source code; linting them is meaningless and
    // emits noise on minified output.
    ignores: [
      "playwright-report/**",
      "test-results/**",
      "public/mockServiceWorker.js",
      ".next/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
