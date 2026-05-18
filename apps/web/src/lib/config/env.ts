// Validates process.env at module load. Fails fast with a clear error on missing vars.
// `clientEnv` is safe to import anywhere; `serverEnv` MUST only be imported from
// server components, route handlers, or middleware — never from a 'use client' file.
import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url(),
  NEXT_PUBLIC_REFI_ENV: z.enum(["dev", "staging", "prod"]).default("dev"),
});

const serverSchema = clientSchema.extend({
  SESSION_SECRET: z.string().min(32),
  IP_HASH_SECRET: z.string().min(32),
  ELIGIBILITY_JWT_SECRET: z.string().min(32),
  REFI_DATA_ADAPTER: z.enum(["mock", "live"]).default("mock"),
});

function formatError(error: z.ZodError): string {
  return error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
}

const clientParsed = clientSchema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env["NEXT_PUBLIC_API_BASE_URL"],
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
    process.env["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"],
  NEXT_PUBLIC_POSTHOG_KEY: process.env["NEXT_PUBLIC_POSTHOG_KEY"],
  NEXT_PUBLIC_SENTRY_DSN: process.env["NEXT_PUBLIC_SENTRY_DSN"],
  NEXT_PUBLIC_REFI_ENV: process.env["NEXT_PUBLIC_REFI_ENV"],
});

if (!clientParsed.success) {
  throw new Error(
    `Invalid client environment variables:\n${formatError(clientParsed.error)}`,
  );
}

export const clientEnv = clientParsed.data;
export type ClientEnv = typeof clientEnv;

// Server env is parsed lazily so that client bundles that accidentally import
// this module don't trip on missing server-only secrets at build time.
let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function getServerEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() called from a browser context");
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: process.env["NEXT_PUBLIC_API_BASE_URL"],
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
      process.env["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"],
    NEXT_PUBLIC_POSTHOG_KEY: process.env["NEXT_PUBLIC_POSTHOG_KEY"],
    NEXT_PUBLIC_SENTRY_DSN: process.env["NEXT_PUBLIC_SENTRY_DSN"],
    NEXT_PUBLIC_REFI_ENV: process.env["NEXT_PUBLIC_REFI_ENV"],
    SESSION_SECRET: process.env["SESSION_SECRET"],
    IP_HASH_SECRET: process.env["IP_HASH_SECRET"],
    ELIGIBILITY_JWT_SECRET: process.env["ELIGIBILITY_JWT_SECRET"],
    REFI_DATA_ADAPTER: process.env["REFI_DATA_ADAPTER"],
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${formatError(parsed.error)}`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export type ServerEnv = ReturnType<typeof getServerEnv>;
