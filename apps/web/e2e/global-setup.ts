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
  // `ready` is a Signal user who has cleared every activation precondition
  // (saved draft, advisory profile, active broker, disclosure ack) so the
  // Surface 3 spec can drive a real activation. Distinct from `signal` so
  // the blocked-checklist assertions remain stable.
  ready: { eligibilityCookie: "e2e-ready-user" },
} as const;

export const ACTIVATION_DISCLOSURE = {
  docId: "form-adv-2a",
  version: "v2026-01",
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

async function seedDisclosureRegistry() {
  const root = storeRoot();
  await writeJson(
    join(
      root,
      "disclosure-documents",
      `${safeKey(`${ACTIVATION_DISCLOSURE.docId}__${ACTIVATION_DISCLOSURE.version}`)}.json`,
    ),
    {
      docId: ACTIVATION_DISCLOSURE.docId,
      version: ACTIVATION_DISCLOSURE.version,
      kind: "adv_2a",
      effectiveAt: new Date().toISOString(),
      contentHash: "sha256-seed-adv2a",
      displayStatus: "available",
      meta: meta("e2e-seed-disclosure"),
    },
  );
}

async function seedReadyActivationFor(authId: string, accountId: string) {
  const root = storeRoot();
  const correlationId = "e2e-seed-ready";

  // Saved Execution Policy draft (the activation source-of-truth).
  await writeJson(
    join(root, "execution-policy-drafts", `${safeKey(accountId)}.json`),
    {
      accountId,
      strategyId: "core-balanced",
      accountScope: "primary",
      assetUniverse: ["US_LARGE_CAP_EQUITY"],
      restrictedSectors: [],
      maxSingleOrderUsd: "1000.00",
      maxPositionSizeBps: 1000,
      minimumCashReserveBps: 500,
      dailyOrderLimit: 5,
      dailyLossPauseBps: 300,
      drawdownPauseBps: 1000,
      maxOpenOrders: 5,
      staleBrokerDataPauseAfter: "PT15M",
      staleProfilePauseAfter: "P90D",
      pauseOnDisclosureSuperseded: true,
      pauseOnProfileSuperseded: true,
      updatedAt: new Date().toISOString(),
      meta: meta(correlationId),
    },
  );

  // Advisory profile snapshot v1.
  await writeJson(
    join(root, "profile-snapshots", `${safeKey(`${accountId}__v000001`)}.json`),
    {
      accountId,
      profileVersion: 1,
      goal: "retirement",
      horizon: "10y_plus",
      incomeBand: "100_250k",
      liquidityNeed: "low",
      riskTolerance: "moderate",
      experience: "intermediate",
      accountPurpose: "long_term_growth",
      contentHash: "sha256-seed-profile",
      meta: meta(correlationId),
    },
  );

  // Active brokerage connection.
  await writeJson(
    join(root, "brokerage-connections", `${safeKey(accountId)}.json`),
    {
      accountId,
      brokerName: "prototype-broker",
      connectionId: `conn-${accountId}`,
      status: "active",
      lastValidatedAt: new Date().toISOString(),
      meta: meta(correlationId),
    },
  );

  // Disclosure acknowledgement.
  await writeJson(
    join(
      root,
      "disclosure-acks",
      `${safeKey(`${authId}__${ACTIVATION_DISCLOSURE.docId}__${ACTIVATION_DISCLOSURE.version}`)}.json`,
    ),
    {
      userId: authId,
      docId: ACTIVATION_DISCLOSURE.docId,
      version: ACTIVATION_DISCLOSURE.version,
      ackedAt: new Date().toISOString(),
      acceptanceSource: "web",
      ipHash: "sha256-seed-ip",
      userAgentHash: "sha256-seed-ua",
      meta: meta(correlationId),
    },
  );
}

async function seedUser(opts: {
  cookieValue: string;
  mode: "signal" | "managed" | "ready";
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

  // 2) Subscription mode. `ready` is seeded as a Signal user so the
  //    activation flow exercises the Signal→Managed transition.
  await writeJson(
    join(root, "subscription-modes", `${safeKey(accountId)}.json`),
    {
      accountId,
      mode: opts.mode === "ready" ? "signal" : opts.mode,
      selectedAt: new Date().toISOString(),
      meta: meta(correlationId),
    },
  );

  // 3) Recommendation projections. Signal: one open. Managed: three covering
  //    informational + review-required postures so the spec can assert both.
  const projections =
    opts.mode === "signal" || opts.mode === "ready"
      ? [
          {
            recommendationId: `rec-${opts.mode}-aapl`,
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

  // 4) For managed users, seed an active ExecutionPolicy v1 + a
  //    ManagedExecutionState in `active`. Surface 2 needs these so the
  //    "active policy stays in force" banner has something to anchor to.
  //    No draft is seeded — the draft route's default-initialize path
  //    should populate the form from defaults.
  if (opts.mode === "managed") {
    const signedAt = new Date().toISOString();
    await writeJson(
      join(
        root,
        "execution-policies",
        `${safeKey(`${accountId}__v000001`)}.json`,
      ),
      {
        accountId,
        policyId: `${accountId}-policy-v1`,
        policyVersion: 1,
        strategyId: "core-balanced",
        accountScope: "primary",
        assetUniverse: ["US_LARGE_CAP_EQUITY"],
        riskGuardrailHash: "sha256-seed-guardrails",
        restrictionsHash: "sha256-seed-restrictions",
        pauseRules: ["disclosure_superseded", "profile_superseded"],
        notificationPreferences: ["email"],
        advisoryProfileVersion: 1,
        disclosureVersions: [{ docId: "form-adv-2a", version: "v2026-01" }],
        advisoryAgreementVersion: "v2026-01",
        signedAt,
        signedByAuthId: authId,
        signedIpHash: "sha256-seed-ip",
        signedDeviceFingerprintHash: "sha256-seed-device",
        correlationId,
        meta: meta(correlationId),
      },
    );
    await writeJson(
      join(root, "managed-execution-states", `${safeKey(accountId)}.json`),
      {
        accountId,
        executionPolicyVersion: 1,
        status: "active",
        lastChangedAt: signedAt,
        lastChangedBy: "user",
        meta: meta(correlationId),
      },
    );
  }

  // 5) The `ready` user gets every activation prerequisite pre-seeded.
  if (opts.mode === "ready") {
    await seedReadyActivationFor(authId, accountId);
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
    "execution-policies",
    "execution-policy-drafts",
    "managed-execution-states",
    "brokerage-connections",
    "profile-snapshots",
    "disclosure-documents",
    "disclosure-acks",
    "lifecycle-states",
  ]) {
    const path = join(root, dir);
    if (existsSync(path)) await rm(path, { recursive: true, force: true });
  }

  await seedDisclosureRegistry();

  await seedUser({
    cookieValue: E2E_USERS.signal.eligibilityCookie,
    mode: "signal",
  });
  await seedUser({
    cookieValue: E2E_USERS.managed.eligibilityCookie,
    mode: "managed",
  });
  await seedUser({
    cookieValue: E2E_USERS.ready.eligibilityCookie,
    mode: "ready",
  });
}
