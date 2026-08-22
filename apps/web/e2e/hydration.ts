/**
 * E2E hydration helper. TEST-ONLY — never imported by application code.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * Specs that touch a controlled form field immediately after navigation can
 * land between first paint and React hydration. Playwright sets the DOM value,
 * then hydration mounts the controlled component and resets it to its initial
 * state — so the interaction is silently discarded. The visible signature is a
 * field that reports `""` after a successful-looking `selectOption`/`fill`:
 *
 *     14 × locator resolved to <select …>
 *        - unexpected value ""
 *
 * Downstream assertions then fail somewhere else entirely: the submit button
 * never enables, no result card renders, and the spec times out waiting for an
 * element whose absence is a symptom rather than the fault.
 *
 * Waiting for a heading (or any paint-time signal) does not close this — markup
 * is present before hydration, which is the whole point of SSR. Nor does simply
 * asserting the value afterwards: that detects the race instead of preventing
 * it, which is what the pre-existing guard in support.spec.ts did.
 *
 * The reliable gate is to retry the interaction until the value survives a
 * round trip, which is true exactly once the control is hydrated. React
 * hydrates the tree as a unit, so gating the FIRST stateful interaction on a
 * page is sufficient — later fields on the same page need no wrapper.
 *
 * ─── What this deliberately does NOT do ────────────────────────────────────
 *
 * It does not raise assertion timeouts. A longer timeout would only widen the
 * window in which a discarded interaction goes unnoticed; the interaction still
 * needs replaying after hydration, and no amount of waiting replays it.
 */
import { expect, type Locator } from "@playwright/test";

/** Ceiling for hydration on a cold production-artifact route. */
const HYDRATION_TIMEOUT_MS = 30_000;

/**
 * Select `value`, retrying until React state retains it.
 *
 * `value` is matched by option value or label (Playwright's own rule) and is
 * then asserted against the option's `value` attribute, so callers must pass
 * the value rather than a label that differs from it.
 */
export async function selectOptionHydrated(
  select: Locator,
  value: string,
): Promise<void> {
  await expect(async () => {
    await select.selectOption(value);
    await expect(select).toHaveValue(value);
  }).toPass({ timeout: HYDRATION_TIMEOUT_MS });
}
