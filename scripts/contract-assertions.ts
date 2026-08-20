#!/usr/bin/env tsx
/**
 * Contract assertions — runs in CI alongside the tripwire to prove the
 * investor BFF and prototype store honor the rules in:
 *   - docs/investor-action-taxonomy.md
 *   - docs/admin-investor-boundary.md
 *   - docs/sec203a-product-boundary.md
 *   - docs/bff-prototype-state-contract.md
 *   - memory/contract_execution_policy.md
 *   - memory/contract_receipt_vs_access_log.md
 *
 * Why a tsx script instead of vitest: zero new deps to install in apps/web,
 * runs in <2s, easy to extend, and the assertions here are structural +
 * single-function behavioral — not full UI integration tests.
 *
 * Each section is a logical group; failures print a numbered failure list
 * and exit non-zero.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const failures: string[] = [];

async function section(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`✓ ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`✗ ${name}\n  ${msg}`);
    console.error(`✗ ${name}`);
    console.error(`  ${msg}`);
  }
}

// Isolate prototype store to a tmp dir for every assertion run.
const TMP_STORE = mkdtempSync(join(tmpdir(), "refi-contract-store-"));
process.env["REFI_PROTOTYPE_STORE_DIR"] = TMP_STORE;
process.env["IP_HASH_SECRET"] = "contract-test-secret";

// ─── Imports under test ─────────────────────────────────────────────────────

const {
  InvestorActions,
  RecordAccessActions,
  ExceptionResolutions,
  isInvestorAction,
  isRecordAccessAction,
  isExceptionResolution,
} = await import("../apps/web/src/lib/sec203a/actions.ts");

const { decimalStringRefiner } =
  await import("../apps/web/src/lib/sec203a/decimal.ts");

const {
  INVESTOR_ADMIN_VERBS,
  INVESTOR_ACTION_TO_ADMIN_VERB,
  INVESTOR_ACTIONS_ROUTE_TEMPLATE,
  MANAGED_PAPER_GATED_ADMIN_VERBS,
  RECEIPT_ONLY_ADMIN_VERBS,
  SIGNAL_RELEASE_ADMIN_VERBS,
  adminVerbFor,
  investorActionsRoute,
  isInvestorAdminVerb,
  receiptVerbFor,
} = await import("../apps/web/src/lib/sec203a/admin-verbs.ts");

const {
  INVESTOR_EDITABLE_ACCOUNT_PREFS,
  INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS,
  READ_ONLY_CONTROL_NAMES,
} = await import("../apps/web/src/lib/sec203a/account-prefs.ts");

const { RISK_DECISIONS, isRiskDecision, riskSnapshotSchema, riskLimitsSchema } =
  await import("../apps/web/src/lib/sec203a/risk.ts");

const { appendRiskLimits, listRiskLimits, getLatestRiskLimits } =
  await import("../apps/web/src/lib/prototype-store/entities/risk-limits.ts");

const { appendRiskSnapshot, getRiskSnapshot } =
  await import("../apps/web/src/lib/prototype-store/entities/risk-snapshot.ts");

const {
  ACCOUNT_INTENT_STATUSES,
  ACCOUNT_INTENT_KINDS,
  isAccountIntentStatus,
  accountIntentSchema,
} = await import("../apps/web/src/lib/sec203a/account-intents.ts");

const accountIntentEntity =
  await import("../apps/web/src/lib/prototype-store/entities/account-intent.ts");
const { appendAccountIntent, getAccountIntent } = accountIntentEntity;

const {
  ORDER_STATUSES,
  NON_TERMINAL_ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  ORDER_SIDES,
  ORDER_TYPES,
  ORDER_TIFS,
  KNOWN_TERMINAL_REASON_CODES,
  canTransitionOrderStatus,
  isOrderStatus,
  isTerminalOrderStatus,
  orderSchema,
} = await import("../apps/web/src/lib/sec203a/orders.ts");

const orderEntity =
  await import("../apps/web/src/lib/prototype-store/entities/order.ts");
const {
  appendOrder,
  transitionOrder,
  getOrder,
  listOrdersByAccount,
  listOrdersByIntent,
  listOrdersByCorrelation,
} = orderEntity;

const {
  ORDER_EVENT_TYPES,
  ORDER_EVENT_REASON_CODES,
  ORDER_EVENT_SOURCE_SERVICES,
  isOrderEventType,
  orderEventSchema,
} = await import("../apps/web/src/lib/sec203a/order-events.ts");

const orderEventEntity =
  await import("../apps/web/src/lib/prototype-store/entities/order-event.ts");
const {
  appendOrderEvent,
  getOrderEvent,
  listOrderEventsForOrder,
  listOrderEventsForCorrelation,
} = orderEventEntity;

const {
  ATTEMPT_TYPES,
  BROKER_ATTEMPT_STATUSES,
  OUTCOME_BROKER_ATTEMPT_STATUSES,
  ATTEMPT_HTTP_METHODS,
  KNOWN_SECRET_KEY_PARTS,
  isBrokerAttemptStatus,
  brokerOrderAttemptSchema,
} = await import("../apps/web/src/lib/sec203a/broker-order-attempts.ts");

const brokerAttemptEntity =
  await import("../apps/web/src/lib/prototype-store/entities/broker-order-attempt.ts");
const {
  appendBrokerAttempt,
  completeBrokerAttempt,
  getBrokerAttempt,
  listBrokerAttemptsForOrder,
  listBrokerAttemptsForCorrelation,
  listBrokerAttemptRetryChain,
} = brokerAttemptEntity;

const { FILL_SOURCES, KNOWN_LIQUIDITY_VALUES, isFillSource, fillSchema } =
  await import("../apps/web/src/lib/sec203a/fills.ts");

const fillEntity =
  await import("../apps/web/src/lib/prototype-store/entities/fill.ts");
const {
  appendFill,
  getFill,
  listFillsForOrder,
  listFillsForBrokerOrder,
  listFillsForAccount,
} = fillEntity;

const { appendProfileSnapshot, getLatestProfileSnapshot } =
  await import("../apps/web/src/lib/prototype-store/entities/advisory-profile.ts");

const { appendDecisionRecord } =
  await import("../apps/web/src/lib/prototype-store/entities/decision-record.ts");

const { appendActionReceipt, listActionReceipts } =
  await import("../apps/web/src/lib/prototype-store/entities/receipt.ts");

const { appendRecordAccess, listRecordAccesses } =
  await import("../apps/web/src/lib/prototype-store/entities/record-access-log.ts");

const { setManagedExecutionState, getManagedExecutionState } =
  await import("../apps/web/src/lib/prototype-store/entities/managed-execution-state.ts");

const { appendExecutionPolicy, getLatestExecutionPolicy } =
  await import("../apps/web/src/lib/prototype-store/entities/execution-policy.ts");

const { upsertRecommendation, getRecommendation } =
  await import("../apps/web/src/lib/prototype-store/entities/recommendation-projection.ts");

// ─── Action taxonomy assertions ─────────────────────────────────────────────

await section(
  "InvestorActions and RecordAccessActions are disjoint",
  async () => {
    const overlap = (InvestorActions as readonly string[]).filter((a) =>
      (RecordAccessActions as readonly string[]).includes(a),
    );
    assert.deepEqual(
      overlap,
      [],
      `Disjoint sets violated. Overlapping members: ${overlap.join(", ")}`,
    );
  },
);

await section(
  "Forbidden investor actions are not in InvestorActions",
  async () => {
    const forbidden = [
      "acceptRecommendation",
      "approveTrade",
      "approveRebalance",
      "adminRebalance",
      "manualTradeSubmit",
      "forceInference",
      "forceTraining",
      "cancelOrder",
      "rollback",
      "configWrite",
      "controlsWrite",
      "accountInitialize",
      "staffReviewAdvice",
      "founderApproveRecommendation",
      "editRecommendation",
      "activateManagedPolicy", // superseded by activateExecutionPolicy
      "approveUserSideException", // superseded by resolveException
    ];
    for (const id of forbidden) {
      assert.equal(
        isInvestorAction(id),
        false,
        `Forbidden identifier "${id}" was accepted as an InvestorActionName.`,
      );
    }
  },
);

await section(
  "Record access actions are recognized only via isRecordAccessAction",
  async () => {
    for (const a of [
      "viewRecord",
      "downloadRecord",
      "exportRecord",
      "viewEvidence",
    ]) {
      assert.equal(isRecordAccessAction(a), true);
      assert.equal(
        isInvestorAction(a),
        false,
        `"${a}" should be record-access only, not an InvestorActionName.`,
      );
    }
  },
);

await section(
  "ExceptionResolutions includes all 6 required categories",
  async () => {
    const required = [
      "approve_exception",
      "reject_exception",
      "update_profile",
      "reconnect_broker",
      "acknowledge_disclosure",
      "pause_managed",
    ];
    for (const r of required) {
      assert.equal(
        isExceptionResolution(r),
        true,
        `Required resolution category "${r}" missing.`,
      );
    }
    assert.equal(
      isExceptionResolution("approve_trade"),
      false,
      "Generic 'approve_trade' must not be a valid resolution category.",
    );
    assert.equal(
      isExceptionResolution("foobar"),
      false,
      "Unknown resolution category must be rejected.",
    );
  },
);

// ─── Decimal-string discipline ──────────────────────────────────────────────

await section(
  "Decimal-string refiner accepts/rejects the right values",
  async () => {
    for (const ok of ["0", "0.05", "-3.14", "100.50", "1000000.0001"]) {
      assert.equal(decimalStringRefiner(ok), true, `should accept "${ok}"`);
    }
    for (const bad of [
      "",
      "abc",
      "1.2.3",
      "1e10",
      "NaN",
      "Infinity",
      "0.5x",
      ".",
    ]) {
      assert.equal(decimalStringRefiner(bad), false, `should reject "${bad}"`);
    }
  },
);

// ─── Prototype-store immutability ───────────────────────────────────────────

await section("Profile snapshots are immutable per version", async () => {
  const accountId = `imm-${Date.now()}`;
  const fields = {
    goal: "g",
    horizon: "h",
    incomeBand: "i",
    liquidityNeed: "l",
    riskTolerance: "r",
    experience: "e",
    accountPurpose: "p",
  };
  const v1 = await appendProfileSnapshot({
    accountId,
    fields,
    correlationId: "c1",
  });
  assert.equal(v1.profileVersion, 1);
  const v2 = await appendProfileSnapshot({
    accountId,
    fields: { ...fields, restrictions: "no_crypto" },
    correlationId: "c2",
  });
  assert.equal(v2.profileVersion, 2);
  const latest = await getLatestProfileSnapshot(accountId);
  assert.equal(latest?.profileVersion, 2);
});

await section("Decision records are immutable per recordId", async () => {
  const accountId = `dr-${Date.now()}`;
  await appendDecisionRecord({
    record: {
      accountId,
      recordId: "rec-1",
      advisoryProfileVersion: 1,
      disclosureVersions: [{ docId: "crs", version: "1.0" }],
      orderIds: [],
      fillIds: [],
      auditEventIds: [],
      decisionSummary: "Test decision",
      deliveryChannel: "platform",
      deliveredAt: new Date().toISOString(),
    },
    correlationId: "c1",
  });
  await assert.rejects(
    () =>
      appendDecisionRecord({
        record: {
          accountId,
          recordId: "rec-1",
          advisoryProfileVersion: 1,
          disclosureVersions: [{ docId: "crs", version: "1.0" }],
          orderIds: [],
          fillIds: [],
          auditEventIds: [],
          decisionSummary: "Different summary",
          deliveryChannel: "platform",
          deliveredAt: new Date().toISOString(),
        },
        correlationId: "c2",
      }),
    /already exists/,
  );
});

await section("Execution policy versions monotonically increase", async () => {
  const accountId = `ep-${Date.now()}`;
  const base = {
    accountId,
    strategyId: "balanced-v1",
    accountScope: "primary",
    assetUniverse: ["US-EQ"],
    riskGuardrailHash: "h1",
    restrictionsHash: "h2",
    pauseRules: [],
    notificationPreferences: [],
    advisoryProfileVersion: 1,
    disclosureVersions: [{ docId: "crs", version: "1.0" }],
    advisoryAgreementVersion: "iaa-1.0",
    signedAt: new Date().toISOString(),
    signedByAuthId: "dev-test",
    signedIpHash: "iphash",
    signedDeviceFingerprintHash: "fphash",
    correlationId: "c1",
  };
  const p1 = await appendExecutionPolicy({ policy: base });
  const p2 = await appendExecutionPolicy({
    policy: { ...base, correlationId: "c2" },
  });
  assert.equal(p1.policyVersion, 1);
  assert.equal(p2.policyVersion, 2);
  const latest = await getLatestExecutionPolicy(accountId);
  assert.equal(latest?.policyVersion, 2);
});

// ─── Receipt vs access log separation ───────────────────────────────────────

await section(
  "InvestorActionReceipt and RecordAccessLog are independent streams",
  async () => {
    const authId = `sep-${Date.now()}`;
    await appendActionReceipt({
      action: "refreshProfile",
      actor: "user",
      authId,
      correlationId: "c1",
      outcome: "ok",
      references: ["advisory-profile:x/v1"],
    });
    await appendRecordAccess({
      action: "viewRecord",
      authId,
      correlationId: "c2",
      recordRef: "record:y",
    });
    const receipts = await listActionReceipts({ authId });
    const accesses = await listRecordAccesses({ authId });
    assert.equal(receipts.length, 1, "Expected exactly one action receipt");
    assert.equal(accesses.length, 1, "Expected exactly one access entry");
    assert.equal(
      receipts[0]!.action,
      "refreshProfile",
      "Action receipt should be refreshProfile",
    );
    assert.equal(
      accesses[0]!.action,
      "viewRecord",
      "Access entry should be viewRecord",
    );
    // The critical assertion: viewRecord must never appear in the receipt
    // stream, and refreshProfile must never appear in the access stream.
    assert.equal(
      receipts.some((r) => (r.action as string) === "viewRecord"),
      false,
    );
    assert.equal(
      accesses.some((a) => (a.action as string) === "refreshProfile"),
      false,
    );
  },
);

// ─── Managed execution state transitions ────────────────────────────────────

await section(
  "ManagedExecutionState records cause/byUser distinct from policy",
  async () => {
    const accountId = `mes-${Date.now()}`;
    await setManagedExecutionState({
      accountId,
      executionPolicyVersion: 1,
      status: "active",
      changedBy: "user",
      correlationId: "c1",
    });
    await setManagedExecutionState({
      accountId,
      executionPolicyVersion: 1,
      status: "paused_by_user",
      reasonCode: "user_request",
      changedBy: "user",
      correlationId: "c2",
    });
    const now = await getManagedExecutionState(accountId);
    assert.equal(now?.status, "paused_by_user");
    // Pause did not change policy version.
    assert.equal(now?.executionPolicyVersion, 1);
  },
);

// ─── Contract V3 PR-C realignment assertions ───────────────────────────────

await section(
  'RecommendationProjection.action excludes "hold" (Contract V3 §4a + §7.5a)',
  async () => {
    const accountId = `rec-${Date.now()}`;
    const allowed = ["buy", "sell", "neutral", "rebalance"] as const;
    for (const action of allowed) {
      const rec = await upsertRecommendation({
        rec: {
          accountId,
          recommendationId: `r-${action}`,
          symbol: "AAPL",
          action,
          rationale: "fixture",
          confidence: "0.50",
          status: "open",
          generatedAt: new Date().toISOString(),
        },
        correlationId: `c-${action}`,
      });
      assert.equal(rec.action, action);
    }
    // Read-back type narrowing: every recorded action must be in the V3 set.
    const read = await getRecommendation(accountId, "r-neutral");
    assert.ok(read);
    assert.notEqual(
      read.action as string,
      "hold",
      'V3 forbids "hold" as a RecommendationProjection.action — signal: 0 is "neutral".',
    );
    assert.ok(
      (allowed as readonly string[]).includes(read.action),
      `read.action "${read.action}" not in V3 allowed set ${allowed.join("|")}`,
    );
  },
);

await section(
  "INVESTOR_ADMIN_VERBS matches Daniel's approved, client-emittable action set",
  async () => {
    // Daniel's written direction 2026-07-28, narrowed by his 2026-08-17 reply —
    // the only investor-originable verbs the BFF may emit at
    // POST /api/v1/investor/accounts/{account_id}/actions. Any string outside
    // this set must be a 403 + tripwire hit. Imported from
    // apps/web/src/lib/sec203a/admin-verbs.ts so the literal cannot drift from
    // the source-of-truth module.
    //
    // `update_prefs` is deliberately absent: preference updates travel the
    // dedicated PATCH /preferences route and "should not be exposed as a second
    // public write path through /actions" (2026-08-17 §6).
    const expected = [
      "pause_autopilot",
      "resume_autopilot",
      "join_template",
      "leave_template",
      "reduce_only",
    ];
    const forbidden = [
      "force_rebuild",
      "rebalance",
      "manual_rebalance",
      "template.admin",
      "staff_approve",
      "founder_approve",
      "support_advise",
      "investor_accept",
      // Deferred by Daniel 2026-07-28 until the confirmation, position-preview,
      // step-up-auth, idempotency, partial-fill, unknown-state, and
      // lifecycle-evidence scenarios pass in paper testing. Distinct from
      // ACCOUNT_INTENT_KINDS.liquidate_all, which is a backend intent kind and
      // correctly still exists (see the canary below).
      "liquidate_all",
    ];
    assert.deepEqual(
      [...INVESTOR_ADMIN_VERBS].sort(),
      [...expected].sort(),
      "INVESTOR_ADMIN_VERBS drifted from Daniel's approved action set — update docs/phase2-7-daniel-contract-mechanics-resolution.md §6 and obtain written backend confirmation before changing.",
    );
    assert.equal(
      isInvestorAdminVerb("update_prefs"),
      false,
      "update_prefs must not be client-emittable at /actions — preference updates travel PATCH /preferences (Daniel 2026-08-17 §6).",
    );
    for (const v of forbidden) {
      assert.equal(
        isInvestorAdminVerb(v),
        false,
        `Forbidden verb "${v}" was accepted as an InvestorAdminVerb.`,
      );
    }
    assert.equal(
      INVESTOR_ADMIN_VERBS.length,
      5,
      "Daniel's 2026-08-17 reply fixes the client-emittable allowlist at exactly 5 verbs (update_prefs moved to the dedicated preferences route).",
    );
  },
);

await section(
  "every route file outside app/api/ is a declared public route",
  async () => {
    // A route handler outside apps/web/app/api/ never passes through
    // bffRead/bffMutate, so nothing else in this suite would notice it. Each
    // one must be declared in src/lib/bff/public-routes.ts with a reason.
    const { PUBLIC_ROUTE_FILES } =
      await import("../apps/web/src/lib/bff/public-routes.ts");
    const { readdirSync, statSync } = await import("node:fs");
    const appDir = join(REPO_ROOT, "apps/web/app");

    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry === "route.ts" || entry === "route.tsx") {
          const rel = full
            .slice(join(REPO_ROOT, "apps/web").length + 1)
            .split(sep)
            .join("/");
          if (!rel.startsWith("app/api/")) found.push(rel);
        }
      }
    };
    walk(appDir);

    for (const file of found) {
      assert.ok(
        PUBLIC_ROUTE_FILES.includes(file),
        `Route "${file}" sits outside app/api/ and is therefore unauthenticated by ` +
          `default, but is not declared in apps/web/src/lib/bff/public-routes.ts. ` +
          `Declare it with a reason, or move it under app/api/ so it goes through ` +
          `the BFF handler.`,
      );
    }
    // The declaration list must not rot either: every declared file must exist.
    for (const declared of PUBLIC_ROUTE_FILES) {
      if (declared.startsWith("app/api/")) continue;
      assert.ok(
        found.includes(declared),
        `public-routes.ts declares "${declared}" but no such route file exists.`,
      );
    }
  },
);

await section(
  "Signal-only release subset matches Daniel's 2026-08-17 reply",
  async () => {
    // v1.0.0-dev.1 enables join_template and leave_template only. Preference
    // updates are enabled too, but through PATCH /preferences, not /actions.
    assert.deepEqual(
      [...SIGNAL_RELEASE_ADMIN_VERBS].sort(),
      ["join_template", "leave_template"],
      "SIGNAL_RELEASE_ADMIN_VERBS drifted from Daniel's 2026-08-17 §6 Signal-only surface.",
    );
    assert.deepEqual(
      [...MANAGED_PAPER_GATED_ADMIN_VERBS].sort(),
      ["pause_autopilot", "reduce_only", "resume_autopilot"],
      "pause/resume/reduce_only stay unavailable until Managed paper (Daniel 2026-08-17 §6).",
    );
    // The two sets partition the emittable allowlist — no verb may be in both,
    // and none may be in neither.
    assert.deepEqual(
      [
        ...SIGNAL_RELEASE_ADMIN_VERBS,
        ...MANAGED_PAPER_GATED_ADMIN_VERBS,
      ].sort(),
      [...INVESTOR_ADMIN_VERBS].sort(),
      "Every emittable verb must be either Signal-enabled or Managed-paper-gated, and none may be both.",
    );
  },
);

await section(
  "release gate refuses Managed verbs during the Signal release",
  async () => {
    const { isGatedUntilManagedPaper, GATED_UNTIL_MANAGED_PAPER } =
      await import("../apps/web/src/lib/sec203a/admin-verbs.ts");

    assert.equal(GATED_UNTIL_MANAGED_PAPER, "gated_until_managed_paper");

    // Gated in Signal, allowed at Managed paper.
    for (const action of ["pauseManaged", "resumeManaged"] as const) {
      assert.equal(
        isGatedUntilManagedPaper(action, "signal"),
        true,
        `"${action}" must be refused during the Signal release (Daniel 2026-08-17 §6).`,
      );
      assert.equal(
        isGatedUntilManagedPaper(action, "managed_paper"),
        false,
        `"${action}" must be available once Managed paper is enabled.`,
      );
    }

    // Preference updates travel their own route and are enabled in Signal, so
    // the gate must never catch them.
    assert.equal(
      isGatedUntilManagedPaper("updateAccountPrefs", "signal"),
      false,
      "Preference updates are enabled in the Signal release.",
    );
    // BFF-only actions map to no verb and are never gated by this rule.
    assert.equal(
      isGatedUntilManagedPaper("acknowledgeDisclosure", "signal"),
      false,
    );
  },
);

await section("update_prefs is receipt-only, never emittable", async () => {
  assert.deepEqual(
    [...RECEIPT_ONLY_ADMIN_VERBS],
    ["update_prefs"],
    "RECEIPT_ONLY_ADMIN_VERBS drifted from Daniel's 2026-08-17 §6.",
  );
  // Preference updates still produce action receipts carrying the backend
  // vocabulary — the audit trail keeps update_prefs even though no route may
  // POST it to /actions.
  assert.equal(
    receiptVerbFor("updateAccountPrefs"),
    "update_prefs",
    "Preference updates must still record an update_prefs action receipt.",
  );
  assert.equal(
    adminVerbFor("updateAccountPrefs"),
    undefined,
    "updateAccountPrefs must NOT map to an /actions verb — that would re-open the second public write path Daniel closed on 2026-08-17.",
  );
});

await section(
  "InvestorActionName → InvestorAdminVerb mapping is consistent",
  async () => {
    // Every value in the mapping must be a real admin verb.
    for (const [action, verb] of Object.entries(
      INVESTOR_ACTION_TO_ADMIN_VERB,
    )) {
      assert.equal(
        isInvestorAdminVerb(verb),
        true,
        `Mapping for "${action}" → "${verb}" is not a recognized admin verb.`,
      );
    }
    // Spot-check the three actions Phase 2.6 wires up.
    assert.equal(adminVerbFor("pauseManaged"), "pause_autopilot");
    assert.equal(adminVerbFor("resumeManaged"), "resume_autopilot");
    // BFF-only actions must NOT map (no backend admin-actions call exists).
    assert.equal(
      adminVerbFor("acknowledgeDisclosure"),
      undefined,
      "acknowledgeDisclosure must not map to a backend admin verb — it's a BFF-only action.",
    );
    assert.equal(
      adminVerbFor("saveExecutionPolicyDraft"),
      undefined,
      "saveExecutionPolicyDraft must not map — drafts never reach backend.",
    );
  },
);

await section(
  "appendActionReceipt auto-populates adminVerb from the action mapping",
  async () => {
    const corr = `c-verb-${Date.now()}`;
    const paused = await appendActionReceipt({
      action: "pauseManaged",
      actor: "user",
      authId: "verb-test-user",
      accountId: "verb-test-account",
      correlationId: corr,
      outcome: "ok",
    });
    assert.equal(
      paused.adminVerb,
      "pause_autopilot",
      "pauseManaged receipt must carry adminVerb=pause_autopilot.",
    );
    const ack = await appendActionReceipt({
      action: "acknowledgeDisclosure",
      actor: "user",
      authId: "verb-test-user",
      accountId: "verb-test-account",
      correlationId: `${corr}-ack`,
      outcome: "ok",
    });
    assert.equal(
      ack.adminVerb,
      undefined,
      "BFF-only acknowledgeDisclosure receipt must omit adminVerb.",
    );
  },
);

// ─── Risk domain (FIC §253-309, DDL RiskLimits/RiskSnapshots) ──────────────

await section(
  "RiskDecision is binary: approved | rejected (no REVIEW/DENY partition)",
  async () => {
    assert.deepEqual(
      [...RISK_DECISIONS].sort(),
      ["approved", "rejected"],
      "RISK_DECISIONS drifted from Daniel FIC §253-309 binary decision contract.",
    );
    for (const v of [
      "needs_review",
      "review",
      "deny",
      "denied",
      "flag",
      "flagged",
      "pending",
      "hold",
      "manual_review",
    ]) {
      assert.equal(
        isRiskDecision(v),
        false,
        `Forbidden risk decision "${v}" was accepted — would re-introduce REVIEW/DENY partition.`,
      );
    }
  },
);

await section(
  "RiskSnapshot enforces reasons/decision invariant via Zod",
  async () => {
    // Approved + non-empty reasons → reject.
    const approvedWithReasons = riskSnapshotSchema.safeParse({
      intentId: "i-1",
      accountId: "a-1",
      decision: "approved",
      snapshot: {},
      snapshotHash: "a".repeat(64),
      correlationId: "c-1",
      assessedAt: new Date().toISOString(),
      reasons: ["something"],
    });
    assert.equal(
      approvedWithReasons.success,
      false,
      "Approved snapshot with non-empty reasons[] must be rejected.",
    );
    // Rejected + empty reasons → reject.
    const rejectedWithoutReasons = riskSnapshotSchema.safeParse({
      intentId: "i-2",
      accountId: "a-1",
      decision: "rejected",
      snapshot: {},
      snapshotHash: "b".repeat(64),
      correlationId: "c-2",
      assessedAt: new Date().toISOString(),
      reasons: [],
    });
    assert.equal(
      rejectedWithoutReasons.success,
      false,
      "Rejected snapshot with empty reasons[] must be rejected.",
    );
    // Invalid hash → reject.
    const badHash = riskSnapshotSchema.safeParse({
      intentId: "i-3",
      accountId: "a-1",
      decision: "approved",
      snapshot: {},
      snapshotHash: "not-hex",
      correlationId: "c-3",
      assessedAt: new Date().toISOString(),
      reasons: [],
    });
    assert.equal(
      badHash.success,
      false,
      "Snapshot with non-SHA-256 hash must be rejected.",
    );
    // Valid approved → accept.
    const ok = riskSnapshotSchema.safeParse({
      intentId: "i-4",
      accountId: "a-1",
      decision: "approved",
      snapshot: { positions: [] },
      snapshotHash: "c".repeat(64),
      correlationId: "c-4",
      assessedAt: new Date().toISOString(),
      reasons: [],
    });
    assert.equal(ok.success, true, "Valid approved snapshot must parse.");
  },
);

await section(
  "RiskSnapshots are immutable per intent_id (17 CFR 275.204-2)",
  async () => {
    const intentId = `i-immut-${Date.now()}`;
    await appendRiskSnapshot({
      snapshot: {
        intentId,
        accountId: "imut-acc",
        decision: "approved",
        snapshot: { v: 1 },
        snapshotHash: "d".repeat(64),
        correlationId: "c-imut-1",
        assessedAt: new Date().toISOString(),
        reasons: [],
      },
    });
    // Second write with same intentId — even with same payload — must throw.
    await assert.rejects(
      appendRiskSnapshot({
        snapshot: {
          intentId,
          accountId: "imut-acc",
          decision: "rejected",
          snapshot: { v: 2 },
          snapshotHash: "e".repeat(64),
          correlationId: "c-imut-2",
          assessedAt: new Date().toISOString(),
          reasons: ["limits_breached"],
        },
      }),
      /already exists/,
      "A second RiskSnapshot for the same intent_id must be rejected.",
    );
    const read = await getRiskSnapshot(intentId);
    assert.ok(read);
    assert.equal(read.decision, "approved", "Original snapshot must persist.");
    assert.equal(read.snapshot["v"], 1);
  },
);

await section(
  "RiskLimits versions monotonically increase per account",
  async () => {
    const accountId = `rl-${Date.now()}`;
    const base = {
      accountId,
      maxGrossExposurePct: 1.0,
      maxNetExposurePct: 1.0,
      maxSingleNamePct: 0.1,
      maxSectorPct: 0.3,
    };
    const v1 = await appendRiskLimits({
      limits: base,
      correlationId: "c-rl-1",
    });
    const v2 = await appendRiskLimits({
      limits: { ...base, maxSingleNamePct: 0.05 },
      correlationId: "c-rl-2",
    });
    const v3 = await appendRiskLimits({
      limits: { ...base, maxSectorPct: 0.25 },
      correlationId: "c-rl-3",
    });
    assert.equal(v1.version, 1);
    assert.equal(v2.version, 2);
    assert.equal(v3.version, 3);
    const latest = await getLatestRiskLimits(accountId);
    assert.equal(latest?.version, 3);
    const all = await listRiskLimits(accountId);
    assert.deepEqual(
      all.map((l) => l.version),
      [1, 2, 3],
    );
  },
);

await section(
  "RiskLimits schema rejects out-of-range pcts and non-decimal-string monetary fields",
  async () => {
    // pct > 1 for single-name is impossible (can't hold >100% of one asset).
    const tooBig = riskLimitsSchema.safeParse({
      accountId: "a-1",
      maxGrossExposurePct: 1.0,
      maxNetExposurePct: 1.0,
      maxSingleNamePct: 1.5,
      maxSectorPct: 0.3,
    });
    assert.equal(tooBig.success, false, "maxSingleNamePct > 1 must reject.");
    // orderLimits with JS number monetary → reject.
    const numberMoney = riskLimitsSchema.safeParse({
      accountId: "a-1",
      maxGrossExposurePct: 1.0,
      maxNetExposurePct: 1.0,
      maxSingleNamePct: 0.1,
      maxSectorPct: 0.3,
      orderLimits: { maxOrderNotional: 10000 },
    });
    assert.equal(
      numberMoney.success,
      false,
      "Monetary fields must be DecimalString, not JS number.",
    );
    // Valid with DecimalString → accept.
    const ok = riskLimitsSchema.safeParse({
      accountId: "a-1",
      maxGrossExposurePct: 1.0,
      maxNetExposurePct: 1.0,
      maxSingleNamePct: 0.1,
      maxSectorPct: 0.3,
      orderLimits: { maxOrderNotional: "10000.00" },
    });
    assert.equal(ok.success, true, "Valid RiskLimits must parse.");
  },
);

// ─── AccountIntents domain (DDL line 74-94, FIC §89-92, builder.py) ────────

await section(
  "AccountIntentStatus matches Daniel authoritative enum (4 values, no REVIEW/DENY)",
  async () => {
    assert.deepEqual(
      [...ACCOUNT_INTENT_STATUSES].sort(),
      ["blocked", "empty", "invalid", "ready"],
      "ACCOUNT_INTENT_STATUSES drifted from Daniel models.py/builder.py.",
    );
    for (const v of [
      "needs_review",
      "review",
      "deny",
      "denied",
      "flag",
      "flagged",
      "pending",
      "hold",
      "manual_review",
      "approved",
      "rejected",
    ]) {
      assert.equal(
        isAccountIntentStatus(v),
        false,
        `Forbidden status "${v}" was accepted — would re-introduce REVIEW/DENY partition.`,
      );
    }
    // intent_kind enum is the live set; canary against silent expansion.
    assert.deepEqual(
      [...ACCOUNT_INTENT_KINDS].sort(),
      ["liquidate_all", "rebalance", "signal_flip"],
      "ACCOUNT_INTENT_KINDS drifted from Daniel models.py.",
    );
  },
);

function validIntent(
  overrides: Partial<{
    intentId: string;
    status: "ready" | "blocked" | "empty" | "invalid";
    blockedReason?: string;
  }> = {},
): Parameters<typeof accountIntentSchema.safeParse>[0] {
  const base = {
    intentId: overrides.intentId ?? "i-ok",
    accountId: "a-1",
    status: overrides.status ?? "ready",
    templateId: "tpl-1",
    templateVersion: "v1",
    actionId: "a".repeat(64),
    intentKind: "rebalance",
    ts: new Date().toISOString(),
    legs: [],
    summaryJson: {},
    legsHash: "b".repeat(64),
    correlationId: "c-1",
  };
  if (overrides.blockedReason !== undefined) {
    return { ...base, blockedReason: overrides.blockedReason };
  }
  return base;
}

await section(
  "AccountIntent: blocked status REQUIRES blockedReason",
  async () => {
    const missing = accountIntentSchema.safeParse(
      validIntent({ status: "blocked" }),
    );
    assert.equal(
      missing.success,
      false,
      "status='blocked' without blockedReason must be rejected.",
    );
    const present = accountIntentSchema.safeParse(
      validIntent({ status: "blocked", blockedReason: "AUTOPILOT_DISABLED" }),
    );
    assert.equal(
      present.success,
      true,
      "status='blocked' with blockedReason must parse.",
    );
  },
);

await section(
  "AccountIntent: non-blocked status FORBIDS blockedReason",
  async () => {
    for (const status of ["ready", "empty", "invalid"] as const) {
      const withReason = accountIntentSchema.safeParse(
        validIntent({ status, blockedReason: "AUTOPILOT_DISABLED" }),
      );
      assert.equal(
        withReason.success,
        false,
        `status='${status}' with blockedReason must be rejected.`,
      );
      const clean = accountIntentSchema.safeParse(validIntent({ status }));
      assert.equal(
        clean.success,
        true,
        `status='${status}' without blockedReason must parse.`,
      );
    }
  },
);

await section(
  "AccountIntent: legsHash and actionId MUST be 64-char lowercase SHA-256 hex",
  async () => {
    const badLegs = accountIntentSchema.safeParse({
      ...validIntent(),
      legsHash: "not-hex",
    });
    assert.equal(badLegs.success, false, "legsHash must reject non-hex.");
    const shortHash = accountIntentSchema.safeParse({
      ...validIntent(),
      legsHash: "a".repeat(63),
    });
    assert.equal(shortHash.success, false, "legsHash must reject < 64 chars.");
    const upperHash = accountIntentSchema.safeParse({
      ...validIntent(),
      legsHash: "A".repeat(64),
    });
    assert.equal(
      upperHash.success,
      false,
      "legsHash must reject uppercase hex (Python hexdigest() is lowercase).",
    );
    const badAction = accountIntentSchema.safeParse({
      ...validIntent(),
      actionId: "Z".repeat(64),
    });
    assert.equal(
      badAction.success,
      false,
      "actionId must reject non-hex characters.",
    );
  },
);

await section(
  "AccountIntent: immutable per intent_id (17 CFR 275.204-2)",
  async () => {
    const intentId = `ai-immut-${Date.now()}`;
    const intent = {
      intentId,
      accountId: "imut-acc",
      status: "ready" as const,
      templateId: "tpl-1",
      templateVersion: "v1",
      actionId: "1".repeat(64),
      intentKind: "rebalance" as const,
      ts: new Date().toISOString(),
      legs: [],
      summaryJson: {},
      legsHash: "2".repeat(64),
      correlationId: "c-imut-1",
    };
    await appendAccountIntent({ intent });
    // Second write — even with same payload — must throw.
    await assert.rejects(
      appendAccountIntent({
        intent: {
          ...intent,
          status: "blocked",
          blockedReason: "AUTOPILOT_DISABLED",
        },
      }),
      /already exists/,
      "A second AccountIntent for the same intent_id must be rejected.",
    );
    const read = await getAccountIntent(intentId);
    assert.ok(read);
    assert.equal(
      read.status,
      "ready",
      "Original intent must persist unchanged.",
    );
  },
);

await section(
  "AccountIntent: BFF execution-policy ref is a wrapper, not a Daniel field",
  async () => {
    const intentId = `ai-bff-${Date.now()}`;
    const intent = {
      intentId,
      accountId: "bff-acc",
      status: "ready" as const,
      templateId: "tpl-1",
      templateVersion: "v1",
      actionId: "3".repeat(64),
      intentKind: "rebalance" as const,
      ts: new Date().toISOString(),
      legs: [],
      summaryJson: {},
      legsHash: "4".repeat(64),
      correlationId: "c-bff-1",
    };
    const stored = await appendAccountIntent({
      intent,
      bffExecutionPolicyRef: { policyId: "p-1", policyVersion: 7 },
    });
    // Stored shape carries the BFF ref.
    assert.deepEqual(stored.bffExecutionPolicyRef, {
      policyId: "p-1",
      policyVersion: 7,
    });
    // Stored Daniel-shape fields are unchanged byte-for-byte.
    for (const k of Object.keys(intent) as Array<keyof typeof intent>) {
      assert.deepEqual(
        (stored as unknown as Record<string, unknown>)[k],
        intent[k],
        `BFF wrapping must not mutate Daniel field "${String(k)}".`,
      );
    }
    // The bff ref is NOT a recognized field on Daniel's wire-shape schema —
    // Zod parse of the stored object including the ref must STRIP it (z.object
    // default is to drop unknowns), proving the wire shape can't carry it.
    const parsed = accountIntentSchema.safeParse(stored);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(
        (parsed.data as unknown as Record<string, unknown>)[
          "bffExecutionPolicyRef"
        ],
        undefined,
        "Daniel wire schema must not surface bffExecutionPolicyRef.",
      );
    }
  },
);

await section(
  "AccountIntent module does NOT expose order-creation or broker-submission helpers",
  async () => {
    // Negative-space invariant: the intent entity must not be a vector for
    // creating Orders or submitting to a broker. Names like `submit`,
    // `createOrder`, `placeBroker`, `executeIntent` are forbidden exports.
    const forbidden = [
      "submit",
      "submitIntent",
      "submitToBroker",
      "placeOrder",
      "placeBroker",
      "createOrder",
      "createOrders",
      "executeIntent",
      "broker",
      "brokerSubmit",
      "sendToBroker",
    ];
    const exported = Object.keys(accountIntentEntity);
    for (const name of forbidden) {
      assert.equal(
        exported.includes(name),
        false,
        `AccountIntent entity exports forbidden symbol "${name}" — intents must not create orders or imply broker submission.`,
      );
    }
    // Also: no prototype-store entity for Orders exists in this PR (we
    // explicitly scoped Orders out). If one ships later, that's a separate PR.
  },
);

// ─── Orders domain (DDL line 380-418, states.py, transitions.py) ──────────

await section(
  "Order status enum matches Daniel authoritative source (23 values; 7 terminal)",
  async () => {
    const expected = [
      // non-terminal (16)
      "planned",
      "pending_submit",
      "blocked_by_conflict",
      "blocked_dependency",
      "submit_started",
      "submitted",
      "acknowledged",
      "working",
      "partial_fill",
      "cancel_requested",
      "cancel_acknowledged",
      "amend_requested",
      "replace_requested",
      "unknown",
      "reconciliation_pending",
      "escalated",
      // terminal (7)
      "filled",
      "partially_filled_terminal",
      "canceled",
      "expired",
      "rejected",
      "failed",
      "reconciled_terminal",
    ];
    assert.deepEqual(
      [...ORDER_STATUSES].sort(),
      [...expected].sort(),
      "ORDER_STATUSES drifted from apps/common/trade_lifecycle/states.py:3-34.",
    );
    assert.equal(
      NON_TERMINAL_ORDER_STATUSES.length,
      16,
      "Expected exactly 16 non-terminal statuses.",
    );
    assert.equal(
      TERMINAL_ORDER_STATUSES.length,
      7,
      "Expected exactly 7 terminal statuses.",
    );
    // No overlap between non-terminal and terminal sets.
    const overlap = (NON_TERMINAL_ORDER_STATUSES as readonly string[]).filter(
      (s) => (TERMINAL_ORDER_STATUSES as readonly string[]).includes(s),
    );
    assert.deepEqual(
      overlap,
      [],
      `Status appears in both terminal and non-terminal sets: ${overlap.join(", ")}`,
    );
  },
);

await section(
  "Order status: forbidden REVIEW/DENY values are rejected",
  async () => {
    for (const v of [
      "needs_review",
      "review",
      "deny",
      "denied",
      "flag",
      "flagged",
      "pending",
      "hold",
      "manual_review",
      "approved",
    ]) {
      assert.equal(
        isOrderStatus(v),
        false,
        `Forbidden status "${v}" was accepted — would re-introduce REVIEW/DENY partition.`,
      );
    }
  },
);

await section(
  "AccountPrefs: exactly four investor-editable fields",
  async () => {
    assert.deepEqual(
      [...INVESTOR_EDITABLE_ACCOUNT_PREFS].sort(),
      ["drift_threshold", "excluded_assets", "fractional_enabled", "min_order"],
      "Investor-editable AccountPrefs drifted from Daniel's approved four (docs/phase2-7-daniel-direction-resolution.md §4).",
    );
    assert.equal(
      INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS.length,
      INVESTOR_EDITABLE_ACCOUNT_PREFS.length,
      "camelCase mirror and snake_case wire list must stay the same length.",
    );
  },
);

await section(
  "No investor-editable capital-allocation or risk-limit control (camelCase + snake_case)",
  async () => {
    // The Phase 2.7 doc recorded this area as "confirmed clean" on the basis
    // of a grep for `capital_allocation`, `allocation_pct`, and
    // `capital_usage`. That grep was snake_case-only and this repo names
    // fields in camelCase, so it missed seven live editable controls in the
    // Automation Center: maxPositionSizeBps and minimumCashReserveBps (capital
    // allocation) plus maxSingleOrderUsd, dailyOrderLimit, dailyLossPauseBps,
    // drawdownPauseBps, and maxOpenOrders (risk limits). They were removed on
    // 2026-07-30.
    //
    // This assertion scans BOTH spellings, and scans for the semantic control
    // names rather than a fixed literal list, so the same class of miss cannot
    // recur. It targets the investor-editable write surfaces specifically:
    // read-only DISPLAY of backend-owned limits is expected and allowed.
    // Covers the storage entity, both BFF write routes, the typed DTO, and the
    // rendering surfaces. Including the UI pages is what makes `data-testid`
    // attributes and visible control labels part of the check, not just field
    // declarations.
    //
    // Deliberately NOT scanned: apps/web/e2e/automation-center.spec.ts, which
    // names all seven controls in negative assertions proving their absence.
    const editableSurfaces = [
      "apps/web/src/lib/prototype-store/entities/execution-policy-draft.ts",
      "apps/web/app/api/v1/investor/execution-policy/draft/route.ts",
      "apps/web/app/api/v1/investor/execution-policy/route.ts",
      "apps/web/app/api/v1/investor/execution-policy/activate/route.ts",
      "packages/api-clients/src/hooks/execution-policy.ts",
      "apps/web/app/us/app/settings/automation/page.tsx",
      "apps/web/app/us/app/settings/automation/activate/page.tsx",
    ];

    const offenders: string[] = [];
    for (const rel of editableSurfaces) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      for (const [i, rawLine] of src.split("\n").entries()) {
        // Only flag real declarations/uses, not the comments explaining the
        // removal. A line that is purely a comment is documentation.
        const line = rawLine.trim();
        if (line.startsWith("*") || line.startsWith("//") || line === "")
          continue;
        for (const name of READ_ONLY_CONTROL_NAMES) {
          if (new RegExp(`\\b${name}\\b`).test(line)) {
            offenders.push(`${rel}:${String(i + 1)} → ${name}`);
          }
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Backend-owned control(s) reappeared on an investor-editable surface:\n    ${offenders.join("\n    ")}\n  RiskLimits, template risk settings, broker state, and operator controls are read-only to the investor, and capital-allocation percentage controls are not an AccountPrefs capability.`,
    );
  },
);

await section(
  "Investor actions route is account-scoped in the path",
  async () => {
    assert.equal(
      INVESTOR_ACTIONS_ROUTE_TEMPLATE,
      "/api/v1/investor/accounts/{account_id}/actions",
      "Investor-api actions route drifted from Daniel's §5 contract.",
    );
    assert.equal(
      investorActionsRoute("acct_123"),
      "/api/v1/investor/accounts/acct_123/actions",
      "investorActionsRoute() must interpolate the account into the path.",
    );
    // Account id must be encoded — it is a claim to be verified, and a raw
    // value could otherwise alter the path shape.
    assert.equal(
      investorActionsRoute("a/b"),
      "/api/v1/investor/accounts/a%2Fb/actions",
      "Account id must be URL-encoded so it cannot escape its path segment.",
    );
  },
);

await section("Exception Review carries no risk-derived kind", async () => {
  const { EXCEPTION_KINDS, isExceptionKind } =
    await import("../apps/web/src/lib/prototype-store/entities/exception-review.ts");
  // A backend risk rejection is terminal for its intent. An exception
  // implies a resolution path, so a risk denial must never become one —
  // that would be an investor risk override in disguise.
  for (const forbidden of [
    "risk_rejected",
    "risk_denied",
    "risk_review",
    "risk_override",
    "denied_by_risk",
    "risk_limit_breach",
    "needs_review",
    "manual_review",
  ]) {
    assert.equal(
      isExceptionKind(forbidden),
      false,
      `Forbidden exception kind "${forbidden}" was accepted — a risk rejection is terminal and has no investor resolution path.`,
    );
  }
  // Daniel's resolvable non-risk conditions must each have a home.
  for (const required of [
    "missing_consent",
    "stale_profile",
    "broker_disconnected",
    "reconciliation_block",
  ]) {
    assert.ok(
      (EXCEPTION_KINDS as readonly string[]).includes(required),
      `Resolvable non-risk condition "${required}" has no ExceptionKind.`,
    );
  }
});

await section(
  "Signal-only: no broker submission or cancel path is exported",
  async () => {
    // The first dev release is Signal-only and exposes no path from investor
    // actions to broker submission; investor cancellation of pending_submit
    // orders is deferred on ownership-boundary grounds.
    const src = readFileSync(
      join(REPO_ROOT, "packages/api-clients/src/index.ts"),
      "utf8",
    );
    for (const forbidden of ["useSubmitOrder", "useCancelOrder"]) {
      assert.equal(
        new RegExp(
          `^\\s*(export\\s*\\{[^}]*\\b${forbidden}\\b|\\s*${forbidden},)`,
          "m",
        ).test(src),
        false,
        `${forbidden} is exported from @refi/api-clients — that is a live path from the investor product to broker submission/cancellation.`,
      );
    }

    // And the wire contract must not offer the operations either.
    const spec = readFileSync(
      join(REPO_ROOT, "packages/api-clients/openapi/refi-api.yaml"),
      "utf8",
    );
    for (const op of ["submitOrder", "cancelOrder"]) {
      assert.equal(
        new RegExp(`operationId:\\s*${op}\\b`).test(spec),
        false,
        `refi-api.yaml still declares operationId ${op}.`,
      );
    }
  },
);

await section(
  "Integration target is refinity-dev, not staging or production",
  async () => {
    const spec = readFileSync(
      join(REPO_ROOT, "packages/api-clients/openapi/refi-api.yaml"),
      "utf8",
    );
    // refinity-dev is the only active deployment, intentionally. Staging is
    // out of scope until the dev release is reproducible, and the production
    // host does not resolve.
    //
    // Check declared `url:` entries, not raw text: the prose above the servers
    // block legitimately names the retired hosts to explain why they are gone.
    const declaredUrls = [...spec.matchAll(/^\s*-?\s*url:\s*(\S+)/gm)].map(
      (m) => m[1] ?? "",
    );
    for (const host of ["api-staging.refi.trading", "api.refi.trading"]) {
      const hit = declaredUrls.find((u) => u.includes(host));
      assert.equal(
        hit,
        undefined,
        `refi-api.yaml declares a server at ${String(hit)}. The integration target is refinity-dev; the dev base URL arrives with Daniel's connection package and must not be guessed.`,
      );
    }
    assert.ok(
      declaredUrls.length > 0,
      "No server url found in refi-api.yaml — the assertion above would be vacuous.",
    );
  },
);

await section(
  "OpenAPI OrderPreviewResult.status is binary (ALLOW | DENY)",
  async () => {
    // Guards the wire contract itself, not just the TS types: the generated
    // client is gitignored and rebuilt from this yaml, so a REVIEW value
    // re-added here would silently re-introduce the partition Daniel's Q1
    // answer forbids (GAP-RISK-BINARY-006). Regex rather than a YAML parser
    // to keep this script dependency-free.
    const spec = readFileSync(
      join(REPO_ROOT, "packages/api-clients/openapi/refi-api.yaml"),
      "utf8",
    );
    const match = /OrderPreviewResult:[\s\S]*?status:\s*\{[^}]*\}/.exec(spec);
    assert.ok(
      match,
      "Could not locate OrderPreviewResult.status in refi-api.yaml — the assertion below is vacuous, fix the locator.",
    );
    const statusLine = match[0].slice(match[0].lastIndexOf("status:"));
    const enumValues = /enum:\s*\[([^\]]*)\]/
      .exec(statusLine)?.[1]
      .split(",")
      .map((v) => v.trim())
      .sort();
    assert.deepEqual(
      enumValues,
      ["ALLOW", "DENY"],
      `OrderPreviewResult.status enum drifted to [${enumValues?.join(", ")}] — a risk verdict is a backend hard stop with no frontend escalation. Retryable operational failures belong in the UNAVAILABLE client state.`,
    );
  },
);

await section(
  "Order side enum matches Daniel authoritative source",
  async () => {
    assert.deepEqual(
      [...ORDER_SIDES].sort(),
      ["buy", "buy_to_cover", "sell", "sell_short"],
      "ORDER_SIDES drifted from apps/account-intent-builder/src/domain/models.py:15-21.",
    );
  },
);

await section(
  "Order type and TIF enums match observed exec-gateway defaults",
  async () => {
    assert.deepEqual([...ORDER_TYPES].sort(), [
      "limit",
      "market",
      "stop",
      "stop_limit",
    ]);
    assert.deepEqual([...ORDER_TIFS].sort(), ["day", "fok", "gtc", "ioc"]);
  },
);

function baseOrder(
  overrides: Partial<{
    orderId: string;
    status: import("../apps/web/src/lib/sec203a/orders.ts").OrderStatus;
    terminalAt?: string;
    terminalReasonCode?: string;
  }> = {},
): Parameters<typeof orderSchema.safeParse>[0] {
  const base = {
    orderId: overrides.orderId ?? "o-1",
    accountId: "a-1",
    intentId: "i-1",
    asset: "AAPL",
    side: "buy" as const,
    qty: "10",
    tif: "day" as const,
    status: overrides.status ?? "planned",
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    orderType: "market" as const,
  };
  if (overrides.terminalAt !== undefined) {
    return {
      ...base,
      terminalAt: overrides.terminalAt,
      ...(overrides.terminalReasonCode
        ? { terminalReasonCode: overrides.terminalReasonCode }
        : {}),
    };
  }
  if (overrides.terminalReasonCode !== undefined) {
    return { ...base, terminalReasonCode: overrides.terminalReasonCode };
  }
  return base;
}

await section(
  "Order schema requires DecimalString for qty, limitPrice, stopPrice, filledQty, avgFillPrice",
  async () => {
    // qty as number → reject.
    const numQty = orderSchema.safeParse({ ...baseOrder(), qty: 10 });
    assert.equal(numQty.success, false, "qty as JS number must be rejected.");
    // limitPrice as number → reject.
    const numLimit = orderSchema.safeParse({
      ...baseOrder(),
      limitPrice: 150.5,
    });
    assert.equal(
      numLimit.success,
      false,
      "limitPrice as JS number must be rejected.",
    );
    // filledQty as number → reject.
    const numFilled = orderSchema.safeParse({
      ...baseOrder(),
      filledQty: 5,
    });
    assert.equal(
      numFilled.success,
      false,
      "filledQty as JS number must be rejected.",
    );
    // Valid with all DecimalString → accept.
    const ok = orderSchema.safeParse({
      ...baseOrder(),
      qty: "10.00",
      limitPrice: "150.50",
      stopPrice: "149.00",
      filledQty: "5.00",
      avgFillPrice: "150.25",
    });
    assert.equal(
      ok.success,
      true,
      "Valid order with DecimalString fields must parse.",
    );
  },
);

await section(
  "Order schema requires intentId, accountId at investor-facing wire boundary",
  async () => {
    const noIntent = orderSchema.safeParse({
      ...baseOrder(),
      intentId: undefined,
    });
    assert.equal(noIntent.success, false, "Missing intentId must be rejected.");
    const emptyIntent = orderSchema.safeParse({ ...baseOrder(), intentId: "" });
    assert.equal(
      emptyIntent.success,
      false,
      "Empty intentId must be rejected.",
    );
    const noAccount = orderSchema.safeParse({
      ...baseOrder(),
      accountId: undefined,
    });
    assert.equal(
      noAccount.success,
      false,
      "Missing accountId must be rejected.",
    );
  },
);

await section(
  "Order: terminal status REQUIRES terminalAt + terminalReasonCode; non-terminal FORBIDS them",
  async () => {
    // Terminal status without terminalAt → reject.
    const terminalNoAt = orderSchema.safeParse(
      baseOrder({
        status: "filled",
        terminalReasonCode: "broker_acknowledged",
      }),
    );
    assert.equal(
      terminalNoAt.success,
      false,
      "filled without terminalAt must be rejected.",
    );
    // Non-terminal with terminalAt → reject.
    const nonTerminalWithAt = orderSchema.safeParse(
      baseOrder({ status: "working", terminalAt: new Date().toISOString() }),
    );
    assert.equal(
      nonTerminalWithAt.success,
      false,
      "Non-terminal status with terminalAt must be rejected.",
    );
    // Terminal with both → accept.
    const ok = orderSchema.safeParse(
      baseOrder({
        status: "filled",
        terminalAt: new Date().toISOString(),
        terminalReasonCode: "broker_acknowledged",
      }),
    );
    assert.equal(ok.success, true, "Terminal with both fields must parse.");
  },
);

await section(
  "Known terminal_reason_code values all parse against orderSchema",
  async () => {
    for (const code of KNOWN_TERMINAL_REASON_CODES) {
      const parsed = orderSchema.safeParse(
        baseOrder({
          status: "rejected",
          terminalAt: new Date().toISOString(),
          terminalReasonCode: code,
        }),
      );
      assert.equal(
        parsed.success,
        true,
        `Known terminal_reason_code "${code}" failed schema parse.`,
      );
    }
  },
);

await section(
  "canTransitionOrderStatus: terminal status CANNOT transition to any active state",
  async () => {
    for (const terminal of TERMINAL_ORDER_STATUSES) {
      for (const active of NON_TERMINAL_ORDER_STATUSES) {
        assert.equal(
          canTransitionOrderStatus(terminal, active),
          false,
          `Forbidden transition allowed: ${terminal} → ${active}`,
        );
      }
      // Also forbid terminal → terminal (broker-truth overrides are out of
      // scope for the investor surface).
      for (const otherTerminal of TERMINAL_ORDER_STATUSES) {
        if (otherTerminal === terminal) continue;
        assert.equal(
          canTransitionOrderStatus(terminal, otherTerminal),
          false,
          `Forbidden terminal→terminal transition allowed: ${terminal} → ${otherTerminal}`,
        );
      }
    }
    // Sanity: a few KNOWN-GOOD transitions must succeed.
    assert.equal(canTransitionOrderStatus("planned", "pending_submit"), true);
    assert.equal(canTransitionOrderStatus("working", "filled"), true);
    assert.equal(canTransitionOrderStatus("submitted", "rejected"), true);
  },
);

await section(
  "Order entity: terminal immutability enforced by transitionOrder()",
  async () => {
    const orderId = `o-imut-${Date.now()}`;
    const corr = `c-${Date.now()}`;
    await appendOrder({
      order: {
        orderId,
        accountId: "imut-acc",
        intentId: "i-imut",
        asset: "AAPL",
        side: "buy",
        qty: "10",
        tif: "day",
        status: "filled",
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        orderType: "market",
        terminalAt: new Date().toISOString(),
        terminalReasonCode: "broker_acknowledged",
      },
      bffCorrelationId: corr,
    });
    // Attempt to transition out of terminal — must throw.
    await assert.rejects(
      transitionOrder({
        orderId,
        expectedFromStatus: "filled",
        toStatus: "working",
        updatedAt: new Date().toISOString(),
      }),
      /terminal/,
      "Terminal → active transition must be rejected.",
    );
    const stored = await getOrder(orderId);
    assert.ok(stored);
    assert.equal(
      stored.status,
      "filled",
      "Terminal order must remain terminal.",
    );
  },
);

await section(
  "Order entity: lookups by accountId, intentId, and bffCorrelationId work",
  async () => {
    const corr = `c-look-${Date.now()}`;
    const accountId = `acc-look-${Date.now()}`;
    const intentId = `int-look-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await appendOrder({
        order: {
          orderId: `o-look-${i}-${Date.now()}`,
          accountId,
          intentId,
          asset: "AAPL",
          side: "buy",
          qty: "1",
          tif: "day",
          status: "planned",
          submittedAt: new Date(Date.now() + i).toISOString(),
          updatedAt: new Date(Date.now() + i).toISOString(),
          orderType: "market",
        },
        bffCorrelationId: corr,
      });
    }
    const byAccount = await listOrdersByAccount(accountId);
    assert.equal(byAccount.length, 3);
    const byIntent = await listOrdersByIntent(intentId);
    assert.equal(byIntent.length, 3);
    const byCorr = await listOrdersByCorrelation(corr);
    assert.equal(byCorr.length, 3);
    // Stored shape carries bffCorrelationId.
    assert.equal(byCorr[0]?.bffCorrelationId, corr);
  },
);

await section(
  "Order module exposes NO submission, placement, broker, OrderEvents, BrokerOrderAttempts, or Fills helpers",
  async () => {
    const forbidden = [
      "submit",
      "submitOrder",
      "submitToBroker",
      "placeOrder",
      "placeBroker",
      "sendToBroker",
      "executeOrder",
      "createOrder",
      "createOrderEvent",
      "appendOrderEvent",
      "createBrokerAttempt",
      "appendBrokerAttempt",
      "createFill",
      "appendFill",
      "broker",
      "brokerSubmit",
    ];
    const exported = Object.keys(orderEntity);
    for (const name of forbidden) {
      assert.equal(
        exported.includes(name),
        false,
        `Order entity exports forbidden symbol "${name}" — frontend must not submit, place, or emit lifecycle events / attempts / fills.`,
      );
    }
  },
);

await section(
  "Order entity exports only the expected lookup + lifecycle-guarded write surface",
  async () => {
    const exported = new Set(Object.keys(orderEntity));
    const expected = [
      "appendOrder",
      "transitionOrder",
      "getOrder",
      "listOrdersByAccount",
      "listOrdersByIntent",
      "listOrdersByCorrelation",
    ];
    for (const name of expected) {
      assert.equal(
        exported.has(name),
        true,
        `Expected entity export "${name}" missing.`,
      );
    }
  },
);

// ─── OrderEvents domain (DDL 294-330, constants.py 3-72, transitions.py) ──

await section(
  "OrderEvent event_type enum matches Daniel ORDER_EVENT_TYPES exactly (27 values)",
  async () => {
    const expected = [
      "order_planned",
      "submit_queued",
      "submit_started",
      "submit_acknowledged",
      "submit_rejected",
      "submit_timeout",
      "submit_unknown",
      "broker_status_observed",
      "order_working",
      "fill_observed",
      "partial_fill_observed",
      "order_filled",
      "cancel_requested",
      "cancel_acknowledged",
      "cancel_rejected",
      "order_canceled",
      "order_expired",
      "amend_requested",
      "replace_requested",
      "reconciliation_started",
      "reconciliation_discrepancy",
      "reconciliation_repaired",
      "reconciliation_escalated",
      "operator_intervention",
      "transition_rejected",
      "ignored_duplicate",
      "stale_event_ignored",
    ];
    assert.deepEqual(
      [...ORDER_EVENT_TYPES].sort(),
      [...expected].sort(),
      "ORDER_EVENT_TYPES drifted from apps/common/trade_lifecycle/constants.py:3-32.",
    );
    assert.equal(ORDER_EVENT_TYPES.length, 27);
    // Forbidden additions — would re-introduce REVIEW/DENY semantics.
    for (const bad of [
      "needs_review",
      "review",
      "deny",
      "denied",
      "pending",
      "approved",
      "rejected", // bare "rejected" is not an event_type (different from "submit_rejected")
    ]) {
      assert.equal(
        isOrderEventType(bad),
        false,
        `Forbidden event_type "${bad}" was accepted.`,
      );
    }
  },
);

await section(
  "OrderEvent reason_code enum matches Daniel REASON_CODES exactly (35 values)",
  async () => {
    assert.equal(
      ORDER_EVENT_REASON_CODES.length,
      35,
      "REASON_CODES count drifted from constants.py:34-72.",
    );
    // Spot-check anchors representing each category.
    const anchors = [
      "submit_requested",
      "broker_acknowledged",
      "transition_allowed",
      "invalid_transition",
      "missing_fill_evidence",
      "control_halt_global",
    ];
    for (const code of anchors) {
      assert.equal(
        (ORDER_EVENT_REASON_CODES as readonly string[]).includes(code),
        true,
        `Expected reason_code "${code}" missing from ORDER_EVENT_REASON_CODES.`,
      );
    }
  },
);

await section(
  "OrderEvent source_service enum matches Daniel writer set (8 values)",
  async () => {
    assert.deepEqual(
      [...ORDER_EVENT_SOURCE_SERVICES].sort(),
      [
        "admin",
        "admin_intervention",
        "broker_poller",
        "broker_webhook",
        "exec-gateway",
        "poller",
        "reconciler",
        "trade-manager",
      ],
      "ORDER_EVENT_SOURCE_SERVICES drifted from BROKER_TRUTH_SOURCES (transitions.py:52-54) + writer services.",
    );
  },
);

function baseEvent(
  overrides: Partial<{
    eventId: string;
    orderId: string;
    occurredAt: string;
    correlationId?: string;
    rawHash?: string;
  }> = {},
): Parameters<typeof orderEventSchema.safeParse>[0] {
  return {
    orderId: overrides.orderId ?? "o-1",
    occurredAt: overrides.occurredAt ?? new Date().toISOString(),
    eventId: overrides.eventId ?? "ev-1",
    eventType: "order_planned",
    sourceService: "trade-manager",
    ...(overrides.correlationId !== undefined
      ? { correlationId: overrides.correlationId }
      : {}),
    ...(overrides.rawHash !== undefined ? { rawHash: overrides.rawHash } : {}),
  };
}

await section(
  "OrderEvent schema: eventId, orderId, occurredAt, eventType, sourceService are REQUIRED",
  async () => {
    const noEventId = orderEventSchema.safeParse({
      ...baseEvent(),
      eventId: "",
    });
    assert.equal(noEventId.success, false, "Empty eventId must be rejected.");
    const noOrderId = orderEventSchema.safeParse({
      ...baseEvent(),
      orderId: "",
    });
    assert.equal(noOrderId.success, false, "Empty orderId must be rejected.");
    const badTs = orderEventSchema.safeParse({
      ...baseEvent(),
      occurredAt: "not-a-date",
    });
    assert.equal(badTs.success, false, "Non-ISO occurredAt must be rejected.");
    const badType = orderEventSchema.safeParse({
      ...baseEvent(),
      eventType: "fabricated_type",
    });
    assert.equal(
      badType.success,
      false,
      "event_type outside the 27-value set must be rejected.",
    );
    const badSource = orderEventSchema.safeParse({
      ...baseEvent(),
      sourceService: "frontend",
    });
    assert.equal(
      badSource.success,
      false,
      "source_service outside the 8-value writer set must be rejected.",
    );
    // Valid minimal record parses.
    const ok = orderEventSchema.safeParse(baseEvent());
    assert.equal(ok.success, true, "Valid minimal OrderEvent must parse.");
  },
);

await section(
  "OrderEvent schema: correlationId is OPTIONAL (matches Daniel nullable)",
  async () => {
    // No correlationId → accept (Daniel: best-effort, may be null early in lifecycle).
    const noCorr = orderEventSchema.safeParse(baseEvent());
    assert.equal(
      noCorr.success,
      true,
      "OrderEvent without correlationId must parse — Daniel permits null.",
    );
    // With correlationId → accept.
    const withCorr = orderEventSchema.safeParse(
      baseEvent({ correlationId: "c-1" }),
    );
    assert.equal(withCorr.success, true);
    // Empty correlationId → reject.
    const emptyCorr = orderEventSchema.safeParse({
      ...baseEvent(),
      correlationId: "",
    });
    assert.equal(
      emptyCorr.success,
      false,
      "Empty correlationId string must be rejected.",
    );
  },
);

await section(
  "OrderEvent schema: rawHash must be 64-char lowercase SHA-256 hex when set",
  async () => {
    const badShort = orderEventSchema.safeParse(
      baseEvent({ rawHash: "a".repeat(63) }),
    );
    assert.equal(badShort.success, false, "rawHash < 64 chars must reject.");
    const badUpper = orderEventSchema.safeParse(
      baseEvent({ rawHash: "A".repeat(64) }),
    );
    assert.equal(
      badUpper.success,
      false,
      "rawHash uppercase must reject (Python hexdigest is lowercase).",
    );
    const ok = orderEventSchema.safeParse(
      baseEvent({ rawHash: "c".repeat(64) }),
    );
    assert.equal(ok.success, true, "Valid 64-char lowercase hex must parse.");
  },
);

await section(
  "OrderEvent entity: append-only — duplicate eventId is rejected",
  async () => {
    const eventId = `ev-immut-${Date.now()}`;
    const orderId = `o-immut-${Date.now()}`;
    await appendOrderEvent({
      event: {
        orderId,
        occurredAt: new Date().toISOString(),
        eventId,
        eventType: "order_planned",
        sourceService: "trade-manager",
      },
    });
    await assert.rejects(
      appendOrderEvent({
        event: {
          orderId,
          occurredAt: new Date().toISOString(),
          eventId,
          eventType: "submit_started",
          sourceService: "trade-manager",
        },
      }),
      /already exists/,
      "Second append with same eventId must throw — OrderEvents are append-only.",
    );
    const read = await getOrderEvent(eventId);
    assert.ok(read);
    assert.equal(
      read.eventType,
      "order_planned",
      "Original event must persist.",
    );
  },
);

await section(
  "OrderEvent entity: listOrderEventsForOrder returns events in chronological order",
  async () => {
    const orderId = `o-chron-${Date.now()}`;
    const base = new Date("2026-05-31T10:00:00Z").getTime();
    for (const [i, eventType] of [
      [0, "order_planned"],
      [2, "submit_started"],
      [1, "submit_queued"],
      [3, "order_filled"],
    ] as const) {
      await appendOrderEvent({
        event: {
          orderId,
          occurredAt: new Date(base + i * 1000).toISOString(),
          eventId: `ev-chron-${orderId}-${i}`,
          eventType,
          sourceService: "trade-manager",
        },
      });
    }
    const ordered = await listOrderEventsForOrder(orderId);
    assert.equal(ordered.length, 4);
    assert.deepEqual(
      ordered.map((e) => e.eventType),
      ["order_planned", "submit_queued", "submit_started", "order_filled"],
      "Events must be returned in ascending occurredAt order.",
    );
  },
);

await section(
  "OrderEvent entity: listOrderEventsForCorrelation filters by correlationId",
  async () => {
    const corr = `c-look-${Date.now()}`;
    const orderId = `o-corr-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await appendOrderEvent({
        event: {
          orderId,
          occurredAt: new Date(Date.now() + i * 1000).toISOString(),
          eventId: `ev-corr-${orderId}-${i}`,
          eventType: "broker_status_observed",
          sourceService: "broker_webhook",
          correlationId: corr,
        },
      });
    }
    const byCorr = await listOrderEventsForCorrelation(corr);
    assert.equal(byCorr.length, 3);
    assert.equal(byCorr[0]?.correlationId, corr);
  },
);

await section(
  "OrderEvent entity: exports NO Orders-mutation, broker-submission, attempt, or fill helpers",
  async () => {
    const forbidden = [
      // Order mutation
      "updateOrder",
      "transitionOrder",
      "mutateOrder",
      "patchOrder",
      // Broker submission
      "submit",
      "submitOrder",
      "submitToBroker",
      "placeOrder",
      "placeBroker",
      "sendToBroker",
      "executeOrder",
      "broker",
      "brokerSubmit",
      // BrokerOrderAttempts
      "createBrokerAttempt",
      "appendBrokerAttempt",
      "recordBrokerAttempt",
      // Fills
      "createFill",
      "appendFill",
      "recordFill",
    ];
    const exported = Object.keys(orderEventEntity);
    for (const name of forbidden) {
      assert.equal(
        exported.includes(name),
        false,
        `OrderEvent entity exports forbidden symbol "${name}" — entity must not mutate Orders, submit to broker, or create attempts/fills.`,
      );
    }
  },
);

await section(
  "OrderEvent entity: exports exactly the expected append + lookup surface",
  async () => {
    const exported = new Set(Object.keys(orderEventEntity));
    const expected = [
      "appendOrderEvent",
      "getOrderEvent",
      "listOrderEventsForOrder",
      "listOrderEventsForCorrelation",
    ];
    for (const name of expected) {
      assert.equal(
        exported.has(name),
        true,
        `Expected entity export "${name}" missing.`,
      );
    }
  },
);

// ─── BrokerOrderAttempts domain (DDL 2783-2833, states.py:50-74) ──────────

await section(
  "BrokerOrderAttempt attempt_type enum matches Daniel exactly (8 values)",
  async () => {
    assert.deepEqual(
      [...ATTEMPT_TYPES].sort(),
      [
        "amend",
        "cancel",
        "fill_lookup",
        "position_lookup",
        "reconcile",
        "replace",
        "status_lookup",
        "submit",
      ],
      "ATTEMPT_TYPES drifted from apps/common/trade_lifecycle/states.py:63-74.",
    );
    assert.equal(ATTEMPT_TYPES.length, 8);
  },
);

await section(
  "BrokerOrderAttempt status enum matches Daniel exactly (8 values; 1 initial + 7 outcome)",
  async () => {
    assert.deepEqual(
      [...BROKER_ATTEMPT_STATUSES].sort(),
      [
        "acknowledged",
        "error",
        "recovered",
        "rejected",
        "started",
        "terminal",
        "timeout",
        "unknown",
      ],
      "BROKER_ATTEMPT_STATUSES drifted from apps/common/trade_lifecycle/states.py:50-61.",
    );
    assert.equal(BROKER_ATTEMPT_STATUSES.length, 8);
    assert.equal(
      OUTCOME_BROKER_ATTEMPT_STATUSES.length,
      7,
      "Outcome set must be exactly 7 (all statuses except 'started').",
    );
    assert.equal(
      (OUTCOME_BROKER_ATTEMPT_STATUSES as readonly string[]).includes(
        "started",
      ),
      false,
      "'started' is the initial status; must not appear in outcome set.",
    );
    for (const v of [
      "needs_review",
      "review",
      "deny",
      "denied",
      "approved",
      "pending",
      "hold",
      "manual_review",
    ]) {
      assert.equal(
        isBrokerAttemptStatus(v),
        false,
        `Forbidden status "${v}" was accepted — would re-introduce REVIEW/DENY partition.`,
      );
    }
  },
);

await section(
  "BrokerOrderAttempt http_method enum includes standard HTTP + SDK markers (8 values)",
  async () => {
    assert.deepEqual([...ATTEMPT_HTTP_METHODS].sort(), [
      "DELETE",
      "DRY_RUN",
      "GET",
      "PATCH",
      "POST",
      "PUT",
      "SDK",
      "UNSUPPORTED",
    ]);
  },
);

function baseAttempt(
  overrides: Partial<{
    attemptId: string;
    attemptSeq: number;
    parentAttemptId?: string;
    status:
      | "started"
      | "acknowledged"
      | "rejected"
      | "timeout"
      | "error"
      | "unknown"
      | "recovered"
      | "terminal";
    localCompletedAt?: string;
  }> = {},
): Parameters<typeof brokerOrderAttemptSchema.safeParse>[0] {
  const base = {
    attemptId: overrides.attemptId ?? "att-1",
    orderId: "o-1",
    accountId: "a-1",
    attemptType: "submit" as const,
    attemptSeq: overrides.attemptSeq ?? 1,
    status: overrides.status ?? "started",
    localStartedAt: new Date().toISOString(),
  };
  return {
    ...base,
    ...(overrides.parentAttemptId !== undefined
      ? { parentAttemptId: overrides.parentAttemptId }
      : {}),
    ...(overrides.localCompletedAt !== undefined
      ? { localCompletedAt: overrides.localCompletedAt }
      : {}),
  };
}

await section(
  "BrokerOrderAttempt schema requires attemptId, attemptType, attemptSeq>=1, status, localStartedAt",
  async () => {
    const noId = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt(),
      attemptId: "",
    });
    assert.equal(noId.success, false, "Empty attemptId must be rejected.");
    const zeroSeq = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt(),
      attemptSeq: 0,
    });
    assert.equal(
      zeroSeq.success,
      false,
      "attemptSeq=0 must be rejected (must be positive).",
    );
    const negSeq = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt(),
      attemptSeq: -1,
    });
    assert.equal(
      negSeq.success,
      false,
      "negative attemptSeq must be rejected.",
    );
    const badStart = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt(),
      localStartedAt: "not-a-date",
    });
    assert.equal(
      badStart.success,
      false,
      "Non-ISO localStartedAt must be rejected.",
    );
    const badType = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt(),
      attemptType: "fabricated",
    });
    assert.equal(
      badType.success,
      false,
      "attempt_type outside the 8-value set must be rejected.",
    );
    // Valid minimal record parses.
    const ok = brokerOrderAttemptSchema.safeParse(baseAttempt());
    assert.equal(ok.success, true, "Valid minimal attempt must parse.");
  },
);

await section(
  "BrokerOrderAttempt schema: started status FORBIDS completion fields",
  async () => {
    const startedWithCompletion = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt({ status: "started" }),
      localCompletedAt: new Date().toISOString(),
    });
    assert.equal(
      startedWithCompletion.success,
      false,
      "status='started' with localCompletedAt must be rejected.",
    );
    const startedWithResponse = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt({ status: "started" }),
      responsePayloadRaw: { ok: true },
    });
    assert.equal(
      startedWithResponse.success,
      false,
      "status='started' with responsePayloadRaw must be rejected.",
    );
  },
);

await section(
  "BrokerOrderAttempt schema: attempt_seq=1 forbids parent_attempt_id; seq>1 requires it",
  async () => {
    const seq1WithParent = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt({ attemptSeq: 1, parentAttemptId: "att-0" }),
    });
    assert.equal(
      seq1WithParent.success,
      false,
      "attempt_seq=1 with parent_attempt_id must be rejected.",
    );
    const seq2NoParent = brokerOrderAttemptSchema.safeParse(
      baseAttempt({ attemptSeq: 2 }),
    );
    assert.equal(
      seq2NoParent.success,
      false,
      "attempt_seq>1 without parent_attempt_id must be rejected.",
    );
    const ok = brokerOrderAttemptSchema.safeParse(
      baseAttempt({ attemptSeq: 2, parentAttemptId: "att-root" }),
    );
    assert.equal(
      ok.success,
      true,
      "attempt_seq=2 with parent_attempt_id must parse.",
    );
  },
);

await section(
  "BrokerOrderAttempt schema: raw_request_hash and raw_response_hash must be SHA-256 hex",
  async () => {
    const badReq = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt(),
      rawRequestHash: "Z".repeat(64),
    });
    assert.equal(
      badReq.success,
      false,
      "Non-hex rawRequestHash must be rejected.",
    );
    const badRespLen = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt(),
      rawResponseHash: "a".repeat(63),
    });
    assert.equal(
      badRespLen.success,
      false,
      "rawResponseHash < 64 chars must be rejected.",
    );
    const ok = brokerOrderAttemptSchema.safeParse({
      ...baseAttempt(),
      rawRequestHash: "b".repeat(64),
      rawResponseHash: "c".repeat(64),
    });
    assert.equal(ok.success, true);
  },
);

await section(
  "BrokerOrderAttempt KNOWN_SECRET_KEY_PARTS covers all critical credential vocabulary",
  async () => {
    // Spot-check that the redaction sentinel set hasn't lost a critical key.
    const required = [
      "authorization",
      "api_key",
      "secret",
      "password",
      "token",
      "access_token",
      "refresh_token",
      "cookie",
    ];
    for (const key of required) {
      assert.equal(
        (KNOWN_SECRET_KEY_PARTS as readonly string[]).includes(key),
        true,
        `Critical secret-key sentinel "${key}" missing from KNOWN_SECRET_KEY_PARTS.`,
      );
    }
  },
);

await section(
  "BrokerOrderAttempt entity: appendBrokerAttempt rejects non-started status",
  async () => {
    await assert.rejects(
      appendBrokerAttempt({
        attempt: {
          attemptId: `att-bad-${Date.now()}`,
          attemptType: "submit",
          attemptSeq: 1,
          status: "acknowledged" as const,
          localStartedAt: new Date().toISOString(),
        },
      }),
      /status="started"/,
      "appendBrokerAttempt with status='acknowledged' must throw.",
    );
  },
);

await section(
  "BrokerOrderAttempt entity: appendBrokerAttempt rejects completion fields at insert",
  async () => {
    await assert.rejects(
      appendBrokerAttempt({
        attempt: {
          attemptId: `att-early-${Date.now()}`,
          attemptType: "submit",
          attemptSeq: 1,
          status: "started",
          localStartedAt: new Date().toISOString(),
          localCompletedAt: new Date().toISOString(),
        },
      }),
      /completion fields/,
      "appendBrokerAttempt with localCompletedAt must throw.",
    );
  },
);

await section(
  "BrokerOrderAttempt entity: completeBrokerAttempt is single-shot (double-completion rejected)",
  async () => {
    const attemptId = `att-2shot-${Date.now()}`;
    await appendBrokerAttempt({
      attempt: {
        attemptId,
        orderId: "o-2shot",
        attemptType: "submit",
        attemptSeq: 1,
        status: "started",
        localStartedAt: new Date().toISOString(),
      },
    });
    const completed = await completeBrokerAttempt({
      attemptId,
      status: "acknowledged",
      localCompletedAt: new Date().toISOString(),
      httpStatus: 200,
    });
    assert.equal(completed.status, "acknowledged");
    assert.equal(completed.httpStatus, 200);
    // Second completion must throw.
    await assert.rejects(
      completeBrokerAttempt({
        attemptId,
        status: "rejected",
        localCompletedAt: new Date().toISOString(),
      }),
      /already completed/,
      "Second completion attempt must be rejected.",
    );
  },
);

await section(
  "BrokerOrderAttempt entity: completion preserves immutable identity fields byte-for-byte",
  async () => {
    const attemptId = `att-imut-${Date.now()}`;
    const orderId = `o-imut-${Date.now()}`;
    const initial = {
      attemptId,
      orderId,
      planId: "p-1",
      intentId: "i-1",
      accountId: "a-1",
      clientOrderId: "coid-1",
      brokerName: "alpaca",
      asset: "AAPL",
      attemptType: "submit" as const,
      attemptSeq: 1,
      status: "started" as const,
      endpointAction: "execute_order",
      httpMethod: "POST" as const,
      requestPayloadInternal: { qty: "10" },
      localStartedAt: new Date().toISOString(),
      correlationId: "c-imut",
      rawRequestHash: "d".repeat(64),
    };
    await appendBrokerAttempt({ attempt: initial });
    const completed = await completeBrokerAttempt({
      attemptId,
      status: "rejected",
      localCompletedAt: new Date().toISOString(),
      brokerCode: "INSUFFICIENT_FUNDS",
      errorType: "BrokerRejectError",
      retryable: false,
    });
    // Immutable fields must match initial.
    const immutableKeys = [
      "attemptId",
      "orderId",
      "planId",
      "intentId",
      "accountId",
      "clientOrderId",
      "brokerName",
      "asset",
      "attemptType",
      "attemptSeq",
      "endpointAction",
      "httpMethod",
      "requestPayloadInternal",
      "localStartedAt",
      "correlationId",
      "rawRequestHash",
    ] as const;
    for (const k of immutableKeys) {
      assert.deepEqual(
        (completed as unknown as Record<string, unknown>)[k],
        (initial as unknown as Record<string, unknown>)[k],
        `Immutable field "${k}" was mutated by completion.`,
      );
    }
    // Mutable fields were set.
    assert.equal(completed.status, "rejected");
    assert.equal(completed.brokerCode, "INSUFFICIENT_FUNDS");
    assert.equal(completed.retryable, false);
  },
);

await section(
  "BrokerOrderAttempt entity: completeBrokerAttempt rejects unknown attempt and 'started' as completion",
  async () => {
    await assert.rejects(
      completeBrokerAttempt({
        attemptId: `att-missing-${Date.now()}`,
        status: "acknowledged",
        localCompletedAt: new Date().toISOString(),
      }),
      /not found/,
      "Completing an unknown attempt must throw.",
    );
    // Try to "complete" with status="started" (not in outcome set).
    const attemptId = `att-badcomp-${Date.now()}`;
    await appendBrokerAttempt({
      attempt: {
        attemptId,
        attemptType: "submit",
        attemptSeq: 1,
        status: "started",
        localStartedAt: new Date().toISOString(),
      },
    });
    await assert.rejects(
      completeBrokerAttempt({
        attemptId,
        status: "started" as unknown as "acknowledged",
        localCompletedAt: new Date().toISOString(),
      }),
      /OUTCOME_BROKER_ATTEMPT_STATUSES/,
      "Completing with status='started' must throw.",
    );
  },
);

await section(
  "BrokerOrderAttempt entity: retry chain returns root + retries in attempt_seq order",
  async () => {
    const rootId = `att-root-${Date.now()}`;
    const orderId = `o-retry-${Date.now()}`;
    // Insert root attempt (seq=1, no parent).
    await appendBrokerAttempt({
      attempt: {
        attemptId: rootId,
        orderId,
        attemptType: "submit",
        attemptSeq: 1,
        status: "started",
        localStartedAt: new Date(Date.now()).toISOString(),
      },
    });
    // Insert two retries (seq=2, seq=3) chained to root.
    for (const seq of [3, 2]) {
      // intentionally out-of-order insertion
      await appendBrokerAttempt({
        attempt: {
          attemptId: `${rootId}-retry-${seq}`,
          orderId,
          attemptType: "submit",
          attemptSeq: seq,
          parentAttemptId: rootId,
          status: "started",
          localStartedAt: new Date(Date.now() + seq * 1000).toISOString(),
        },
      });
    }
    const chain = await listBrokerAttemptRetryChain(rootId);
    assert.equal(chain.length, 3);
    assert.deepEqual(
      chain.map((a) => a.attemptSeq),
      [1, 2, 3],
      "Retry chain must be ordered by attempt_seq ascending.",
    );
    assert.equal(chain[0]?.attemptId, rootId);
    assert.equal(chain[1]?.parentAttemptId, rootId);
    assert.equal(chain[2]?.parentAttemptId, rootId);
  },
);

await section(
  "BrokerOrderAttempt entity: lookups by orderId and correlationId work",
  async () => {
    const corr = `c-bal-${Date.now()}`;
    const orderId = `o-bal-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const attemptId = `att-bal-${orderId}-${i}`;
      await appendBrokerAttempt({
        attempt: {
          attemptId,
          orderId,
          attemptType: "status_lookup",
          attemptSeq: 1,
          status: "started",
          localStartedAt: new Date(Date.now() + i).toISOString(),
          correlationId: corr,
        },
      });
    }
    const byOrder = await listBrokerAttemptsForOrder(orderId);
    assert.equal(byOrder.length, 3);
    const byCorr = await listBrokerAttemptsForCorrelation(corr);
    assert.equal(byCorr.length, 3);
    assert.equal(byCorr[0]?.correlationId, corr);
    // Spot-check get by id.
    const single = await getBrokerAttempt(byOrder[0]!.attemptId);
    assert.ok(single);
  },
);

await section(
  "BrokerOrderAttempt entity: exports NO Order-mutation, OrderEvent-create, Fill-create, or broker-submission helpers",
  async () => {
    const forbidden = [
      // Order mutation
      "updateOrder",
      "transitionOrder",
      "mutateOrder",
      "patchOrder",
      // OrderEvents creation
      "createOrderEvent",
      "appendOrderEvent",
      "recordOrderEvent",
      // Fills creation
      "createFill",
      "appendFill",
      "recordFill",
      // Broker submission helpers (entity records evidence; doesn't submit)
      "submit",
      "submitOrder",
      "submitToBroker",
      "placeOrder",
      "sendToBroker",
      "executeOrder",
      "callBroker",
    ];
    const exported = Object.keys(brokerAttemptEntity);
    for (const name of forbidden) {
      assert.equal(
        exported.includes(name),
        false,
        `BrokerOrderAttempt entity exports forbidden symbol "${name}" — entity is an evidence ledger, not an actor.`,
      );
    }
  },
);

await section(
  "BrokerOrderAttempt entity: exports exactly the expected append + complete + lookup surface",
  async () => {
    const exported = new Set(Object.keys(brokerAttemptEntity));
    const expected = [
      "appendBrokerAttempt",
      "completeBrokerAttempt",
      "getBrokerAttempt",
      "listBrokerAttemptsForOrder",
      "listBrokerAttemptsForCorrelation",
      "listBrokerAttemptRetryChain",
    ];
    for (const name of expected) {
      assert.equal(
        exported.has(name),
        true,
        `Expected entity export "${name}" missing.`,
      );
    }
  },
);

// ─── Fills domain (DDL 212-247, pipeline.py writer audit) ─────────────────

await section(
  "Fill source enum matches Daniel exactly (3 closed values per pipeline.py)",
  async () => {
    assert.deepEqual(
      [...FILL_SOURCES].sort(),
      ["poller", "reconciliation", "webhook"],
      "FILL_SOURCES drifted from pipeline.py:2908,1778.",
    );
    assert.equal(FILL_SOURCES.length, 3);
    for (const bad of [
      "broker_webhook",
      "broker_poller",
      "admin",
      "reconciler",
      "frontend",
      "exec-gateway",
    ]) {
      assert.equal(
        isFillSource(bad),
        false,
        `Non-Fill source "${bad}" was accepted — confusing with BROKER_TRUTH_SOURCES.`,
      );
    }
  },
);

await section(
  "Fill KNOWN_LIQUIDITY_VALUES documents the commonly-observed broker values",
  async () => {
    // liquidity is free-form per Daniel; this sentinel set is documentation.
    for (const v of ["maker", "taker", "unknown"]) {
      assert.equal(
        (KNOWN_LIQUIDITY_VALUES as readonly string[]).includes(v),
        true,
        `KNOWN_LIQUIDITY_VALUES missing canonical "${v}".`,
      );
    }
  },
);

function baseFill(
  overrides: Partial<{
    orderId: string;
    fillId: string;
  }> = {},
): Parameters<typeof fillSchema.safeParse>[0] {
  return {
    orderId: overrides.orderId ?? "o-1",
    fillId: overrides.fillId ?? "f-1",
  };
}

await section(
  "Fill schema: orderId + fillId are required; all other fields optional matching Daniel",
  async () => {
    const noOrder = fillSchema.safeParse({ ...baseFill(), orderId: "" });
    assert.equal(noOrder.success, false, "Empty orderId must be rejected.");
    const noFill = fillSchema.safeParse({ ...baseFill(), fillId: "" });
    assert.equal(noFill.success, false, "Empty fillId must be rejected.");
    // Bare-minimum (just PK) must parse — all other fields nullable in Daniel.
    const ok = fillSchema.safeParse(baseFill());
    assert.equal(ok.success, true, "Bare PK-only Fill must parse.");
  },
);

await section(
  "Fill schema: qty, price, fees, commission MUST be DecimalString",
  async () => {
    const numQty = fillSchema.safeParse({ ...baseFill(), qty: 10 });
    assert.equal(numQty.success, false, "qty as JS number must be rejected.");
    const numPrice = fillSchema.safeParse({ ...baseFill(), price: 150.5 });
    assert.equal(
      numPrice.success,
      false,
      "price as JS number must be rejected.",
    );
    const numFees = fillSchema.safeParse({ ...baseFill(), fees: 1.25 });
    assert.equal(numFees.success, false, "fees as JS number must be rejected.");
    const numCommission = fillSchema.safeParse({
      ...baseFill(),
      commission: 0.5,
    });
    assert.equal(
      numCommission.success,
      false,
      "commission as JS number must be rejected.",
    );
    const ok = fillSchema.safeParse({
      ...baseFill(),
      qty: "10",
      price: "150.50",
      fees: "1.25",
      commission: "0.50",
    });
    assert.equal(
      ok.success,
      true,
      "Valid Fill with DecimalString fields must parse.",
    );
  },
);

await section(
  "Fill schema: timestamp fields must be valid ISO datetime",
  async () => {
    for (const field of [
      "ts",
      "brokerExecutionTs",
      "localReceivedAt",
      "createdAt",
    ] as const) {
      const bad = fillSchema.safeParse({
        ...baseFill(),
        [field]: "not-a-date",
      });
      assert.equal(
        bad.success,
        false,
        `${field} with non-ISO value must be rejected.`,
      );
      const ok = fillSchema.safeParse({
        ...baseFill(),
        [field]: new Date().toISOString(),
      });
      assert.equal(ok.success, true, `${field} with valid ISO must parse.`);
    }
  },
);

await section(
  "Fill schema: rawHash must be 64-char lowercase SHA-256 hex when set",
  async () => {
    const badHex = fillSchema.safeParse({
      ...baseFill(),
      rawHash: "Z".repeat(64),
    });
    assert.equal(badHex.success, false, "Non-hex rawHash must be rejected.");
    const tooShort = fillSchema.safeParse({
      ...baseFill(),
      rawHash: "a".repeat(63),
    });
    assert.equal(
      tooShort.success,
      false,
      "rawHash < 64 chars must be rejected.",
    );
    const ok = fillSchema.safeParse({
      ...baseFill(),
      rawHash: "b".repeat(64),
    });
    assert.equal(ok.success, true);
  },
);

await section(
  "Fill entity: append-only — duplicate (orderId, fillId) is rejected",
  async () => {
    const orderId = `o-imut-${Date.now()}`;
    const fillId = `f-imut-${Date.now()}`;
    await appendFill({
      fill: { orderId, fillId, qty: "10", price: "150.00" },
    });
    await assert.rejects(
      appendFill({
        fill: {
          orderId,
          fillId,
          qty: "20",
          price: "151.00",
        },
      }),
      /already exists/,
      "Second append for same (orderId, fillId) must be rejected.",
    );
    const read = await getFill(orderId, fillId);
    assert.ok(read);
    assert.equal(read.qty, "10", "Original fill must persist.");
  },
);

await section(
  "Fill entity: same fillId across DIFFERENT orderIds is allowed (PK is composite)",
  async () => {
    const fillId = `f-shared-${Date.now()}`;
    const orderA = `oA-${Date.now()}`;
    const orderB = `oB-${Date.now()}`;
    await appendFill({ fill: { orderId: orderA, fillId } });
    await appendFill({ fill: { orderId: orderB, fillId } });
    const a = await getFill(orderA, fillId);
    const b = await getFill(orderB, fillId);
    assert.ok(a);
    assert.ok(b);
    assert.notEqual(
      a.orderId,
      b.orderId,
      "Composite PK must allow same fillId across different orders.",
    );
  },
);

await section(
  "Fill entity: listFillsForOrder returns fills in chronological order",
  async () => {
    const orderId = `o-chron-${Date.now()}`;
    const base = new Date("2026-06-01T10:00:00Z").getTime();
    const fillIds = [
      `chron0-${orderId}`,
      `chron1-${orderId}`,
      `chron2-${orderId}`,
    ];
    // Insert out of order; expect list to come back in ts ascending.
    await appendFill({
      fill: {
        orderId,
        fillId: fillIds[2]!,
        ts: new Date(base + 2000).toISOString(),
      },
    });
    await appendFill({
      fill: {
        orderId,
        fillId: fillIds[0]!,
        ts: new Date(base + 0).toISOString(),
      },
    });
    await appendFill({
      fill: {
        orderId,
        fillId: fillIds[1]!,
        ts: new Date(base + 1000).toISOString(),
      },
    });
    const list = await listFillsForOrder(orderId);
    assert.equal(list.length, 3);
    assert.deepEqual(
      list.map((f) => f.fillId),
      fillIds,
      "listFillsForOrder must return fills in ascending ts order.",
    );
  },
);

await section(
  "Fill entity: listFillsForBrokerOrder filters by brokerOrderId",
  async () => {
    const brokerOrderId = `bo-${Date.now()}`;
    const orderId = `o-bo-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await appendFill({
        fill: {
          orderId,
          fillId: `f-bo-${i}-${Date.now()}`,
          brokerOrderId,
          ts: new Date(Date.now() + i).toISOString(),
        },
      });
    }
    const list = await listFillsForBrokerOrder(brokerOrderId);
    assert.equal(list.length, 3);
    assert.equal(list[0]?.brokerOrderId, brokerOrderId);
  },
);

await section(
  "Fill entity: listFillsForAccount filters by accountId",
  async () => {
    const accountId = `acc-${Date.now()}`;
    const orderId = `o-acc-${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      await appendFill({
        fill: {
          orderId,
          fillId: `f-acc-${i}-${Date.now()}`,
          accountId,
          ts: new Date(Date.now() + i).toISOString(),
        },
      });
    }
    const list = await listFillsForAccount(accountId);
    assert.equal(list.length, 2);
    assert.equal(list[0]?.accountId, accountId);
  },
);

await section(
  "Fill entity: exports NO Order-mutation, OrderEvent-create, BrokerAttempt-create, OrderIdMap-create, or broker-submission helpers",
  async () => {
    const forbidden = [
      // Order mutation
      "updateOrder",
      "transitionOrder",
      "mutateOrder",
      "patchOrder",
      // OrderEvents creation
      "createOrderEvent",
      "appendOrderEvent",
      "recordOrderEvent",
      // BrokerOrderAttempts creation
      "createBrokerAttempt",
      "appendBrokerAttempt",
      "completeBrokerAttempt",
      "recordBrokerAttempt",
      // OrderIdMap creation
      "createOrderIdMap",
      "appendOrderIdMap",
      "recordOrderIdMap",
      "upsertOrderIdMap",
      // Broker submission helpers
      "submit",
      "submitOrder",
      "submitToBroker",
      "placeOrder",
      "sendToBroker",
      "executeOrder",
      "callBroker",
    ];
    const exported = Object.keys(fillEntity);
    for (const name of forbidden) {
      assert.equal(
        exported.includes(name),
        false,
        `Fill entity exports forbidden symbol "${name}" — Fills are broker evidence only.`,
      );
    }
  },
);

await section(
  "Fill entity: exports exactly the expected append + lookup surface",
  async () => {
    const exported = new Set(Object.keys(fillEntity));
    const expected = [
      "appendFill",
      "getFill",
      "listFillsForOrder",
      "listFillsForBrokerOrder",
      "listFillsForAccount",
    ];
    for (const name of expected) {
      assert.equal(
        exported.has(name),
        true,
        `Expected entity export "${name}" missing.`,
      );
    }
  },
);

// ─── Alpha game handoff route (/api/v1/investor/alpha-claim) ────────────────
//
// End-to-end behavioral assertions for the narrow alpha-claim port. Unlike the
// entity-only sections above, this drives the real Next route handler. Setup
// order matters:
//   1. `jose` and `next/server` resolve only under apps/web (pnpm workspace),
//      so we anchor resolution there with createRequire and dynamic-import the
//      resolved absolute paths.
//   2. We generate a real ES256 keypair, export the PUBLIC JWK, and set every
//      required env var (public key + iss/aud) and FLAG_ALPHA_CLAIM_ROUTE=on
//      BEFORE importing the route/env module. getServerEnv() caches on first
//      call, so the public key must be set before the first request; the
//      private key is never placed in the environment.
{
  const { createRequire } = await import("node:module");
  const requireFromWeb = createRequire(
    join(process.cwd(), "apps/web/package.json"),
  );
  const jose = (await import(
    requireFromWeb.resolve("jose")
  )) as typeof import("jose");
  const { SignJWT, generateKeyPair, exportJWK } = jose;
  const nextServer = (await import(
    requireFromWeb.resolve("next/server")
  )) as typeof import("next/server");
  const { NextRequest } = nextServer;

  // Real signing keypair (extractable so the public half can be exported).
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  // A DIFFERENT keypair, used only to produce a validly-shaped but
  // wrong-signature token for the invalid-signature assertion.
  const wrong = await generateKeyPair("ES256", { extractable: true });

  process.env["ALPHA_HANDOFF_PUBLIC_KEY_JWK"] = JSON.stringify(publicJwk);
  process.env["ALPHA_HANDOFF_ISSUER"] = "refi-alpha";
  process.env["ALPHA_HANDOFF_AUDIENCE"] = "refi-us-sec-ia";
  process.env["FLAG_ALPHA_CLAIM_ROUTE"] = "on";
  // getServerEnv() validates the whole server schema (min-32 secrets). The
  // harness header sets a short IP_HASH_SECRET for the entity sections; the
  // route path reaches getServerEnv, so widen it to a valid length here. This
  // block runs after every other section, so the override affects nothing else.
  process.env["IP_HASH_SECRET"] = "contract-test-ip-hash-secret-0123456789";

  const { POST } =
    (await import("../apps/web/app/api/v1/investor/alpha-claim/route.ts")) as {
      POST: (req: unknown) => Promise<Response>;
    };
  const { findByAlphaPlayerId, playerKey } =
    await import("../apps/web/src/lib/prototype-store/entities/alpha-application.ts");

  const ORIGIN = "http://localhost:3000";
  const ROUTE_URL = `${ORIGIN}/api/v1/investor/alpha-claim`;

  let seq = 0;
  const uid = (p: string): string => `${p}-${Date.now()}-${seq++}`;

  type Claims = Record<string, unknown>;
  function baseClaims(overrides: Claims = {}): Claims {
    const now = Math.floor(Date.now() / 1000);
    return {
      iss: "refi-alpha",
      aud: "refi-us-sec-ia",
      sub: uid("player"),
      jti: uid("jti"),
      iat: now,
      exp: now + 300,
      progressSnapshotId: "snap-1",
      completedArenas: ["arena-1", "arena-2"],
      machineBuilderUnlocked: true,
      machineVersionCount: 3,
      machineBeatRate: 0.5,
      intendedDestination: "ELIGIBILITY",
      ...overrides,
    };
  }

  async function mint(
    claims: Claims,
    signWith: CryptoKey = privateKey as CryptoKey,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256" })
      .sign(signWith);
  }

  interface ReqOpts {
    origin?: string | null; // undefined → default same-origin; null → omit
    referer?: string;
    rawBody?: string; // overrides JSON body (for malformed-body test)
    ip?: string; // rate-limit bucket key; unique per call unless overridden
  }
  function makeReq(body: unknown, opts: ReqOpts = {}): unknown {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      // Unique per request so the per-IP limiter doesn't accumulate across
      // unrelated tests; the rate-limit test passes a fixed ip to trip it.
      "x-forwarded-for": opts.ip ?? uid("ip"),
    };
    if (opts.origin === undefined) headers["origin"] = ORIGIN;
    else if (opts.origin !== null) headers["origin"] = opts.origin;
    if (opts.referer) headers["referer"] = opts.referer;
    const init: RequestInit = { method: "POST", headers };
    if (opts.rawBody !== undefined) init.body = opts.rawBody;
    else if (body !== undefined) init.body = JSON.stringify(body);
    return new NextRequest(
      ROUTE_URL,
      init as ConstructorParameters<typeof NextRequest>[1],
    );
  }

  async function call(
    body: unknown,
    opts: ReqOpts = {},
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await POST(makeReq(body, opts));
    const json = (await res.json()) as Record<string, unknown>;
    return { status: res.status, json };
  }

  await section("alpha-claim: flag off returns 404", async () => {
    const saved = process.env["FLAG_ALPHA_CLAIM_ROUTE"];
    process.env["FLAG_ALPHA_CLAIM_ROUTE"] = "off";
    try {
      const token = await mint(baseClaims());
      const { status } = await call({ token });
      assert.equal(status, 404, "flag off must return 404");
    } finally {
      process.env["FLAG_ALPHA_CLAIM_ROUTE"] = saved;
    }
  });

  await section("alpha-claim: malformed JSON body returns 400", async () => {
    const { status } = await call(undefined, { rawBody: "{not valid json" });
    assert.equal(status, 400, "malformed body must return 400");
  });

  await section("alpha-claim: wrong-shape body returns 400", async () => {
    const { status } = await call({ notToken: "x" });
    assert.equal(status, 400, "body without token must return 400");
  });

  await section(
    "alpha-claim: missing declared origin returns 403",
    async () => {
      const token = await mint(baseClaims());
      const { status } = await call({ token }, { origin: null });
      assert.equal(status, 403, "missing origin must return 403");
    },
  );

  await section("alpha-claim: cross-origin request returns 403", async () => {
    const token = await mint(baseClaims());
    const { status } = await call({ token }, { origin: "http://evil.example" });
    assert.equal(status, 403, "cross-origin must return 403");
  });

  await section("alpha-claim: invalid signature returns 401", async () => {
    const token = await mint(baseClaims(), wrong.privateKey as CryptoKey);
    const { status } = await call({ token });
    assert.equal(status, 401, "wrong-key signature must return 401");
  });

  await section("alpha-claim: wrong issuer returns 401", async () => {
    const token = await mint(baseClaims({ iss: "not-refi-alpha" }));
    const { status } = await call({ token });
    assert.equal(status, 401, "wrong issuer must return 401");
  });

  await section("alpha-claim: wrong audience returns 401", async () => {
    const token = await mint(baseClaims({ aud: "someone-else" }));
    const { status } = await call({ token });
    assert.equal(status, 401, "wrong audience must return 401");
  });

  await section("alpha-claim: expired token returns 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await mint(baseClaims({ iat: now - 600, exp: now - 300 }));
    const { status } = await call({ token });
    assert.equal(status, 401, "expired token must return 401");
  });

  await section("alpha-claim: unknown private claim returns 401", async () => {
    // Valid signature + iss/aud/exp, but a smuggled behavioral dimension the
    // strict claim schema forbids (spec §6.6).
    const token = await mint(baseClaims({ dimensionCode: "AGGRESSION" }));
    const { status } = await call({ token });
    assert.equal(status, 401, "unknown claim must return 401");
  });

  await section(
    "alpha-claim: valid same-origin token returns 201",
    async () => {
      const token = await mint(baseClaims());
      const { status, json } = await call({ token });
      assert.equal(status, 201, "first valid consumption must return 201");
      const data = json["data"] as Record<string, unknown>;
      assert.equal(
        data["firstConsumption"],
        true,
        "first consumption flag must be true",
      );
    },
  );

  await section(
    "alpha-claim: same jti replay returns 200 with original binding",
    async () => {
      const claims = baseClaims();
      const token = await mint(claims);
      const first = await call({ token });
      assert.equal(first.status, 201, "first call must be 201");
      const firstData = first.json["data"] as Record<string, unknown>;

      const second = await call({ token });
      assert.equal(second.status, 200, "replay must return 200");
      const secondData = second.json["data"] as Record<string, unknown>;
      assert.equal(
        secondData["firstConsumption"],
        false,
        "replay firstConsumption must be false",
      );
      // Test 12: replay returns the ORIGINAL application reference + player.
      assert.equal(
        secondData["applicationRef"],
        firstData["applicationRef"],
        "replay must return the original applicationRef",
      );
      assert.equal(
        secondData["alphaPlayerId"],
        firstData["alphaPlayerId"],
        "replay must return the original alphaPlayerId",
      );
    },
  );

  await section(
    "alpha-claim: new jti for same alphaPlayerId updates the same application",
    async () => {
      const sub = uid("player");
      const token1 = await mint(baseClaims({ sub, jti: uid("jti") }));
      const first = await call({ token: token1 });
      assert.equal(first.status, 201, "first player claim must be 201");
      const bound1 = await findByAlphaPlayerId(sub);
      assert.ok(bound1, "player application must exist after first claim");
      const claimedAt1 = bound1.handoffClaimedAt;

      const token2 = await mint(
        baseClaims({ sub, jti: uid("jti"), progressSnapshotId: "snap-2" }),
      );
      const second = await call({ token: token2 });
      assert.equal(
        second.status,
        201,
        "a new jti is a first consumption → 201",
      );
      const d1 = first.json["data"] as Record<string, unknown>;
      const d2 = second.json["data"] as Record<string, unknown>;
      // Same player → same application storage key, not a second row.
      assert.equal(
        d2["applicationRef"],
        d1["applicationRef"],
        "second claim must reuse the same application reference",
      );
      assert.equal(
        d2["applicationRef"],
        playerKey(sub),
        "application must be keyed by player for an email-less entrant",
      );
      const bound2 = await findByAlphaPlayerId(sub);
      assert.ok(bound2, "player application must still exist");
      // handoffClaimedAt preserved from the first successful handoff; game
      // progress + updatedAt advanced.
      assert.equal(
        bound2.handoffClaimedAt,
        claimedAt1,
        "handoffClaimedAt must be preserved from the first handoff",
      );
      assert.equal(
        bound2.progressSnapshotId,
        "snap-2",
        "game progress fields must be updated on re-claim",
      );
    },
  );

  await section(
    "alpha-claim: only the public JWK is read by the shell",
    async () => {
      const configured = JSON.parse(
        process.env["ALPHA_HANDOFF_PUBLIC_KEY_JWK"] ?? "{}",
      ) as Record<string, unknown>;
      assert.equal(
        "d" in configured,
        false,
        "configured JWK must be public-only (no private scalar 'd')",
      );
      assert.equal(
        process.env["ALPHA_HANDOFF_PRIVATE_KEY_JWK"],
        undefined,
        "no private JWK env var may be set",
      );
      assert.equal(
        process.env["ALPHA_HANDOFF_PRIVATE_KEY"],
        undefined,
        "no private key env var may be set",
      );
    },
  );

  await section(
    "alpha-claim: 201 response matches the AlphaClaimClient contract",
    async () => {
      const token = await mint(baseClaims());
      const { status, json } = await call({ token });
      assert.equal(status, 201);
      assert.equal(typeof json["correlationId"], "string");
      const data = json["data"] as Record<string, unknown>;
      assert.ok(data, "response must carry a data object");
      assert.equal(typeof data["alphaPlayerId"], "string");
      assert.equal(typeof data["applicationRef"], "string");
      assert.equal(typeof data["intendedDestination"], "string");
      assert.equal(typeof data["firstConsumption"], "boolean");
      // AlphaClaimClient types score as number | null.
      assert.ok(
        typeof data["score"] === "number" || data["score"] === null,
        "score must be number | null",
      );
      assert.equal(
        json["error"],
        undefined,
        "successful response must not carry an error envelope",
      );
    },
  );

  await section(
    "alpha-claim: over-long-lived token (> 10 min) returns 401 (#21)",
    async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await mint(baseClaims({ iat: now, exp: now + 3600 }));
      const { status, json } = await call({ token });
      assert.equal(status, 401, "1-hour token must be rejected");
      assert.equal(
        (json["error"] as Record<string, unknown>)["code"],
        "token_lifetime_exceeded",
      );
    },
  );

  await section(
    "alpha-claim: per-IP rate limit returns 429 after the cap (#19)",
    async () => {
      const ip = "203.0.113.7";
      let last = 0;
      for (let i = 0; i < 31; i++) {
        last = (await call({}, { ip })).status;
      }
      assert.equal(last, 429, "31st request from one IP must be rate-limited");
      // A different IP is unaffected (per-key window).
      const fresh = (await call({}, { ip: "203.0.113.8" })).status;
      assert.notEqual(fresh, 429, "a different IP is not rate-limited");
    },
  );
}

// ─── BFF auth: fail closed ──────────────────────────────────────────────────
//
// getAuthContext must reject a PRESENT-but-invalid session cookie (never
// downgrade it to the dev-fallback identity), accept a validly signed token,
// and allow the dev fallback only under REFI_ENV=dev. The test env resolves
// REFI_ENV=dev and the placeholder SESSION_JWT_SECRET via non-prod defaults.
{
  const { createRequire } = await import("node:module");
  const requireFromWeb = createRequire(
    join(process.cwd(), "apps/web/package.json"),
  );
  const jose = (await import(
    requireFromWeb.resolve("jose")
  )) as typeof import("jose");
  const nextServer = (await import(
    requireFromWeb.resolve("next/server")
  )) as typeof import("next/server");
  const { NextRequest } = nextServer;

  const { getAuthContext } = await import("../apps/web/src/lib/bff/auth.ts");
  const { getServerEnv } = await import("../apps/web/src/lib/config/env.ts");
  const sessionSecret = getServerEnv().SESSION_JWT_SECRET;

  function reqWithCookies(cookies: Record<string, string>): unknown {
    const cookie = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    return new NextRequest("http://localhost:3000/api/v1/investor/status", {
      headers: { cookie },
    });
  }

  await section(
    "auth: valid signed session token resolves the authId",
    async () => {
      const token = await new jose.SignJWT({ sub: "user-valid-1" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(sessionSecret));
      const ctx = await getAuthContext(
        reqWithCookies({ us_session_v1: token }) as never,
      );
      assert.ok(ctx, "valid token must resolve a context");
      assert.equal(ctx.authId, "user-valid-1");
    },
  );

  await section(
    "auth: present-but-invalid session token fails closed (no dev downgrade)",
    async () => {
      // A forged/garbage session cookie, plus an attacker-mintable eligibility
      // cookie. The old behavior downgraded to a dev-* identity; it must not.
      const ctx = await getAuthContext(
        reqWithCookies({
          us_session_v1: "not.a.valid.jwt",
          us_eligibility_v1: "attacker-minted",
        }) as never,
      );
      assert.equal(
        ctx,
        null,
        "invalid session token must yield null, never a dev fallback identity",
      );
    },
  );

  await section(
    "auth: token signed with the wrong secret is rejected",
    async () => {
      const token = await new jose.SignJWT({ sub: "user-forged" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(
          new TextEncoder().encode("a-different-secret-not-the-configured"),
        );
      const ctx = await getAuthContext(
        reqWithCookies({ us_session_v1: token }) as never,
      );
      assert.equal(ctx, null, "wrong-secret token must be rejected");
    },
  );

  await section(
    "auth: dev fallback applies only when no session cookie is present (REFI_ENV=dev)",
    async () => {
      const ctx = await getAuthContext(
        reqWithCookies({ us_eligibility_v1: "elig-abc" }) as never,
      );
      assert.ok(ctx, "dev env must allow eligibility-cookie fallback");
      assert.ok(
        ctx.authId.startsWith("dev-"),
        "fallback identity must be a dev-* id",
      );
    },
  );
}

// ─── BFF mutate: same-origin CSRF guard ─────────────────────────────────────
//
// Every bffMutate route must reject cross-origin and origin-less requests
// (403) before auth, and let same-origin requests through to the auth gate.
{
  const { createRequire } = await import("node:module");
  const requireFromWeb = createRequire(
    join(process.cwd(), "apps/web/package.json"),
  );
  const nextServer = (await import(
    requireFromWeb.resolve("next/server")
  )) as typeof import("next/server");
  const { NextRequest } = nextServer;

  const { bffMutate } = await import("../apps/web/src/lib/bff/handler.ts");
  const mutate = bffMutate({
    action: "refreshProfile",
    apply: () => ({ data: { ok: true } }),
  });

  const ORIGIN = "http://localhost:3000";
  function post(headers: Record<string, string>): unknown {
    return new NextRequest(`${ORIGIN}/api/v1/investor/profile`, {
      method: "POST",
      headers,
    });
  }

  await section("bffMutate: cross-origin request is rejected 403", async () => {
    const res = await mutate(post({ origin: "http://evil.example" }) as never);
    assert.equal(res.status, 403, "cross-origin mutation must be 403");
  });

  await section("bffMutate: origin-less request is rejected 403", async () => {
    const res = await mutate(post({}) as never);
    assert.equal(res.status, 403, "origin-less mutation must be 403");
  });

  await section(
    "bffMutate: same-origin request passes CSRF and reaches the auth gate (401 unauth)",
    async () => {
      const res = await mutate(post({ origin: ORIGIN }) as never);
      assert.equal(
        res.status,
        401,
        "same-origin unauthenticated mutation must reach auth and 401",
      );
    },
  );

  await section(
    "bffMutate: same-origin via Referer fallback is accepted past CSRF",
    async () => {
      const res = await mutate(
        post({ referer: `${ORIGIN}/us/app/settings` }) as never,
      );
      assert.equal(
        res.status,
        401,
        "same-origin Referer must pass CSRF then hit the auth gate",
      );
    },
  );
}

// ─── Storage backing resolver (REFI_BACKING) ────────────────────────────────
//
// The resolver flips alpha-application / alpha-handoff-jti between the
// prototype (filesystem) and durable (Firestore) drivers per REFI_BACKING__*.
// Defaults to prototype; fails closed on an invalid mode. The durable driver's
// live behaviour is covered by the emulator-gated section below.
{
  const { backingFor } = await import("../apps/web/src/lib/config/backing.ts");
  const { resolveKvStore } = await import("../apps/web/src/lib/store/index.ts");

  await section("backing: defaults to prototype when unset", async () => {
    delete process.env["REFI_BACKING__ALPHA_HANDOFF_JTI"];
    assert.equal(backingFor("alpha-handoff-jti"), "prototype");
  });

  await section("backing: honors durable when explicitly set", async () => {
    process.env["REFI_BACKING__ALPHA_APPLICATION"] = "durable";
    try {
      assert.equal(backingFor("alpha-application"), "durable");
    } finally {
      delete process.env["REFI_BACKING__ALPHA_APPLICATION"];
    }
  });

  await section("backing: rejects an invalid mode (fail-closed)", async () => {
    process.env["REFI_BACKING__ALPHA_APPLICATION"] = "sqlite";
    try {
      assert.throws(
        () => backingFor("alpha-application"),
        /Invalid REFI_BACKING__ALPHA_APPLICATION/,
      );
    } finally {
      delete process.env["REFI_BACKING__ALPHA_APPLICATION"];
    }
  });

  await section(
    "backing: prototype resolver reads/writes + putIfAbsent semantics",
    async () => {
      delete process.env["REFI_BACKING__ALPHA_APPLICATION"];
      const kv = resolveKvStore<{ v: number }>(
        "alpha-application",
        "backing-smoke",
      );
      assert.equal(await kv.putIfAbsent("k1", { v: 1 }), true);
      assert.equal(
        await kv.putIfAbsent("k1", { v: 2 }),
        false,
        "second putIfAbsent must return false",
      );
      assert.deepEqual(await kv.get("k1"), { v: 1 });
    },
  );

  await section(
    "backing: durable selection constructs a store without a Firestore call",
    async () => {
      process.env["REFI_BACKING__ALPHA_APPLICATION"] = "durable";
      try {
        const kv = resolveKvStore<{ v: number }>(
          "alpha-application",
          "alpha-applications",
        );
        // Construction is lazy — the Firestore client is only created on the
        // first method call, so this asserts wiring without touching GCP.
        assert.equal(typeof kv.putIfAbsent, "function");
      } finally {
        delete process.env["REFI_BACKING__ALPHA_APPLICATION"];
      }
    },
  );

  await section(
    "durable: Firestore driver end-to-end (emulator-gated)",
    async () => {
      if (!process.env["FIRESTORE_EMULATOR_HOST"]) {
        console.log(
          "  ↳ skipped: set FIRESTORE_EMULATOR_HOST (+ GCP_PROJECT_ID) to run the durable driver against the Firestore emulator",
        );
        return;
      }
      if (!process.env["GCP_PROJECT_ID"])
        process.env["GCP_PROJECT_ID"] = "demo-refi";
      const { durableKvStore, __resetDurableClientForTests } =
        await import("../apps/web/src/lib/durable-store/store.ts");
      __resetDurableClientForTests();
      const kv = durableKvStore<{ v: number }>(
        `durable-smoke-${String(Date.now())}`,
      );
      assert.equal(await kv.get("x"), null, "absent get → null");
      assert.equal(
        await kv.putIfAbsent("x", { v: 1 }),
        true,
        "first create → true",
      );
      assert.equal(
        await kv.putIfAbsent("x", { v: 2 }),
        false,
        "atomic create on existing → false (distributed replay guard)",
      );
      assert.deepEqual(await kv.get("x"), { v: 1 });
      await kv.put("x", { v: 3 });
      assert.deepEqual(await kv.get("x"), { v: 3 });
      const listed = await kv.list();
      assert.ok(
        listed.some((e) => e.key === "x"),
        "list returns the doc",
      );
      await kv.delete("x");
      assert.equal(await kv.get("x"), null, "deleted → null");
    },
  );
}

// ─── BFF→investor-api user assertion (D-017, Daniel 2026-08-17) ─────────────
//
// Runs last, like the alpha-claim block: it mutates process.env and relies on
// getServerEnv()'s cache having been primed by earlier sections.
{
  const { createRequire } = await import("node:module");
  const requireFromWeb = createRequire(
    join(process.cwd(), "apps/web/package.json"),
  );
  const jose = (await import(
    requireFromWeb.resolve("jose")
  )) as typeof import("jose");

  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const assertionMod =
    await import("../apps/web/src/lib/investor-api/user-assertion.ts");
  const {
    USER_ASSERTION_HEADER,
    USER_ASSERTION_ALG,
    USER_ASSERTION_MAX_TTL_SECONDS,
    USER_ASSERTION_TTL_SECONDS,
    INVESTOR_API_DEV_AUDIENCE,
    REQUIRED_ASSERTION_CLAIMS,
    REQUIRED_AUTH_METHOD_CLAIM,
    OPTIONAL_AUTH_METHOD_CLAIM,
    MissingAuthMethodError,
    assertPublishableIssuer,
    jwksUrlFor,
    mintUserAssertion,
    getPublicJwks,
    resetSigningKeyCache,
  } = assertionMod;

  await section(
    "user assertion: contract constants match Daniel's §2",
    async () => {
      assert.equal(USER_ASSERTION_HEADER, "X-Refinity-User-Assertion");
      assert.equal(USER_ASSERTION_ALG, "ES256");
      assert.equal(
        USER_ASSERTION_MAX_TTL_SECONDS,
        120,
        "Daniel 2026-08-17: 'The maximum TTL is two minutes.'",
      );
      assert.ok(
        USER_ASSERTION_TTL_SECONDS <= USER_ASSERTION_MAX_TTL_SECONDS,
        "Minted TTL must never exceed the contract maximum.",
      );
      assert.equal(INVESTOR_API_DEV_AUDIENCE, "urn:refinity:investor-api:dev");
      assert.deepEqual(
        [...REQUIRED_ASSERTION_CLAIMS],
        ["iss", "aud", "sub", "iat", "nbf", "exp", "jti", "sid", "auth_time"],
        "Required claim list drifted from Daniel's §2.",
      );
      // Daniel 2026-08-19 narrowed the 2026-08-17 "amr or acr": `amr` is the
      // required v1 method claim and arrives non-empty; `acr` "may be added
      // later" and is therefore additive, never a substitute. An assertion
      // carrying only `acr` must not be mintable.
      assert.equal(REQUIRED_AUTH_METHOD_CLAIM, "amr");
      assert.equal(OPTIONAL_AUTH_METHOD_CLAIM, "acr");
      assert.equal(
        jwksUrlFor("https://app.example.com/"),
        "https://app.example.com/.well-known/jwks.json",
      );
    },
  );

  await section(
    "user assertion: preview-shaped issuers are rejected outside dev",
    async () => {
      // Daniel: "The BFF should use a stable environment-specific issuer, not a
      // Vercel preview URL, and publish a JWKS."
      for (const issuer of [
        "https://refi-us-sec-ia-abc123.vercel.app",
        "https://refi-git-feature-branch.example.com",
        "http://localhost:3000",
      ]) {
        assert.throws(
          () => assertPublishableIssuer(issuer, "prod"),
          /not a stable environment issuer/,
          `Issuer "${issuer}" must be rejected in prod.`,
        );
        assert.throws(
          () => assertPublishableIssuer(issuer, "staging"),
          /not a stable environment issuer/,
          `Issuer "${issuer}" must be rejected in staging.`,
        );
      }
      // Stable hosts and URN issuers pass; localhost passes in dev only.
      assertPublishableIssuer("https://app.refi.trading", "prod");
      assertPublishableIssuer("urn:refinity:bff:dev", "prod");
      assertPublishableIssuer("http://localhost:3000", "dev");
      assert.throws(
        () => assertPublishableIssuer("not a url", "prod"),
        /not a valid absolute URL or URN/,
      );
    },
  );

  await section(
    "signing key: ephemeral fallback needs an explicit opt-in",
    async () => {
      // A deployed dev tier runs multiple Cloud Run instances; a per-process
      // key would sign under a kid absent from the JWKS another instance
      // serves. REFI_ENV=dev alone must NOT be enough to enable it.
      resetSigningKeyCache();
      delete process.env["BFF_ASSERTION_PRIVATE_KEY_JWK"];
      delete process.env["BFF_ASSERTION_ALLOW_EPHEMERAL_KEY"];
      process.env["REFI_ENV"] = "dev";
      resetServerEnvCacheForTests();
      await assert.rejects(
        assertionMod.getSigningKey(),
        /BFF_ASSERTION_PRIVATE_KEY_JWK is not configured/,
        "REFI_ENV=dev alone must not enable the per-process ephemeral key.",
      );

      // Explicit opt-in enables it for a single-process local/CI run.
      process.env["BFF_ASSERTION_ALLOW_EPHEMERAL_KEY"] = "1";
      resetServerEnvCacheForTests();
      resetSigningKeyCache();
      const key = await assertionMod.getSigningKey();
      assert.ok(
        key.kid.startsWith("dev-ephemeral-"),
        "Opted-in local runs get a clearly-labelled ephemeral key.",
      );

      // Opt-in must not rescue a non-dev tier.
      process.env["REFI_ENV"] = "staging";
      resetServerEnvCacheForTests();
      resetSigningKeyCache();
      await assert.rejects(
        assertionMod.getSigningKey(),
        /BFF_ASSERTION_PRIVATE_KEY_JWK is not configured/,
        "The ephemeral opt-in must never apply outside REFI_ENV=dev.",
      );
      process.env["REFI_ENV"] = "dev";
      resetServerEnvCacheForTests();
    },
  );

  await section(
    "user assertion: minted token carries every required claim",
    async () => {
      resetSigningKeyCache();
      const { publicKey, privateKey } = await jose.generateKeyPair("ES256", {
        extractable: true,
      });
      const privateJwk = await jose.exportJWK(privateKey);
      process.env["BFF_ASSERTION_PRIVATE_KEY_JWK"] = JSON.stringify({
        ...privateJwk,
        kid: "test-key-1",
      });
      process.env["BFF_ASSERTION_ISSUER"] = "https://app.refi.trading";
      process.env["INVESTOR_API_AUDIENCE"] = INVESTOR_API_DEV_AUDIENCE;
      // getServerEnv() memoises on first call and earlier sections already
      // primed it, so the new values need an explicit re-parse.
      resetServerEnvCacheForTests();

      const authTime = Math.floor(Date.now() / 1000) - 42;
      const minted = await mintUserAssertion({
        userId: "user-opaque-1",
        sid: "sid-1",
        authTime,
        amr: ["otp"],
      });

      const { payload, protectedHeader } = await jose.jwtVerify(
        minted.token,
        publicKey,
        {
          algorithms: ["ES256"],
          issuer: "https://app.refi.trading",
          audience: INVESTOR_API_DEV_AUDIENCE,
        },
      );

      assert.equal(protectedHeader.alg, "ES256");
      assert.equal(
        protectedHeader.kid,
        "test-key-1",
        "kid must be in the header — investor-api selects the key by kid.",
      );
      for (const claim of REQUIRED_ASSERTION_CLAIMS) {
        assert.notEqual(
          payload[claim],
          undefined,
          `Required claim "${claim}" is missing from the minted assertion.`,
        );
      }
      assert.ok(
        Array.isArray(payload["amr"]) &&
          (payload["amr"] as unknown[]).length > 0,
        "`amr` must be present and non-empty — the required v1 method claim.",
      );
      assert.equal(payload.sub, "user-opaque-1");
      assert.equal(payload["sid"], "sid-1");
      assert.equal(
        payload["auth_time"],
        authTime,
        "auth_time must be the UNDERLYING authentication time, not the mint time.",
      );
      assert.notEqual(
        payload["auth_time"],
        payload.iat,
        "auth_time must not collapse onto iat — that would defeat step-up (D-015).",
      );
      assert.equal(
        payload["account_id"],
        undefined,
        "Account ids must NOT ride in the assertion — investor-api re-authorizes ownership server-side.",
      );
      const ttl = (payload.exp ?? 0) - (payload.iat ?? 0);
      assert.ok(
        ttl > 0 && ttl <= USER_ASSERTION_MAX_TTL_SECONDS,
        `TTL ${ttl}s must be within the 2-minute contract maximum.`,
      );
    },
  );

  await section("user assertion: each mint gets a unique jti", async () => {
    const base = {
      userId: "user-opaque-1",
      sid: "sid-1",
      authTime: Math.floor(Date.now() / 1000) - 10,
      amr: ["otp"],
    };
    const a = await mintUserAssertion(base);
    const b = await mintUserAssertion(base);
    assert.notEqual(
      a.jti,
      b.jti,
      "Daniel: 'Mint an assertion per BFF-to-backend call with a unique jti.'",
    );
  });

  await section(
    "user assertion: fails closed without auth_time or amr",
    async () => {
      await assert.rejects(
        mintUserAssertion({
          userId: "u",
          sid: "s",
          authTime: 0,
          amr: ["otp"],
        }),
        /underlying auth_time/,
        "A missing auth_time must throw, never fall back to now.",
      );
      await assert.rejects(
        mintUserAssertion({
          userId: "u",
          sid: "s",
          authTime: Math.floor(Date.now() / 1000),
        }),
        MissingAuthMethodError,
        "An assertion with no `amr` must be refused.",
      );
      await assert.rejects(
        mintUserAssertion({
          userId: "u",
          sid: "s",
          authTime: Math.floor(Date.now() / 1000),
          amr: [],
        }),
        MissingAuthMethodError,
        "An EMPTY `amr` is not a method claim. Daniel 2026-08-19 specifies a " +
          "non-empty array, and `[]` would assert that authentication happened " +
          "by no method at all.",
      );
      // `acr` is additive, never a substitute (Daniel 2026-08-19). This is the
      // case the previous "amr or acr" reading would have let through.
      await assert.rejects(
        mintUserAssertion({
          userId: "u",
          sid: "s",
          authTime: Math.floor(Date.now() / 1000),
          acr: "urn:example:loa2",
        }),
        MissingAuthMethodError,
        "`acr` alone must not satisfy the method requirement.",
      );
    },
  );

  await section("jwks: publishes public material only, with kid", async () => {
    const jwks = await getPublicJwks();
    assert.ok(jwks.keys.length >= 1, "JWKS must publish at least one key.");
    for (const key of jwks.keys) {
      assert.equal(
        (key as Record<string, unknown>)["d"],
        undefined,
        "A private component `d` must never appear in the published JWKS.",
      );
      assert.equal(key.kty, "EC");
      assert.equal(key.crv, "P-256");
      assert.equal(key.alg, "ES256");
      assert.equal(key.use, "sig");
      assert.ok(
        typeof key.kid === "string" && key.kid.length > 0,
        "Every published key needs a kid for rotation.",
      );
    }
  });

  await section("jwks: rotation overlap publishes both keys", async () => {
    const other = await jose.generateKeyPair("ES256", { extractable: true });
    const otherPublic = await jose.exportJWK(other.publicKey);
    process.env["BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"] = JSON.stringify({
      ...otherPublic,
      kid: "retiring-key-0",
      alg: "ES256",
      use: "sig",
    });
    resetServerEnvCacheForTests();
    const jwks = await getPublicJwks();
    const kids = jwks.keys.map((k) => k.kid).sort();
    assert.deepEqual(
      kids,
      ["retiring-key-0", "test-key-1"],
      "During a rotation overlap the retiring key must stay published until investor-api's JWKS cache expires.",
    );
    // A private key smuggled into the PREVIOUS slot must be refused outright.
    const otherPrivate = await jose.exportJWK(other.privateKey);
    process.env["BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"] = JSON.stringify({
      ...otherPrivate,
      kid: "retiring-key-0",
    });
    resetServerEnvCacheForTests();
    await assert.rejects(
      getPublicJwks(),
      /private component/,
      "A private JWK in the previous-key slot must be rejected, not published.",
    );
    delete process.env["BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"];
    resetServerEnvCacheForTests();
  });
}

// ─── Done ───────────────────────────────────────────────────────────────────

rmSync(TMP_STORE, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\ncontract-assertions: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(
  `\ncontract-assertions: all assertions passed (store: ${TMP_STORE}).`,
);
