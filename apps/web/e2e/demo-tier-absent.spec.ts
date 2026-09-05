/**
 * Production posture (REFI_ENV=prod, the main lane): the demo tier's surfaces
 * are structurally dark. No method of the demo session route and no demo
 * entry page is reachable, so production cannot be signed into as a persona.
 */
import { test, expect } from "@playwright/test";

test.describe("Demo tier is absent outside REFI_ENV=demo", () => {
  test("demo session route answers 404 for every method", async ({
    request,
  }) => {
    const H = {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    };
    expect((await request.get("/api/demo/session")).status()).toBe(404);
    expect(
      (
        await request.post("/api/demo/session", {
          headers: H,
          data: { persona: "admitted" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await request.delete("/api/demo/session", { headers: H })).status(),
    ).toBe(404);
  });

  test("demo entry page is 404 and no indicator renders", async ({ page }) => {
    const res = await page.goto("/us/demo");
    expect(res?.status()).toBe(404);
    await page.goto("/us");
    await expect(page.getByTestId("demo-tier-indicator")).toHaveCount(0);
  });
});
