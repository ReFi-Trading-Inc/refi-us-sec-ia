import { test, expect } from "./fixtures";
import { request as playwrightRequest } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

// Eligibility-only: the SIWE connect page is reached after the eligibility
// gate but before a real session exists. Using the seeded `signal` user value
// makes the BFF dev-fallback derive a consistent authId, so the AuthProvider
// resolves the unauthenticated state cleanly instead of looping.
const ELIGIBILITY_COOKIE_ONLY = [
  {
    name: "us_eligibility_v1",
    value: E2E_USERS.signal.eligibilityCookie,
    domain: "localhost",
    path: "/",
  },
];

test.describe("SIWE auth", () => {
  test("connect page renders wallet button", async ({ page }) => {
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    await page.goto("/us/auth/connect");
    // Wait for H1 before further assertions — Next.js dev compiles routes
    // on-demand and the first parallel navigation can hit a transient 404.
    await expect(
      page.getByRole("heading", { level: 1, name: /verify your identity/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect wallet/i }),
    ).toBeVisible();
  });

  test("shows SIWE copy on the connect page", async ({ page }) => {
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    await page.goto("/us/auth/connect");
    await expect(
      page.getByRole("heading", { level: 1, name: /verify your identity/i }),
    ).toBeVisible();
    // Anchor to the unique body sentence on the connect card. The earlier
    // regex `/ethereum wallet|sign in|wallet/i` resolved to both the
    // "Connect your wallet to continue" heading and this paragraph and
    // tripped strict-mode.
    await expect(
      page.getByText(/uses your Ethereum wallet as your login/i),
    ).toBeVisible();
  });
});

// S1 fail-closed: an invalid session cookie must NOT degrade to devFallback.
// The plan pins this behavior — a forged token is a security decision, not a
// UX one, and the code path that used to catch the verify error and return a
// dev identity is exactly what we removed. Hitting an investor route with a
// garbage token must resolve to 401, never to a seeded identity.
test.describe("BFF auth fail-closed (S1)", () => {
  test("forged session token is rejected with 401", async ({ baseURL }) => {
    const ctx = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        // No SESSION_SECRET on the request side; the cookie is the credential.
      },
    });
    const res = await ctx.get("/api/v1/investor/recommendations", {
      headers: {
        cookie: [
          `us_eligibility_v1=${E2E_USERS.signal.eligibilityCookie}`,
          // Structurally-valid-looking JWT (header.payload.sig) that will fail
          // signature verification. Pre-fix, this triggered devFallback and
          // resolved to the seeded signal identity; post-fix, it must 401.
          `us_session_v1=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.not-a-valid-signature`,
        ].join("; "),
      },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("absent session cookie in dev resolves to dev identity via eligibility", async ({
    baseURL,
  }) => {
    const ctx = await playwrightRequest.newContext({ baseURL });
    const res = await ctx.get("/api/v1/investor/recommendations", {
      headers: {
        cookie: `us_eligibility_v1=${E2E_USERS.signal.eligibilityCookie}`,
      },
    });
    // Dev fallback fires because REFI_ENV is not "prod" and no session token
    // was presented. The seeded signal user has a recommendation projection,
    // so this must be a 200 — proving the dev path is still reachable via
    // absence, not degradation.
    expect(res.status()).toBe(200);
    await ctx.dispose();
  });

  test("absent session cookie AND absent eligibility yields no auth context", async ({
    baseURL,
  }) => {
    const ctx = await playwrightRequest.newContext({ baseURL });
    const res = await ctx.get("/api/v1/investor/recommendations");
    // No credentials at all → devFallback has nothing to hash → null auth
    // context → caller returns 401.
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});
