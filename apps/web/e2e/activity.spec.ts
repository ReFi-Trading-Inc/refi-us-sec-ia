/**
 * Investor activity — browser → same-origin BFF → frozen client → Daniel's
 * deterministic simulator (`listAccountRecords`). Structured records only; the
 * five execution-chain variants never reach the Signal page (D-LAUNCH-06).
 * Simulator evidence only — never a connected refinity-dev claim.
 */
import { test, expect, type Request } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { SIMULATOR_ORIGIN } from "./investor-api-simulator";

const EXECUTION_CHAIN = [
  "account_intent",
  "risk_decision",
  "execution_plan",
  "order",
  "fill",
];

test.describe("Activity — Signal user", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
  });

  test("renders the simulator's account records through the BFF with authoritative fields, no placeholders", async ({
    page,
  }) => {
    const browserRequests: string[] = [];
    page.on("request", (req: Request) => browserRequests.push(req.url()));

    await page.goto("/us/app/activity");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const row = page.getByTestId("activity-record").first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toHaveAttribute("data-record-type", "recommendation");
    await expect(row).toContainText("CURRENT");
    await expect(row).toContainText("record_alpha_00000001");
    await expect(row).toContainText("recommendation_alpha_0001");
    await expect(row).not.toContainText("—");
    await expect(page.getByTestId("activity-upstream-state")).toHaveCount(0);

    for (const row2 of await page.getByTestId("activity-record").all()) {
      const t = await row2.getAttribute("data-record-type");
      expect(
        EXECUTION_CHAIN,
        `execution-chain record ${t ?? ""} must not render`,
      ).not.toContain(t);
    }
    // No execution controls anywhere on the page.
    await expect(
      page.getByRole("button", {
        name: /\b(accept|approve|execute|buy|sell|trade)\b/i,
      }),
    ).toHaveCount(0);

    for (const url of browserRequests) {
      for (const forbidden of [
        "/v1/activity",
        "/v1/recommendations",
        "/api/v1/investor/accounts/",
        SIMULATOR_ORIGIN,
      ]) {
        expect(url, `browser must not call ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  test("the BFF projection never contains execution-chain record types", async ({
    page,
  }) => {
    await page.goto("/us/app/activity");
    const res = await page.request.get("/api/v1/investor/activity");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: {
        items: Array<{ recordType: string }>;
        excludedCount: number;
        upstream: { state: string };
      };
    };
    expect(body.data.upstream.state).toBe("ok");
    expect(body.data.items.length).toBeGreaterThan(0);
    for (const item of body.data.items) {
      expect(EXECUTION_CHAIN).not.toContain(item.recordType);
    }
    expect(typeof body.data.excludedCount).toBe("number");
  });

  test("unauthenticated reads are refused", async ({ request }) => {
    expect((await request.get("/api/v1/investor/activity")).status()).toBe(401);
  });
});
