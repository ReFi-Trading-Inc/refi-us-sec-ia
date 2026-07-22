import path from "node:path";
import type { NextConfig } from "next";

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
      ],
    },
  ],
};

export default nextConfig;
