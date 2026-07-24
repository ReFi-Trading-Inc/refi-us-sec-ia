/**
 * S2 CSRF enforcement (Sprint 1).
 *
 * Proves the origin/referer check on mutating BFF routes rejects
 * cross-origin credentialed calls with 403, and accepts same-origin.
 * Covers both surfaces:
 *   - /api/us/eligibility (public POST route, direct enforceCsrfOrigin call)
 *   - /api/v1/investor/* (investor mutations via bffMutate wrapper)
 *
 * We only test one investor route (subscription-mode) since every mutation
 * runs through the same bffMutate wrapper — the check is exercised once at
 * the wrapper level.
 */
import { test, expect } from "./fixtures";
import { request as playwrightRequest } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

const ELIGIBILITY_BODY = {
  state: "NY",
  isUsPerson: true,
  dob: "1990-01-01",
};

test.describe("BFF CSRF enforcement (S2)", () => {
  test("mutation with untrusted Origin returns 403", async ({ baseURL }) => {
    const ctx = await playwrightRequest.newContext({ baseURL });
    const res = await ctx.post("/api/us/eligibility", {
      headers: { origin: "https://evil.example.com" },
      data: ELIGIBILITY_BODY,
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("forbidden");
    await ctx.dispose();
  });

  test("mutation with untrusted Referer (no Origin) returns 403", async ({
    baseURL,
  }) => {
    const ctx = await playwrightRequest.newContext({ baseURL });
    const res = await ctx.post("/api/us/eligibility", {
      headers: { referer: "https://evil.example.com/some/page" },
      data: ELIGIBILITY_BODY,
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("mutation with no Origin and no Referer returns 403", async ({
    baseURL,
  }) => {
    const ctx = await playwrightRequest.newContext({ baseURL });
    // APIRequestContext doesn't send Origin/Referer by default when we
    // provide neither — the fingerprint of a scripted (non-browser) call.
    const res = await ctx.post("/api/us/eligibility", {
      data: ELIGIBILITY_BODY,
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("mutation with trusted Origin is accepted (passes CSRF, may still fail auth)", async ({
    baseURL,
  }) => {
    const ctx = await playwrightRequest.newContext({ baseURL });
    const res = await ctx.post("/api/us/eligibility", {
      headers: { origin: "http://localhost:3000" },
      data: ELIGIBILITY_BODY,
    });
    // Public route — no auth barrier. CSRF passes → 200.
    expect(res.status()).toBe(200);
    await ctx.dispose();
  });

  test("investor mutation with untrusted Origin returns 403 before auth check", async ({
    baseURL,
  }) => {
    // No auth cookies; CSRF must fire first so we get 403 (not 401).
    const ctx = await playwrightRequest.newContext({ baseURL });
    const res = await ctx.post("/api/v1/investor/subscription-mode", {
      headers: {
        origin: "https://evil.example.com",
        cookie: `us_eligibility_v1=${E2E_USERS.signal.eligibilityCookie}`,
      },
      data: { mode: "signal" },
    });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});
