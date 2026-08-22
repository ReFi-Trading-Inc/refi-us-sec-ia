/**
 * E2E direct-API helper. TEST-ONLY — never imported by application code.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * Several specs POST a mutating BFF route directly, bypassing the UI, to prove
 * a server-side guard holds even when the client misbehaves — e.g. "resume
 * still fails closed while a system pause is active", or "an Idempotency-Key
 * replay does not create a second policy version".
 *
 * Those routes sit behind the same-origin CSRF guard in
 * `apps/web/src/lib/bff/origin.ts`, which fails closed when a request declares
 * no `Origin` (and no usable `Referer`) — the classic CSRF fingerprint for a
 * credentialed browser mutation. Playwright's `page.request` does NOT
 * synthesise an `Origin` for a bare `post()`, so those calls were rejected at
 * the CSRF layer with 403 before the guard under test ever ran. The specs
 * asserted 412/200 and failed for a reason unrelated to what they cover.
 *
 * ─── What this deliberately does NOT do ────────────────────────────────────
 *
 * It does not weaken or bypass the CSRF guard, and production behaviour is
 * untouched. It supplies the `Origin` a real same-origin client — the app's own
 * `fetch` — always sends, so the request reaches the business-logic guard the
 * spec is actually asserting on. A genuinely cross-origin attacker still gets
 * 403; that path is covered separately by the CSRF contract assertions, and
 * `postCrossOrigin` below exists so a spec can exercise it explicitly rather
 * than relying on an absent header.
 */
import type { Page, APIResponse } from "@playwright/test";

/**
 * The origin the app is served from, matching `baseURL` in playwright.config.
 * Kept in sync via the same `PLAYWRIGHT_BASE_URL` override the config reads, so
 * a non-default port cannot silently desynchronise the two.
 */
export const E2E_ORIGIN =
  process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000";

type PostOptions = {
  headers?: Record<string, string>;
  data?: unknown;
};

/**
 * POST a BFF route the way the app's own client does: same-origin, JSON body.
 *
 * `content-type: application/json` is defaulted (every current caller sets it)
 * and per-call `headers` win, so a spec can still override either header when
 * that is the thing under test.
 */
export async function postSameOrigin(
  page: Page,
  url: string,
  options: PostOptions = {},
): Promise<APIResponse> {
  return page.request.post(url, {
    headers: {
      "content-type": "application/json",
      origin: E2E_ORIGIN,
      ...options.headers,
    },
    data: options.data ?? {},
  });
}

/**
 * POST a BFF route declaring a foreign origin — the CSRF case. Use this when a
 * spec asserts the 403, so the intent is explicit in the request rather than
 * implied by a missing header.
 */
export async function postCrossOrigin(
  page: Page,
  url: string,
  options: PostOptions = {},
): Promise<APIResponse> {
  return postSameOrigin(page, url, {
    ...options,
    headers: { ...options.headers, origin: "https://attacker.example" },
  });
}
