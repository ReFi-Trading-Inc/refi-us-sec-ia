import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./global-setup";
import { e2eAuthCookies } from "./session";

const SIGNAL_COOKIE = E2E_USERS.signal.eligibilityCookie;

test.describe("Support", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(await e2eAuthCookies(SIGNAL_COOKIE));
    // The support page POSTs to `/v1/support/ticket` via apiFetch (the BFF
    // owns this surface but the upstream ticket sink is still TBD). Mock the
    // route so the form's submit-success path can be observed in E2E without
    // standing up a real ticket backend.
    await page.route("**/v1/support/ticket", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, ticket_id: "tkt-e2e" }),
      }),
    );
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

  test("shows success banner after submission", async ({ page }) => {
    const categorySelect = page.getByLabel(/category/i);
    await categorySelect.selectOption("App issue");
    // Confirm React state caught the change before continuing — the
    // canSubmit predicate depends on the live `category` state.
    await expect(categorySelect).toHaveValue("App issue");
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
    // Per-stock investment-advice prompt matches the support boundary
    // classifier (`blockedPromptPatterns` — /should i (buy|sell|hold|invest)/i)
    // and MUST disable submit. This is the load-bearing SEC 203A-2(e) §D
    // assertion: support never crosses into client-specific advice.
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
});
