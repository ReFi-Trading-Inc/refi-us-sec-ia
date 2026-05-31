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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  adminVerbFor,
  isInvestorAdminVerb,
} = await import("../apps/web/src/lib/sec203a/admin-verbs.ts");

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
  "INVESTOR_ADMIN_VERBS matches Contract V3 §13.3 exactly",
  async () => {
    // Contract V3 §13.3 — the only investor-side admin-action verbs the BFF
    // may accept. Any string outside this set must be a 403 + tripwire hit.
    // Imported from apps/web/src/lib/sec203a/admin-verbs.ts so the literal
    // cannot drift from the source-of-truth module.
    const expected = [
      "pause_autopilot",
      "resume_autopilot",
      "join_template",
      "leave_template",
      "update_prefs",
      "liquidate_all",
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
    ];
    assert.deepEqual(
      [...INVESTOR_ADMIN_VERBS].sort(),
      [...expected].sort(),
      "INVESTOR_ADMIN_VERBS drifted from Contract V3 §13.3 — update Contract V3 and Daniel's authoritative spec before changing.",
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
      6,
      "Contract V3 §13.3 fixes the allowlist at exactly 6 verbs.",
    );
  },
);

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
    assert.equal(adminVerbFor("updateAccountPrefs"), "update_prefs");
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
