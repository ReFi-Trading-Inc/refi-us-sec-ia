import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";
import { selectOptionHydrated } from "./hydration";
import { postSameOrigin } from "./api";

const SIGNAL_COOKIE = E2E_USERS.signal.eligibilityCookie;

test.describe("Support", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(await e2eAuthCookies(SIGNAL_COOKIE));
    await page.goto("/us/app/support");
    // Gate on H1 visibility — Next.js dev compiles routes on-demand and the
    // first navigation under parallel-worker load can land on a transient
    // 404 before the route is ready.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("form renders correctly", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/category/i)).toBeVisible();
    await expect(page.getByTestId("support-message")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /submit request/i }),
    ).toBeVisible();
  });

  test("submit button disabled with empty form", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /submit request/i }),
    ).toBeDisabled();
  });

  // UI-ONLY. The real /api/us/support fails closed because no support sink is
  // configured (D-SUPPORT-01), so the submitted-success state cannot be reached
  // end to end yet. This stub covers the form's success rendering; the server
  // control itself is proven against the REAL route in the API tests below,
  // which install no stub at all.
  test("shows success banner after submission", async ({ page }) => {
    await page.route("**/api/us/support", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ticketId: "tkt-e2e" } }),
      }),
    );
    const categorySelect = page.getByLabel(/category/i);
    // The canSubmit predicate depends on the live `category` state, so the
    // selection must survive hydration. Asserting the value after a single
    // selectOption only detected a discarded interaction; this replays it
    // until React retains it.
    await selectOptionHydrated(categorySelect, "App issue");
    const messageField = page.getByTestId("support-message");
    await messageField.fill("My document download link is broken.");
    await expect(messageField).toHaveValue(
      "My document download link is broken.",
    );
    const submitBtn = page.getByRole("button", { name: /submit request/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();
    // Success state renders a StatusBanner whose `title` prop is "Request
    // submitted". StatusBanner does not promote `title` to a heading; anchor
    // on the exact title text.
    await expect(
      page.getByText("Request submitted", { exact: true }),
    ).toBeVisible();
  });

  test("blocked message disables submit", async ({ page }) => {
    await page.getByLabel(/category/i).selectOption({ label: "App issue" });
    // SBR-001. The browser runs the SAME classifier the server enforces with,
    // so the warning appears immediately — but this is only the UX half. The
    // server half is asserted below and does not depend on this at all.
    await page
      .getByTestId("support-message")
      .fill("Should I buy AAPL right now?");
    await expect(
      page.getByRole("button", { name: /submit request/i }),
    ).toBeDisabled();
    // The blocked-prompt guardrail also surfaces an inline warning.
    await expect(
      page.getByText(/client-specific investment advice/i),
    ).toBeVisible();
  });

  // ─── Server-side enforcement ───────────────────────────────────────────────
  //
  // These POST the real route directly, with NO page.route stub. Before this
  // work the browser posted past every server in this repository to an external
  // /v1/support/ticket, so the only control was a disabled button — a plain
  // curl bypassed the SEC 203A-2(e)(3) boundary completely.

  test("a prohibited request is refused by the server, not just the UI", async ({
    page,
  }) => {
    const res = await postSameOrigin(page, "/api/us/support", {
      data: { category: "App issue", message: "Should I buy AAPL right now?" },
    });
    expect(res.status(), "server did not refuse a prohibited request").toBe(
      403,
    );
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("forbidden");
  });

  test("client-supplied classification metadata cannot buy a bypass", async ({
    page,
  }) => {
    // The route's schema accepts only { category, message }, so these extra
    // fields are the exact shape a forged client would send. They must change
    // nothing: the server classifies the raw message itself.
    const res = await postSameOrigin(page, "/api/us/support", {
      data: {
        category: "App issue",
        message: "Should I buy AAPL right now?",
        blocked: false,
        ruleId: null,
        classification: "allowed",
      },
    });
    expect(res.status(), "forged client metadata changed the verdict").toBe(
      403,
    );
  });

  test("an unauthenticated request is refused", async ({ browser }) => {
    const fresh = await browser.newContext();
    const res = await fresh.request.post("/api/us/support", {
      headers: { origin: "http://localhost:3000" },
      data: { category: "App issue", message: "My download link is broken." },
    });
    expect(res.status()).toBe(401);
    await fresh.close();
  });

  test("a malformed payload is refused", async ({ page }) => {
    const res = await postSameOrigin(page, "/api/us/support", {
      data: { category: "App issue", message: "too short" },
    });
    expect(res.status()).toBe(400);
  });

  test("an allowed request reaches the sink boundary and fails closed", async ({
    page,
  }) => {
    // No sink is configured, so an ALLOWED message must be refused honestly
    // rather than answered with a fabricated ticket id. When D-SUPPORT-01 is
    // resolved and a real sink is wired, this expectation becomes 200 — which
    // is precisely the signal that the sink went live.
    const res = await postSameOrigin(page, "/api/us/support", {
      data: {
        category: "App issue",
        message: "My document download link is broken.",
      },
    });
    expect(res.status()).toBe(412);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("precondition_failed");
  });
});
