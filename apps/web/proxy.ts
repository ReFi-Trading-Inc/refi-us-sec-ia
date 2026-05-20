import { type NextRequest, NextResponse } from "next/server";

const ELIGIBILITY_COOKIE = "us_eligibility_v1";
const SESSION_COOKIE = "us_session_v1";
const CSRF_COOKIE = "csrf_v1";

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

function buildCsp(nonce: string): string {
  const scriptSrc = isProd
    ? `'nonce-${nonce}' 'strict-dynamic'`
    : `'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;

  const sHost = sentryHost(sentryDsn);
  const extraConnect = [
    isProd ? `https://${posthogHost}` : null,
    sHost ? `https://${sHost}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src 'self' ${scriptSrc}`,
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

  const nonce = crypto.randomUUID().replace(/-/g, "");
  requestHeaders.set("x-csp-nonce", nonce);

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

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("x-correlation-id", correlationId);
  response.headers.set("x-csp-nonce", nonce);
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
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

  // Issue CSRF token on navigation to /us/app/* pages (readable by JS so the
  // fetch client can echo it back in the x-csrf-token header).
  const isAppNav =
    pathname.startsWith("/us/app/") && !request.headers.get("x-requested-with");
  if (isAppNav && !request.cookies.get(CSRF_COOKIE)) {
    const csrfToken = crypto.randomUUID().replace(/-/g, "");
    response.cookies.set(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/us",
      maxAge: 60 * 60 * 8,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
