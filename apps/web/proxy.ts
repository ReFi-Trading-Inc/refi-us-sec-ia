import { type NextRequest, NextResponse } from "next/server";

const ELIGIBILITY_COOKIE = "us_eligibility_v1";
const SESSION_COOKIE = "us_session_v1";

const isProd = process.env["NEXT_PUBLIC_REFI_ENV"] === "prod";
const posthogHost =
  process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "app.posthog.com";
const sentryDsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];

function sentryHost(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    return new URL(dsn).hostname;
  } catch {
    return null;
  }
}

function buildCsp(): string {
  // No nonces here, deliberately: pages are statically prerendered, so
  // Next's emitted <script> tags can never carry a per-request nonce — and
  // with 'strict-dynamic', browsers ignore 'self', which shipped production
  // with ALL JavaScript blocked (no hydration; forms fell back to native
  // GET submits). Same-origin + inline is the strongest policy that works
  // until pages are rendered dynamically with the nonce threaded through
  // Next via request headers.
  const scriptSrc = isProd
    ? `'self' 'unsafe-inline'`
    : `'self' 'unsafe-inline' 'unsafe-eval'`;

  const sHost = sentryHost(sentryDsn);
  const extraConnect = [
    isProd ? `https://${posthogHost}` : null,
    sHost ? `https://${sHost}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' wss: https:${extraConnect ? " " + extraConnect : ""}`,
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const correlationId =
    request.headers.get("x-correlation-id") ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-correlation-id", correlationId);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const realIp = forwardedFor.split(",")[0]?.trim();
    if (realIp) requestHeaders.set("x-real-ip", realIp);
  }

  const needsEligibility =
    pathname.startsWith("/us/auth/connect") ||
    (pathname.startsWith("/us/onboarding/") && pathname !== "/us/onboarding");

  if (needsEligibility && !request.cookies.get(ELIGIBILITY_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/us/eligibility";
    return NextResponse.redirect(url);
  }

  const needsSession =
    pathname.startsWith("/us/app/") ||
    (pathname.startsWith("/us/onboarding/") && pathname !== "/us/onboarding");

  if (needsSession && !request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/us/auth/connect";
    return NextResponse.redirect(url);
  }

  // Admin surfaces do not exist in this investor app. Operator commands live
  // exclusively in the upstream admin service (see docs/admin-investor-boundary.md).
  // Any request to /admin/* gets a hard 404 so we don't accidentally proxy or
  // hint at admin functionality from the investor app.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse(null, { status: 404 });
  }

  // Demo-tier entry page: structurally dark on every tier except REFI_ENV=demo
  // (server-only runtime tier, read here directly because the edge proxy has
  // no access to the validated server env). The page itself also calls
  // notFound(); this edge 404 is the hard guarantee that production never
  // serves a persona picker, regardless of how the page renders.
  if (
    (pathname === "/us/demo" || pathname.startsWith("/us/demo/")) &&
    process.env["REFI_ENV"] !== "demo"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("x-correlation-id", correlationId);
  response.headers.set("Content-Security-Policy", buildCsp());
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );

  // NOTE: a double-submit CSRF cookie used to be issued here for /us/app/*
  // navigations. Removed 2026-08-25 (CS-02): nothing ever echoed or validated
  // it, and the implemented CSRF control for cookie-authenticated mutations is
  // the fail-closed same-origin check in bffMutate (src/lib/bff/origin.ts).
  // The tripwire pins the retired identifiers so the half-layer cannot
  // silently return without a reviewed CSRF architecture decision.

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
