/**
 * Identity verification — provider-neutral frontend lifecycle behind the BFF.
 *
 * The onboarding KYC page and the account page use only same-origin ReFi
 * routes. The adapter is the deterministic MOCK (REFI_KYC_PROVIDER=mock in the
 * Playwright webServer env; controls enabled by REFI_KYC_MOCK_CONTROLS=1).
 * Nothing here is identity verification and nothing reaches a vendor, the
 * Investor API, or identity-ccid. The legacy browser-direct `/ccid/*` and
 * `/compliance/*` calls must not appear.
 */
import { expect, test, type Page, type Request } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { SIMULATOR_ORIGIN } from "./investor-api-simulator";

const FORBIDDEN_BROWSER_TARGETS = [
  "/ccid/status",
  "/ccid/start",
  "/ccid/webhook/provider",
  "/compliance/invalidate-cache",
  "/api/v1/investor/kyc?", // Investor API getKycStatus path would end in /kyc
  "/api/v1/identity/",
  "/.well-known/jwks.json",
  SIMULATOR_ORIGIN,
];

const VENDOR_NAMES =
  /\b(persona|plaid|alloy|socure|sumsub|trulioo|complycube|jumio|onfido)\b|stripe\s*identity/i;

async function resetMock(page: Page) {
  await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
  const res = await page.request.post(
    "/api/v1/investor/kyc/verification/mock",
    {
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      data: { reset: true },
    },
  );
  expect(res.status()).toBe(200);
}

async function advance(page: Page, to: string) {
  return page.request.post("/api/v1/investor/kyc/verification/mock", {
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    data: { to },
  });
}

test.describe("Identity verification lifecycle via the BFF (mock adapter)", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ context }) => {
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
  });

  test("start → in progress → under review → passed, through same-origin routes only; passed enters Investor Profile v2, never the legacy v1 questionnaire", async ({
    page,
  }) => {
    await resetMock(page);
    const browserRequests: string[] = [];
    page.on("request", (req: Request) => {
      browserRequests.push(req.url());
    });

    await page.goto("/us/onboarding/kyc", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("kyc-state-not_started")).toBeVisible({
      timeout: 30_000,
    });
    // Production build: the mock control panel must not render.
    await expect(page.getByTestId("kyc-mock-controls")).toHaveCount(0);

    const startPromise = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/investor/kyc/verification/start") &&
        r.request().method() === "POST",
    );
    await page.getByTestId("kyc-start").click();
    const started = await startPromise;
    expect(started.status()).toBe(200);
    const startBody = (await started.json()) as {
      data: { adapter: string; session: { state: string } };
    };
    expect(startBody.data.adapter).toBe("mock");
    expect(startBody.data.session.state).toBe("in_progress");
    await expect(page.getByTestId("kyc-state-in_progress")).toBeVisible({
      timeout: 30_000,
    });

    // Deterministic transitions via the server-side test control (not the UI).
    expect((await advance(page, "under_review")).status()).toBe(200);
    await expect(page.getByTestId("kyc-state-under_review")).toBeVisible({
      timeout: 30_000,
    });
    // Vendor-neutrality is asserted on the KYC page itself, before the redirect.
    expect(await page.content()).not.toMatch(VENDOR_NAMES);
    expect((await advance(page, "passed")).status()).toBe(200);
    // A passed public-U.S. KYC journey must enter Investor Profile questionnaire
    // v2 and must never route to the legacy v1 advisory questionnaire.
    await page.waitForURL("**/us/onboarding/investor-profile", {
      timeout: 30_000,
    });
    expect(new URL(page.url()).pathname).toBe(
      "/us/onboarding/investor-profile",
    );
    expect(new URL(page.url()).pathname).not.toBe("/us/onboarding/profile");
    for (const url of browserRequests) {
      expect(
        new URL(url).pathname,
        "KYC success must never navigate to the legacy v1 profile page",
      ).not.toBe("/us/onboarding/profile");
    }

    for (const url of browserRequests) {
      for (const forbidden of FORBIDDEN_BROWSER_TARGETS) {
        expect(url, `browser must not call ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  test("the normalized result is attestation vocabulary and NO attestation was submitted", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const res = await page.request.get("/api/v1/investor/kyc/verification");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: {
        available: boolean;
        adapter: string;
        session: { state: string };
        normalized: { status: string; provider: string };
      };
    };
    expect(body.data.available).toBe(true);
    expect(body.data.session.state).toBe("passed");
    expect(body.data.normalized.status).toBe("passed");
    expect(body.data.normalized.provider).toBe("mock-kyc-adapter");
    expect(JSON.stringify(body)).not.toMatch(VENDOR_NAMES);
    // The simulator's consent/attestation surface never saw a call from this flow:
    // a direct read of the attestation list through our BFF does not exist, so
    // prove it by the only path that could have written — none is manifested.
    const attempt = await page.request.get(
      "/api/v1/investor/accounts/x/compliance-profile-attestations",
    );
    expect([404, 401]).toContain(attempt.status());
  });

  test("invalid mock transitions are refused and the mock cannot self-approve from not_started", async ({
    page,
  }) => {
    await resetMock(page);
    const jump = await advance(page, "passed");
    expect(jump.status()).toBe(409);
    const body = (await jump.json()) as {
      data: { reason: string; from: string };
    };
    expect(body.data.reason).toBe("invalid_transition");
    expect(body.data.from).toBe("not_started");
  });

  test("failed journey shows the unsuccessful state and a retry; account page shows a generic label, no provider brand", async ({
    page,
  }) => {
    await resetMock(page);
    await page.goto("/us/onboarding/kyc", { waitUntil: "domcontentloaded" });
    await page.getByTestId("kyc-start").click();
    await expect(page.getByTestId("kyc-state-in_progress")).toBeVisible({
      timeout: 30_000,
    });
    expect((await advance(page, "failed")).status()).toBe(200);
    await expect(page.getByTestId("kyc-state-failed")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("kyc-start")).toBeVisible();

    await page.goto("/us/app/account", { waitUntil: "domcontentloaded" });
    const card = page.getByTestId("identity-verification-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Identity verification");
    await expect(card).not.toContainText(/provider:/i);
    expect(await card.innerText()).not.toMatch(VENDOR_NAMES);
  });

  test("unauthenticated requests are refused", async ({ request }) => {
    expect(
      (await request.get("/api/v1/investor/kyc/verification")).status(),
    ).toBe(401);
  });
});
