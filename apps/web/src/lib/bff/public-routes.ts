/**
 * Registry of route handlers that are PUBLIC and UNAUTHENTICATED by design.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * Every investor route lives under `apps/web/app/api/` and goes through
 * `bffRead` / `bffMutate`, which resolve an auth context and fail closed. A
 * route file placed ANYWHERE ELSE under `app/` — for example
 * `app/.well-known/jwks.json/route.ts` — is outside that tree and therefore
 * outside anything that scans it. A public unauthenticated route shipping
 * without an explicit declaration is precisely the drift a route gate exists to
 * catch, so each one is enumerated here and asserted in
 * `scripts/contract-assertions.ts`.
 *
 * Adding a route file outside `app/api/` FAILS the contract assertions until
 * its path is listed here with a reason. That is the point: the exception has
 * to be argued, not discovered later.
 */

export interface PublicRoute {
  /** Path as served, relative to the origin. */
  path: string;
  /** Source file, relative to `apps/web/`. */
  file: string;
  /** Why it is unauthenticated, and what it must never expose. */
  reason: string;
}

export const PUBLIC_UNAUTHENTICATED_ROUTES: ReadonlyArray<PublicRoute> = [
  {
    path: "/.well-known/jwks.json",
    file: "app/.well-known/jwks.json/route.ts",
    reason:
      "Machine-readable discovery document. investor-api fetches it without a " +
      "session to verify our user assertions (D-017). Public key material only " +
      "— the private component is stripped before publication, and the route " +
      "returns 503 rather than leaking configuration detail on error.",
  },
  {
    path: "/api/health",
    file: "app/api/health/route.ts",
    reason:
      "Liveness probe. Returns a boolean and a timestamp; no account, session, " +
      "or configuration data.",
  },
] as const;

/** Route files allowed to exist outside `app/api/`, keyed by source path. */
export const PUBLIC_ROUTE_FILES: ReadonlyArray<string> =
  PUBLIC_UNAUTHENTICATED_ROUTES.map((r) => r.file);
