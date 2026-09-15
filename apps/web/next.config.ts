import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The legacy v1 advisory questionnaire is retired: the public U.S. app has
  // ONE canonical Investor Profile questionnaire (v2). Keep the old path as a
  // real HTTP 308 so stale links/bookmarks land on v2 without rendering a page.
  redirects: () => [
    {
      source: "/us/onboarding/profile",
      destination: "/us/onboarding/investor-profile",
      permanent: true,
    },
  ],
  // The conference booth deck is a prebuilt static bundle in public/booth.
  // Next serves public/booth/index.html at that exact path but not at the bare
  // /booth, so the directory index is rewritten explicitly. It is a leaf:
  // nothing under /booth links back into the app, and the proxy applies the
  // same CSP to it as to every other route (the bundle ships its own compiled
  // CSS and self-hosted fonts, so 'self' is sufficient and no origin is added
  // to the policy — do not reintroduce a CDN or Google Fonts there).
  //
  // The bundle has NO source in this repo. It is built from the Vite project at
  // ReFi/Conferences/Web Summit 2025 Qatar/Booth-Visuals/refi.trading-presentation
  // with `npm run build:booth`, whose dist-booth/ is copied here wholesale.
  // Edit the deck there, rebuild, and recopy — never hand-edit public/booth.
  rewrites: () => [{ source: "/booth", destination: "/booth/index.html" }],
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
      ],
    },
  ],
};

export default nextConfig;
