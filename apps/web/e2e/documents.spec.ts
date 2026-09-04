/**
 * Documents — disclosure/consent through the BFF (C1b-2 slice 1).
 *
 * Proves the browser boundary: the page reads effective disclosures and
 * records consent ONLY via same-origin BFF routes; the BFF reaches Daniel's
 * deterministic v1.1.0-alpha.2 simulator (started by global-setup) through the
 * frozen Investor API client. No browser request may target the legacy
 * browser-direct `/v1/documents/acknowledge`, the simulator, or any
 * Investor API / identity-ccid path.
 *
 * This is simulator evidence, not a connected refinity-dev journey: the
 * initialized backend test user remains a backend readiness dependency.
 */
import { expect, test, type Request } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { SIMULATOR_ORIGIN } from "./investor-api-simulator";

const FORBIDDEN_BROWSER_TARGETS = [
  "/v1/documents/acknowledge",
  "/api/v1/investor/consents",
  "/api/v1/identity/",
  "/.well-known/jwks.json",
  SIMULATOR_ORIGIN,
];

test.describe("Documents disclosure consent via the BFF", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies(
      await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie),
    );
  });

  test("effective disclosures come from the BFF and consent is recorded per exact version/hash", async ({
    page,
  }) => {
    const browserRequests: string[] = [];
    page.on("request", (req: Request) => {
      browserRequests.push(req.url());
    });

    const readPromise = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/v1/investor/disclosures") &&
        res.request().method() === "GET",
    );
    await page.goto("/us/app/documents", { waitUntil: "domcontentloaded" });
    const read = await readPromise;
    expect(read.status()).toBe(200);
    const readBody = (await read.json()) as {
      data: {
        upstream: { state: string };
        disclosures: Array<{
          disclosure_key: string;
          disclosure_version: number;
          content_hash: string;
        }>;
      };
      meta?: { source?: string };
    };
    expect(readBody.data.upstream.state).toBe("ok");
    expect(readBody.data.disclosures.length).toBeGreaterThan(0);
    const first = readBody.data.disclosures[0];
    if (first === undefined) throw new Error("no effective disclosure");

    await expect(
      page.getByTestId(`effective-disclosure-${first.disclosure_key}`),
    ).toBeVisible({ timeout: 30_000 });

    // Consent: the BFF must receive the EXACT version/hash the read returned.
    const ackPromise = page.waitForResponse(
      (res) =>
        res
          .url()
          .includes(
            `/api/v1/investor/disclosures/${encodeURIComponent(first.disclosure_key)}/acknowledge`,
          ) && res.request().method() === "POST",
    );
    await page.getByTestId("disclosure-consent-checkbox").check();
    await page.getByTestId("disclosure-consent-confirm").click();
    const ack = await ackPromise;
    const sent = JSON.parse(ack.request().postData() ?? "{}") as {
      disclosure_version: number;
      disclosure_hash: string;
    };
    expect(sent.disclosure_version).toBe(first.disclosure_version);
    expect(sent.disclosure_hash).toBe(first.content_hash);
    expect(ack.status()).toBe(201);
    const ackBody = (await ack.json()) as {
      data: {
        ok: boolean;
        contractVersion: string;
        receipt: {
          disclosure_key: string;
          disclosure_version: number;
          disclosure_hash: string;
          status: string;
        };
      };
    };
    expect(ackBody.data.ok).toBe(true);
    expect(ackBody.data.contractVersion).toBe("v1.1.0-alpha.2");
    expect(ackBody.data.receipt.disclosure_key).toBe(first.disclosure_key);
    expect(ackBody.data.receipt.disclosure_version).toBe(
      first.disclosure_version,
    );
    expect(ackBody.data.receipt.disclosure_hash).toBe(first.content_hash);
    expect(ackBody.data.receipt.status).toBe("ACTIVE");
    await expect(page.getByText("Acknowledged")).toBeVisible();

    // Boundary: nothing browser-direct, nothing to the simulator or the
    // Investor API / identity-ccid paths.
    for (const url of browserRequests) {
      for (const forbidden of FORBIDDEN_BROWSER_TARGETS) {
        expect(url, `browser must not call ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  test("a stale version/hash is refused by the BFF (409) and nothing is recorded", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const read = await page.request.get("/api/v1/investor/disclosures");
    const body = (await read.json()) as {
      data: {
        disclosures: Array<{
          disclosure_key: string;
          disclosure_version: number;
          content_hash: string;
        }>;
      };
    };
    const first = body.data.disclosures[0];
    if (first === undefined) throw new Error("no effective disclosure");
    const stale = await page.request.post(
      `/api/v1/investor/disclosures/${encodeURIComponent(first.disclosure_key)}/acknowledge`,
      {
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        data: {
          disclosure_version: first.disclosure_version + 1,
          disclosure_hash: first.content_hash,
        },
      },
    );
    expect(stale.status()).toBe(409);
    const staleBody = (await stale.json()) as {
      data: { ok: boolean; reason: string };
    };
    expect(staleBody.data.ok).toBe(false);
    expect(staleBody.data.reason).toBe("disclosure_stale");

    const unknown = await page.request.post(
      "/api/v1/investor/disclosures/not_a_real_key/acknowledge",
      {
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        data: { disclosure_version: 1, disclosure_hash: first.content_hash },
      },
    );
    expect(unknown.status()).toBe(404);
  });

  test("unauthenticated requests are refused", async ({ request }) => {
    const res = await request.get("/api/v1/investor/disclosures");
    expect(res.status()).toBe(401);
  });
});
