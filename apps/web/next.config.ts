import path from "node:path";
import type { NextConfig } from "next";

/**
 * Content Security Policy — S5 (Sprint 2).
 *
 * Composed as a template so operator-configured origins (WalletConnect
 * relay, PostHog, Sentry, Admin Portal proxy) fold in without touching
 * the directive shape. The full policy is:
 *
 *   default-src 'self';
 *   base-uri 'self';
 *   object-src 'none';
 *   frame-ancestors 'none';
 *   form-action 'self';
 *   img-src 'self' data: blob: https://*.walletconnect.com https://*.walletconnect.org;
 *   font-src 'self' data:;
 *   style-src 'self' 'unsafe-inline';   // Tailwind + inline critical CSS
 *   script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.posthog.com;
 *   connect-src 'self' <PostHog> <Sentry> <WalletConnect relay> <Admin Portal>;
 *   worker-src 'self' blob:;
 *   report-uri <Sentry ingest report-uri>;
 *
 * Notes on tradeoffs:
 *   - `unsafe-inline` on style is required by Tailwind and Next.js
 *     inline critical CSS. Nonces on style-src were considered and
 *     deferred to a follow-up when we control the CSS pipeline.
 *   - `unsafe-eval` on script is required by wagmi/viem's inline
 *     wasm/inline eval paths. The wallet libs are exactly the highest-
 *     supply-chain-risk surface, which is why the report-uri exists.
 *   - frame-ancestors 'none' + X-Frame-Options DENY (below) — belt and
 *     braces against clickjacking on the advisor surface.
 *
 * The report-uri is derived from NEXT_PUBLIC_SENTRY_DSN (which resolves
 * to a fully-formed URL); we swap the /<id> tail with `/security/`
 * so violations arrive as CSP reports rather than errors.
 */
function buildCsp(): string {
  const posthogHost = "https://*.posthog.com";
  const sentryDsn = process.env["NEXT_PUBLIC_SENTRY_DSN"] ?? "";
  const sentryOrigin = (() => {
    try {
      return sentryDsn.length > 0 ? new URL(sentryDsn).origin : "";
    } catch {
      return "";
    }
  })();
  const walletConnect = [
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "wss://relay.walletconnect.com",
    "wss://relay.walletconnect.org",
  ].join(" ");
  const adminPortalOrigin = (() => {
    const raw = process.env["ADMIN_PORTAL_BASE_URL"];
    if (!raw) return "";
    try {
      return new URL(raw).origin;
    } catch {
      return "";
    }
  })();
  const connectSrc = [
    "'self'",
    posthogHost,
    sentryOrigin,
    walletConnect,
    adminPortalOrigin,
  ]
    .filter((s) => s.length > 0)
    .join(" ");
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://*.walletconnect.com https://*.walletconnect.org",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${posthogHost}`,
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
  ];
  if (sentryOrigin.length > 0) {
    directives.push(`report-uri ${sentryOrigin}/api/security/csp-report/`);
  }
  return directives.join("; ");
}

const CSP = buildCsp();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@refi/ui", "@refi/api-clients"],
  // The Firestore SDK is a heavy gRPC/native Node package (durable-store
  // driver). Keep it external so Next doesn't bundle it into the serverless
  // function — bundling breaks its dynamic requires and inflates the lambda.
  serverExternalPackages: ["@google-cloud/firestore"],
  typedRoutes: true,
  headers: () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
        { key: "Content-Security-Policy", value: CSP },
        // HSTS: 2 years + preload. Safe on Cloud Run behind the managed
        // TLS terminator; no path served over plain HTTP in production.
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        // Cross-origin isolation defaults — cheap, and required if we
        // ever want SharedArrayBuffer-backed performance work.
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      ],
    },
  ],
};

export default nextConfig;
