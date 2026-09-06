import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";

const SIGNAL_COOKIE = E2E_USERS.signal.eligibilityCookie;

// Broker connection goes through the same-origin BFF only
// (`/api/v1/investor/broker/connection` → the contract's
// listBrokerageConnections / createBrokerageConnection against the simulator).
// The legacy browser-direct `/v1/brokers/*` calls and their MSW/route mocks are
// gone (C1b-2 rows 10–16). The simulator's fixture account already has a
// CONNECTED, synced Alpaca paper connection, so the page opens in its
// "holdings read" state here; the connect form itself is driven end-to-end on
// the demo lane (invited persona), where the account starts unconnected.
// Shape-valid, low-entropy fixture (40 alphanumerics). Never a real credential;
// built at runtime so secret scanners do not mistake it for one.
const FIXTURE_SECRET = "e2eFixtureSecret".padEnd(40, "0");

const LEGACY_BROKER_PATHS = [
  "/v1/brokers/supported",
  "/v1/brokers/connection",
  "/v1/brokers/connect/keys",
  "/v1/brokers/connect/start",
  "/v1/brokers/account",
  "/v1/brokers/positions",
  "/v1/brokers/orders",
  "/v1/brokers/disconnect",
  "/v1/strategies/current",
  "/v1/account/activation",
  "/v1/account/activate",
];

test.describe("Broker onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(await e2eAuthCookies(SIGNAL_COOKIE));
  });

  test("shows the backend's connection state and the holdings it read; no browser-direct broker calls", async ({
    page,
  }) => {
    const browserPaths: string[] = [];
    page.on("request", (req) => {
      browserPaths.push(new URL(req.url()).pathname);
    });
    await page.goto("/us/onboarding/broker");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("broker-connection-status")).toHaveAttribute(
      "data-stage",
      "synced",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("broker-holdings-preview")).toBeVisible();
    // The simulator fixture carries no positions page, so the count may be 0;
    // what matters is that it is the backend's number, rendered.
    expect(
      Number(await page.getByTestId("broker-holdings-count").innerText()),
    ).toBeGreaterThanOrEqual(0);
    await expect(page.getByTestId("broker-continue")).toHaveAttribute(
      "href",
      "/us/onboarding/strategy",
    );
    expect(browserPaths).toContain("/api/v1/investor/broker/connection");
    for (const p of browserPaths) {
      for (const legacy of LEGACY_BROKER_PATHS) {
        expect(p, `browser must not call ${legacy}`).not.toBe(legacy);
      }
    }
  });

  test("the BFF refuses a live Alpaca key and a non-paper environment by shape; nothing reaches the contract", async ({
    page,
  }) => {
    await page.goto("/us/onboarding/broker");
    const H = {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    };
    const live = await page.request.post("/api/v1/investor/broker/connection", {
      headers: H,
      data: {
        environment: "paper",
        apiKeyId: "AKABCDEFGHIJ12345678",
        apiSecretKey: FIXTURE_SECRET,
      },
    });
    expect(live.status()).toBe(400);
    const liveEnv = await page.request.post(
      "/api/v1/investor/broker/connection",
      {
        headers: H,
        data: {
          environment: "live",
          apiKeyId: "PKABCDEFGHIJ12345678",
          apiSecretKey: FIXTURE_SECRET,
        },
      },
    );
    expect(liveEnv.status()).toBe(400);
    // Cross-origin submissions never reach the handler.
    const foreign = await page.request.post(
      "/api/v1/investor/broker/connection",
      {
        headers: { ...H, origin: "http://evil.example" },
        data: {
          environment: "paper",
          apiKeyId: "PKABCDEFGHIJ12345678",
          apiSecretKey: FIXTURE_SECRET,
        },
      },
    );
    expect(foreign.status()).toBe(403);
    for (const r of [live, liveEnv, foreign]) {
      expect(await r.text()).not.toContain(FIXTURE_SECRET);
    }
  });

  test("the connection read never carries a credential field", async ({
    page,
  }) => {
    await page.goto("/us/onboarding/broker");
    const res = await page.request.get("/api/v1/investor/broker/connection");
    expect(res.status()).toBe(200);
    const text = await res.text();
    // `credentialStatus` is the contract's status enum, not a credential.
    expect(text).not.toMatch(
      /api_key|api_secret|apiKeyId|apiSecretKey|"credentials"/,
    );
    const body = (await res.json()) as {
      data: { connection: { connectionStatus: string; broker: string } | null };
    };
    expect(body.data.connection?.broker).toBe("alpaca");
  });

  test("the broker surface teaches paper-only and never live trading", async ({
    page,
  }) => {
    await page.goto("/us/onboarding/broker");
    await expect(page.getByTestId("broker-connection-status")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("radio", { name: /live/i })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /live dashboard/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/trading enabled/i)).toHaveCount(0);
    await expect(page.getByText(/submit .*orders on your behalf/i)).toHaveCount(
      0,
    );
    await expect(page.getByText(/managed execution/i)).toHaveCount(0);
  });

  test("strategy review and setup checklist read the BFF summary; there is no activate control", async ({
    page,
  }) => {
    const browserPaths: string[] = [];
    page.on("request", (req) => {
      browserPaths.push(new URL(req.url()).pathname);
    });
    await page.goto("/us/onboarding/strategy");
    await expect(page.getByTestId("strategy-review")).toBeVisible();
    await expect(page.getByTestId("strategy-template")).toContainText(/SPX/, {
      timeout: 30_000,
    });
    await page.goto("/us/onboarding/activation");
    await expect(page.getByTestId("setup-checklist")).toBeVisible();
    await expect(page.getByTestId("setup-authorization")).toHaveText(
      /authorized/i,
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("button", { name: /activate|enable|start managing/i }),
    ).toHaveCount(0);
    expect(browserPaths).toContain("/api/v1/investor/onboarding");
    for (const p of browserPaths) {
      for (const legacy of LEGACY_BROKER_PATHS) {
        expect(p, `browser must not call ${legacy}`).not.toBe(legacy);
      }
    }
  });
});

test.describe("Legacy v1 advisory profile route is retired", () => {
  // The public U.S. application has ONE canonical questionnaire: Investor
  // Profile v2. The old seven-field form (with a user-entered risk tolerance)
  // must not render here; the route survives only as a redirect.
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(await e2eAuthCookies(SIGNAL_COOKIE));
  });

  test("/us/onboarding/profile redirects to Investor Profile v2 and asks for no risk tolerance", async ({
    page,
  }) => {
    // The legacy route answers with an HTTP redirect to v2 (no page, no form).
    const raw = await page.request.fetch("/us/onboarding/profile", {
      maxRedirects: 0,
    });
    expect([307, 308]).toContain(raw.status());
    expect(raw.headers()["location"] ?? "").toContain(
      "/us/onboarding/investor-profile",
    );
    await page.goto("/us/onboarding/profile", {
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname).toBe(
      "/us/onboarding/investor-profile",
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel(/risk tolerance/i)).toHaveCount(0);
    await expect(page.getByText(/risk tolerance/i)).toHaveCount(0);
  });
});
