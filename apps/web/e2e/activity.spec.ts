/**
 * Investor activity — browser → same-origin BFF → frozen client → Daniel's
 * deterministic simulator (`listAccountRecords`). All record variants render
 * read-only with their authoritative fields; execution-chain records carry a
 * category label and never a control (D-LAUNCH-06 CLOSED — YES; no frontend
 * order authority). Simulator evidence only — never a connected claim.
 */
import { test, expect, type Request } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { SIMULATOR_ORIGIN } from "./investor-api-simulator";

test.describe("Activity — Signal user", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
  });

  test("renders the simulator's account records through the BFF with authoritative fields, no placeholders, no controls", async ({
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
    await expect(row).toContainText("$6,250.06");
    await expect(row).not.toContainText("—");
    await expect(page.getByTestId("activity-upstream-state")).toHaveCount(0);
    await expect(
      page.getByTestId("activity-table").getByRole("button"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /\b(accept|approve|execute|cancel|buy|sell|trade)\b/i,
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

  test("the BFF projection carries every record with a category and withholds nothing", async ({
    page,
  }) => {
    await page.goto("/us/app/activity");
    const res = await page.request.get("/api/v1/investor/activity");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: {
        items: Array<{ recordType: string; category: string }>;
        excludedCount: number;
        upstream: { state: string };
      };
    };
    expect(body.data.upstream.state).toBe("ok");
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.excludedCount).toBe(0);
    for (const item of body.data.items) {
      expect(["account", "execution_chain"]).toContain(item.category);
    }
  });

  test("unauthenticated reads are refused", async ({ request }) => {
    expect((await request.get("/api/v1/investor/activity")).status()).toBe(401);
  });
});
