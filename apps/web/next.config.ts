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
