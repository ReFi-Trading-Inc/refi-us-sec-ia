import { type NextRequest, NextResponse } from "next/server";

const ELIGIBILITY_COOKIE = "us_eligibility_v1";
const SESSION_COOKIE = "us_session_v1";

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' wss: https:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Correlation ID
  const correlationId =
    request.headers.get("x-correlation-id") ?? crypto.randomUUID();

  // Forward client IP as x-real-ip (no storage; downstream may HMAC it).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-correlation-id", correlationId);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const realIp = forwardedFor.split(",")[0]?.trim();
    if (realIp) requestHeaders.set("x-real-ip", realIp);
  }

  // CSP nonce
  const nonce = crypto.randomUUID().replace(/-/g, "");
  requestHeaders.set("x-csp-nonce", nonce);

  // Eligibility gate: connect + onboarding pages (except `/us/onboarding` index).
  const needsEligibility =
    pathname.startsWith("/us/auth/connect") ||
    (pathname.startsWith("/us/onboarding/") && pathname !== "/us/onboarding");

  if (needsEligibility && !request.cookies.get(ELIGIBILITY_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/us/eligibility";
    return NextResponse.redirect(url);
  }

  // Session gate placeholder (real SIWE check in MIG-P2-01).
  if (pathname.startsWith("/us/app/") && !request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/us/auth/connect";
    return NextResponse.redirect(url);
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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
