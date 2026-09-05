/**
 * Account event stream — browser → same-origin SSE → frozen client
 * `streamAccountEvents` → Daniel's deterministic simulator. Proves the stream
 * route forwards the contract's frames unchanged in shape and that the app
 * shell's live strip connects. Simulator evidence only.
 */
import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";

test.describe("Account events (simulator upstream)", () => {
  test.beforeEach(async ({ page }) => {
    await page
      .context()
      .addCookies(await e2eAuthCookies(E2E_USERS.signal.eligibilityCookie));
  });

  test("forwards the simulator's recommendation.updated frame with its event id", async ({
    page,
  }) => {
    await page.goto("/us/app/home", { waitUntil: "domcontentloaded" });
    const frames = await page.evaluate(async () => {
      const res = await fetch("/api/v1/investor/events", {
        credentials: "include",
      });
      const reader = res.body?.getReader();
      if (!reader) return { status: res.status, text: "" };
      const dec = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && !text.includes("event: ")) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value);
      }
      await reader.cancel();
      return { status: res.status, text };
    });
    expect(frames.status).toBe(200);
    expect(frames.text).toContain("id: event_alpha_00000001");
    expect(frames.text).toContain("event: recommendation.updated");
    await expect(page.getByTestId("live-status-strip")).toBeVisible();
  });

  test("unauthenticated stream requests are refused", async ({ request }) => {
    expect((await request.get("/api/v1/investor/events")).status()).toBe(401);
  });
});
