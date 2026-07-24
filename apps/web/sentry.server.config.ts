import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server-side init.
 *
 * Release + environment are set explicitly so Sentry dashboards can
 * filter errors per deploy. The release is read from a build-time env
 * var; Cloud Run deploys populate SENTRY_RELEASE with the image tag
 * (git short-sha) so a stack trace on the "1.2.3" release stays
 * findable even after "1.2.4" ships.
 *
 * Only initialises in prod. Dev + staging must set NEXT_PUBLIC_REFI_ENV
 * explicitly if they want error capture — the default is off so a local
 * dev's console noise doesn't drown production signal.
 */
if (process.env["NEXT_PUBLIC_REFI_ENV"] === "prod") {
  Sentry.init({
    dsn: process.env["NEXT_PUBLIC_SENTRY_DSN"],
    tracesSampleRate: 0.1,
    release:
      process.env["SENTRY_RELEASE"] ??
      process.env["NEXT_PUBLIC_APP_VERSION"] ??
      undefined,
    environment: process.env["NEXT_PUBLIC_REFI_ENV"],
    // Server side never captures full request bodies — the BFF's own
    // structured request log (apps/web/src/lib/bff/log.ts) is the
    // canonical audit stream; Sentry is for exception stacks only.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      return event;
    },
  });
}
