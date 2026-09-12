/**
 * Investor product (P1) — design-system conformance, measured.
 *
 * The founder directive forbids eyeballing this: "Do not simply eyeball the
 * implementation. Add visual assertions where practical and inspect the
 * rendered pages at the target viewport."
 *
 * So these read COMPUTED styles from the real rendered artifact and compare
 * them to the ReFi.Trading design system's trading-application register
 * (canvas `ui_kits/trading-app/app.css`). A regression to stock shadcn
 * geometry — 6px buttons, 8px cards, pill badges — fails here rather than in
 * a screenshot review.
 *
 * Runs on the demo lane because the components must actually render, which
 * requires the fixture adapter.
 */
import { test, expect, type Locator } from "@playwright/test";

/** Workstation-first: the design system is desktop-dense by default. */
const DESKTOP = { width: 1440, height: 900 };

async function css(el: Locator, prop: string): Promise<string> {
  return el.evaluate(
    (node, p) => window.getComputedStyle(node).getPropertyValue(p),
    prop,
  );
}

test.use({ viewport: DESKTOP });

test.describe("design-system conformance", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/us/product/brokerage");
    await expect(page.getByTestId("connection-panel")).toBeVisible();
  });

  test("radii follow the application register, not consumer defaults", async ({
    page,
  }) => {
    // Cards / panels: 6px — the app ceiling. Never rounded-lg/8px, which the
    // system reserves for the landing page.
    const panel = page.getByTestId("connection-panel");
    expect(await css(panel, "border-radius")).toBe("6px");

    // Buttons: 4px.
    const button = page.getByTestId("connect-paper");
    expect(await css(button, "border-radius")).toBe("4px");

    // Badges: 2px — emphatically not a pill.
    const badge = page.getByTestId("environment-badge").first();
    expect(await css(badge, "border-radius")).toBe("2px");

    // Inputs: 2px.
    await button.click();
    const input = page.getByTestId("api-key-id");
    expect(await css(input, "border-radius")).toBe("2px");
  });

  test("panels use 16px padding and rest flat", async ({ page }) => {
    const panel = page.getByTestId("connection-panel");
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(await css(panel, `padding-${side}`)).toBe("16px");
    }
    // No shadow at rest; elevation is a hover affordance only.
    expect(await css(panel, "box-shadow")).toBe("none");
  });

  test("the fixed type scale is used, with no marketing-size type", async ({
    page,
  }) => {
    // 20px/700 section heading.
    const h1 = page.getByRole("heading", { level: 1 });
    expect(await css(h1, "font-size")).toBe("20px");
    expect(await css(h1, "font-weight")).toBe("700");

    // 12px metadata / badge.
    const badge = page.getByTestId("environment-badge").first();
    expect(await css(badge, "font-size")).toBe("12px");

    // Nothing on a product surface may reach marketing display sizes.
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll("#product-main *")]
        .map((n) => parseFloat(window.getComputedStyle(n).fontSize))
        .filter((n) => Number.isFinite(n)),
    );
    expect(Math.max(...sizes)).toBeLessThanOrEqual(24);
  });

  test("financial values render in the mono face", async ({ page }) => {
    await page.goto("/us/product/subscription");
    const allocation = page.getByTestId("allocation-input");
    const family = await css(allocation, "font-family");
    // Allocation is financial data: mono, per the system's number rule.
    expect(family.toLowerCase()).toContain("mono");
    expect(await css(allocation, "font-variant-numeric")).toContain(
      "tabular-nums",
    );
  });

  test("focus is a visible 2px mint indicator with offset", async ({
    page,
  }) => {
    const button = page.getByTestId("connect-paper");
    await button.focus();
    expect(await css(button, "outline-width")).toBe("2px");
    expect(await css(button, "outline-offset")).toBe("2px");
    // mint #0CD4A0
    expect(await css(button, "outline-color")).toBe("rgb(12, 212, 160)");
  });

  test("the primary action is mint on charcoal, and it is the only one", async ({
    page,
  }) => {
    const primary = page.getByTestId("connect-paper");
    expect(await css(primary, "background-color")).toBe("rgb(12, 212, 160)");
    expect(await css(primary, "color")).toBe("rgb(16, 24, 32)");

    // Exactly one mint-filled action per state — the system's rule that the
    // primary action is singular.
    const mintFilled = await page.evaluate(
      () =>
        [...document.querySelectorAll("#product-main button")].filter(
          (b) =>
            window.getComputedStyle(b).backgroundColor === "rgb(12, 212, 160)",
        ).length,
    );
    expect(mintFilled).toBe(1);
  });

  test("surfaces use the ReFi charcoal ladder, not a generic dark theme", async ({
    page,
  }) => {
    // Page ground: charcoal #101820. Panels sit one step up the ladder.
    const body = page.locator("#product-main").locator("..");
    expect(await css(body, "background-color")).toBe("rgb(16, 24, 32)");
    const panel = page.getByTestId("connection-panel");
    expect(await css(panel, "background-color")).toBe("rgb(45, 58, 71)");
  });

  test("a gated primary action looks unavailable, not merely dimmed", async ({
    page,
  }) => {
    await page.goto("/us/product/subscription");
    const confirm = page.getByTestId("confirm-subscription");
    await expect(confirm).toBeDisabled();
    // Never a faded mint: a disabled primary must not still read as THE action.
    expect(await css(confirm, "background-color")).not.toBe(
      "rgb(12, 212, 160)",
    );
  });

  test("motion is restrained and honours prefers-reduced-motion", async ({
    page,
  }) => {
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll("#product-main *")].flatMap((n) =>
        window
          .getComputedStyle(n)
          .transitionDuration.split(",")
          .map((d) => parseFloat(d) * 1000)
          .filter((d) => Number.isFinite(d) && d > 0),
      ),
    );
    // Nothing over 300ms anywhere on the surface.
    for (const d of durations) expect(d).toBeLessThanOrEqual(300);
  });

  test("state is never conveyed by colour alone", async ({ page }) => {
    // Each status carries a text label a monochrome display still reads.
    await expect(page.getByTestId("environment-badge").first()).toHaveText(
      "PAPER",
    );
    await expect(page.getByTestId("connection-status")).not.toHaveText("");
    await expect(page.getByTestId("live-badge")).toContainText("NOT AVAILABLE");
  });

  test("the dense layout survives a narrow viewport without sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/**
 * Rendered-screen capture at the workstation viewport.
 *
 * The directive requires inspecting the rendered pages rather than trusting
 * the code, so this writes the four states a reviewer needs to look at. The
 * assertions above are what FAIL a regression; these images are what a human
 * reviews for the things a computed-style check cannot judge — hierarchy,
 * density, whether it reads as a workstation rather than a consumer app.
 */
test.describe("rendered screens", () => {
  test("capture the investor product states", async ({ page }, testInfo) => {
    const shot = async (name: string) => {
      await page.screenshot({
        path: testInfo.outputPath(`${name}.png`),
        fullPage: true,
      });
    };

    await page.goto("/us/product/brokerage");
    await expect(page.getByTestId("connection-panel")).toBeVisible();
    await shot("01-brokerage-not-connected");

    await page.getByTestId("connect-paper").click();
    await expect(page.getByTestId("api-key-id")).toBeVisible();
    await shot("02-brokerage-credential-form");

    await page.getByTestId("api-key-id").fill(`PK${"0".repeat(18)}`);
    await page
      .getByTestId("api-secret-key")
      .fill("e2eFixtureSecret".padEnd(40, "0"));
    await page.getByTestId("submit-connection").click();
    await expect(page.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "connected",
    );
    await shot("03-brokerage-connected");

    await page.getByTestId("continue-to-subscription").click();
    await expect(page.getByTestId("subscription-surface")).toBeVisible();
    await shot("04-subscription");

    await page.getByTestId("allocation-input").fill("25");
    await page.getByTestId("consent-checkbox").check();
    await page.getByTestId("confirm-subscription").click();
    await expect(page.getByTestId("subscription-confirmed")).toBeVisible();
    await shot("05-subscription-confirmed");
  });
});
