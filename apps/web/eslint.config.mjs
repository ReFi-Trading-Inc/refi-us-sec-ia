import { nextConfig } from "../../packages/config/eslint/index.js";

const config = [
  ...nextConfig,
  {
    // Generated artifacts: Playwright HTML traces, the MSW service worker
    // bundle, and the prebuilt conference booth deck. These are not source
    // code; linting them is meaningless and emits noise on minified output.
    ignores: [
      "playwright-report/**",
      "test-results/**",
      "public/mockServiceWorker.js",
      "public/booth/**",
      ".next/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
