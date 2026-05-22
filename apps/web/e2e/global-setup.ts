/**
 * Playwright global setup. Seeds the prototype store with two test identities:
 * one Signal user and one Managed user, each with a deterministic auth id
 * derived from the test eligibility cookie value (matches the FNV-1a hash in
 * apps/web/src/lib/bff/auth.ts).
 *
 * Surface 1 uses this seed; later surfaces should extend it rather than
 * adding ad-hoc seeding inside spec files.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const APP_ROOT = resolve(dirname(__filename), "..");

// FNV-1a (matches apps/web/src/lib/bff/auth.ts). Keep in sync.
function fnv1a(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function authIdFor(cookieValue: string): string {
  return `dev-${fnv1a(cookieValue).slice(0, 16)}`;
}

function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export const E2E_USERS = {
  signal: { eligibilityCookie: "e2e-signal-user" },
  managed: { eligibilityCookie: "e2e-managed-user" },
} as const;

export function e2eAuthIdFor(mode: keyof typeof E2E_USERS): string {
  return authIdFor(E2E_USERS[mode].eligibilityCookie);
}

export function e2eAccountIdFor(mode: keyof typeof E2E_USERS): string {
  return `acct-${e2eAuthIdFor(mode)}`;
}

function storeRoot(): string {
  const fromEnv = process.env["REFI_PROTOTYPE_STORE_DIR"];
  if (fromEnv) return resolve(fromEnv);
  return join(APP_ROOT, ".refi-prototype-store");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

function meta(correlationId: string) {
  return {
    createdAt: new Date().toISOString(),
    correlationId,
    source: "prototype-bff" as const,
  };
}

async function seedUser(opts: {
  cookieValue: string;
  mode: "signal" | "managed";
}) {
  const root = storeRoot();
  const authId = authIdFor(opts.cookieValue);
  const accountId = `acct-${authId}`;
  const correlationId = `e2e-seed-${opts.mode}`;

  // 1) Auth ↔ account link.
  await writeJson(
    join(
      root,
      "auth-session-links",
      `${safeKey(`${authId}__${accountId}`)}.json`,
    ),
    {
      authId,
      accountId,
      linkedAt: new Date().toISOString(),
      source: "onboarding" as const,
      meta: meta(correlationId),
    },
  );

  // 2) Subscription mode.
  await writeJson(
    join(root, "subscription-modes", `${safeKey(accountId)}.json`),
    {
      accountId,
      mode: opts.mode,
      selectedAt: new Date().toISOString(),
      meta: meta(correlationId),
    },
  );

  // 3) Recommendation projections. Signal: one open. Managed: three covering
  //    informational + review-required postures so the spec can assert both.
  const projections =
    opts.mode === "signal"
      ? [
          {
            recommendationId: "rec-signal-aapl",
            symbol: "AAPL",
            action: "buy" as const,
            rationale: "Signal-mode test recommendation.",
            status: "open" as const,
          },
        ]
      : [
          {
            recommendationId: "rec-managed-aapl",
            symbol: "AAPL",
            action: "buy" as const,
            rationale: "Managed-mode informational recommendation.",
            status: "delivered" as const,
          },
          {
            recommendationId: "rec-managed-msft",
            symbol: "MSFT",
            action: "sell" as const,
            rationale: "Managed-mode review-required recommendation.",
            status: "blocked" as const,
          },
        ];

  for (const p of projections) {
    await writeJson(
      join(
        root,
        "recommendation-projections",
        `${safeKey(`${accountId}__${p.recommendationId}`)}.json`,
      ),
      {
        accountId,
        recommendationId: p.recommendationId,
        symbol: p.symbol,
        action: p.action,
        rationale: p.rationale,
        confidence: "0.75",
        status: p.status,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        meta: meta(correlationId),
      },
    );
  }
}

export default async function globalSetup() {
  const root = storeRoot();
  // Clean only the entity directories we seed — never the whole prototype
  // store, which other tests may populate.
  for (const dir of [
    "auth-session-links",
    "subscription-modes",
    "recommendation-projections",
  ]) {
    const path = join(root, dir);
    if (existsSync(path)) await rm(path, { recursive: true, force: true });
  }

  await seedUser({
    cookieValue: E2E_USERS.signal.eligibilityCookie,
    mode: "signal",
  });
  await seedUser({
    cookieValue: E2E_USERS.managed.eligibilityCookie,
    mode: "managed",
  });
}
