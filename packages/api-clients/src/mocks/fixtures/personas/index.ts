// Persona registry + active-persona resolver.
//
// The MSW handler reads the `refi_persona_v1` cookie on each request and
// returns the matching persona's data. The cookie is set by the dev-only
// PersonaSwitcher (MIG-P2.5-10); in production the switcher does not render
// and the cookie is never present, so handlers fall back to Maya.

import { davidKim } from "./david-kim";
import { mayaThompson } from "./maya-thompson";
import { sarahPatel } from "./sarah-patel";
import type { PersonaId, PersonaPackage } from "./types";

export type { PersonaId, PersonaPackage } from "./types";
export { mayaThompson } from "./maya-thompson";
export { davidKim } from "./david-kim";
export { sarahPatel } from "./sarah-patel";

export const PERSONA_COOKIE = "refi_persona_v1";
// Test/mock-only fallback header. Only consulted by MSW handlers, which are
// dev/test-only and disabled when NEXT_PUBLIC_REFI_ENV=prod. Allows Playwright
// to deterministically pin persona via context.setExtraHTTPHeaders when
// cookie propagation to fetch() is unreliable. Never used in production.
export const PERSONA_HEADER = "x-refi-persona";

export const PERSONAS: Record<PersonaId, PersonaPackage> = {
  maya: mayaThompson,
  david: davidKim,
  sarah: sarahPatel,
};

export const PERSONA_LIST: PersonaPackage[] = [
  mayaThompson,
  davidKim,
  sarahPatel,
];

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

function isPersonaId(value: string | null): value is PersonaId {
  return value === "maya" || value === "david" || value === "sarah";
}

/**
 * Returns the persona package, resolved in this order:
 *   1. x-refi-persona header (test/mock-only; see PERSONA_HEADER comment)
 *   2. refi_persona_v1 cookie (dev PersonaSwitcher)
 *   3. Maya fallback
 */
export function getActivePersona(request: Request): PersonaPackage {
  const headerValue = request.headers.get(PERSONA_HEADER);
  if (isPersonaId(headerValue)) return PERSONAS[headerValue];
  const cookieValue = readCookie(request, PERSONA_COOKIE);
  if (isPersonaId(cookieValue)) return PERSONAS[cookieValue];
  return mayaThompson;
}
