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

// CJS package since #34 (no type:module): Playwright transpiles this file to
// CJS where import.meta is illegal, so use the CJS __dirname global.
const APP_ROOT = resolve(__dirname, "..");

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
  // Dedicated account for idempotency tests so they cannot race against the
  // UI activation test that targets `ready` in parallel.
  idempotency: { eligibilityCookie: "e2e-idempotency-user" },
  // Managed users seeded with specific ManagedExecutionState statuses so the
  // pause / resume spec can assert each branch in isolation without mutating
  // the shared `managed` user (whose status the Surface-1 spec depends on).
  pausableActive: { eligibilityCookie: "e2e-pausable-active-user" },
  resumablePaused: { eligibilityCookie: "e2e-resumable-paused-user" },
  systemPaused: { eligibilityCookie: "e2e-system-paused-user" },
  // Surface 5: Managed users with disclosure versions on the active policy
  // that are no longer the latest available in the registry.
  staleDisclosure: { eligibilityCookie: "e2e-stale-disclosure-user" },
  staleDisclosurePaused: {
    eligibilityCookie: "e2e-stale-disclosure-paused-user",
  },
  // Surface 6: Managed users whose advisory profile is flagged as stale.
  // `staleProfilePaused` — system-paused with reasonCode=stale_profile_aging
  //   and the latest profile snapshot matches the policy's pinned version.
  //   The user only needs to re-confirm; MES auto-restores on confirm.
  // `staleProfileMaterial` — system-paused with reasonCode=stale_profile_changed
  //   AND a NEW profile snapshot exists with different fields. Reconfirm
  //   must fail with material_change_requires_policy_review; the UI routes
  //   to the activation page.
  // `staleProfileWithDisclosure` — system-paused with reasonCode=
  //   stale_profile_aging AND a stale disclosure also exists. Confirming
  //   the profile records the confirmation but must NOT clear the pause
  //   (the disclosure blocker remains).
  staleProfilePaused: { eligibilityCookie: "e2e-stale-profile-paused-user" },
  staleProfileMaterial: {
    eligibilityCookie: "e2e-stale-profile-material-user",
  },
  staleProfileWithDisclosure: {
    eligibilityCookie: "e2e-stale-profile-with-disclosure-user",
  },
  // Surface 7: Managed user with a seeded set of open exceptions across the
  // ExceptionKind union. Dedicated so the existing `managed` user's
  // Surface-1 spec is not affected by resolution writes.
  exceptionsUser: { eligibilityCookie: "e2e-exceptions-user" },
} as const;

export const ACTIVATION_DISCLOSURE_V2 = {
  docId: "form-adv-2a",
  version: "v2026-06",
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
  // v1 (the version pinned in pre-Surface-5 seeded ExecutionPolicies). Now
  // marked `superseded` so the eligibility view treats v2 as the latest
  // required acknowledgement.
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
      effectiveAt: "2026-01-15T00:00:00Z",
      contentHash: "sha256-seed-adv2a-v1",
      displayStatus: "superseded",
      meta: meta("e2e-seed-disclosure"),
    },
  );
  // v2: superseding version, available for re-acknowledgement.
  await writeJson(
    join(
      root,
      "disclosure-documents",
      `${safeKey(`${ACTIVATION_DISCLOSURE_V2.docId}__${ACTIVATION_DISCLOSURE_V2.version}`)}.json`,
    ),
    {
      docId: ACTIVATION_DISCLOSURE_V2.docId,
      version: ACTIVATION_DISCLOSURE_V2.version,
      kind: "adv_2a",
      effectiveAt: "2026-06-01T00:00:00Z",
      contentHash: "sha256-seed-adv2a-v2",
      displayStatus: "available",
      supersedesVersion: ACTIVATION_DISCLOSURE.version,
      meta: meta("e2e-seed-disclosure-v2"),
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

  // Disclosure acknowledgement. The ready / idempotency users ack the
  // CURRENT available version (v2) so activation can proceed cleanly.
  await writeJson(
    join(
      root,
      "disclosure-acks",
      `${safeKey(`${authId}__${ACTIVATION_DISCLOSURE_V2.docId}__${ACTIVATION_DISCLOSURE_V2.version}`)}.json`,
    ),
    {
      userId: authId,
      docId: ACTIVATION_DISCLOSURE_V2.docId,
      version: ACTIVATION_DISCLOSURE_V2.version,
      ackedAt: new Date().toISOString(),
      acceptanceSource: "web",
      ipHash: "sha256-seed-ip",
      userAgentHash: "sha256-seed-ua",
      meta: meta(correlationId),
    },
  );
}

type ManagedSeedStatus =
  | "active"
  | "paused_by_user"
  | "paused_by_system"
  | "review_required"
  | "setup_incomplete";

async function seedManagedAccount(args: {
  accountId: string;
  authId: string;
  correlationId: string;
  status: ManagedSeedStatus;
  reasonCode?: string;
}) {
  const root = storeRoot();
  const signedAt = new Date().toISOString();
  await writeJson(
    join(
      root,
      "execution-policies",
      `${safeKey(`${args.accountId}__v000001`)}.json`,
    ),
    {
      accountId: args.accountId,
      policyId: `${args.accountId}-policy-v1`,
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
      signedByAuthId: args.authId,
      signedIpHash: "sha256-seed-ip",
      signedDeviceFingerprintHash: "sha256-seed-device",
      correlationId: args.correlationId,
      meta: meta(args.correlationId),
    },
  );
  await writeJson(
    join(root, "managed-execution-states", `${safeKey(args.accountId)}.json`),
    {
      accountId: args.accountId,
      executionPolicyVersion: 1,
      status: args.status,
      ...(args.reasonCode ? { reasonCode: args.reasonCode } : {}),
      lastChangedAt: signedAt,
      lastChangedBy: args.status === "paused_by_system" ? "system" : "user",
      meta: meta(args.correlationId),
    },
  );
}

async function seedUser(opts: {
  cookieValue: string;
  mode:
    | "signal"
    | "managed"
    | "ready"
    | "idempotency"
    | "pausableActive"
    | "resumablePaused"
    | "systemPaused"
    | "staleDisclosure"
    | "staleDisclosurePaused"
    | "staleProfilePaused"
    | "staleProfileMaterial"
    | "staleProfileWithDisclosure"
    | "exceptionsUser";
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
  //    - `ready` / `idempotency` are Signal so activation flow exercises the
  //      Signal→Managed transition.
  //    - `pausableActive` / `resumablePaused` / `systemPaused` are Managed so
  //      the pause/resume controls render.
  const seededMode: "signal" | "managed" =
    opts.mode === "ready" ||
    opts.mode === "idempotency" ||
    opts.mode === "signal"
      ? "signal"
      : "managed";
  await writeJson(
    join(root, "subscription-modes", `${safeKey(accountId)}.json`),
    {
      accountId,
      mode: seededMode,
      selectedAt: new Date().toISOString(),
      meta: meta(correlationId),
    },
  );

  // 3) Recommendation projections. Signal-shaped accounts get one open card;
  //    Managed-shaped accounts get the informational + review-required pair.
  const projections =
    seededMode === "signal"
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

  // 4) Managed-shaped users get a signed ExecutionPolicy v1 + a
  //    ManagedExecutionState seeded to a specific status. Surface 2 + the
  //    pause/resume + disclosure-reack specs drive different branches off
  //    the same shape.
  const managedSeedStatus: ManagedSeedStatus | null =
    opts.mode === "managed" ||
    opts.mode === "pausableActive" ||
    opts.mode === "staleDisclosure" ||
    opts.mode === "exceptionsUser"
      ? "active"
      : opts.mode === "resumablePaused"
        ? "paused_by_user"
        : opts.mode === "systemPaused" ||
            opts.mode === "staleDisclosurePaused" ||
            opts.mode === "staleProfilePaused" ||
            opts.mode === "staleProfileMaterial" ||
            opts.mode === "staleProfileWithDisclosure"
          ? "paused_by_system"
          : null;
  if (managedSeedStatus !== null) {
    const reasonCode =
      opts.mode === "systemPaused"
        ? "broker_disconnected"
        : opts.mode === "staleDisclosurePaused"
          ? "stale_disclosure_form-adv-2a"
          : opts.mode === "staleProfilePaused" ||
              opts.mode === "staleProfileWithDisclosure"
            ? "stale_profile_aging"
            : opts.mode === "staleProfileMaterial"
              ? "stale_profile_changed"
              : undefined;
    await seedManagedAccount({
      accountId,
      authId,
      correlationId,
      status: managedSeedStatus,
      ...(reasonCode ? { reasonCode } : {}),
    });
  }

  // 5) `ready` and `idempotency` users get every activation prerequisite
  //    pre-seeded so the activation flow runs end-to-end.
  if (opts.mode === "ready" || opts.mode === "idempotency") {
    await seedReadyActivationFor(authId, accountId);
  }

  // 6) Stale-profile users need a profile-snapshot history seeded. The
  //    seedManagedAccount call above pins `advisoryProfileVersion: 1` in the
  //    ExecutionPolicy; here we seed the actual snapshots so the reactivation
  //    eligibility route can compute the diff.
  if (
    opts.mode === "staleProfilePaused" ||
    opts.mode === "staleProfileWithDisclosure" ||
    opts.mode === "staleProfileMaterial"
  ) {
    const root = storeRoot();
    const baseFields = {
      goal: "retirement",
      horizon: "10y_plus",
      incomeBand: "100_250k",
      liquidityNeed: "low",
      riskTolerance: "moderate",
      experience: "intermediate",
      accountPurpose: "long_term_growth",
    };
    await writeJson(
      join(
        root,
        "profile-snapshots",
        `${safeKey(`${accountId}__v000001`)}.json`,
      ),
      {
        accountId,
        profileVersion: 1,
        ...baseFields,
        contentHash: "sha256-seed-profile-v1",
        meta: meta(correlationId),
      },
    );
    if (opts.mode === "staleProfileMaterial") {
      // A NEW snapshot exists with different fields → material change.
      await writeJson(
        join(
          root,
          "profile-snapshots",
          `${safeKey(`${accountId}__v000002`)}.json`,
        ),
        {
          accountId,
          profileVersion: 2,
          ...baseFields,
          // Risk tolerance materially increased.
          riskTolerance: "aggressive",
          incomeBand: "250_500k",
          contentHash: "sha256-seed-profile-v2",
          meta: meta(correlationId),
        },
      );
    }

    // staleProfilePaused and staleProfileMaterial pre-ack the latest
    // disclosure version (v2026-06) so the ONLY outstanding blocker is the
    // profile. staleProfileWithDisclosure intentionally leaves v2026-06
    // unacked so the disclosure blocker remains after profile reconfirmation.
    if (
      opts.mode === "staleProfilePaused" ||
      opts.mode === "staleProfileMaterial"
    ) {
      await writeJson(
        join(
          root,
          "disclosure-acks",
          `${safeKey(`${authId}__${ACTIVATION_DISCLOSURE_V2.docId}__${ACTIVATION_DISCLOSURE_V2.version}`)}.json`,
        ),
        {
          userId: authId,
          docId: ACTIVATION_DISCLOSURE_V2.docId,
          version: ACTIVATION_DISCLOSURE_V2.version,
          ackedAt: new Date().toISOString(),
          acceptanceSource: "web",
          ipHash: "sha256-seed-ip",
          userAgentHash: "sha256-seed-ua",
          meta: meta(correlationId),
        },
      );
    }
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
    "activation-idempotency",
    "profile-confirmations",
    "profile-snapshots",
    "exception-reviews",
    // exception-resolutions is an append-only jsonl, scrubbed via the
    // file-level rm below.
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
  await seedUser({
    cookieValue: E2E_USERS.idempotency.eligibilityCookie,
    mode: "idempotency",
  });
  await seedUser({
    cookieValue: E2E_USERS.pausableActive.eligibilityCookie,
    mode: "pausableActive",
  });
  await seedUser({
    cookieValue: E2E_USERS.resumablePaused.eligibilityCookie,
    mode: "resumablePaused",
  });
  await seedUser({
    cookieValue: E2E_USERS.systemPaused.eligibilityCookie,
    mode: "systemPaused",
  });
  await seedUser({
    cookieValue: E2E_USERS.staleDisclosure.eligibilityCookie,
    mode: "staleDisclosure",
  });
  await seedUser({
    cookieValue: E2E_USERS.staleDisclosurePaused.eligibilityCookie,
    mode: "staleDisclosurePaused",
  });
  await seedUser({
    cookieValue: E2E_USERS.staleProfilePaused.eligibilityCookie,
    mode: "staleProfilePaused",
  });
  await seedUser({
    cookieValue: E2E_USERS.staleProfileMaterial.eligibilityCookie,
    mode: "staleProfileMaterial",
  });
  await seedUser({
    cookieValue: E2E_USERS.staleProfileWithDisclosure.eligibilityCookie,
    mode: "staleProfileWithDisclosure",
  });
  await seedUser({
    cookieValue: E2E_USERS.exceptionsUser.eligibilityCookie,
    mode: "exceptionsUser",
  });

  // Surface 7 exception seed for the dedicated exceptionsUser. Seeded as an
  // append-only-style fixture (the resolution log is jsonl-backed so we wipe
  // it via direct unlink to keep tests deterministic).
  const excRoot = storeRoot();
  await rm(join(excRoot, "exception-resolutions.jsonl"), {
    force: true,
  });
  const excAccountId = `acct-${authIdFor(
    E2E_USERS.exceptionsUser.eligibilityCookie,
  )}`;
  const now = new Date().toISOString();
  const exceptions = [
    {
      exceptionId: "exc-profile-stale",
      kind: "stale_profile" as const,
      summary:
        "Your profile snapshot is older than your freshness setting. Review it to keep automation eligible.",
    },
    {
      exceptionId: "exc-disclosure-expired",
      kind: "expired_disclosure" as const,
      summary:
        "A newer disclosure version supersedes the one your active policy was signed under.",
      intentRef: "rec-managed-aapl",
    },
    {
      exceptionId: "exc-broker-stale",
      kind: "stale_broker_data" as const,
      summary:
        "Broker reported no fresh positions data within your policy's freshness window.",
    },
    {
      exceptionId: "exc-out-of-policy",
      kind: "out_of_policy_intent" as const,
      summary:
        "A recommended trade falls outside the guardrails you signed in your active policy.",
      intentRef: "rec-managed-msft",
    },
  ];
  for (const ex of exceptions) {
    await writeJson(
      join(
        root,
        "exception-reviews",
        `${safeKey(`${excAccountId}__${ex.exceptionId}`)}.json`,
      ),
      {
        accountId: excAccountId,
        exceptionId: ex.exceptionId,
        kind: ex.kind,
        status: "open",
        ...(ex.intentRef ? { intentRef: ex.intentRef } : {}),
        summary: ex.summary,
        openedAt: now,
        meta: meta("e2e-seed-exceptions"),
      },
    );
  }
}
