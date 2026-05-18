"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

const isProd = process.env["NEXT_PUBLIC_REFI_ENV"] === "prod";
const posthogKey = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
const posthogHost =
  process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://app.posthog.com";

function PostHogInit() {
  useEffect(() => {
    if (!isProd || !posthogKey) return;
    posthog.init(posthogKey, {
      api_host: posthogHost,
      capture_pageview: false,
      capture_pageleave: true,
      persistence: "localStorage",
    });
  }, []);
  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!isProd || !posthogKey) {
    return <>{children}</>;
  }
  return (
    <PHProvider client={posthog}>
      <PostHogInit />
      {children}
    </PHProvider>
  );
}
