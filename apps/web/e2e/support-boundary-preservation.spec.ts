// Support-boundary preservation — Phase 2.5 backlog §D.
//
// Proves that the /us/app/support surface never becomes advice,
// recommendation editing, staff approval, execution approval, or per-trade
// investor acceptance — for either tier (Managed and Signal).
//
// Stable attributes used:
//   - data-testid="support-page" with data-blocked, data-rule-id, data-category
//   - data-testid="support-submit-button"
//
// The classifier surfaces data-blocked + data-rule-id on the page root so the
// spec never needs to read the visible copy (which is what previous suites
// got wrong: they bound to "rule: SBR-001" copy regex). Forbidden-label
// checks below are a literal-substring tripwire on page text, scoped to the
// load-bearing names in the §D requirement.

import { test, expect, type Page } from "@playwright/test";

const baseAuth = [
  {
    name: "us_eligibility_v1",
    value: "mock-eligibility-token",
    domain: "localhost",
    path: "/us",
  },
  {
    name: "us_session_v1",
    value: "mock-session-token",
    domain: "localhost",
    path: "/us",
  },
];

async function setPersona(
  page: Page,
  persona: "maya" | "david" | "sarah",
): Promise<void> {
  await page.context().clearCookies();
  await page.context().addCookies([
    ...baseAuth,
    {
      name: "refi_persona_v1",
      value: persona,
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.context().setExtraHTTPHeaders({ "x-refi-persona": persona });
}

// Investor-side per-trade / staff-approval affordances that must NEVER exist
// on the support surface regardless of tier or classifier state.
const FORBIDDEN_TESTIDS = [
  "signal-place-order-button",
  "signal-order-entry",
  "managed-place-order-button",
  "order-submit-button",
  "investor-accept",
  "accept-trade-button",
  "approve-trade-button",
  "approve-recommendation-button",
  "approve-for-execution-button",
  "submit-order-button",
  "edit-recommendation-button",
  "staff-approve-button",
  "execute-now-button",
  "rebalance-approval-button",
  "recommendation-override-button",
] as const;

// Literal substrings that must not appear anywhere in the support page's
// rendered text. Matched case-insensitively. The §D requirement explicitly
// names these as forbidden labels.
const FORBIDDEN_LABELS = [
  "accept_trade",
  "investor-accept",
  "approve for execution",
  "accept and execute",
  "edit recommendation",
  "staff approval",
  "execute now",
  "rebalance approval",
  "recommendation override",
] as const;

async function assertNoForbiddenTestids(page: Page): Promise<void> {
  for (const id of FORBIDDEN_TESTIDS) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
}

async function assertNoForbiddenLabels(page: Page): Promise<void> {
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const label of FORBIDDEN_LABELS) {
    expect(
      text.includes(label.toLowerCase()),
      `forbidden label "${label}" leaked onto /us/app/support`,
    ).toBe(false);
  }
}

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

async function selectCategory(
  page: Page,
  value: "allowed_technical" | "allowed_billing" | "complaint",
): Promise<void> {
  // Wait for hydration so the Select's onChange handler is wired before
  // we change the value. Without this, selectOption can land before React
  // attached its synthetic-event listener and the state never updates.
  await expect(page.getByTestId("support-submit-button")).toBeAttached({
    timeout: 30_000,
  });
  await page.getByLabel(/category/i).selectOption(value);
  await expect(page.getByTestId("support-page")).toHaveAttribute(
    "data-category",
    value,
    { timeout: 5_000 },
  );
}

async function fillMessage(page: Page, text: string): Promise<void> {
  // Wait for the submit button to render — proof React has hydrated and the
  // textarea's onChange handler is wired. fill() before hydration sets the
  // DOM value but the React controlled component immediately resets it to
  // "" on its first render, leaving the classifier blind to the typed text.
  await expect(page.getByTestId("support-submit-button")).toBeAttached({
    timeout: 30_000,
  });
  const textarea = page.locator("#support-message");
  await textarea.waitFor({ state: "visible", timeout: 30_000 });
  // React-controlled textareas in dev can drop Playwright's synthetic input
  // events when listener attachment races the keystroke. Retry the
  // prototype-setter-then-input-event idiom until the page root's
  // data-category attribute reflects classifier state, proving React's
  // onChange actually ran. Bounded by Playwright's default timeout.
  await expect
    .poll(
      async () => {
        await textarea.evaluate((el, value) => {
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter?.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }, text);
        return await textarea.inputValue();
      },
      { timeout: 15_000, intervals: [250, 500, 1_000] },
    )
    .toBe(text);
}

async function gotoSupport(page: Page): Promise<void> {
  // Next dev can return 404 on first hit while the route compiles. Retry
  // up to 3 times before letting the assertion fail naturally.
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await page.goto("/us/app/support", {
      waitUntil: "domcontentloaded",
    });
    if (response && response.status() === 200) break;
    await page.waitForTimeout(3_000);
  }
  await expect(page.getByTestId("support-page")).toBeVisible({
    timeout: 45_000,
  });
  // Wait for the React tree to settle (network idle proves react-query
  // hydration and any MSW responses completed). Without this, the first
  // input event into the textarea can be dropped before React's onChange
  // listener is attached.
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
}

test.describe("§D Support-boundary preservation", () => {
  test("Maya (Managed) — support page exposes no advice/approval/edit affordances", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await gotoSupport(page);
    await assertNoForbiddenTestids(page);
    await assertNoForbiddenLabels(page);
  });

  test("David (Signal) — support page exposes no advice/approval/edit affordances", async ({
    page,
  }) => {
    await setPersona(page, "david");
    await gotoSupport(page);
    await assertNoForbiddenTestids(page);
    await assertNoForbiddenLabels(page);
  });

  test("Buy/sell advice prompt (SBR-001) blocks submission via stable attributes", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await gotoSupport(page);
    await fillMessage(page, "Should I buy NVDA today?");
    const root = page.getByTestId("support-page");
    await expect(root).toHaveAttribute("data-blocked", "true", {
      timeout: 5_000,
    });
    await expect(root).toHaveAttribute("data-rule-id", "SBR-001");
    await expect(page.getByTestId("support-submit-button")).toBeDisabled();
    await assertNoForbiddenTestids(page);
  });

  test("Recommendation-approval prompt (SBR-010) blocks submission via stable attributes", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await gotoSupport(page);
    await fillMessage(page, "Please approve my recommendation for AAPL.");
    const root = page.getByTestId("support-page");
    await expect(root).toHaveAttribute("data-blocked", "true", {
      timeout: 5_000,
    });
    await expect(root).toHaveAttribute("data-rule-id", "SBR-010");
    await expect(page.getByTestId("support-submit-button")).toBeDisabled();
  });

  test("Portfolio-change prompt (SBR-020) blocks submission via stable attributes", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await gotoSupport(page);
    await fillMessage(
      page,
      "Please rebalance my portfolio to be more conservative.",
    );
    const root = page.getByTestId("support-page");
    await expect(root).toHaveAttribute("data-blocked", "true", {
      timeout: 5_000,
    });
    await expect(root).toHaveAttribute("data-rule-id", "SBR-020");
    await expect(page.getByTestId("support-submit-button")).toBeDisabled();
  });

  test("Model-override prompt (SBR-040) blocks submission via stable attributes", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await gotoSupport(page);
    await fillMessage(page, "Please retrain the model for me.");
    const root = page.getByTestId("support-page");
    await expect(root).toHaveAttribute("data-blocked", "true", {
      timeout: 5_000,
    });
    await expect(root).toHaveAttribute("data-rule-id", "SBR-040");
    await expect(page.getByTestId("support-submit-button")).toBeDisabled();
  });

  test("Maya (Managed) — allowed technical prompt unblocks submission without exposing forbidden affordances", async ({
    page,
  }) => {
    await setPersona(page, "maya");
    await gotoSupport(page);
    await selectCategory(page, "allowed_technical");
    await fillMessage(
      page,
      "The activity feed crashed when I clicked an event.",
    );
    const root = page.getByTestId("support-page");
    await expect(root).toHaveAttribute("data-blocked", "false", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("support-submit-button")).toBeEnabled();
    await assertNoForbiddenTestids(page);
    await assertNoForbiddenLabels(page);
  });

  test("David (Signal) — allowed technical prompt unblocks submission without exposing forbidden affordances", async ({
    page,
  }) => {
    await setPersona(page, "david");
    await gotoSupport(page);
    await selectCategory(page, "allowed_technical");
    await fillMessage(
      page,
      "Login failed three times in a row and I cannot get back in.",
    );
    const root = page.getByTestId("support-page");
    await expect(root).toHaveAttribute("data-blocked", "false", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("support-submit-button")).toBeEnabled();
    await assertNoForbiddenTestids(page);
    await assertNoForbiddenLabels(page);
  });
});
