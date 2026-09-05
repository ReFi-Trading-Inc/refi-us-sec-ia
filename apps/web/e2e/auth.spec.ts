import { test, expect, type Request } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";

// Eligibility-only: the connect step is reached after the eligibility gate
// but before a session exists. Using the seeded `signal` user value makes the
// BFF dev-fallback derive a consistent authId, so the AuthProvider resolves
// the unauthenticated state cleanly instead of looping.
const ELIGIBILITY_COOKIE_ONLY = [
  {
    name: "us_eligibility_v1",
    value: E2E_USERS.signal.eligibilityCookie,
    domain: "localhost",
    path: "/",
  },
];

// The production build (NEXT_PUBLIC_REFI_ENV=prod) cannot verify a wallet
// linking signature, so the wallet stack is never mounted: no WalletConnect
// relay, no wagmi, no "Connect wallet" button. Wallets are optional linked
// identifiers, never the login (Daniel 2026-07-28).
test.describe("Connect step without a wallet stack", () => {
  test("connect page mounts no wallet stack and offers no wallet button", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (req: Request) => {
      requests.push(req.url());
    });
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    await page.goto("/us/auth/connect");
    await expect(
      page.getByRole("heading", { level: 1, name: /continue to onboarding/i }),
    ).toBeVisible();
    await expect(page.getByTestId("connect-signin-unavailable")).toBeVisible();
    await expect(page.getByTestId("wallet-linking-notice")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect wallet|link wallet/i }),
    ).toHaveCount(0);
    // No demo tier here: the walkthrough link must not appear.
    await expect(page.getByTestId("connect-demo-persona-link")).toHaveCount(0);
    for (const url of requests) {
      expect(url, "no WalletConnect / relay traffic").not.toMatch(
        /walletconnect|reown|relay\./i,
      );
    }
  });

  test("presents wallet linking as optional, never as the login", async ({
    page,
  }) => {
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    await page.goto("/us/auth/connect");
    await expect(page.getByTestId("wallet-linking-notice")).toContainText(
      /never how you sign in/i,
    );
    await expect(
      page.getByText(/uses your Ethereum wallet as your login/i),
    ).toHaveCount(0);
    await expect(
      page.getByText(/your wallet address is your account/i),
    ).toHaveCount(0);
  });

  test("session is read from the BFF; the legacy browser-direct /auth/* calls are gone", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (req: Request) => {
      requests.push(new URL(req.url()).pathname);
    });
    await page.context().addCookies(ELIGIBILITY_COOKIE_ONLY);
    const sessionRead = page.waitForResponse((r) =>
      r.url().includes("/api/v1/investor/session"),
    );
    await page.goto("/us/auth/connect");
    await expect(page.getByTestId("connect-signin-unavailable")).toBeVisible();
    expect((await sessionRead).status()).toBe(401);
    expect(requests).toContain("/api/v1/investor/session");
    for (const p of requests) {
      expect(p).not.toMatch(/^\/auth\/(session|refresh|revoke-all)$/);
    }
  });

  test("DELETE /api/v1/investor/session requires same-origin and clears the session cookie", async ({
    request,
  }) => {
    expect(
      (
        await request.delete("/api/v1/investor/session", {
          headers: { origin: "http://evil.example" },
        })
      ).status(),
    ).toBe(403);
    const ok = await request.delete("/api/v1/investor/session", {
      headers: { origin: "http://localhost:3000" },
    });
    expect(ok.status()).toBe(200);
    const setCookie = ok
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(setCookie.some((h) => /^us_session_v1=;/.test(h.value))).toBe(true);
    expect(setCookie.some((h) => /Max-Age=0/i.test(h.value))).toBe(true);
  });

  test("the app shell renders no wallet button and loads without a wallet stack", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (req: Request) => {
      requests.push(req.url());
    });
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
    await page.goto("/us/app/account");
    await expect(page.getByTestId("session-card")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("sign-out")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect wallet/i }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/connected wallet|no wallet connected/i),
    ).toHaveCount(0);
    for (const url of requests) {
      expect(url).not.toMatch(/walletconnect|reown|relay\./i);
    }
  });
});
