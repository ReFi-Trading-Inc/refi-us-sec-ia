// Scenario resolver for MSW handlers.
//
// Dev/staging only. Reads `?scenario=<id>` query param first (one-shot per
// request, useful for Playwright deterministic snapshots), then falls back
// to the `refi_scenario_v1` cookie (sticky across navigation). Production
// builds never set the cookie and the scenario switcher does not render.

import {
  VERDICT_FIXTURES,
  type ScenarioId,
  type ScenarioVerdict,
} from "./fixtures/compliance/verdicts";

export const SCENARIO_COOKIE = "refi_scenario_v1";
export const SCENARIO_QUERY_PARAM = "scenario";

function isScenarioId(v: string | null): v is ScenarioId {
  return (
    v !== null && Object.prototype.hasOwnProperty.call(VERDICT_FIXTURES, v)
  );
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1] ?? "") : null;
}

function readQuery(request: Request, name: string): string | null {
  try {
    return new URL(request.url).searchParams.get(name);
  } catch {
    return null;
  }
}

/**
 * Returns the active scenario for this request, or `null` if none is set.
 * `null` means "use the handler's default behavior" (e.g. qty>1000 → DENY).
 */
export function getActiveScenario(request: Request): ScenarioVerdict | null {
  const q = readQuery(request, SCENARIO_QUERY_PARAM);
  if (isScenarioId(q)) return VERDICT_FIXTURES[q];
  const c = readCookie(request, SCENARIO_COOKIE);
  if (isScenarioId(c)) return VERDICT_FIXTURES[c];
  return null;
}

/** Returns the active scenario id, or `null`. */
export function getActiveScenarioId(request: Request): ScenarioId | null {
  return getActiveScenario(request)?.id ?? null;
}
