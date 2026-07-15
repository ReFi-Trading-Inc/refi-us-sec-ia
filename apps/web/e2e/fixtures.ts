/**
 * Shared Playwright test fixture.
 *
 * Overrides `page.goto` to default `waitUntil: "domcontentloaded"` instead of
 * `"load"`. Next.js dev mode + our client Providers (React Query, MSW gate,
 * PostHog wrapper) keep long-poll fetches and HMR websocket streams open,
 * so the browser `load` event does not fire promptly even after the page
 * is fully interactive. Every spec should import `test` from this module
 * rather than directly from `@playwright/test`.
 */
import { test as base, expect } from "@playwright/test";

/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture builder; `use` is the fixture-teardown callback, not a React Hook. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = async (url, opts) =>
      originalGoto(url, { waitUntil: "domcontentloaded", ...opts });
    await use(page);
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

export { expect };
