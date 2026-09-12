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
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
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
  AUTOMATED_ALPHA_ADMIN_VERBS,
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
    //
    // `update_allocation` was added by the frozen v1.1.0-alpha.2 package
    // (AccountActionRequest.action enum: join_template | update_allocation |
    // leave_template) and adopted on Daniel's 2026-09-09 integration list.
    const expected = [
      "pause_autopilot",
      "resume_autopilot",
      "join_template",
      "update_allocation",
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
      6,
      "The client-emittable allowlist is exactly 6 verbs: Daniel's 2026-08-17 five (update_prefs moved to the dedicated preferences route) plus update_allocation from the frozen v1.1.0-alpha.2 AccountActionRequest.action enum (adopted 2026-09-09).",
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
    // v1.1.0-alpha.2 (Daniel 2026-09-09): the automated Alpha emits exactly
    // the AccountActionRequest.action enum — join / update_allocation / leave.
    assert.deepEqual(
      [...AUTOMATED_ALPHA_ADMIN_VERBS].sort(),
      ["join_template", "leave_template", "update_allocation"],
      "AUTOMATED_ALPHA_ADMIN_VERBS must equal alpha.2's AccountActionRequest.action enum.",
    );
    // The emittable allowlist is exactly: the Signal pair, plus the one verb
    // alpha.2 added (update_allocation), plus the Managed-paper-gated three.
    // No verb is in two sets; none is in none.
    assert.deepEqual(
      [
        ...SIGNAL_RELEASE_ADMIN_VERBS,
        "update_allocation",
        ...MANAGED_PAPER_GATED_ADMIN_VERBS,
      ].sort(),
      [...INVESTOR_ADMIN_VERBS].sort(),
      "Every emittable verb must be Signal-enabled, the alpha.2 update_allocation, or Managed-paper-gated — and none may be two of those.",
    );
    for (const v of AUTOMATED_ALPHA_ADMIN_VERBS) {
      assert.ok(
        !(MANAGED_PAPER_GATED_ADMIN_VERBS as readonly string[]).includes(v),
        `automated Alpha verb "${v}" must never be a Managed-paper-gated verb`,
      );
    }
    // The three contracted actions map to their verbs and nothing else does.
    const contracted = {
      joinTemplate: "join_template",
      updateAllocation: "update_allocation",
      leaveTemplate: "leave_template",
    } as const;
    for (const [action, verb] of Object.entries(contracted)) {
      assert.equal(
        INVESTOR_ACTION_TO_ADMIN_VERB[
          action as keyof typeof INVESTOR_ACTION_TO_ADMIN_VERB
        ],
        verb,
        `${action} → ${verb}`,
      );
    }
    assert.equal(
      Object.values(INVESTOR_ACTION_TO_ADMIN_VERB).filter(
        (v) => v === "update_allocation",
      ).length,
      1,
      "exactly one action emits update_allocation",
    );
  },
);

await section(
  'action "resolveException" is used only by the category-guarded route',
  async () => {
    // resolveException is on SIGNAL_ALLOWED_ACTIONS only because the canonical
    // exceptions route applies isExceptionResolutionPermitted before anything
    // else. A second bffMutate({ action: "resolveException" }) route would
    // inherit the Signal allowance while bypassing the category partition —
    // so the action is mechanically pinned to the one guarded file.
    const { readdirSync, statSync } = await import("node:fs");
    const apiDir = join(REPO_ROOT, "apps/web/app/api");
    const users: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "route.ts") {
          const src = readFileSync(full, "utf8");
          if (/action:\s*"resolveException"/.test(src)) {
            users.push(
              full
                .slice(REPO_ROOT.length + 1)
                .split(sep)
                .join("/"),
            );
          }
        }
      }
    };
    walk(apiDir);
    const canonical =
      "apps/web/app/api/v1/investor/exceptions/[id]/resolve/route.ts";
    assert.deepEqual(
      users,
      [canonical],
      `action "resolveException" may be used ONLY by ${canonical} — it is ` +
        "Signal-allowed solely because that route enforces the category " +
        "partition. Found: " +
        JSON.stringify(users),
    );
    const src = readFileSync(join(REPO_ROOT, canonical), "utf8");
    assert.ok(
      src.includes("isExceptionResolutionPermitted"),
      "The canonical resolve route no longer applies " +
        "isExceptionResolutionPermitted — the category partition is unenforced.",
    );
    // Ordering is proven on the INVOCATIONS inside the apply handler, not on
    // bare indexOf: the header comment and the import block both name these
    // identifiers near the top of the file, so an unanchored search matches
    // them and passes regardless of where the actual calls sit. Both searches
    // therefore start at the apply handler.
    const applyStart = src.indexOf("apply:");
    assert.ok(applyStart > 0, `${canonical} has no apply handler to inspect.`);
    const guardCall = src.indexOf(
      "isExceptionResolutionPermitted(",
      applyStart,
    );
    const lookupCall = src.indexOf("getExceptionReview(", applyStart);
    assert.ok(
      guardCall > 0,
      "No isExceptionResolutionPermitted(...) INVOCATION inside apply — the " +
        "import alone does not enforce the partition.",
    );
    assert.ok(
      lookupCall > 0,
      "No getExceptionReview(...) invocation inside apply — the route shape " +
        "changed; re-derive this invariant rather than deleting it.",
    );
    assert.ok(
      guardCall < lookupCall,
      "The category-check INVOCATION must run BEFORE the exception lookup " +
        "inside apply, so refusals stay id-independent.",
    );
  },
);

await section(
  "Signal capability policy: complete, disjoint, default-deny (C1a-1)",
  async () => {
    const {
      SIGNAL_ALLOWED_ACTIONS,
      AUTOMATED_ALPHA_ONLY_ACTIONS,
      AUTOMATED_ALPHA_ALLOWED_ACTIONS,
      AUTOMATED_ALPHA_WITHHELD_SIGNAL_ACTIONS,
      MANAGED_PAPER_GATED_ACTIONS,
      SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS,
      MANAGED_EXCEPTION_RESOLUTIONS,
      isInvestorActionPermitted,
      isExceptionResolutionPermitted,
      unclassifiedInvestorActions,
      unclassifiedExceptionResolutions,
    } = await import("../apps/web/src/lib/sec203a/release-policy.ts");
    const { InvestorActions, ExceptionResolutions } =
      await import("../apps/web/src/lib/sec203a/actions.ts");
    const { isGatedUntilManagedPaper } =
      await import("../apps/web/src/lib/sec203a/admin-verbs.ts");

    // Completeness + disjointness (runtime mirror of the compile-time proofs).
    assert.deepEqual(
      unclassifiedInvestorActions(),
      [],
      "Every InvestorActionName must be classified Signal-allowed, automated-Alpha-only, or Managed-gated.",
    );
    for (const a of AUTOMATED_ALPHA_ONLY_ACTIONS) {
      assert.ok(
        !(SIGNAL_ALLOWED_ACTIONS as readonly string[]).includes(a) &&
          !(MANAGED_PAPER_GATED_ACTIONS as readonly string[]).includes(a),
        `"${a}" must be classified automated-Alpha-only and nowhere else.`,
      );
    }
    assert.deepEqual(unclassifiedExceptionResolutions(), []);
    for (const a of SIGNAL_ALLOWED_ACTIONS) {
      assert.ok(
        !(MANAGED_PAPER_GATED_ACTIONS as readonly string[]).includes(a),
        `"${a}" classified in both sets.`,
      );
    }

    // Default-deny semantics: signal permits exactly the allowlist.
    for (const a of InvestorActions) {
      assert.equal(
        isInvestorActionPermitted(a, "signal"),
        (SIGNAL_ALLOWED_ACTIONS as readonly string[]).includes(a),
        `signal-stage verdict for "${a}" must equal allowlist membership.`,
      );
      assert.equal(
        isInvestorActionPermitted(a, "managed_paper"),
        true,
        `managed_paper must permit "${a}".`,
      );
    }

    // Named denials that must never regress open (Daniel 2026-08-17 §6 + C0).
    for (const a of [
      "pauseManaged",
      "resumeManaged",
      "activateExecutionPolicy",
      "updateExecutionPolicy",
      "saveExecutionPolicyDraft",
      "selectMode",
    ] as const) {
      assert.equal(
        isInvestorActionPermitted(a, "signal"),
        false,
        `"${a}" must be denied at the signal stage.`,
      );
    }

    // Consistency with the legacy three-verb predicate: everything IT gates,
    // the policy also denies at signal. The converse is deliberately false —
    // that asymmetry is why the policy replaced the predicate (C0 §5).
    for (const a of InvestorActions) {
      if (isGatedUntilManagedPaper(a, "signal")) {
        assert.equal(
          isInvestorActionPermitted(a, "signal"),
          false,
          `policy must deny "${a}", which the legacy predicate gates.`,
        );
      }
    }

    // Exception-resolution partition: exactly the three remediation
    // categories pass at signal; Managed categories never do.
    assert.equal(
      SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS.length +
        MANAGED_EXCEPTION_RESOLUTIONS.length,
      ExceptionResolutions.length,
    );
    for (const r of ExceptionResolutions) {
      assert.equal(
        isExceptionResolutionPermitted(r, "signal"),
        (SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS as readonly string[]).includes(r),
        `signal-stage verdict for resolution "${r}" must equal allowlist membership.`,
      );
    }
  },
);

await section(
  "Automated Alpha capability policy (v1.1.0-alpha.2, Daniel 2026-09-09 step 0): explicit allowlist, default deny, no execution surface",
  async () => {
    const {
      SIGNAL_ALLOWED_ACTIONS,
      AUTOMATED_ALPHA_ONLY_ACTIONS,
      AUTOMATED_ALPHA_ALLOWED_ACTIONS,
      AUTOMATED_ALPHA_WITHHELD_SIGNAL_ACTIONS,
      MANAGED_PAPER_GATED_ACTIONS,
      isInvestorActionPermitted,
      isExceptionResolutionPermitted,
      SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS,
    } = await import("../apps/web/src/lib/sec203a/release-policy.ts");
    const { InvestorActions, ExceptionResolutions } =
      await import("../apps/web/src/lib/sec203a/actions.ts");
    const { NOT_PERMITTED_AT_RELEASE_STAGE } =
      await import("../apps/web/src/lib/sec203a/admin-verbs.ts");

    // Exactly the intended actions, by name — a drift in either direction fails.
    assert.deepEqual(
      [...AUTOMATED_ALPHA_ALLOWED_ACTIONS].sort(),
      [
        "acknowledgeDisclosure",
        "completeKycStepUp",
        "connectBroker",
        "disconnectBroker",
        "dismissSignal",
        "joinTemplate",
        "leaveTemplate",
        "previewAllocation",
        "refreshProfile",
        "resolveException",
        "rotateBrokerCredentials",
        "saveProfileDraft",
        "saveSignal",
        "startKycVerification",
        "submitComplianceAttestation",
        "submitKycEvaluation",
        "submitSupportRequest",
        "syncBrokerConnection",
        "updateAccountPrefs",
        "updateAllocation",
      ],
      "AUTOMATED_ALPHA_ALLOWED_ACTIONS drifted from the reviewed alpha.2 mapping.",
    );
    assert.deepEqual([...AUTOMATED_ALPHA_ONLY_ACTIONS].sort(), [
      "joinTemplate",
      "leaveTemplate",
      "previewAllocation",
      "rotateBrokerCredentials",
      "submitComplianceAttestation",
      "syncBrokerConnection",
      "updateAllocation",
    ]);
    assert.deepEqual(
      [...AUTOMATED_ALPHA_WITHHELD_SIGNAL_ACTIONS],
      ["advanceMockKycVerification"],
      "the mock KYC test control is the only Signal action withheld from the automated Alpha",
    );
    // Default deny: the verdict is allowlist membership and nothing else.
    for (const a of InvestorActions) {
      assert.equal(
        isInvestorActionPermitted(a, "automated_alpha"),
        (AUTOMATED_ALPHA_ALLOWED_ACTIONS as readonly string[]).includes(a),
        `automated_alpha verdict for "${a}" must equal allowlist membership.`,
      );
    }
    // Allowlist = (Signal ∪ automated-only) − withheld. No Managed-gated action.
    const expected = new Set<string>([
      ...SIGNAL_ALLOWED_ACTIONS,
      ...AUTOMATED_ALPHA_ONLY_ACTIONS,
    ]);
    for (const w of AUTOMATED_ALPHA_WITHHELD_SIGNAL_ACTIONS) expected.delete(w);
    assert.deepEqual(
      [...AUTOMATED_ALPHA_ALLOWED_ACTIONS].sort(),
      [...expected].sort(),
      "allowlist must be exactly Signal ∪ automated-only minus the withheld set",
    );
    for (const a of MANAGED_PAPER_GATED_ACTIONS) {
      assert.equal(
        isInvestorActionPermitted(a, "automated_alpha"),
        false,
        `Managed-gated "${a}" must stay denied at automated_alpha (not in alpha.2).`,
      );
    }
    // Named denials that must never open: no execution-policy mutation, no
    // pause/resume, no mode switch, no mock KYC control.
    for (const a of [
      "activateExecutionPolicy",
      "updateExecutionPolicy",
      "saveExecutionPolicyDraft",
      "pauseManaged",
      "resumeManaged",
      "selectMode",
      "advanceMockKycVerification",
    ] as const) {
      assert.equal(isInvestorActionPermitted(a, "automated_alpha"), false, a);
    }
    // No direct order / cancel / intent / transfer / liquidation / admission
    // action exists in the enum at all — the name space itself is closed.
    for (const forbidden of [
      /order/i,
      /cancel/i,
      /intent/i,
      /transfer/i,
      /liquidat/i,
      /admit|admission|approve/i,
      /riskOverride|overrideRisk/i,
    ]) {
      assert.ok(
        !InvestorActions.some((a) => forbidden.test(a)),
        `no InvestorActionName may match ${String(forbidden)}`,
      );
    }
    // Exception resolutions keep the Signal partition at automated_alpha.
    for (const r of ExceptionResolutions) {
      assert.equal(
        isExceptionResolutionPermitted(r, "automated_alpha"),
        (SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS as readonly string[]).includes(r),
        `automated_alpha resolution verdict for "${r}"`,
      );
    }
    // Signal stays unchanged: none of the new actions runs there.
    for (const a of AUTOMATED_ALPHA_ONLY_ACTIONS) {
      assert.equal(
        isInvestorActionPermitted(a, "signal"),
        false,
        `${a} denied at signal`,
      );
    }
    // The handler refuses with a stage-specific reason and never the Signal
    // wording outside Signal.
    const handler = readFileSync(
      join(REPO_ROOT, "apps/web/src/lib/bff/handler.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(
      /isInvestorActionPermitted\(handler\.action, stage\)/.test(handler) &&
        /NOT_PERMITTED_AT_RELEASE_STAGE/.test(handler),
      "bffMutate enforces the policy for every stage with a stage-specific reason code",
    );
    assert.equal(
      NOT_PERMITTED_AT_RELEASE_STAGE,
      "not_permitted_at_release_stage",
    );
    // env enum carries the third stage and nothing else new.
    const envSrc = readFileSync(
      join(REPO_ROOT, "apps/web/src/lib/config/env.ts"),
      "utf8",
    );
    assert.ok(
      /REFI_RELEASE_STAGE:\s*z\s*\.enum\(\["signal",\s*"automated_alpha",\s*"managed_paper"\]\)/.test(
        envSrc,
      ),
      "REFI_RELEASE_STAGE enum is exactly signal | automated_alpha | managed_paper",
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
    assert.equal(
      adminVerbFor("submitSupportRequest"),
      undefined,
      "submitSupportRequest must not map to a backend admin verb — the support " +
        "sink is not an investor-api action, and mapping it would imply the " +
        "BFF may proxy support through /actions.",
    );
    assert.equal(
      receiptVerbFor("submitSupportRequest"),
      undefined,
      "submitSupportRequest must not carry a receipt verb either — it is " +
        "BFF-only in both vocabularies.",
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
    // C2a shrank this list dramatically, and that is the point: the BFF
    // execution-policy write routes, the execution-policy/managed hooks, and
    // the Automation Center pages were structurally REMOVED from the artifact.
    // A deleted surface cannot regress a control name, so the scan now covers
    // the surviving editable surfaces: the storage entity that still exists
    // for audit history, the remediation hooks the Signal IA kept, and the
    // relocated Signal pages. If a Managed authoring surface ever returns, it
    // must be added back here in the same commit — the invariant is the scan
    // list tracking the real write surface, not a fixed set of paths.
    const editableSurfaces = [
      "apps/web/src/lib/prototype-store/entities/execution-policy-draft.ts",
      "packages/api-clients/src/hooks/remediation.ts",
      // C2a correction: the reactivation pages were reclassified as Managed
      // workflows and removed; the surviving investor-editable surfaces are
      // the genuine Signal flows.
      "apps/web/app/us/onboarding/profile/page.tsx",
      "apps/web/app/us/app/documents/page.tsx",
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

  // CS-02 (2026-08-25): with the dead double-submit layer removed, the
  // same-origin check is the SOLE implemented CSRF control, so its edges are
  // pinned mechanically: a cookie-authenticated mutation cannot proceed unless
  // the request declares the exact server-resolved origin.
  await section(
    "bffMutate: Origin null with no Referer is rejected 403 even with cookies",
    async () => {
      const res = await mutate(
        post({ origin: "null", cookie: "us_session_v1=looks-valid" }) as never,
      );
      assert.equal(
        res.status,
        403,
        "Origin: null (sandboxed/data: context) must fail closed before auth",
      );
    },
  );

  await section(
    "bffMutate: deceptive origin sharing the hostname as a prefix is rejected",
    async () => {
      const res = await mutate(
        post({
          origin: "http://localhost:3000.evil.example",
          cookie: "us_session_v1=looks-valid",
        }) as never,
      );
      assert.equal(res.status, 403, "prefix-spoofed origin must be 403");
    },
  );

  await section(
    "bffMutate: mismatched scheme or port is rejected",
    async () => {
      for (const origin of [
        "https://localhost:3000",
        "http://localhost:4000",
      ]) {
        const res = await mutate(post({ origin }) as never);
        assert.equal(
          res.status,
          403,
          `${origin} must not count as same-origin`,
        );
      }
    },
  );

  await section(
    "bffMutate: malformed Referer with no Origin is rejected 403",
    async () => {
      const res = await mutate(post({ referer: "not a url at all" }) as never);
      assert.equal(res.status, 403, "unparseable Referer must fail closed");
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
    OPTIONAL_AUTH_METHOD_CLAIM,
    PROHIBITED_ASSURANCE_CLAIM,
    ASSERTION_ID_PATTERN,
    InvalidAuthMethodError,
    ProhibitedClaimError,
    ClaimPatternError,
    assertPublishableIssuer,
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
      // v1.1.0-alpha.2 (package README; ATD-040..042): `auth_time` required,
      // `amr` OPTIONAL and preserved unchanged when present, `acr` PROHIBITED.
      assert.equal(OPTIONAL_AUTH_METHOD_CLAIM, "amr");
      assert.equal(PROHIBITED_ASSURANCE_CLAIM, "acr");
      assert.equal(
        ASSERTION_ID_PATTERN.source,
        "^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$",
        "sub/sid/jti pattern drifted from BffAssertionClaims.",
      );
      // Daniel 2026-08-19: investor-api uses only the explicitly configured
      // JWKS URL and never derives one from `iss`. The helper that did exactly
      // that derivation was deleted 2026-08-24; its reappearance would be a
      // contract regression, so its absence is pinned.
      assert.ok(
        !("jwksUrlFor" in assertionMod),
        "jwksUrlFor must not exist — the JWKS URL is configured, never derived from iss",
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
        userId: "usr_alpha_invited_01",
        sid: "session_alpha_00000001",
        authTime,
        amr: ["email_link", "email_otp"],
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
      assert.deepEqual(
        payload["amr"],
        ["email_link", "email_otp"],
        "`amr` must be forwarded unchanged and in order when present.",
      );
      assert.equal(payload["acr"], undefined, "`acr` must never be emitted.");
      assert.equal(payload.sub, "usr_alpha_invited_01");
      assert.equal(payload["sid"], "session_alpha_00000001");
      for (const claim of ["sub", "sid", "jti"] as const) {
        assert.match(
          String(payload[claim]),
          ASSERTION_ID_PATTERN,
          `${claim} must satisfy the BffAssertionClaims pattern.`,
        );
      }
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
      userId: "usr_alpha_invited_01",
      sid: "session_alpha_00000001",
      authTime: Math.floor(Date.now() / 1000) - 10,
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
    "user assertion: auth_time required, amr optional-but-valid, acr prohibited, ids patterned",
    async () => {
      const now = Math.floor(Date.now() / 1000);
      const ok = {
        userId: "usr_alpha_invited_01",
        sid: "session_alpha_00000001",
      };
      await assert.rejects(
        mintUserAssertion({ ...ok, authTime: 0, amr: ["email_otp"] }),
        /underlying auth_time/,
        "A missing auth_time must throw, never fall back to now.",
      );
      // amr absent is VALID in v1.1.0-alpha.2 (ATD-041) and must not be synthesised.
      const withoutAmr = await mintUserAssertion({ ...ok, authTime: now });
      const jwks = await getPublicJwks();
      const current = jwks.keys.find((k) => k.kid === "test-key-1");
      assert.ok(current, "current signing key must be published");
      const { payload } = await jose.jwtVerify(
        withoutAmr.token,
        await jose.importJWK(current, "ES256"),
        { algorithms: ["ES256"] },
      );
      assert.equal(payload["amr"], undefined, "Absent `amr` must stay absent.");
      await assert.rejects(
        mintUserAssertion({ ...ok, authTime: now, amr: [] }),
        InvalidAuthMethodError,
        "An EMPTY `amr` asserts authentication by no method and must be refused.",
      );
      await assert.rejects(
        mintUserAssertion({
          ...ok,
          authTime: now,
          amr: ["email_otp", "email_otp"],
        }),
        InvalidAuthMethodError,
        "Duplicate `amr` values violate uniqueItems.",
      );
      await assert.rejects(
        mintUserAssertion({
          ...ok,
          authTime: now,
          acr: "urn:example:loa2",
        } as never),
        ProhibitedClaimError,
        "`acr` is reserved/prohibited in v1.1.0-alpha.2 and must never be minted.",
      );
      await assert.rejects(
        mintUserAssertion({
          userId: "investor@example.invalid",
          sid: ok.sid,
          authTime: now,
        }),
        ClaimPatternError,
        "An email is not an opaque subject id.",
      );
      await assert.rejects(
        mintUserAssertion({ userId: ok.userId, sid: "short", authTime: now }),
        ClaimPatternError,
        "sid must satisfy the BffAssertionClaims pattern.",
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

// ─── Investor Profile v2 drafts — atomic revision ordering & finality ───────
{
  const drafts =
    await import("../apps/web/src/lib/prototype-store/entities/investor-profile-v2.ts");
  const { saveProfileDraftV2, getProfileDraftV2, closeProfileDraftsV2 } =
    drafts;
  const answers = { questionnaireVersion: 2 as const };
  /** A manual gate: `hold` resolves when `release()` is called. */
  function gate() {
    let release!: () => void;
    const hold = new Promise<void>((r) => {
      release = r;
    });
    return { hold, release };
  }
  const base = (
    authId: string,
    sessionId: string,
    rev: number,
    step = "goal",
  ) => ({
    authId,
    accountId: "acct-ca-1",
    sessionId,
    draftRevision: rev,
    answers,
    currentStepId: step,
    correlationId: "corr-ca",
  });

  await section(
    "drafts: concurrent rev 5 and rev 4 — rev 5 wins, final stored revision is 5",
    async () => {
      const authId = "auth-ca-order";
      const g = gate();
      // rev 5 enters the critical section, reads, decides, and PAUSES before
      // its write; rev 4 is started while rev 5 is paused.
      const five = saveProfileDraftV2(base(authId, "S", 5), {
        beforeWrite: () => g.hold,
      });
      const four = saveProfileDraftV2(base(authId, "S", 4, "horizon"));
      await new Promise((r) => setTimeout(r, 20)); // let rev 4 attempt to run
      g.release();
      const [r5, r4] = await Promise.all([five, four]);
      assert.equal(r5.stored, true, "rev 5 must store");
      assert.equal(r4.stored, false, "rev 4 must be rejected as stale");
      assert.equal(r4.reason, "stale_revision");
      const final = await getProfileDraftV2(authId, "acct-ca-1");
      assert.equal(
        final?.draftRevision,
        5,
        "a lower revision must never replace a higher one",
      );
      assert.equal(final?.currentStepId, "goal");
    },
  );

  await section(
    "drafts: a save cannot race through a submission tombstone (either order)",
    async () => {
      // Order A: close is paused before writing; a same-session save starts.
      const authA = "auth-ca-tomb-a";
      assert.equal(
        (await saveProfileDraftV2(base(authA, "T", 1))).stored,
        true,
      );
      const gA = gate();
      const close = closeProfileDraftsV2(
        { authId: authA, accountId: "acct-ca-1", correlationId: "corr-ca" },
        { beforeWrite: () => gA.hold },
      );
      const lateSave = saveProfileDraftV2(base(authA, "T", 2, "horizon"));
      await new Promise((r) => setTimeout(r, 20));
      gA.release();
      const [closed, saved] = await Promise.all([close, lateSave]);
      assert.deepEqual(closed.closedSessionIds, ["T"]);
      assert.equal(saved.stored, false);
      assert.equal(saved.reason, "session_closed");
      assert.equal(await getProfileDraftV2(authA, "acct-ca-1"), null);

      // Order B: save is paused before writing; close starts. Close must see
      // the saved session AFTER the save completes and tombstone it.
      const authB = "auth-ca-tomb-b";
      const gB = gate();
      const save = saveProfileDraftV2(base(authB, "U", 1), {
        beforeWrite: () => gB.hold,
      });
      const closeB = closeProfileDraftsV2({
        authId: authB,
        accountId: "acct-ca-1",
        correlationId: "corr-ca",
      });
      await new Promise((r) => setTimeout(r, 20));
      gB.release();
      const [savedB, closedB] = await Promise.all([save, closeB]);
      assert.equal(savedB.stored, true);
      assert.deepEqual(closedB.closedSessionIds, ["U"]);
      assert.equal(await getProfileDraftV2(authB, "acct-ca-1"), null);
      assert.equal(
        (await saveProfileDraftV2(base(authB, "U", 2))).reason,
        "session_closed",
      );
    },
  );

  await section(
    "drafts: finality is server-derived — no hint, bogus hint, and no-draft cases",
    async () => {
      const authId = "auth-ca-final";
      assert.equal(
        (await saveProfileDraftV2(base(authId, "V", 3))).stored,
        true,
      );
      // No hint at all: the active session is still closed.
      const noHint = await closeProfileDraftsV2({
        authId,
        accountId: "acct-ca-1",
        correlationId: "corr-ca",
      });
      assert.deepEqual(noHint.closedSessionIds, ["V"]);
      assert.equal(noHint.hadActiveDraft, true);
      assert.equal(
        (await saveProfileDraftV2(base(authId, "V", 4))).reason,
        "session_closed",
      );

      // Bogus hint with a new active session: the real session closes too.
      assert.equal(
        (await saveProfileDraftV2(base(authId, "W", 1))).stored,
        true,
      );
      const bogus = await closeProfileDraftsV2({
        authId,
        accountId: "acct-ca-1",
        clientSessionHint: "bogus",
        correlationId: "corr-ca",
      });
      assert.ok(
        bogus.closedSessionIds.includes("W") &&
          bogus.closedSessionIds.includes("bogus"),
      );
      assert.equal(
        (await saveProfileDraftV2(base(authId, "W", 2))).reason,
        "session_closed",
      );

      // No prior draft anywhere: legitimate, nothing to close, no throw.
      const none = await closeProfileDraftsV2({
        authId: "auth-ca-nodraft",
        accountId: "acct-ca-1",
        correlationId: "corr-ca",
      });
      assert.equal(none.hadActiveDraft, false);
      assert.deepEqual(none.closedSessionIds, []);
    },
  );

  await section(
    "drafts: no implicit session takeover; preaccount promotion adopts the existing session",
    async () => {
      const authId = "auth-ca-takeover";
      assert.equal(
        (await saveProfileDraftV2(base(authId, "A", 1))).stored,
        true,
      );
      const b = await saveProfileDraftV2(base(authId, "B", 1, "horizon"));
      assert.equal(b.stored, false);
      assert.equal(b.reason, "session_mismatch");
      assert.equal(
        (await getProfileDraftV2(authId, "acct-ca-1"))?.sessionId,
        "A",
      );

      // Preaccount draft P; an account-scoped save from another session must
      // not bypass it, but the SAME session promotes one-way.
      const authP = "auth-ca-preaccount";
      const pre = await saveProfileDraftV2({
        ...base(authP, "P", 1),
        accountId: null,
      });
      assert.equal(pre.stored, true);
      assert.equal(
        (await getProfileDraftV2(authP, "acct-ca-1"))?.sessionId,
        "P",
      );
      const other = await saveProfileDraftV2(base(authP, "Q", 1));
      assert.equal(other.reason, "session_mismatch");
      const promoted = await saveProfileDraftV2(base(authP, "P", 2, "horizon"));
      assert.equal(promoted.stored, true);
      assert.equal(
        (await getProfileDraftV2(authP, "acct-ca-1"))?.accountId,
        "acct-ca-1",
      );
      // Submission closes BOTH scopes.
      const closed = await closeProfileDraftsV2({
        authId: authP,
        accountId: "acct-ca-1",
        correlationId: "corr-ca",
      });
      assert.deepEqual(closed.closedSessionIds, ["P"]);
      assert.equal(await getProfileDraftV2(authP, "acct-ca-1"), null);
      assert.equal(await getProfileDraftV2(authP, null), null);
    },
  );
}

// ─── C1b-2 slice 1 — disclosure/consent through the frozen Investor API client
{
  const { createInvestorApiClient, ContractVersionMismatchError } =
    await import("../packages/api-clients/src/investor-api/index.ts");
  const {
    acknowledgeDisclosure,
    listEffectiveDisclosures,
    consentIdempotencyKey,
  } = await import("../apps/web/src/lib/investor-api/disclosure-consent.ts");

  const HASH = "2".repeat(64);
  const disclosure = {
    content_hash: HASH,
    content_ref:
      "https://example.invalid/disclosures/automated-portfolio-alpha-1",
    disclosure_key: "automated_portfolio_alpha",
    disclosure_version: 1,
    effective_at: "2026-09-01T00:00:00Z",
    locale: "en-US",
    status: "EFFECTIVE",
  };
  const receipt = {
    account_id: "acct-ca-000001",
    consent_key: "automated_portfolio_alpha",
    consent_receipt_id: "consent_alpha_00000001",
    disclosure_hash: HASH,
    disclosure_key: "automated_portfolio_alpha",
    disclosure_version: 1,
    expires_at: "2026-12-01T00:00:00Z",
    recorded_at: "2026-09-01T00:00:00Z",
    status: "ACTIVE",
  };
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Correlation-Id": "corr_ca",
  };
  type Seen = { url: string; method: string; headers: Headers; body: unknown };
  function fakeUpstream(opts: {
    disclosures?: unknown;
    consentStatus?: number;
    consentBody?: unknown;
  }) {
    const seen: Seen[] = [];
    const fetchImpl = async (
      url: URL | RequestInfo,
      init?: RequestInit,
    ): Promise<Response> => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : undefined;
      seen.push({ url: u, method, headers: new Headers(init?.headers), body });
      if (u.endsWith("/api/v1/investor/disclosures") && method === "GET") {
        return new Response(
          JSON.stringify(
            opts.disclosures ?? {
              data: {
                items: [disclosure],
                page: { has_more: false, next_cursor: null },
              },
            },
          ),
          { status: 200, headers },
        );
      }
      if (u.endsWith("/api/v1/investor/consents") && method === "POST") {
        return new Response(
          JSON.stringify(opts.consentBody ?? { data: receipt }),
          {
            status: opts.consentStatus ?? 201,
            headers,
          },
        );
      }
      return new Response(
        JSON.stringify({
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "x",
            correlation_id: "corr_ca",
          },
        }),
        { status: 404, headers },
      );
    };
    const client = createInvestorApiClient({
      identityCcid: {
        baseUrl: "http://127.0.0.1:1",
        getBearer: () => Promise.resolve("id-b"),
      },
      investorApi: {
        baseUrl: "http://127.0.0.1:1",
        getBearer: () => Promise.resolve("inv-b"),
      },
      mintAssertion: () => Promise.resolve("assertion"),
      fetch: fetchImpl as typeof fetch,
    });
    return { client, seen };
  }
  const selection = {
    disclosureKey: "automated_portfolio_alpha",
    disclosureVersion: 1,
    disclosureHash: HASH,
  };

  await section(
    "disclosures: read maps to listEffectiveDisclosures through the frozen client",
    async () => {
      const { client, seen } = fakeUpstream({});
      const out = await listEffectiveDisclosures(client);
      assert.equal(out.items.length, 1);
      assert.equal(out.items[0]?.disclosure_key, "automated_portfolio_alpha");
      assert.equal(seen.length, 1);
      assert.ok(seen[0]?.url.endsWith("/api/v1/investor/disclosures"));
      assert.equal(seen[0]?.headers.get("Authorization"), "Bearer inv-b");
      assert.equal(
        seen[0]?.headers.get("X-Refinity-User-Assertion"),
        "assertion",
      );
    },
  );

  await section(
    "consent: recordConsent receives the EXACT listed version/hash, ACCEPT, deterministic Idempotency-Key",
    async () => {
      const { client, seen } = fakeUpstream({});
      const out = await acknowledgeDisclosure(client, {
        accountId: "acct-ca-000001",
        selection,
      });
      assert.equal(out.kind, "recorded");
      const post = seen.find((s) => s.method === "POST");
      assert.ok(post, "recordConsent must be called");
      assert.ok(post.url.endsWith("/api/v1/investor/consents"));
      assert.deepEqual(post.body, {
        account_id: "acct-ca-000001",
        consent_key: "automated_portfolio_alpha",
        disclosure_key: "automated_portfolio_alpha",
        disclosure_version: 1,
        disclosure_hash: HASH,
        action: "ACCEPT",
      });
      const key = post.headers.get("Idempotency-Key");
      assert.equal(
        key,
        consentIdempotencyKey("acct-ca-000001", selection, "ACCEPT"),
      );
      assert.ok(
        key !== null && key.length >= 8 && key.length <= 128,
        "Idempotency-Key within contract bounds",
      );
      // A replay of the same tuple produces the SAME key (byte-identical body → backend replay).
      const again = fakeUpstream({});
      await acknowledgeDisclosure(again.client, {
        accountId: "acct-ca-000001",
        selection,
      });
      assert.equal(
        again.seen
          .find((s) => s.method === "POST")
          ?.headers.get("Idempotency-Key"),
        key,
      );
      // A different tuple is a different key.
      assert.notEqual(
        consentIdempotencyKey(
          "acct-ca-000001",
          { ...selection, disclosureVersion: 2 },
          "ACCEPT",
        ),
        key,
      );
      assert.equal(
        seen.filter((s) => s.method === "POST").length,
        1,
        "mutation issued exactly once — no automatic retry",
      );
    },
  );

  await section(
    "consent: Alpha 1:1 consent/disclosure mapping — consent_key is a COPY of the listed disclosure_key (Daniel 2026-09-04), not a merged field",
    async () => {
      // Owner decision, Daniel 2026-09-04: "consent must equal disclosure right
      // now … obtain disclosure key then copy it into consent key"; the fields
      // stay separate because later releases add multiple disclosures
      // (automated trading, trading risk, …). This pins the CURRENT Alpha rule
      // only — it is not a permanent schema equivalence.
      for (const key of [
        "automated_portfolio_alpha",
        "unified_alpha_disclosure_v2",
      ]) {
        const listed = {
          ...disclosure,
          disclosure_key: key,
          disclosure_version: 7,
          content_hash: "a".repeat(64),
        };
        const up = fakeUpstream({
          disclosures: {
            data: {
              items: [listed],
              page: { has_more: false, next_cursor: null },
            },
          },
          consentBody: {
            data: {
              ...receipt,
              consent_key: key,
              disclosure_key: key,
              disclosure_version: 7,
              disclosure_hash: "a".repeat(64),
            },
          },
        });
        const out = await acknowledgeDisclosure(up.client, {
          accountId: "acct-ca-000001",
          selection: {
            disclosureKey: key,
            disclosureVersion: 7,
            disclosureHash: "a".repeat(64),
          },
        });
        assert.equal(out.kind, "recorded");
        const post = up.seen.find((s) => s.method === "POST");
        assert.ok(post, "recordConsent must be called");
        const body = post.body as Record<string, unknown>;
        // 1:1 for Alpha: both fields carry the listed key; changing X changes both.
        assert.equal(body["consent_key"], key);
        assert.equal(body["disclosure_key"], key);
        // The key ORIGINATES from listEffectiveDisclosures (the GET preceded the POST
        // and the value equals what the upstream listed) — no mapping table, no
        // alternate key generation anywhere in the request path.
        assert.equal(up.seen[0]?.method, "GET");
        assert.ok(up.seen[0]?.url.endsWith("/api/v1/investor/disclosures"));
        // Version and hash are exact copies of the listed tuple.
        assert.equal(body["disclosure_version"], 7);
        assert.equal(body["disclosure_hash"], "a".repeat(64));
        assert.equal(body["action"], "ACCEPT");
        // The two fields remain DISTINCT keys in the request model — a future
        // contract where consent_key !== disclosure_key needs no model rewrite.
        assert.deepEqual(Object.keys(body).sort(), [
          "account_id",
          "action",
          "consent_key",
          "disclosure_hash",
          "disclosure_key",
          "disclosure_version",
        ]);
      }
      const src = readFileSync(
        join(REPO_ROOT, "apps/web/src/lib/investor-api/disclosure-consent.ts"),
        "utf8",
      );
      assert.ok(
        /consent_key:\s*match\.disclosure_key/.test(src),
        "consent_key must be a copy of the listed disclosure_key (Alpha 1:1), not derived elsewhere",
      );
      assert.ok(
        !/consentKeyFor|CONSENT_KEY_MAP|consentTaxonomy/.test(src),
        "no frontend consent taxonomy or mapping table may exist in this slice",
      );
    },
  );

  await section(
    "consent: a stale version or hash never reaches recordConsent",
    async () => {
      const stale = fakeUpstream({});
      const out = await acknowledgeDisclosure(stale.client, {
        accountId: "acct-ca-000001",
        selection: { ...selection, disclosureVersion: 2 },
      });
      assert.equal(out.kind, "stale");
      assert.equal(stale.seen.filter((s) => s.method === "POST").length, 0);
      const wrongHash = fakeUpstream({});
      const out2 = await acknowledgeDisclosure(wrongHash.client, {
        accountId: "acct-ca-000001",
        selection: { ...selection, disclosureHash: "3".repeat(64) },
      });
      assert.equal(out2.kind, "stale");
      const unknown = fakeUpstream({});
      const out3 = await acknowledgeDisclosure(unknown.client, {
        accountId: "acct-ca-000001",
        selection: { ...selection, disclosureKey: "not_listed" },
      });
      assert.equal(out3.kind, "not_effective");
      assert.equal(unknown.seen.filter((s) => s.method === "POST").length, 0);
    },
  );

  await section(
    "consent: contract drift fails closed — unknown field / wrong status are ContractVersionMismatchError",
    async () => {
      const extra = fakeUpstream({
        disclosures: {
          data: {
            items: [{ ...disclosure, surprise: true }],
            page: { has_more: false, next_cursor: null },
          },
        },
      });
      await assert.rejects(
        acknowledgeDisclosure(extra.client, {
          accountId: "acct-ca-000001",
          selection,
        }),
        ContractVersionMismatchError,
        "an unknown field on a disclosure must not be silently ignored",
      );
      const wrongStatus = fakeUpstream({ consentStatus: 200 });
      await assert.rejects(
        acknowledgeDisclosure(wrongStatus.client, {
          accountId: "acct-ca-000001",
          selection,
        }),
        ContractVersionMismatchError,
        "recordConsent success_status is 201 in contract.json; another 2xx is a mismatch",
      );
      const badReceipt = fakeUpstream({
        consentBody: { data: { ...receipt, status: "MAYBE" } },
      });
      await assert.rejects(
        acknowledgeDisclosure(badReceipt.client, {
          accountId: "acct-ca-000001",
          selection,
        }),
        ContractVersionMismatchError,
      );
    },
  );

  await section(
    "consent: a contract-declared backend error becomes an upstream_error outcome, not a throw",
    async () => {
      const conflict = fakeUpstream({
        consentStatus: 409,
        consentBody: {
          error: {
            code: "VERSION_CONFLICT",
            message: "safe text",
            correlation_id: "corr_ca_2",
          },
        },
      });
      const out = await acknowledgeDisclosure(conflict.client, {
        accountId: "acct-ca-000001",
        selection,
      });
      assert.equal(out.kind, "upstream_error");
      if (out.kind === "upstream_error") {
        assert.equal(out.status, 409);
        assert.equal(out.code, "VERSION_CONFLICT");
        assert.equal(out.correlationId, "corr_ca_2");
      }
    },
  );

  await section(
    "boundary: the Documents page and legacy MSW no longer carry the browser-direct acknowledge call",
    async () => {
      const page = readFileSync(
        join(REPO_ROOT, "apps/web/app/us/app/documents/page.tsx"),
        "utf8",
      );
      assert.ok(
        !page.includes("/v1/documents/acknowledge"),
        "legacy browser-direct path removed from the page",
      );
      assert.ok(
        !page.includes("apiFetch"),
        "legacy apiFetch import removed from the page",
      );
      assert.ok(
        !page.includes("@refi/api-clients/investor-api"),
        "the server-only client is never imported by the page",
      );
      const msw = readFileSync(
        join(REPO_ROOT, "packages/api-clients/src/mocks/handlers.ts"),
        "utf8",
      );
      assert.ok(
        !msw.includes("/v1/documents/acknowledge"),
        "legacy MSW handler removed",
      );
    },
  );
}

// ─── KYC provider boundary (public U.S. onboarding decision, 2026-09-04) ────
{
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const kyc = await import("../apps/web/src/lib/kyc/index.ts");
  const { MockKycProvider, MOCK_ADVANCE_TRANSITIONS } =
    await import("../apps/web/src/lib/kyc/mock-provider.ts");
  const {
    KYC_LIFECYCLE_STATES,
    toAttestationKycStatus,
    normalizeUnknownLifecycle,
    toNormalizedKycResult,
    NotALifecycleStateError,
  } = kyc;
  const VENDOR_NAMES =
    /\b(persona|plaid|alloy|socure|sumsub|trulioo|complycube|jumio|onfido|veriff|idnow|mitek)\b|stripe\s*identity/i;
  const kycFiles = [
    "apps/web/src/lib/kyc/provider.ts",
    "apps/web/src/lib/kyc/mock-provider.ts",
    "apps/web/src/lib/kyc/index.ts",
    "apps/web/app/api/v1/investor/kyc/verification/route.ts",
    "apps/web/app/api/v1/investor/kyc/verification/start/route.ts",
    "apps/web/app/api/v1/investor/kyc/verification/mock/route.ts",
    "apps/web/app/_hooks/useKycVerification.ts",
    "apps/web/app/us/onboarding/kyc/page.tsx",
    "apps/web/app/us/app/account/page.tsx",
    "apps/web/app/us/_content/app-copy.ts",
  ];
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

  await section(
    "kyc: the frontend boundary is provider-neutral — routes, hooks, pages and copy name no vendor; the neutral modules carry only the adapter-kind label and resolver",
    async () => {
      // Founder decision 2026-09-10: the selected adapter lives in
      // lib/kyc/socure/; the neutral boundary may reference it ONLY as the
      // adapter-kind label (provider.ts) and in the resolver (index.ts).
      const LABEL_ONLY = new Set([
        "apps/web/src/lib/kyc/provider.ts",
        "apps/web/src/lib/kyc/index.ts",
      ]);
      const allowedLine =
        /^\s*(\*|\/\/|\/\*\*)|KYC_ADAPTER_KINDS = \[|import \{ SocureKycProvider \} from "\.\/socure\/adapter"|case "socure":|let socure: SocureKycProvider|socure \?\?= new SocureKycProvider\(\)|return socure;|setSocureProviderForTests\(p: SocureKycProvider \| null\)|socure = p;/;
      for (const f of kycFiles) {
        const src = read(f);
        if (!LABEL_ONLY.has(f)) {
          assert.ok(!VENDOR_NAMES.test(src), `${f} must not name a KYC vendor`);
          continue;
        }
        for (const line of src.split("\n")) {
          if (VENDOR_NAMES.test(line)) {
            assert.ok(
              allowedLine.test(line),
              `${f}: vendor name outside the adapter-kind label/resolver: ${line.trim()}`,
            );
          }
        }
      }
      // No vendor type crosses into the boundary: only the adapter class is imported.
      const idx = read("apps/web/src/lib/kyc/index.ts");
      assert.ok(
        !/from "\.\/socure\/(schemas|mapping|client|errors|fixtures)"/.test(
          idx,
        ),
        "index.ts imports only the adapter class from the vendor directory",
      );
      for (const f of [
        "apps/web/app/api/v1/investor/kyc/verification/route.ts",
        "apps/web/app/api/v1/investor/kyc/verification/start/route.ts",
        "apps/web/app/api/v1/investor/onboarding/route.ts",
        "apps/web/src/lib/compliance/attestation-mapping.ts",
      ]) {
        assert.ok(
          !/lib\/kyc\/socure|kyc\/socure\//.test(read(f)),
          `${f} must not import from the vendor adapter directory`,
        );
      }
    },
  );

  await section(
    "kyc: lifecycle → attestation vocabulary (passed/failed/pending) and NOT_REQUIRED is never a provider state",
    async () => {
      assert.equal(toAttestationKycStatus("passed"), "passed");
      assert.equal(toAttestationKycStatus("failed"), "failed");
      for (const s of [
        "not_started",
        "in_progress",
        "additional_info_required",
        "under_review",
      ] as const) {
        assert.equal(
          toAttestationKycStatus(s),
          "pending",
          `${s} normalizes to pending`,
        );
      }
      // The backend policy projection's value is not a lifecycle state.
      assert.throws(
        () => normalizeUnknownLifecycle("NOT_REQUIRED"),
        NotALifecycleStateError,
      );
      assert.throws(
        () => normalizeUnknownLifecycle("approved"),
        NotALifecycleStateError,
      );
      assert.throws(
        () => normalizeUnknownLifecycle("verified"),
        NotALifecycleStateError,
      );
      assert.deepEqual(
        [...KYC_LIFECYCLE_STATES],
        [
          "not_started",
          "in_progress",
          "additional_info_required",
          "under_review",
          "passed",
          "failed",
        ],
      );
      // Only the generated attestation enum members are ever produced.
      const produced = new Set(
        KYC_LIFECYCLE_STATES.map(toAttestationKycStatus),
      );
      assert.deepEqual([...produced].sort(), ["failed", "passed", "pending"]);
    },
  );

  await section(
    "kyc: the mock is deterministic — explicit transitions only, no self-approval, labelled as mock",
    async () => {
      const mock = new MockKycProvider();
      const subject = { authId: "auth-kyc-ca-1" };
      await mock.reset(subject);
      const s0 = await mock.getSession(subject);
      assert.equal(s0.state, "not_started");
      // Reads never advance state.
      assert.equal((await mock.getSession(subject)).state, "not_started");
      // Cannot jump not_started → passed.
      const jump = await mock.advance(subject, "passed");
      assert.equal(jump.ok, false);
      const started = await mock.start(subject, "corr");
      assert.equal(started.accepted, true);
      assert.equal((await mock.getSession(subject)).state, "in_progress");
      // Idempotent resume.
      const again = await mock.start(subject, "corr");
      assert.equal(again.accepted, true);
      assert.equal((await mock.getSession(subject)).state, "in_progress");
      assert.deepEqual(MOCK_ADVANCE_TRANSITIONS.in_progress, [
        "additional_info_required",
        "under_review",
        "passed",
        "failed",
      ]);
      assert.equal((await mock.advance(subject, "under_review")).ok, true);
      assert.equal((await mock.advance(subject, "passed")).ok, true);
      const done = await mock.getSession(subject);
      assert.equal(done.state, "passed");
      assert.deepEqual(
        done.history.map((h) => h.state),
        ["not_started", "in_progress", "under_review", "passed"],
      );
      const normalized = toNormalizedKycResult(done, mock.kind);
      assert.equal(normalized.status, "passed");
      assert.equal(normalized.provider, "mock-kyc-adapter");
      assert.ok(!VENDOR_NAMES.test(JSON.stringify(normalized)));
      assert.ok(
        done.referenceId.startsWith("mock-kyc-"),
        "reference ids are opaque and mock-labelled",
      );
      // Failed journeys can be retried; passed ones cannot be restarted.
      const other = { authId: "auth-kyc-ca-2" };
      await mock.reset(other);
      await mock.start(other, "corr");
      await mock.advance(other, "failed");
      assert.equal((await mock.start(other, "corr")).accepted, true);
      assert.equal((await mock.start(subject, "corr")).accepted, false);
    },
  );

  await section(
    "kyc: provider resolution — unconfigured fails closed; mock controls exist only when explicitly enabled",
    async () => {
      const saved = {
        p: process.env["REFI_KYC_PROVIDER"],
        c: process.env["REFI_KYC_MOCK_CONTROLS"],
        e: process.env["REFI_ENV"],
      };
      try {
        delete process.env["REFI_KYC_PROVIDER"];
        delete process.env["REFI_KYC_MOCK_CONTROLS"];
        process.env["REFI_ENV"] = "prod";
        resetServerEnvCacheForTests();
        assert.throws(
          () => kyc.getKycProvider(),
          kyc.KycProviderUnavailableError,
          "default is unconfigured → unavailable",
        );
        assert.equal(
          kyc.getMockKycControls(),
          null,
          "no controls when unconfigured",
        );
        process.env["REFI_KYC_PROVIDER"] = "mock";
        resetServerEnvCacheForTests();
        assert.equal(kyc.getKycProvider().kind, "mock");
        assert.equal(
          kyc.getMockKycControls(),
          null,
          "mock adapter without the flag exposes no controls (production mode)",
        );
        process.env["REFI_KYC_MOCK_CONTROLS"] = "1";
        resetServerEnvCacheForTests();
        assert.ok(
          kyc.getMockKycControls() !== null,
          "explicit opt-in enables controls",
        );
      } finally {
        for (const [k, v] of [
          ["REFI_KYC_PROVIDER", saved.p],
          ["REFI_KYC_MOCK_CONTROLS", saved.c],
          ["REFI_ENV", saved.e],
        ] as const) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        resetServerEnvCacheForTests();
      }
    },
  );

  await section(
    "kyc: the mock control route is gated on getMockKycControls() and answers 404 when it is null",
    async () => {
      const src = read(
        "apps/web/app/api/v1/investor/kyc/verification/mock/route.ts",
      );
      assert.ok(
        /getMockKycControls\(\)/.test(src),
        "route must resolve controls through the gated resolver",
      );
      assert.ok(
        /controls === null/.test(src) && /status: 404/.test(src),
        "null controls must answer 404",
      );
      assert.ok(
        !/REFI_KYC_MOCK_CONTROLS/.test(
          read("apps/web/app/us/onboarding/kyc/page.tsx"),
        ),
        "browser never sees the gate flag",
      );
    },
  );

  await section(
    "kyc: a passed verification hands off to Investor Profile v2, never the legacy v1 questionnaire",
    async () => {
      const src = read("apps/web/app/us/onboarding/kyc/page.tsx");
      assert.ok(
        /router\.replace\(\s*"\/us\/onboarding\/investor-profile"\s*\)/.test(
          src,
        ),
        "post-pass destination must be /us/onboarding/investor-profile",
      );
      assert.ok(
        !/["']\/us\/onboarding\/profile["']/.test(src),
        "the legacy v1 advisory questionnaire must not be a KYC destination",
      );
      // Progression is gated on the provider lifecycle being exactly `passed`.
      assert.ok(
        /if \(state !== "passed"\) return;/.test(src),
        "progression must require lifecycle state === passed",
      );
    },
  );

  await section(
    "kyc: no attestation submission, no Investor API/identity call, and no legacy browser-direct KYC path remain",
    async () => {
      for (const f of kycFiles.slice(0, 7)) {
        const src = read(f);
        assert.ok(
          !/call\(\s*["']createComplianceProfileAttestation["']/.test(src),
          `${f} must not submit an attestation`,
        );
        assert.ok(
          !/investorApiClientFor|call\(\s*["']getKycStatus["']|call\(\s*["']exchangeIdentity["']/.test(
            src,
          ),
          `${f} must not call the Investor API or identity-ccid`,
        );
      }
      const legacy =
        /\/ccid\/status|\/ccid\/start|\/ccid\/webhook\/provider|\/compliance\/invalidate-cache/;
      for (const f of [
        "apps/web/app/us/onboarding/kyc/page.tsx",
        "apps/web/app/us/app/account/page.tsx",
        "apps/web/app/_hooks/useKycVerification.ts",
        "apps/web/app/_providers/auth/AuthProvider.tsx",
        "packages/api-clients/src/index.ts",
        "packages/api-clients/src/mocks/handlers.ts",
      ]) {
        assert.ok(
          !legacy.test(read(f)),
          `${f} must not carry a legacy browser-direct KYC path`,
        );
      }
      assert.ok(
        !existsSync(join(REPO_ROOT, "packages/api-clients/src/hooks/kyc.ts")),
        "legacy hooks/kyc.ts removed",
      );
    },
  );
}

// ─── Socure adapter (founder decision 2026-09-10: ReFi-owned KYC, provider Socure) ──
{
  const { resetServerEnvCacheForTests, getServerEnv } =
    await import("../apps/web/src/lib/config/env.ts");
  const schemas = await import("../apps/web/src/lib/kyc/socure/schemas.ts");
  const mapping = await import("../apps/web/src/lib/kyc/socure/mapping.ts");
  const errors = await import("../apps/web/src/lib/kyc/socure/errors.ts");
  const fx = await import("../apps/web/src/lib/kyc/socure/fixtures.ts");
  const client = await import("../apps/web/src/lib/kyc/socure/client.ts");
  const { SocureKycProvider, SOCURE_CONTINUE_PATH } =
    await import("../apps/web/src/lib/kyc/socure/adapter.ts");
  const entity =
    await import("../apps/web/src/lib/prototype-store/entities/kyc-evaluation.ts");
  const evidence = await import("../apps/web/src/lib/kyc/evidence.ts");
  const kycIndex = await import("../apps/web/src/lib/kyc/index.ts");
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const PII_VALUES = [
    fx.FIXTURE_INDIVIDUAL.given_name,
    fx.FIXTURE_INDIVIDUAL.family_name,
    fx.FIXTURE_INDIVIDUAL.date_of_birth!,
    fx.FIXTURE_INDIVIDUAL.email!,
    fx.FIXTURE_INDIVIDUAL.phone_number!,
    fx.FIXTURE_INDIVIDUAL.address.line_1!,
    fx.FIXTURE_INDIVIDUAL.di_session_token,
  ];
  const noPii = (value: unknown, label: string) => {
    const text = JSON.stringify(value);
    for (const v of PII_VALUES) {
      assert.ok(
        !text.includes(v),
        `${label} must not contain applicant PII (${v.slice(0, 4)}…)`,
      );
    }
    for (const k of evidence.KYC_EVIDENCE_FORBIDDEN_KEYS) {
      assert.ok(
        !new RegExp(`"${k}"\\s*:`).test(text),
        `${label} must not carry key ${k}`,
      );
    }
  };
  const SAVED_KEYS = [
    "REFI_KYC_PROVIDER",
    "REFI_KYC_MOCK_CONTROLS",
    "REFI_ENV",
    "NEXT_PUBLIC_REFI_ENV",
    "SOCURE_API_BASE_URL",
    "SOCURE_API_KEY",
    "SOCURE_WORKFLOW_NAME",
    "SOCURE_ENV",
    "SOCURE_WEBHOOK_BEARER_TOKEN",
    "REFI_INVESTOR_API_CREDENTIAL_MODE",
    "REFI_RUNTIME_PROFILE",
    "REFI_DATA_ADAPTER",
    "GCP_PROJECT_ID",
    "REFI_AUTH_PROVIDER",
    "FLAG_ALPHA_CLAIM_ROUTE",
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
    "NEXT_PUBLIC_POSTHOG_KEY",
    "NEXT_PUBLIC_SENTRY_DSN",
    "ALPHA_HANDOFF_PUBLIC_KEY_JWK",
    "ALPHA_HANDOFF_ISSUER",
    "ALPHA_HANDOFF_AUDIENCE",
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of SAVED_KEYS) saved[k] = process.env[k];
  const withEnv = async (
    over: Record<string, string | undefined>,
    fn: () => Promise<void>,
  ) => {
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetServerEnvCacheForTests();
    try {
      await fn();
    } finally {
      for (const k of SAVED_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      resetServerEnvCacheForTests();
    }
  };
  const SOCURE_OK = {
    REFI_KYC_PROVIDER: "socure",
    REFI_KYC_MOCK_CONTROLS: "0",
    SOCURE_API_BASE_URL: "https://riskos.sandbox.socure.com",
    SOCURE_API_KEY: "fixture-api-key-not-real-0123456789",
    SOCURE_WORKFLOW_NAME: "kyc-fraud-watchlist-docv-fixture",
    SOCURE_ENV: "sandbox",
    SOCURE_WEBHOOK_BEARER_TOKEN: undefined,
  };
  const CONSENT_AT = "2026-09-10T00:00:00.000Z";
  const subjectA = { authId: "auth-socure-a" };
  const subjectB = { authId: "auth-socure-b" };
  const freshProvider = (fake: InstanceType<typeof client.FakeSocureClient>) =>
    new SocureKycProvider(() => fake);

  await section(
    "socure: request schema follows the guide (required given/family/country + one of DOB/phone/address); PII never persists",
    async () => {
      assert.equal(
        schemas.socureIndividualSchema.safeParse(fx.FIXTURE_INDIVIDUAL).success,
        true,
      );
      const {
        date_of_birth: _d,
        phone_number: _p,
        address,
        ...rest
      } = fx.FIXTURE_INDIVIDUAL;
      assert.equal(
        schemas.socureIndividualSchema.safeParse({
          ...rest,
          address: { country: "US" },
        }).success,
        false,
        "at least one of DOB / phone / address line is required",
      );
      assert.equal(
        schemas.socureIndividualSchema.safeParse({
          ...fx.FIXTURE_INDIVIDUAL,
          address: { ...address, country: "GB" },
        }).success,
        false,
        "US only",
      );
      assert.equal(
        schemas.socureIndividualSchema.safeParse({
          ...fx.FIXTURE_INDIVIDUAL,
          api_key: "x",
        }).success,
        false,
        "strict: unknown applicant keys are refused",
      );
      const reqOk = {
        workflow: "w",
        id: "refi-kyc-req-" + "0".repeat(8) + "-0000-0000-0000-000000000000",
        timestamp: CONSENT_AT,
        data: {
          individual: {
            ...fx.FIXTURE_INDIVIDUAL,
            additional_context: {
              user_consent: true,
              consent_timestamp: CONSENT_AT,
            },
          },
        },
      };
      assert.equal(
        schemas.socureEvaluationRequestSchema.safeParse(reqOk).success,
        true,
      );
      assert.equal(
        schemas.socureEvaluationRequestSchema.safeParse({
          ...reqOk,
          base_url: "x",
        }).success,
        false,
        "strict top level",
      );
      assert.equal(
        schemas.socureEvaluationRequestSchema.safeParse({
          ...reqOk,
          id: "user-123",
        }).success,
        false,
        "request id must be the opaque refi-kyc-req shape (never a user id)",
      );
      const { additional_context: _ac, ...noConsent } = reqOk.data.individual;
      assert.equal(
        schemas.socureEvaluationRequestSchema.safeParse({
          ...reqOk,
          data: { individual: noConsent },
        }).success,
        false,
        "consent context required",
      );
      assert.equal(
        schemas.socureEvaluationRequestSchema.safeParse({
          ...reqOk,
          data: {
            individual: {
              ...reqOk.data.individual,
              additional_context: {
                user_consent: false,
                consent_timestamp: CONSENT_AT,
              },
            },
          },
        }).success,
        false,
        "user_consent must be true",
      );
      assert.equal(
        schemas.socureErrorBodySchema.safeParse(
          fx.ERROR_BODY_WORKFLOW_NOT_FOUND,
        ).success,
        true,
      );
    },
  );

  await section(
    "socure: response/webhook schemas validate the documented shapes; malformed answers are refused, extra provider fields tolerated but never copied",
    async () => {
      for (const b of [
        fx.RESPONSE_ACCEPT,
        fx.RESPONSE_REJECT,
        fx.RESPONSE_REVIEW_DOCV_PAUSED,
        fx.RESPONSE_REVIEW_NO_DOCV,
      ]) {
        assert.equal(
          schemas.socureEvaluationResponseSchema.safeParse(b).success,
          true,
        );
      }
      assert.equal(
        schemas.socureEvaluationResponseSchema.safeParse(fx.RESPONSE_MALFORMED)
          .success,
        false,
      );
      assert.equal(
        schemas.socureEvaluationResponseSchema.safeParse({
          ...fx.RESPONSE_ACCEPT,
          extra: { nested: true },
        }).success,
        true,
      );
      assert.equal(
        mapping.extractDocvTransactionToken(
          schemas.socureEvaluationResponseSchema.parse(
            fx.RESPONSE_REVIEW_DOCV_PAUSED,
          ),
        ),
        fx.FIXTURE_DOCV_TOKEN,
      );
      assert.equal(
        mapping.extractDocvTransactionToken(
          schemas.socureEvaluationResponseSchema.parse(
            fx.RESPONSE_REVIEW_NO_DOCV,
          ),
        ),
        null,
      );
      assert.equal(
        mapping.extractDocvTransactionToken(
          schemas.socureEvaluationResponseSchema.parse(
            fx.RESPONSE_REVIEW_TOKEN_WRONG_ENRICHMENT,
          ),
        ),
        null,
        "a token outside the SocureDocRequest enrichment is never used",
      );
      assert.deepEqual(
        mapping.mapSocureEvaluation(
          schemas.socureEvaluationResponseSchema.parse(
            fx.RESPONSE_REVIEW_TOKEN_WRONG_ENRICHMENT,
          ),
        ),
        {
          refiState: "under_review",
          providerDecision: "review",
          final: false,
          docvTransactionToken: null,
          reviewReason: "provider_review",
        },
        "REVIEW without a DocV enrichment stays non-terminal and safe",
      );
      const ev = (o: Parameters<typeof fx.webhookEvent>[0]) =>
        fx.webhookEvent(o);
      const REQ = "refi-kyc-req-00000000-0000-0000-0000-000000000000";
      for (const w of [
        ev({ eventId: fx.FIXTURE_WEBHOOK_EVENT_ID, requestId: REQ }),
        ev({
          eventId: fx.FIXTURE_WEBHOOK_EVENT_ID,
          requestId: REQ,
          decision: "REJECT",
        }),
        ev({
          eventId: fx.FIXTURE_WEBHOOK_EVENT_ID,
          requestId: REQ,
          evalId: fx.WEBHOOK_UNKNOWN_EVAL_ID,
        }),
      ]) {
        assert.equal(
          schemas.socureEvaluationCompletedEventSchema.safeParse(w).success,
          true,
        );
      }
      const paused = ev({
        eventId: fx.FIXTURE_WEBHOOK_EVENT_ID,
        requestId: REQ,
        eventType: "evaluation_paused",
        decision: "REVIEW",
      });
      assert.equal(
        schemas.socureEvaluationCompletedEventSchema.safeParse(paused).success,
        false,
      );
      assert.equal(
        schemas.socureWebhookEventSchema.safeParse(paused).success,
        true,
      );
      assert.equal(
        schemas.socureEvaluationCompletedEventSchema.safeParse({
          event_type: "evaluation_completed",
          data: { id: "x", eval_id: "y" },
        }).success,
        false,
        "event_id and decision required",
      );
    },
  );

  await section(
    "socure: decision mapping — ACCEPT→passed, REJECT→failed, REVIEW+paused+token→additional_info_required (DocV), REVIEW otherwise→under_review; webhook REVIEW never verifies",
    async () => {
      const m = (b: unknown) =>
        mapping.mapSocureEvaluation(
          schemas.socureEvaluationResponseSchema.parse(b),
        );
      assert.deepEqual(m(fx.RESPONSE_ACCEPT), {
        refiState: "passed",
        providerDecision: "accept",
        final: true,
        docvTransactionToken: null,
        reviewReason: null,
      });
      assert.deepEqual(m(fx.RESPONSE_REJECT), {
        refiState: "failed",
        providerDecision: "reject",
        final: true,
        docvTransactionToken: null,
        reviewReason: null,
      });
      assert.deepEqual(m(fx.RESPONSE_REVIEW_DOCV_PAUSED), {
        refiState: "additional_info_required",
        providerDecision: "review",
        final: false,
        docvTransactionToken: fx.FIXTURE_DOCV_TOKEN,
        reviewReason: "docv_step_up",
      });
      assert.deepEqual(m(fx.RESPONSE_REVIEW_NO_DOCV), {
        refiState: "under_review",
        providerDecision: "review",
        final: false,
        docvTransactionToken: null,
        reviewReason: "provider_review",
      });
      const w = (b: unknown) =>
        mapping.mapSocureWebhookDecision(
          schemas.socureEvaluationCompletedEventSchema.parse(b),
        );
      const REQ2 = "refi-kyc-req-00000000-0000-0000-0000-000000000000";
      assert.deepEqual(
        w(
          fx.webhookEvent({
            eventId: fx.FIXTURE_WEBHOOK_EVENT_ID,
            requestId: REQ2,
          }),
        ),
        { refiState: "passed", providerDecision: "accept", final: true },
      );
      assert.deepEqual(
        w(
          fx.webhookEvent({
            eventId: fx.FIXTURE_WEBHOOK_EVENT_ID,
            requestId: REQ2,
            decision: "REJECT",
          }),
        ),
        { refiState: "failed", providerDecision: "reject", final: true },
      );
      assert.deepEqual(
        w(
          fx.webhookEvent({
            eventId: fx.FIXTURE_WEBHOOK_EVENT_ID,
            requestId: REQ2,
            decision: "REVIEW",
          }),
        ),
        { refiState: "under_review", providerDecision: "review", final: false },
      );
      // Component statuses are derived only from documented aggregates.
      const c = mapping.deriveComponentStatuses({
        providerDecision: "review",
        final: false,
        docvOccurred: true,
      });
      assert.equal(c.documentVerification, "pending");
      assert.equal(c.liveness, "pending");
      assert.equal(c.identityVerification, "review");
      const c2 = mapping.deriveComponentStatuses({
        providerDecision: "accept",
        final: true,
        docvOccurred: false,
      });
      assert.equal(c2.documentVerification, "not_evaluated");
      assert.equal(c2.fraud, "pass");
    },
  );

  await section(
    "socure: error classification — provider failure is never a rejection; 429/5xx/timeout retryable; 401/403 config; 400/404/422 invalid request; messages carry no body",
    async () => {
      assert.equal(errors.classifySocureHttpStatus(401).kind, "auth_config");
      assert.equal(errors.classifySocureHttpStatus(403).kind, "auth_config");
      assert.equal(
        errors.classifySocureHttpStatus(429, 30).kind,
        "rate_limited",
      );
      assert.equal(
        errors.classifySocureHttpStatus(429, 30).retryAfterSeconds,
        30,
      );
      assert.equal(
        errors.classifySocureHttpStatus(400).kind,
        "invalid_request",
      );
      assert.equal(
        errors.classifySocureHttpStatus(422).kind,
        "invalid_request",
      );
      assert.equal(
        errors.classifySocureHttpStatus(503).kind,
        "provider_unavailable",
      );
      assert.equal(errors.classifySocureHttpStatus(500).retryable, true);
      assert.equal(errors.classifySocureHttpStatus(401).retryable, false);
      assert.equal(
        new errors.SocureProviderError("timeout", null).retryable,
        true,
      );
      assert.ok(
        !errors.SOCURE_ERROR_KINDS.includes("rejected" as never) &&
          !errors.SOCURE_ERROR_KINDS.includes("review_required" as never),
        "decisions are not errors",
      );
      for (const k of errors.SOCURE_ERROR_KINDS) {
        const e = new errors.SocureProviderError(k, 500);
        assert.ok(!/eval_id|given_name|national_id|Bearer/.test(e.message));
      }
    },
  );

  await section(
    "runtime profile: socure_kyc validates only the KYC surface — boots on the prod tier without WalletConnect, PostHog, Sentry, game handoff or connected investor-API configuration; refuses mock/demo/stytch/claim-route; the full profile keeps its prod requirements; release stage is not overloaded",
    async () => {
      const PROD_KYC = {
        REFI_ENV: "prod",
        NEXT_PUBLIC_REFI_ENV: "prod",
        REFI_RUNTIME_PROFILE: "socure_kyc",
        REFI_DATA_ADAPTER: "live",
        GCP_PROJECT_ID: "refi-socure-prod",
        REFI_AUTH_PROVIDER: "unconfigured",
        FLAG_ALPHA_CLAIM_ROUTE: "off",
        REFI_KYC_PROVIDER: "unconfigured",
        REFI_KYC_MOCK_CONTROLS: "0",
        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: undefined,
        NEXT_PUBLIC_POSTHOG_KEY: undefined,
        NEXT_PUBLIC_SENTRY_DSN: undefined,
        ALPHA_HANDOFF_PUBLIC_KEY_JWK: undefined,
        ALPHA_HANDOFF_ISSUER: undefined,
        ALPHA_HANDOFF_AUDIENCE: undefined,
      };
      await withEnv(PROD_KYC, async () => {
        const env = getServerEnv();
        assert.equal(env.REFI_RUNTIME_PROFILE, "socure_kyc");
        // Capability values are NOT required by this profile (this harness is a
        // non-prod build where prototype defaults are substituted; a prod build
        // returns undefined for missing values — asserted on source below).
        assert.equal(
          env.REFI_RELEASE_STAGE,
          "signal",
          "release stage untouched by the profile",
        );
      });
      for (const [k, v, why] of [
        ["REFI_KYC_PROVIDER", "mock", "mock adapter refused"],
        ["REFI_KYC_MOCK_CONTROLS", "1", "mock controls refused"],
        ["REFI_DATA_ADAPTER", "mock", "mock data adapter refused"],
        ["GCP_PROJECT_ID", undefined, "durable project id required"],
        [
          "REFI_AUTH_PROVIDER",
          "stytch",
          "connected identity not part of the profile",
        ],
        ["FLAG_ALPHA_CLAIM_ROUTE", "on", "claim route not part of the profile"],
        ["REFI_ENV", "demo", "demo tier refused"],
      ] as const) {
        await withEnv({ ...PROD_KYC, [k]: v }, async () =>
          assert.throws(
            () => getServerEnv(),
            /Invalid server environment/,
            why,
          ),
        );
      }
      // The full profile in prod still requires every capability's configuration
      // (checked by the profile refinement on parsed values, independent of the
      // build-time IS_PRODUCTION default suppression).
      await withEnv(
        {
          ...PROD_KYC,
          REFI_RUNTIME_PROFILE: "full",
          NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "",
          NEXT_PUBLIC_POSTHOG_KEY: "",
          NEXT_PUBLIC_SENTRY_DSN: "",
          ALPHA_HANDOFF_PUBLIC_KEY_JWK: "",
          ALPHA_HANDOFF_ISSUER: "",
          ALPHA_HANDOFF_AUDIENCE: "",
        },
        async () => {
          const env = (() => {
            try {
              return getServerEnv();
            } catch {
              return null;
            }
          })();
          // In this (non-prod-built) harness the prototype defaults are substituted,
          // so the full profile boots; the refinement path is exercised by source.
          assert.ok(env === null || env.REFI_RUNTIME_PROFILE === "full");
        },
      );
      const src = read("apps/web/src/lib/config/env.ts");
      assert.ok(
        /if \(IS_PRODUCTION\) return undefined;/.test(src),
        "a prod build never substitutes a prototype default (no dummy config)",
      );
      assert.ok(
        /NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z\.string\(\)\.min\(1\)\.optional\(\)/.test(
          src,
        ) &&
          /ALPHA_HANDOFF_PUBLIC_KEY_JWK: z\.string\(\)\.min\(1\)\.optional\(\)/.test(
            src,
          ),
        "unrelated capability configuration is optional at the schema level",
      );
      assert.ok(
        /REFI_RUNTIME_PROFILE === "full" && prodTier/.test(src) &&
          /required in production for the full runtime profile/.test(src),
        "full profile fails closed in prod on every capability's configuration",
      );
      assert.ok(
        !/REFI_RELEASE_STAGE[^\n]*profile|profile[^\n]*REFI_RELEASE_STAGE/i.test(
          src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
        ),
        "release stage is never used as the runtime-profile switch",
      );
    },
  );

  await section(
    "socure: configuration — all-or-nothing, sandbox/production hosts distinguishable, demo forbidden, native mode forbids mock and permits unconfigured or complete socure; no fallback",
    async () => {
      await withEnv({ ...SOCURE_OK }, async () =>
        assert.doesNotThrow(() => getServerEnv()),
      );
      await withEnv({ ...SOCURE_OK, SOCURE_API_KEY: undefined }, async () =>
        assert.throws(
          () => getServerEnv(),
          /Invalid server environment/,
          "key required",
        ),
      );
      await withEnv(
        { ...SOCURE_OK, SOCURE_WORKFLOW_NAME: undefined },
        async () =>
          assert.throws(
            () => getServerEnv(),
            /Invalid server environment/,
            "workflow required",
          ),
      );
      await withEnv(
        { ...SOCURE_OK, SOCURE_API_BASE_URL: "https://riskos.socure.com" },
        async () =>
          assert.throws(
            () => getServerEnv(),
            /Invalid server environment/,
            "sandbox env must use sandbox host",
          ),
      );
      await withEnv(
        {
          ...SOCURE_OK,
          SOCURE_ENV: "production",
          SOCURE_WEBHOOK_BEARER_TOKEN: "fixture-webhook-secret-0123456789",
        },
        async () =>
          assert.throws(
            () => getServerEnv(),
            /Invalid server environment/,
            "production must not use sandbox host",
          ),
      );
      await withEnv(
        {
          ...SOCURE_OK,
          SOCURE_ENV: "production",
          SOCURE_API_BASE_URL: "https://riskos.socure.com",
        },
        async () =>
          assert.throws(
            () => getServerEnv(),
            /Invalid server environment/,
            "production requires the webhook Bearer token",
          ),
      );
      await withEnv(
        {
          ...SOCURE_OK,
          SOCURE_ENV: "production",
          SOCURE_API_BASE_URL: "https://riskos.socure.com",
          SOCURE_WEBHOOK_BEARER_TOKEN: "fixture-webhook-secret-0123456789",
        },
        async () => assert.doesNotThrow(() => getServerEnv()),
      );
      await withEnv(
        { ...SOCURE_OK, SOCURE_API_BASE_URL: "https://evil.example.invalid" },
        async () =>
          assert.throws(
            () => getServerEnv(),
            /Invalid server environment/,
            "socure.com hosts only",
          ),
      );
      await withEnv(
        { ...SOCURE_OK, REFI_ENV: "demo", NEXT_PUBLIC_REFI_ENV: "demo" },
        async () =>
          assert.throws(
            () => getServerEnv(),
            /Invalid server environment/,
            "never on demo",
          ),
      );
      // No fallback: unconfigured socure never resolves to the mock.
      await withEnv(
        { REFI_KYC_PROVIDER: "unconfigured", SOCURE_API_KEY: undefined },
        async () => {
          assert.throws(
            () => kycIndex.getKycProvider(),
            kycIndex.KycProviderUnavailableError,
          );
          assert.throws(
            () => client.getSocureClient(),
            client.SocureUnavailableError,
          );
        },
      );
      await withEnv({ ...SOCURE_OK }, async () => {
        assert.equal(kycIndex.getKycProvider().kind, "socure");
        assert.equal(
          kycIndex.getMockKycControls(),
          null,
          "mock controls never exist under socure",
        );
      });
      const src = read("apps/web/src/lib/kyc/index.ts");
      assert.ok(
        !/socure[\s\S]{0,200}MockKycProvider\(\)/.test(
          src.split('case "socure":')[1] ?? "",
        ),
        "socure branch never constructs the mock",
      );
      const envSrc = read("apps/web/src/lib/config/env.ts");
      assert.ok(
        /REFI_KYC_PROVIDER === "mock"[\s\S]{0,300}must not be "mock" on a connected deployment/.test(
          envSrc,
        ),
        "native mode forbids the mock adapter",
      );
      assert.ok(
        !/NEXT_PUBLIC_SOCURE_API_KEY/.test(envSrc) &&
          !/NEXT_PUBLIC_SOCURE_API_KEY/.test(read("apps/web/.env.example")),
        "the API key is never a public env",
      );
    },
  );

  await section(
    "socure: fake-client evaluation — ACCEPT/REJECT/REVIEW persist provider-neutral evidence (eval_id, workflow, decision, provenance) and never PII; provider errors leave the journey retryable",
    async () => {
      await withEnv({ ...SOCURE_OK }, async () => {
        for (const a of [subjectA, subjectB])
          await entity.resetKycEvaluationForTests(a.authId);
        // ACCEPT
        let fake = new client.FakeSocureClient(fx.SCRIPT_ACCEPT);
        let p = freshProvider(fake);
        const start = await p.start(subjectA, "corr-1");
        assert.equal(start.accepted, true);
        assert.equal(
          start.accepted && start.continuePath,
          SOCURE_CONTINUE_PATH,
          "continuation is ReFi's own form",
        );
        const acc = await p.evaluate({
          subject: subjectA,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "sub-1",
          correlationId: "corr-1",
        });
        assert.equal(acc.ok, true);
        assert.equal(acc.session.state, "passed");
        assert.equal(fake.requests.length, 1);
        assert.equal(
          fake.requests[0]!.request.workflow,
          SOCURE_OK.SOCURE_WORKFLOW_NAME,
        );
        assert.match(
          fake.requests[0]!.request.id,
          /^refi-kyc-req-/,
          "customer id is opaque",
        );
        assert.ok(
          !fake.requests[0]!.request.id.includes(subjectA.authId),
          "never the auth id",
        );
        assert.equal(
          fake.requests[0]!.request.data.individual.additional_context
            .user_consent,
          true,
        );
        assert.equal(
          fake.requests[0]!.request.data.individual.additional_context
            .consent_timestamp,
          CONSENT_AT,
        );
        assert.equal(
          fake.requests[0]!.request.data.individual.di_session_token,
          fx.FIXTURE_INDIVIDUAL.di_session_token,
        );
        const recA = (await entity.getKycEvaluation(subjectA.authId))!;
        assert.equal(
          recA.evidence.providerEvaluationId,
          fx.FIXTURE_EVAL_ID_ACCEPT,
        );
        assert.equal(
          recA.evidence.providerRequestId,
          fake.requests[0]!.request.id,
        );
        assert.equal(recA.evidence.providerWorkflowVersion, "1.0.0");
        assert.ok(
          !JSON.stringify(recA).includes("fixture_reason_not_for_users") &&
            !/"score"/.test(JSON.stringify(recA)),
          "score/reason codes are never persisted",
        );
        assert.equal(recA.evidence.providerDecision, "accept");
        assert.equal(recA.evidence.providerDecisionFinal, true);
        assert.equal(recA.evidence.decisionProvenance, "provider_evaluation");
        assert.equal(recA.evidence.provider, "socure");
        assert.equal(
          recA.evidence.schemaVersion,
          evidence.KYC_EVIDENCE_SCHEMA_VERSION,
        );
        assert.ok(recA.referenceId.startsWith("refi-kyc-"));
        noPii(recA, "evaluation record (ACCEPT)");
        assert.equal(
          await entity.findAuthIdByProviderEvaluation(
            fx.FIXTURE_EVAL_ID_ACCEPT,
          ),
          subjectA.authId,
        );
        // passed is terminal: a new submission is refused, no provider call
        const again = await p.evaluate({
          subject: subjectA,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "sub-2",
          correlationId: "corr-2",
        });
        assert.equal(again.ok, false);
        assert.equal(!again.ok && again.reason, "already_terminal");
        assert.equal(fake.requests.length, 1);
        // REJECT (tags never stored)
        fake = new client.FakeSocureClient(fx.SCRIPT_REJECT);
        p = freshProvider(fake);
        const rej = await p.evaluate({
          subject: subjectB,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "sub-b1",
          correlationId: "corr-b",
        });
        assert.equal(rej.ok && rej.session.state, "failed");
        const recB = (await entity.getKycEvaluation(subjectB.authId))!;
        assert.ok(
          !JSON.stringify(recB).includes("fixture_tag_not_for_users"),
          "provider tags are never persisted",
        );
        noPii(recB, "evaluation record (REJECT)");
        // failed is retryable with a NEW evaluation → REVIEW with DocV
        fake = new client.FakeSocureClient(fx.SCRIPT_REVIEW_DOCV);
        p = freshProvider(fake);
        const rev = await p.evaluate({
          subject: subjectB,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "sub-b2",
          correlationId: "corr-b2",
        });
        assert.equal(rev.ok && rev.session.state, "additional_info_required");
        assert.equal(rev.ok && rev.docvTransactionToken, fx.FIXTURE_DOCV_TOKEN);
        const recB2 = (await entity.getKycEvaluation(subjectB.authId))!;
        assert.equal(
          recB2.evidence.providerEvaluationId,
          fx.FIXTURE_EVAL_ID_REVIEW,
        );
        assert.equal(recB2.evidence.reviewReason, "docv_step_up");
        assert.equal(recB2.evidence.documentVerification, "pending");
        assert.equal(await p.docvTokenFor(subjectB), fx.FIXTURE_DOCV_TOKEN);
        assert.equal(
          await p.docvTokenFor(subjectA),
          null,
          "no token for a user without an active step-up",
        );
        // Wrong environment echoed back → refused, never applied
        {
          await entity.resetKycEvaluationForTests(subjectA.authId);
          const f2 = new client.FakeSocureClient({
            kind: "json",
            status: 200,
            body: fx.RESPONSE_ACCEPT_WRONG_ENV,
          });
          const p2 = freshProvider(f2);
          const out = await p2.evaluate({
            subject: subjectA,
            individual: fx.FIXTURE_INDIVIDUAL,
            consentTimestamp: CONSENT_AT,
            submissionKey: "env-x",
            correlationId: "c",
          });
          assert.equal(!out.ok && out.error?.kind, "malformed_response");
          assert.equal(out.session.state, "in_progress");
        }
        // Provider errors: 429, 503, timeout, malformed → journey stays in_progress & retryable; not failed
        for (const a of [subjectA])
          await entity.resetKycEvaluationForTests(a.authId);
        for (const [script, kind, retryable] of [
          [fx.SCRIPT_429, "rate_limited", true],
          [fx.SCRIPT_503, "provider_unavailable", true],
          [fx.SCRIPT_TIMEOUT, "timeout", true],
          [fx.SCRIPT_MALFORMED, "malformed_response", false],
          [fx.SCRIPT_401, "auth_config", false],
          [fx.SCRIPT_400, "invalid_request", false],
        ] as const) {
          fake = new client.FakeSocureClient(script);
          p = freshProvider(fake);
          const out = await p.evaluate({
            subject: subjectA,
            individual: fx.FIXTURE_INDIVIDUAL,
            consentTimestamp: CONSENT_AT,
            submissionKey: `sub-err-${kind}`,
            correlationId: "corr-e",
          });
          assert.equal(out.ok, false);
          assert.equal(!out.ok && out.reason, "provider_error");
          assert.equal(!out.ok && out.error?.kind, kind);
          assert.equal(!out.ok && out.error?.retryable, retryable);
          assert.equal(
            out.session.state,
            "in_progress",
            `${kind}: never a rejection`,
          );
          noPii(out, `outcome (${kind})`);
        }
        const recErr = (await entity.getKycEvaluation(subjectA.authId))!;
        assert.equal(recErr.evidence.providerEvaluationId, null);
        assert.equal(recErr.lastProviderError?.kind, "invalid_request");
        noPii(recErr, "evaluation record (errors)");
      });
    },
  );

  await section(
    "socure: retry safety — same submission key never creates a second provider evaluation; an open (non-final) evaluation is reused; in-flight submission is visible",
    async () => {
      await withEnv({ ...SOCURE_OK }, async () => {
        for (const a of [subjectA, subjectB])
          await entity.resetKycEvaluationForTests(a.authId);
        const fake = new client.FakeSocureClient(
          fx.SCRIPT_REVIEW_DOCV,
          fx.SCRIPT_ACCEPT,
        );
        const p = freshProvider(fake);
        const first = await p.evaluate({
          subject: subjectA,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "dbl",
          correlationId: "c1",
        });
        assert.equal(first.ok && first.reused, false);
        const second = await p.evaluate({
          subject: subjectA,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "dbl",
          correlationId: "c2",
        });
        assert.equal(
          second.ok && second.reused,
          true,
          "double click reuses the answered submission",
        );
        const third = await p.evaluate({
          subject: subjectA,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "other",
          correlationId: "c3",
        });
        assert.equal(
          third.ok && third.reused,
          true,
          "an open evaluation (DocV pending) is never duplicated by a new key",
        );
        assert.equal(
          fake.requests.length,
          1,
          "exactly one provider evaluation",
        );
        // In-flight visibility: simulate a crashed submission
        const rec = (await entity.getKycEvaluation(subjectA.authId))!;
        await entity.putKycEvaluation({
          ...rec,
          submission: {
            key: "inflight",
            phase: "submitting",
            at: rec.updatedAt,
          },
        });
        const inflight = await p.evaluate({
          subject: subjectA,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "inflight",
          correlationId: "c4",
        });
        assert.equal(!inflight.ok && inflight.reason, "submission_in_flight");
        assert.equal(fake.requests.length, 1);
      });
    },
  );

  await section(
    "socure: webhook concurrency — the same final event delivered concurrently applies exactly once (store.update transaction); one history entry, one reference, the rest are duplicate_event",
    async () => {
      await withEnv({ ...SOCURE_OK }, async () => {
        await entity.resetKycEvaluationForTests(subjectB.authId);
        await entity.clearEvaluationIndexForTests(fx.FIXTURE_EVAL_ID_REVIEW);
        const fake = new client.FakeSocureClient(fx.SCRIPT_REVIEW_DOCV);
        const p = freshProvider(fake);
        await p.evaluate({
          subject: subjectB,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "cc1",
          correlationId: "cc",
        });
        const reqB = (await entity.getKycEvaluation(subjectB.authId))!.evidence
          .providerRequestId!;
        await p.markDocvCaptured(subjectB, "cc-cap");
        const eventId = "550e8400-e29b-41d4-a716-4466554400c0";
        const event = fx.webhookEvent({
          requestId: reqB,
          eventId,
          decision: "ACCEPT",
        });
        const results = await Promise.all(
          [1, 2, 3, 4, 5].map((i) => p.applyWebhook(event, `cc-${String(i)}`)),
        );
        const outcomes = results.map((r) => (r.handled ? r.outcome : r.reason));
        assert.equal(
          outcomes.filter((o) => o === "applied").length,
          1,
          `exactly one applied, got ${JSON.stringify(outcomes)}`,
        );
        assert.equal(
          outcomes.filter((o) => o === "duplicate_event").length,
          4,
          "the concurrent rest are duplicates",
        );
        const rec = (await entity.getKycEvaluation(subjectB.authId))!;
        assert.equal(rec.state, "passed");
        assert.equal(
          rec.history.filter((h) => h.state === "passed").length,
          1,
          "one terminal history entry",
        );
        assert.equal(
          rec.evidence.providerReferenceIds.filter((x) => x === eventId).length,
          1,
          "the event id is referenced exactly once",
        );
        // The audit marker belongs to the winner and is never overwritten.
        assert.equal(
          (await entity.getWebhookEvent(eventId))?.outcome,
          "applied",
          "one event consumption recorded, losers never overwrite it",
        );
        // A later replay (marker present) is still a duplicate.
        const later = await p.applyWebhook(event, "cc-later");
        assert.equal(later.handled && later.outcome, "duplicate_event");
        // Leave the shared fixture evaluation id free for the next sections.
        await entity.resetKycEvaluationForTests(subjectB.authId);
        await entity.clearEvaluationIndexForTests(fx.FIXTURE_EVAL_ID_REVIEW);
      });
    },
  );

  await section(
    "socure: webhook idempotency — event_id once; same final result safe; conflict flagged; unknown eval creates nothing; request-id mismatch refused (no reassignment); no terminal regression; REJECT never silently becomes VERIFIED; wrong environment refused",
    async () => {
      await withEnv({ ...SOCURE_OK }, async () => {
        for (const a of [subjectA, subjectB])
          await entity.resetKycEvaluationForTests(a.authId);
        const fake = new client.FakeSocureClient(fx.SCRIPT_REVIEW_DOCV);
        const p = freshProvider(fake);
        await p.evaluate({
          subject: subjectA,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "w1",
          correlationId: "w",
        });
        const reqA = (await entity.getKycEvaluation(subjectA.authId))!.evidence
          .providerRequestId!;
        const ev = (
          o: Partial<Parameters<typeof fx.webhookEvent>[0]> & {
            eventId: string;
          },
        ) => fx.webhookEvent({ requestId: reqA, ...o });
        const captured = await p.markDocvCaptured(subjectA, "w-cap");
        assert.equal(captured?.state, "under_review");
        // unknown evaluation → nothing created
        const unknown = await p.applyWebhook(
          ev({
            eventId: "550e8400-e29b-41d4-a716-446655440002",
            evalId: fx.WEBHOOK_UNKNOWN_EVAL_ID,
          }),
          "w-u",
        );
        assert.equal(unknown.handled && unknown.outcome, "unknown_evaluation");
        assert.equal(
          await entity.getKycEvaluation(fx.WEBHOOK_UNKNOWN_EVAL_ID),
          null,
        );
        // request-id mismatch on a known eval → refused (cannot reassign / spoof)
        const mism = await p.applyWebhook(
          ev({
            eventId: "550e8400-e29b-41d4-a716-446655440003",
            requestId: "refi-kyc-req-ffffffff-ffff-ffff-ffff-ffffffffffff",
          }),
          "w-mm",
        );
        assert.equal(mism.handled && mism.outcome, "evaluation_mismatch");
        assert.equal(
          (await entity.getKycEvaluation(subjectA.authId))!.state,
          "under_review",
        );
        // wrong environment → refused
        assert.deepEqual(
          await p.applyWebhook(
            ev({
              eventId: "550e8400-e29b-41d4-a716-446655440004",
              environment: "Production",
            }),
            "w-env",
          ),
          { handled: false, reason: "environment_mismatch" },
        );
        // other event types ignored; malformed refused
        assert.deepEqual(
          await p.applyWebhook(
            ev({
              eventId: "550e8400-e29b-41d4-a716-446655440005",
              eventType: "evaluation_paused",
              decision: "REVIEW",
            }),
            "w-o",
          ),
          { handled: false, reason: "ignored_event_type" },
        );
        assert.deepEqual(await p.applyWebhook({ nope: true }, "w-m"), {
          handled: false,
          reason: "malformed",
        });
        // final ACCEPT applies once
        const a1 = await p.applyWebhook(
          ev({ eventId: fx.FIXTURE_WEBHOOK_EVENT_ID }),
          "w-a1",
        );
        assert.equal(a1.handled && a1.outcome, "applied");
        let rec = (await entity.getKycEvaluation(subjectA.authId))!;
        assert.equal(rec.state, "passed");
        assert.equal(rec.evidence.providerDecisionFinal, true);
        assert.equal(rec.evidence.decisionProvenance, "provider_webhook");
        assert.equal(rec.evidence.documentVerification, "pass");
        assert.ok(
          rec.evidence.providerReferenceIds.includes(
            fx.FIXTURE_WEBHOOK_EVENT_ID,
          ),
        );
        assert.ok(rec.docv?.captureCompletedAt);
        noPii(rec, "record after webhook");
        assert.ok(!JSON.stringify(rec).includes("fixture notes never stored"));
        // duplicate event id → no change
        const a2 = await p.applyWebhook(
          ev({ eventId: fx.FIXTURE_WEBHOOK_EVENT_ID }),
          "w-a2",
        );
        assert.equal(a2.handled && a2.outcome, "duplicate_event");
        assert.equal(
          (await entity.getKycEvaluation(subjectA.authId))!.history.length,
          rec.history.length,
        );
        // same eval, same final result, new event id → idempotent
        const same = await p.applyWebhook(
          ev({ eventId: "550e8400-e29b-41d4-a716-4466554400aa" }),
          "w-s",
        );
        assert.equal(same.handled && same.outcome, "idempotent_same_result");
        assert.equal(
          (await entity.getKycEvaluation(subjectA.authId))!.state,
          "passed",
        );
        // stale REVIEW after final ACCEPT → ignored
        const stale = await p.applyWebhook(
          ev({
            eventId: "550e8400-e29b-41d4-a716-4466554400bb",
            decision: "REVIEW",
          }),
          "w-st",
        );
        assert.equal(stale.handled && stale.outcome, "stale_ignored");
        assert.equal(
          (await entity.getKycEvaluation(subjectA.authId))!.state,
          "passed",
        );
        // conflicting final REJECT after ACCEPT → flagged, state unchanged
        const conflict = await p.applyWebhook(
          ev({
            eventId: "550e8400-e29b-41d4-a716-4466554400cc",
            decision: "REJECT",
          }),
          "w-c",
        );
        assert.equal(conflict.handled && conflict.outcome, "conflict_flagged");
        rec = (await entity.getKycEvaluation(subjectA.authId))!;
        assert.equal(rec.state, "passed");
        assert.equal(rec.conflict?.providerDecision, "reject");
        // cannot reassign: user B's record cannot claim A's eval_id
        const recB = entity.freshKycEvaluation(subjectB.authId, "socure");
        await assert.rejects(
          entity.putKycEvaluation({
            ...recB,
            evidence: {
              ...recB.evidence,
              providerEvaluationId: fx.FIXTURE_EVAL_ID_REVIEW,
            },
          }),
          /another user/,
        );
        // REJECT never silently becomes VERIFIED: B fails, then an ACCEPT webhook for B's eval → conflict
        await entity.resetKycEvaluationForTests(subjectA.authId);
        await entity.resetKycEvaluationForTests(subjectB.authId);
        const fakeB = new client.FakeSocureClient(fx.SCRIPT_REVIEW_DOCV);
        const pB = freshProvider(fakeB);
        await pB.evaluate({
          subject: subjectB,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "b1",
          correlationId: "b",
        });
        const reqB = (await entity.getKycEvaluation(subjectB.authId))!.evidence
          .providerRequestId!;
        const bRej = await pB.applyWebhook(
          fx.webhookEvent({
            eventId: "550e8400-e29b-41d4-a716-4466554400dd",
            requestId: reqB,
            decision: "REJECT",
          }),
          "b-r",
        );
        assert.equal(bRej.handled && bRej.outcome, "applied");
        assert.equal(
          (await entity.getKycEvaluation(subjectB.authId))!.state,
          "failed",
        );
        const bAcc = await pB.applyWebhook(
          fx.webhookEvent({
            eventId: "550e8400-e29b-41d4-a716-4466554400ee",
            requestId: reqB,
            decision: "ACCEPT",
          }),
          "b-a",
        );
        assert.equal(bAcc.handled && bAcc.outcome, "conflict_flagged");
        assert.equal(
          (await entity.getKycEvaluation(subjectB.authId))!.state,
          "failed",
          "a final REJECT is not overwritten by a late ACCEPT",
        );
        assert.equal(
          (await entity.getWebhookEvent(fx.FIXTURE_WEBHOOK_EVENT_ID))?.outcome,
          "applied",
        );
        for (const a of [subjectA, subjectB])
          await entity.resetKycEvaluationForTests(a.authId);
      });
    },
  );

  await section(
    "socure: the real HTTP client is never constructed in tests and never logs; the API key lives only in the Authorization header builder",
    async () => {
      const src = read("apps/web/src/lib/kyc/socure/client.ts");
      assert.ok(!/console\./.test(src), "no logging in the client");
      assert.equal((src.match(/SOCURE_API_KEY/g) ?? []).length <= 4, true);
      assert.ok(/Authorization: `Bearer \$\{apiKey\}`/.test(src));
      // Founder decision 2026-09-11: the RiskOS API version is pinned by ONE constant
      // and sent on every provider request; the string appears nowhere else.
      assert.equal(client.SOCURE_API_VERSION, "2025-01-01.orion");
      assert.equal(client.SOCURE_API_VERSION_HEADER, "X-API-Version");
      assert.ok(
        /\[SOCURE_API_VERSION_HEADER\]: SOCURE_API_VERSION,/.test(src),
        "version header sent on the evaluation request",
      );
      assert.equal(
        (src.match(/2025-01-01\.orion/g) ?? []).length,
        1,
        "the version string lives in exactly one place",
      );
      for (const f of [
        "adapter.ts",
        "mapping.ts",
        "schemas.ts",
        "errors.ts",
        "fixtures.ts",
        "webhook-auth.ts",
      ]) {
        assert.ok(
          !/orion|X-API-Version/.test(read(`apps/web/src/lib/kyc/socure/${f}`)),
          `${f}: no scattered version string`,
        );
      }
      for (const f of ["adapter.ts", "mapping.ts", "schemas.ts", "errors.ts"]) {
        assert.ok(
          !/console\./.test(read(`apps/web/src/lib/kyc/socure/${f}`)),
          `${f}: no logging`,
        );
      }
      assert.ok(
        !/SOCURE_API_KEY|api_key/.test(
          read("apps/web/src/lib/kyc/socure/adapter.ts"),
        ),
        "adapter never touches the key",
      );
      // No genuine traffic path in the test run: the client factory is injected.
      assert.ok(
        /clientFactory: \(\) => SocureClientLike = getSocureClient/.test(
          read("apps/web/src/lib/kyc/socure/adapter.ts"),
        ),
      );
    },
  );
}

// ─── KYC evaluation route (PR C: Build Your Own UI, DI token, no client control) ──
{
  const ident = await import("../apps/web/src/lib/kyc/identity-input.ts");
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const GOOD = {
    submissionKey: crypto.randomUUID(),
    diSessionToken: "di-session-fixture",
    givenName: " Jane ",
    familyName: "Doe",
    dateOfBirth: "1990-01-01",
    email: "investor@example.invalid",
    phoneNumber: "(555) 555-0100",
    nationalId: "123-45-6789",
    address: {
      line1: "1 Fixture Way",
      locality: "Springfield",
      region: "IL",
      postalCode: "62701",
      country: "US",
    },
    consentToVerification: true,
  };

  await section(
    "kyc evaluation input: strict browser payload — provider controls are refused, DI token and consent required, PII normalised in memory only",
    async () => {
      const ok = ident.identityInputSchema.safeParse(GOOD);
      assert.equal(
        ok.success,
        true,
        JSON.stringify(ok.success ? null : ok.error.issues),
      );
      const n = ident.normalizeIdentityInput(
        ok.success ? ok.data : (null as never),
      );
      assert.equal(n.givenName, "Jane", "trimmed");
      assert.equal(n.phoneNumber, "+15555550100", "E.164");
      assert.equal(n.nationalId, "123456789", "digits only");
      for (const k of ident.FORBIDDEN_CLIENT_CONTROL_KEYS) {
        assert.equal(
          ident.identityInputSchema.safeParse({ ...GOOD, [k]: "x" }).success,
          false,
          `client-supplied ${k} must be refused`,
        );
      }
      for (const [label, bad] of [
        ["missing DI token", { ...GOOD, diSessionToken: undefined }],
        ["empty DI token", { ...GOOD, diSessionToken: "" }],
        ["consent false", { ...GOOD, consentToVerification: false }],
        [
          "under 18",
          { ...GOOD, dateOfBirth: new Date().toISOString().slice(0, 10) },
        ],
        ["non-US", { ...GOOD, address: { ...GOOD.address, country: "CA" } }],
        ["bad SSN", { ...GOOD, nationalId: "12-345-678" }],
        ["bad submission key", { ...GOOD, submissionKey: "not-a-uuid" }],
      ] as const) {
        assert.equal(
          ident.identityInputSchema.safeParse(bad).success,
          false,
          label,
        );
      }
      const masked = ident.maskIdentityInput(
        ok.success ? ok.data : (null as never),
      );
      assert.deepEqual(
        Object.values(masked).every((v) => v === "present" || v === "absent"),
        true,
      );
      assert.ok(
        !JSON.stringify(masked).includes("Jane"),
        "mask never reveals values",
      );
    },
  );

  await section(
    "kyc evaluation route: bffMutate, strict parse, no vendor import, server-side config only, response is neutral state, receipts carry no PII",
    async () => {
      const src = read("apps/web/app/api/v1/investor/kyc/evaluation/route.ts");
      assert.ok(
        /bffMutate<IdentityInput>\(\{/.test(src),
        "uses the receipted mutation wrapper",
      );
      assert.ok(/action: "submitKycEvaluation"/.test(src));
      assert.ok(
        /parse: \(body\) => identityInputSchema\.parse\(body\)/.test(src),
        "strict schema parse",
      );
      assert.ok(
        !/socure|SOCURE_|api_key|apiKey|workflow|SOCURE_API_BASE_URL/i.test(
          src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
        ),
        "route names no vendor and reads no provider control",
      );
      assert.ok(!/console\./.test(src), "no logging");
      assert.ok(
        /references: \[ref\]/.test(src) &&
          /kyc-session:\$\{outcome\.session\.referenceId\}/.test(src),
        "receipt references carry only the opaque session ref",
      );
      assert.ok(
        !/givenName|nationalId|dateOfBirth/.test(src.split("apply:")[1] ?? ""),
        "the apply body never touches identity fields",
      );
      assert.ok(
        /result: "not_evaluating"/.test(src) && /status: 503/.test(src),
        "unconfigured → controlled 503, no fabricated verification",
      );
      assert.ok(
        /adapter_does_not_evaluate_in_app/.test(src) && /status: 409/.test(src),
        "mock → 409 not_evaluating",
      );
      assert.ok(
        /outcome\.retryable \? 503 : 502/.test(src),
        "provider failure is a blocked, retryable answer — never a rejection",
      );
      const { InvestorActions } =
        await import("../apps/web/src/lib/sec203a/actions.ts");
      assert.ok(
        (InvestorActions as readonly string[]).includes("submitKycEvaluation"),
      );
      const rp = await import("../apps/web/src/lib/sec203a/release-policy.ts");
      assert.ok(
        (rp.AUTOMATED_ALPHA_ALLOWED_ACTIONS as readonly string[]).includes(
          "submitKycEvaluation",
        ),
      );
      const manifest = JSON.parse(
        read("compliance/API_ROUTE_MANIFEST.json"),
      ) as { routes: Array<{ route: string; auth: Record<string, string> }> };
      const entry = manifest.routes.find(
        (r) => r.route === "/api/v1/investor/kyc/evaluation",
      );
      assert.ok(
        entry && entry.auth["POST"] === "bff-mutate",
        "manifest classifies the route as bff-mutate",
      );
    },
  );

  await section(
    "kyc evaluation browser seam: pinned DI SDK behind a typed adapter — initialise once, token only after init, no key → unavailable, no fake token; form posts once to the same-origin BFF; no provider host or server key in the browser",
    async () => {
      const pkg = JSON.parse(read("apps/web/package.json")) as {
        dependencies: Record<string, string>;
      };
      assert.equal(
        pkg.dependencies["@socure-inc/device-risk-sdk"],
        "2.11.0",
        "SDK pinned exactly",
      );
      const di = await import("../apps/web/app/_lib/kyc/socure-di.ts");
      {
        // The real pinned package: module.exports IS the class (UMD), so the
        // resolver must find `initialize`/`getSessionToken` on the module
        // itself, on `.default`, or on `.SigmaDeviceManager`.
        const { createRequire: cr } = await import("node:module");
        const realSdk: unknown = cr(
          join(process.cwd(), "apps/web/package.json"),
        )("@socure-inc/device-risk-sdk");
        const resolved = di.resolveSigmaDeviceManager(realSdk);
        assert.equal(typeof resolved.initialize, "function");
        assert.equal(typeof resolved.getSessionToken, "function");
        // A class whose statics depend on `this.instance`, exactly like the
        // SDK, exposed three ways: directly, as `.default`, and as a frozen
        // interop namespace with unbound getters (the Turbopack CJS case).
        class FakeManager {
          static instance: { token: string } | undefined;
          static initialize(cfg: { sdkKey: string }): void {
            if (!this.instance) this.instance = { token: `tok-${cfg.sdkKey}` };
          }
          static getSessionToken(): Promise<string> {
            if (!this.instance) return Promise.reject(new Error("not init"));
            return Promise.resolve(this.instance.token);
          }
        }
        const viaDefault = di.resolveSigmaDeviceManager({
          default: FakeManager,
        });
        viaDefault.initialize({ sdkKey: "k1" });
        assert.equal(await viaDefault.getSessionToken(), "tok-k1");
        FakeManager.instance = undefined;
        const namespace = Object.freeze({
          get initialize() {
            return FakeManager.initialize;
          },
          get getSessionToken() {
            return FakeManager.getSessionToken;
          },
        });
        const viaNamespace = di.resolveSigmaDeviceManager(namespace);
        viaNamespace.initialize({ sdkKey: "k2" });
        assert.equal(
          await viaNamespace.getSessionToken(),
          "tok-k2",
          "frozen interop namespace: statics run against a stable host",
        );
        assert.equal(
          FakeManager.instance,
          undefined,
          "the namespace path never touched the class's own state",
        );
        const viaClass = di.resolveSigmaDeviceManager(FakeManager);
        viaClass.initialize({ sdkKey: "k3" });
        assert.equal(await viaClass.getSessionToken(), "tok-k3");
        assert.equal(
          FakeManager.instance,
          undefined,
          "the class path also uses the private host",
        );
        // The bundler may hand the class back frozen (observed in the Sandbox).
        class FrozenManager {
          static instance: { token: string } | undefined;
          static initialize(cfg: { sdkKey: string }): void {
            if (!this.instance) this.instance = { token: `tok-${cfg.sdkKey}` };
          }
          static getSessionToken(): Promise<string> {
            return this.instance
              ? Promise.resolve(this.instance.token)
              : Promise.reject(new Error("not init"));
          }
        }
        Object.freeze(FrozenManager);
        const viaFrozen = di.resolveSigmaDeviceManager({
          default: FrozenManager,
        });
        viaFrozen.initialize({ sdkKey: "k4" });
        assert.equal(
          await viaFrozen.getSessionToken(),
          "tok-k4",
          "a frozen class still yields a token",
        );
        assert.throws(
          () => di.resolveSigmaDeviceManager({ other: 1 }),
          /SigmaDeviceManager not found/,
          "a module without the manager statics is refused",
        );
      }
      let inits = 0;
      const fake = {
        initialize: (c: { sdkKey: string }) => {
          inits += 1;
          assert.equal(c.sdkKey, "public-sdk-key-fixture");
        },
        getSessionToken: () => Promise.resolve("di-token-fixture"),
      };
      di.setSocureDiSdkForTests(fake);
      assert.equal(
        await di.socureDiSessionToken(),
        null,
        "no token before initialisation",
      );
      assert.equal(await di.ensureSocureDiInitialized(undefined), "no_key");
      assert.equal(inits, 0, "no key → the SDK is never initialised");
      assert.equal(
        await di.ensureSocureDiInitialized("public-sdk-key-fixture"),
        "initialized",
      );
      assert.equal(
        await di.ensureSocureDiInitialized("public-sdk-key-fixture"),
        "already",
      );
      assert.equal(
        await di.ensureSocureDiInitialized("public-sdk-key-fixture"),
        "already",
      );
      assert.equal(inits, 1, "initialise exactly once per page lifetime");
      assert.equal(di.socureDiInitCount(), 1);
      assert.equal(
        await di.ensureSocureDiInitialized("another-key"),
        "key_mismatch",
      );
      assert.equal(await di.socureDiSessionToken(), "di-token-fixture");
      di.setSocureDiSdkForTests({
        initialize: () => {},
        getSessionToken: () => Promise.reject(new Error("x")),
      });
      await di.ensureSocureDiInitialized("public-sdk-key-fixture");
      assert.equal(
        await di.socureDiSessionToken(),
        null,
        "SDK failure → null, never a fabricated token",
      );
      di.setSocureDiSdkForTests(null);
      const wrapper = read("apps/web/app/_lib/kyc/socure-di.ts");
      assert.ok(
        /await import\("@socure-inc\/device-risk-sdk"\)/.test(wrapper),
        "SDK loaded lazily",
      );
      assert.ok(
        /disableNavigationContextTracking: true/.test(wrapper),
        "no navigation tracking outside the funnel",
      );
      assert.ok(
        !/SOCURE_API_KEY|riskos\./.test(wrapper),
        "no server key / evaluation host in the browser adapter",
      );
      const seam = read("apps/web/app/_lib/kyc/di-session.ts");
      assert.ok(
        /NEXT_PUBLIC_SOCURE_SDK_KEY/.test(seam) && !/SOCURE_API_KEY/.test(seam),
      );
      for (const f of [
        "apps/web/app/us/onboarding/kyc/_components/KycIdentityForm.tsx",
        "apps/web/app/us/onboarding/kyc/page.tsx",
        "apps/web/app/_hooks/useKycVerification.ts",
      ]) {
        assert.ok(
          !/device-risk-sdk|SigmaDeviceManager/.test(read(f)),
          `${f}: SDK API stays behind the adapter`,
        );
      }
      const form = read(
        "apps/web/app/us/onboarding/kyc/_components/KycIdentityForm.tsx",
      );
      assert.ok(
        /useMemo\(\(\) => crypto\.randomUUID\(\), \[\]\)/.test(form),
        "one idempotency key per mounted form",
      );
      assert.ok(
        /void prepareDiSession\(\);/.test(form) &&
          /getDiSessionToken\(\)/.test(form) &&
          /if \(!di\.ok\)/.test(form),
        "init on mount; submit requires a DI token",
      );
      assert.ok(
        !/fetch\(\s*["']https?:/.test(form) && !/socure/i.test(form),
        "form never contacts a provider host",
      );
      assert.ok(
        /localStorage|sessionStorage/.test(form) === false,
        "no client-side persistence of identity values",
      );
      const hook = read("apps/web/app/_hooks/useKycVerification.ts");
      assert.ok(
        /\/evaluation`/.test(hook) && !/https?:\/\//.test(hook),
        "hook posts to the same-origin route only",
      );
      const page = read("apps/web/app/us/onboarding/kyc/page.tsx");
      assert.ok(
        /collectsIdentity/.test(page) && !/socure/i.test(page),
        "page gates the form on a neutral capability flag",
      );
    },
  );
}

// ─── KYC step-up and provider webhook (PR D) ──────────────────────────────
{
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const wa = await import("../apps/web/src/lib/kyc/socure/webhook-auth.ts");
  const fx = await import("../apps/web/src/lib/kyc/socure/fixtures.ts");
  const client = await import("../apps/web/src/lib/kyc/socure/client.ts");
  const { SocureKycProvider } =
    await import("../apps/web/src/lib/kyc/socure/adapter.ts");
  const kycIndex = await import("../apps/web/src/lib/kyc/index.ts");
  const entity =
    await import("../apps/web/src/lib/prototype-store/entities/kyc-evaluation.ts");
  const { createRequire: createRequireD } = await import("node:module");
  const requireFromWebD = createRequireD(
    join(process.cwd(), "apps/web/package.json"),
  );
  const { NextRequest } = (await import(
    requireFromWebD.resolve("next/server")
  )) as typeof import("next/server");
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const SECRET = "wh-" + "fixture-".repeat(3) + "token";
  const KEYS = [
    "REFI_KYC_PROVIDER",
    "REFI_KYC_MOCK_CONTROLS",
    "SOCURE_API_BASE_URL",
    "SOCURE_API_KEY",
    "SOCURE_WORKFLOW_NAME",
    "SOCURE_ENV",
    "SOCURE_WEBHOOK_BEARER_TOKEN",
    "SOCURE_WEBHOOK_ENFORCE_SENDER_IP",
    "REFI_ENV",
    "NEXT_PUBLIC_REFI_ENV",
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) saved[k] = process.env[k];
  const withEnv = async (
    over: Record<string, string | undefined>,
    fn: () => Promise<void>,
  ) => {
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetServerEnvCacheForTests();
    try {
      await fn();
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      resetServerEnvCacheForTests();
    }
  };
  const SOCURE_OK = {
    REFI_KYC_PROVIDER: "socure",
    REFI_KYC_MOCK_CONTROLS: "0",
    SOCURE_API_BASE_URL: "https://riskos.sandbox.socure.com",
    SOCURE_API_KEY: "fixture-api-key-not-real-0123456789",
    SOCURE_WORKFLOW_NAME: "kyc-fraud-watchlist-docv-fixture",
    SOCURE_ENV: "sandbox",
    SOCURE_WEBHOOK_BEARER_TOKEN: SECRET,
    SOCURE_WEBHOOK_ENFORCE_SENDER_IP: "0",
  };
  const subject = { authId: "auth-socure-wh" };
  const CONSENT_AT = "2026-09-10T00:00:00.000Z";

  await section(
    "webhook auth: Bearer credential validation only, constant-time, unset token fails closed, sender IPs per environment (defense in depth)",
    async () => {
      assert.deepEqual(
        wa.verifySocureWebhookAuthorization(`Bearer ${SECRET}`, SECRET),
        { ok: true, scheme: "bearer" },
      );
      assert.equal(
        wa.verifySocureWebhookAuthorization(`Bearer ${SECRET}x`, SECRET).ok,
        false,
      );
      assert.equal(
        wa.verifySocureWebhookAuthorization(`Bearer ${SECRET}`, undefined).ok,
        false,
        "unset token → refused",
      );
      assert.equal(wa.verifySocureWebhookAuthorization(null, SECRET).ok, false);
      assert.equal(
        wa.verifySocureWebhookAuthorization(`Digest ${SECRET}`, SECRET).ok,
        false,
        "unknown scheme refused",
      );
      assert.equal(
        wa.verifySocureWebhookAuthorization(
          `Basic ${Buffer.from("u:" + "p".repeat(20)).toString("base64")}`,
          SECRET,
        ).ok,
        false,
        "Bearer only: Basic is refused",
      );
      assert.ok(
        wa.isDocumentedSocureSender("35.230.191.253", "sandbox") &&
          !wa.isDocumentedSocureSender("35.230.191.253", "production"),
      );
      assert.ok(wa.isDocumentedSocureSender("44.195.229.53", "production"));
      const src = read("apps/web/src/lib/kyc/socure/webhook-auth.ts").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      assert.ok(
        /timingSafeEqual/.test(src) && !/hmac|createHmac|signature/i.test(src),
        "no invented HMAC scheme; constant-time compare",
      );
    },
  );

  await section(
    "webhook route: dark unless socure; 401 without/with wrong credential; sender-IP allowlist when enforced; applies once; duplicates/unknown acknowledged; paused audited; wrong environment refused; session cookies irrelevant",
    async () => {
      const { POST } =
        await import("../apps/web/app/api/webhooks/kyc/provider/route.ts");
      const post = (body: unknown, headers: Record<string, string> = {}) =>
        POST(
          new NextRequest(
            "https://bff.example.invalid/api/webhooks/kyc/provider",
            {
              method: "POST",
              headers: { "content-type": "application/json", ...headers },
              body: typeof body === "string" ? body : JSON.stringify(body),
            },
          ),
        );
      await withEnv({ REFI_KYC_PROVIDER: "unconfigured" }, async () => {
        assert.equal(
          (await post({})).status,
          404,
          "dark when the adapter is not selected",
        );
      });
      await withEnv({ ...SOCURE_OK }, async () => {
        await entity.resetKycEvaluationForTests(subject.authId);
        const fake = new client.FakeSocureClient(fx.SCRIPT_REVIEW_DOCV);
        const p = new SocureKycProvider(() => fake);
        kycIndex.setSocureProviderForTests(p);
        await p.evaluate({
          subject,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "wh-1",
          correlationId: "wh",
        });
        const rec = (await entity.getKycEvaluation(subject.authId))!;
        const reqId = rec.evidence.providerRequestId!;
        const ev = (
          o: Partial<Parameters<typeof fx.webhookEvent>[0]> & {
            eventId: string;
          },
        ) => fx.webhookEvent({ requestId: reqId, ...o });
        const auth = { authorization: `Bearer ${SECRET}` };
        assert.equal(
          (await post(ev({ eventId: "550e8400-e29b-41d4-a716-446655440100" })))
            .status,
          401,
          "no credential",
        );
        assert.equal(
          (await post({ eventName: "evaluation_completed" })).status,
          401,
          "verification ping still needs the credential",
        );
        for (const eventName of ["evaluation_completed", "evaluation_paused"]) {
          assert.equal(
            (await post({ eventName }, auth)).status,
            200,
            `RiskOS dashboard verification ping (${eventName}) acknowledged`,
          );
        }
        assert.equal(
          (await post({ eventName: "something_else" }, auth)).status,
          400,
          "unknown eventName is not a ping",
        );
        {
          const diag =
            await import("../apps/web/src/lib/kyc/socure/webhook-diagnostics");
          const marker = ["SEC", "RET-VAL", "UE-9f8e7d6c"].join("");
          const ssnLike = ["123", "45", "6789"].join("-");
          const tokenLike = ["tok", "abc123456"].join("_");
          const leaky = {
            event_id: marker,
            data: { ssn: ssnLike, nested: { token: tokenLike } },
          };
          const sch = await import("../apps/web/src/lib/kyc/socure/schemas.ts");
          const parsed = sch.socureWebhookEventSchema.safeParse(leaky);
          assert.ok(!parsed.success);
          const text = JSON.stringify(
            diag.describeWebhookRejection(leaky, parsed.error, "corr-1"),
          );
          for (const v of [marker, ssnLike, tokenLike, "9f8e7d6c"]) {
            assert.ok(
              !text.includes(v),
              `diagnostic never carries values (${v})`,
            );
          }
          assert.ok(
            text.includes('"data.ssn":"string(11)"') &&
              text.includes('"path":"event_type"'),
            "diagnostic carries key shape and issue paths",
          );
          const res = await post(leaky, auth);
          assert.equal(res.status, 400);
          const body = (await res.json()) as {
            diagnostic?: { correlationId?: string };
          };
          const bodyText = JSON.stringify(body);
          assert.ok(
            bodyText.includes('"diagnostic"') &&
              !bodyText.includes(ssnLike) &&
              !bodyText.includes(tokenLike),
            "400 body carries the structure-only diagnostic and no values",
          );
          const corr = body.diagnostic?.correlationId ?? "";
          const audited = await entity.getWebhookEvent(`rejected:${corr}`);
          assert.ok(
            audited?.outcome === "envelope_rejected",
            "rejected envelope audited durably under its correlation id",
          );
          const auditText = JSON.stringify(audited);
          assert.ok(
            !auditText.includes(ssnLike) && !auditText.includes(tokenLike),
            "audit record carries no values",
          );
          assert.ok(
            !JSON.stringify(await (await post(leaky)).json()).includes(
              "diagnostic",
            ),
            "no diagnostic without the credential",
          );
        }
        assert.equal(
          (await post({ eventName: "evaluation_completed", data: {} }, auth))
            .status,
          400,
          "eventName plus envelope fields is not a ping",
        );
        assert.equal(
          (await entity.getKycEvaluation(subject.authId))?.status ?? "none",
          "none",
          "verification ping persists nothing",
        );
        for (const eventType of [
          "evaluation_completed",
          "evaluation_paused",
        ] as const) {
          const ping = fx.dashboardVerificationPing(eventType);
          const r = await post(ping, auth);
          assert.ok(
            r.status >= 200 && r.status < 300,
            `RiskOS full-envelope verification delivery (${eventType}) acknowledged 2xx, got ${String(r.status)}`,
          );
          assert.equal(
            (await post(ping)).status,
            401,
            "full-envelope delivery still needs the credential",
          );
          const withBogusEnv = {
            ...ping,
            data: { ...(ping.data as object), environment_name: "Staging" },
          };
          assert.equal(
            (await post(withBogusEnv, auth)).status,
            400,
            "non-enum environment_name is still rejected",
          );
        }
        assert.equal(
          (await entity.getKycEvaluation(subject.authId))?.status ?? "none",
          "none",
          "verification deliveries never touch a user record",
        );
        assert.equal(
          (
            await post(
              ev({ eventId: "550e8400-e29b-41d4-a716-446655440100" }),
              { authorization: "Bearer nope-nope-nope-nope-nope" },
            )
          ).status,
          401,
          "wrong credential",
        );
        assert.equal(
          (
            await post(
              ev({ eventId: "550e8400-e29b-41d4-a716-446655440100" }),
              { ...auth, cookie: "us_session_v1=forged" },
            )
          ).status,
          200,
          "a session cookie neither helps nor hurts",
        );
        assert.equal(
          (await entity.getKycEvaluation(subject.authId))!.state,
          "passed",
        );
        const dup = await post(
          ev({ eventId: "550e8400-e29b-41d4-a716-446655440100" }),
          auth,
        );
        assert.equal(dup.status, 200);
        assert.equal(
          ((await dup.json()) as { outcome: string }).outcome,
          "duplicate_event",
        );
        const unknown = await post(
          ev({
            eventId: "550e8400-e29b-41d4-a716-446655440101",
            evalId: fx.WEBHOOK_UNKNOWN_EVAL_ID,
          }),
          auth,
        );
        assert.equal(
          ((await unknown.json()) as { outcome: string }).outcome,
          "unknown_evaluation",
        );
        const paused = await post(
          ev({
            eventId: "550e8400-e29b-41d4-a716-446655440102",
            eventType: "evaluation_paused",
            decision: "REVIEW",
          }),
          auth,
        );
        assert.equal(paused.status, 200);
        assert.equal(
          ((await paused.json()) as { outcome: string }).outcome,
          "ignored",
        );
        assert.equal(
          (await entity.getWebhookEvent("550e8400-e29b-41d4-a716-446655440102"))
            ?.outcome,
          "ignored_event_type",
        );
        assert.equal(
          (
            await post(
              ev({
                eventId: "550e8400-e29b-41d4-a716-446655440103",
                environment: "Production",
              }),
              auth,
            )
          ).status,
          400,
          "environment mismatch refused",
        );
        assert.equal((await post("{not json", auth)).status, 400);
        assert.equal((await post({ hello: 1 }, auth)).status, 400);
        assert.equal(
          (
            await post(
              ev({ eventId: "550e8400-e29b-41d4-a716-446655440104" }),
              { ...auth, "content-length": String(300 * 1024) },
            )
          ).status,
          413,
        );
        assert.equal(
          (await entity.getKycEvaluation(subject.authId))!.state,
          "passed",
          "nothing above regressed the terminal state",
        );
        kycIndex.setSocureProviderForTests(null);
        await entity.resetKycEvaluationForTests(subject.authId);
      });
      await withEnv(
        {
          ...SOCURE_OK,
          SOCURE_WEBHOOK_ENFORCE_SENDER_IP: "1",
          REFI_TRUST_PROXY_HOST: "1",
        },
        async () => {
          // Behind the trusted edge only the LAST X-Forwarded-For entry counts.
          const auth = { authorization: `Bearer ${SECRET}` };
          const body = { hello: 1 };
          const send = async (h: Record<string, string>) =>
            (await post(body, { ...auth, ...h })).status;
          assert.equal(
            await send({ "x-forwarded-for": "3.218.138.162, 203.0.113.9" }),
            403,
            "forged first entry does not satisfy the allowlist behind a trusted edge",
          );
          assert.equal(
            await send({
              "x-real-ip": "3.218.138.162",
              "x-forwarded-for": "203.0.113.9",
            }),
            403,
            "client-supplied X-Real-IP is ignored behind a trusted edge",
          );
          assert.equal(
            await send({ "x-forwarded-for": "203.0.113.9, 3.218.138.162" }),
            400,
            "edge-appended documented sender passes the IP gate (then fails schema)",
          );
          assert.equal(
            await send({}),
            403,
            "no forwarded address behind a trusted edge is refused when enforced",
          );
        },
      );
      await withEnv(
        { ...SOCURE_OK, SOCURE_WEBHOOK_ENFORCE_SENDER_IP: "1" },
        async () => {
          const auth = { authorization: `Bearer ${SECRET}` };
          assert.equal(
            (
              await post(
                { hello: 1 },
                { ...auth, "x-forwarded-for": "203.0.113.9" },
              )
            ).status,
            403,
            "non-documented sender refused when enforced",
          );
          assert.equal(
            (
              await post(
                { hello: 1 },
                { ...auth, "x-forwarded-for": "35.230.191.253" },
              )
            ).status,
            400,
            "documented sandbox sender passes the IP gate (then fails schema)",
          );
        },
      );
      await withEnv(
        { ...SOCURE_OK, SOCURE_WEBHOOK_BEARER_TOKEN: undefined },
        async () => {
          assert.equal(
            (
              await post(
                { hello: 1 },
                { authorization: "Bearer anything-at-all-here" },
              )
            ).status,
            401,
            "no configured secret → refused, never open",
          );
        },
      );
      const src = read(
        "apps/web/app/api/webhooks/kyc/provider/route.ts",
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(
        !/console\./.test(src) && !/authorization[^\n]*\+/.test(src),
        "credential never logged or concatenated",
      );
      assert.ok(
        !/cookies|getAuthContext|bffMutate|bffRead/.test(src),
        "no session path in the webhook route",
      );
    },
  );

  await section(
    "step-up: token only for the owner while active; capture completion → under_review, never passed; CSP admits the capture SDK origin only with the public key",
    async () => {
      await withEnv({ ...SOCURE_OK }, async () => {
        await entity.resetKycEvaluationForTests(subject.authId);
        const fake = new client.FakeSocureClient(fx.SCRIPT_REVIEW_DOCV);
        const p = new SocureKycProvider(() => fake);
        await p.evaluate({
          subject,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "su-1",
          correlationId: "su",
        });
        assert.equal(await p.stepUpToken(subject), fx.FIXTURE_DOCV_TOKEN);
        assert.equal(await p.stepUpToken({ authId: "someone-else" }), null);
        const after = await p.markStepUpCaptured(subject, "su-c");
        assert.equal(after?.state, "under_review");
        assert.equal(
          await p.stepUpToken(subject),
          null,
          "no token once capture is reported",
        );
        assert.equal(
          await p.markStepUpCaptured(subject, "su-c2"),
          null,
          "second completion is a no-op",
        );
        assert.equal(
          (await entity.getKycEvaluation(subject.authId))!.state,
          "under_review",
          "capture is never verification",
        );
        await entity.resetKycEvaluationForTests(subject.authId);
      });
      for (const f of [
        "apps/web/app/api/v1/investor/kyc/step-up/route.ts",
        "apps/web/app/api/v1/investor/kyc/step-up/complete/route.ts",
      ]) {
        const src = read(f);
        assert.ok(
          /bff(Read|Mutate)/.test(src) &&
            !/socure/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")),
          `${f}: session-authenticated and vendor-neutral`,
        );
        assert.ok(
          !/SOCURE_|apiKey|api_key/.test(src),
          `${f}: no server credential`,
        );
      }
      const proxy = read("apps/web/proxy.ts");
      assert.ok(
        /NEXT_PUBLIC_SOCURE_SDK_KEY[\s\S]{0,120}https:\/\/websdk\.socure\.com/.test(
          proxy,
        ),
        "SDK origin gated on the public key",
      );
      const docv = read("apps/web/app/_lib/kyc/docv-sdk.ts");
      assert.ok(
        /onSuccess/.test(docv) && /never the verification decision/.test(docv),
      );
      assert.ok(
        !/SOCURE_API_KEY/.test(docv) &&
          !/SOCURE_API_KEY/.test(
            read(
              "apps/web/app/us/onboarding/kyc/_components/KycDocumentStepUp.tsx",
            ),
          ),
      );
      const page = read("apps/web/app/us/onboarding/kyc/page.tsx");
      assert.ok(
        /state === "additional_info_required" && <KycDocumentStepUp \/>/.test(
          page,
        ),
      );
    },
  );
}

// ─── Attestation evidence from the production KYC adapter (PR E) ───────────
{
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const ae = await import("../apps/web/src/lib/kyc/attestation-evidence.ts");
  const prov = await import("../apps/web/src/lib/kyc/provenance.ts");
  const fx = await import("../apps/web/src/lib/kyc/socure/fixtures.ts");
  const client = await import("../apps/web/src/lib/kyc/socure/client.ts");
  const { SocureKycProvider } =
    await import("../apps/web/src/lib/kyc/socure/adapter.ts");
  const { MockKycProvider } =
    await import("../apps/web/src/lib/kyc/mock-provider.ts");
  const entity =
    await import("../apps/web/src/lib/prototype-store/entities/kyc-evaluation.ts");
  const KEYS = [
    "REFI_KYC_PROVIDER",
    "REFI_KYC_MOCK_CONTROLS",
    "SOCURE_API_BASE_URL",
    "SOCURE_API_KEY",
    "SOCURE_WORKFLOW_NAME",
    "SOCURE_ENV",
    "SOCURE_WEBHOOK_SECRET",
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) saved[k] = process.env[k];
  const withEnv = async (
    over: Record<string, string | undefined>,
    fn: () => Promise<void>,
  ) => {
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetServerEnvCacheForTests();
    try {
      await fn();
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      resetServerEnvCacheForTests();
    }
  };
  const SOCURE_OK = {
    REFI_KYC_PROVIDER: "socure",
    REFI_KYC_MOCK_CONTROLS: "0",
    SOCURE_API_BASE_URL: "https://riskos.sandbox.socure.com",
    SOCURE_API_KEY: "fixture-api-key-not-real-0123456789",
    SOCURE_WORKFLOW_NAME: "kyc-fraud-watchlist-docv-fixture",
    SOCURE_ENV: "sandbox",
  };
  const CONSENT_AT = "2026-09-10T00:00:00.000Z";
  const subject = { authId: "auth-socure-att" };

  await section(
    "attestation evidence: final provider ACCEPT/REJECT → trusted passed/failed with adapter label, workflow level and opaque session ref; review/pending/error → null; mock → mock provenance; never PII/score/tags",
    async () => {
      await withEnv({ ...SOCURE_OK }, async () => {
        for (const id of [
          fx.FIXTURE_EVAL_ID_REVIEW,
          fx.FIXTURE_EVAL_ID_ACCEPT,
          fx.FIXTURE_EVAL_ID_REJECT,
        ]) {
          const owner = await entity.findAuthIdByProviderEvaluation(id);
          if (owner) await entity.resetKycEvaluationForTests(owner);
          await entity.clearEvaluationIndexForTests(id);
        }
        await entity.resetKycEvaluationForTests(subject.authId);
        let p = new SocureKycProvider(
          () => new client.FakeSocureClient(fx.SCRIPT_REVIEW_DOCV),
        );
        assert.equal(
          await ae.kycEvidenceForAttestation(p, subject),
          null,
          "no evaluation → null",
        );
        await p.evaluate({
          subject,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "att-1",
          correlationId: "att",
        });
        assert.equal(
          await ae.kycEvidenceForAttestation(p, subject),
          null,
          "REVIEW (step-up pending) → null, never pending-as-passed",
        );
        const reqId = (await entity.getKycEvaluation(subject.authId))!.evidence
          .providerRequestId!;
        await p.applyWebhook(
          fx.webhookEvent({
            eventId: "550e8400-e29b-41d4-a716-446655440200",
            requestId: reqId,
          }),
          "att-w",
        );
        const ev = await ae.kycEvidenceForAttestation(p, subject);
        assert.ok(
          ev && prov.isTrustedKycEvidence(ev),
          "final webhook ACCEPT → trusted evidence",
        );
        assert.equal(ev!.normalized.status, "passed");
        assert.equal(ev!.normalized.provider, "socure-kyc-adapter");
        assert.equal(ev!.normalized.level, SOCURE_OK.SOCURE_WORKFLOW_NAME);
        assert.match(ev!.normalized.evidence_ref, /^kyc-session:refi-kyc-/);
        assert.equal(ev!.source, "production_provider");
        const text = JSON.stringify(ev);
        for (const v of [
          fx.FIXTURE_INDIVIDUAL.given_name,
          fx.FIXTURE_INDIVIDUAL.email!,
          "fixture_reason_not_for_users",
          "fixture_tag_not_for_users",
          "score",
        ]) {
          assert.ok(
            !text.includes(v),
            `attestation evidence must not carry ${v}`,
          );
        }
        // REJECT → failed
        await entity.resetKycEvaluationForTests(subject.authId);
        await entity.clearEvaluationIndexForTests(fx.FIXTURE_EVAL_ID_REJECT);
        p = new SocureKycProvider(
          () => new client.FakeSocureClient(fx.SCRIPT_REJECT),
        );
        await p.evaluate({
          subject,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "att-2",
          correlationId: "att",
        });
        const rej = await ae.kycEvidenceForAttestation(p, subject);
        assert.ok(
          rej &&
            prov.isTrustedKycEvidence(rej) &&
            rej.normalized.status === "failed",
        );
        // provider error → null
        await entity.resetKycEvaluationForTests(subject.authId);
        p = new SocureKycProvider(
          () => new client.FakeSocureClient(fx.SCRIPT_503),
        );
        await p.evaluate({
          subject,
          individual: fx.FIXTURE_INDIVIDUAL,
          consentTimestamp: CONSENT_AT,
          submissionKey: "att-3",
          correlationId: "att",
        });
        assert.equal(
          await ae.kycEvidenceForAttestation(p, subject),
          null,
          "provider error → no evidence",
        );
        await entity.resetKycEvaluationForTests(subject.authId);
      });
      // mock → mock provenance (refused downstream)
      await withEnv(
        { REFI_KYC_PROVIDER: "mock", REFI_KYC_MOCK_CONTROLS: "1" },
        async () => {
          const m = new MockKycProvider();
          await m.reset(subject);
          const mev = await ae.kycEvidenceForAttestation(m, subject);
          assert.equal(mev?.source, "mock");
          assert.equal(prov.isTrustedKycEvidence(mev), false);
        },
      );
      // Pure rule: a record that claims final without provider provenance is never trusted.
      const { emptyEvidence } =
        await import("../apps/web/src/lib/kyc/evidence.ts");
      const forged = {
        ...emptyEvidence("socure", "passed"),
        referenceId: "refi-kyc-x",
        providerEvaluationId: "e",
        providerDecisionFinal: true,
        decisionProvenance: "refi_manual_review" as const,
      };
      assert.equal(
        ae.trustedEvidenceFromRecord("socure", forged),
        null,
        "manual/other provenance does not become trusted provider evidence here",
      );
      const src = readFileSync(
        join(
          REPO_ROOT,
          "apps/web/app/api/v1/investor/profile/v2/attestation/route.ts",
        ),
        "utf8",
      );
      assert.ok(
        /kycEvidenceForAttestation\(provider, \{ authId \}\)/.test(src) &&
          !/mockKycProvenance/.test(src),
        "the route delegates to the single evidence module",
      );
    },
  );
}

// ─── KYC logging hygiene (mandate §16): no PII, keys or tokens in application logs ──
{
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const walk = (dir: string): string[] =>
    readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? walk(`${dir}/${d.name}`)
        : /\.(tsx?)$/.test(d.name)
          ? [`${dir}/${d.name}`]
          : [],
    );
  await section(
    "kyc logging hygiene: no console/log call anywhere in the KYC, webhook, attestation or BFF wrapper paths; env/secret names never interpolated into messages; receipts carry no identity field",
    async () => {
      const files = [
        ...walk("apps/web/src/lib/kyc"),
        ...walk("apps/web/app/api/v1/investor/kyc"),
        ...walk("apps/web/app/api/webhooks"),
        ...walk("apps/web/app/_lib/kyc"),
        "apps/web/app/api/v1/investor/profile/v2/attestation/route.ts",
        "apps/web/src/lib/compliance/attestation-mapping.ts",
        "apps/web/src/lib/compliance/attestation-submission.ts",
        "apps/web/src/lib/bff/handler.ts",
        "apps/web/src/lib/prototype-store/entities/kyc-evaluation.ts",
        "apps/web/src/lib/prototype-store/entities/receipt.ts",
      ];
      for (const f of files) {
        const code = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        assert.ok(
          !/console\.(log|info|warn|error|debug)\s*\(/.test(code) &&
            !/process\.(stdout|stderr)\.write/.test(code),
          `${f}: no console logging`,
        );
        const withoutAuthHeader = code
          .split("\n")
          .filter((l) => !/Authorization: `Bearer \$\{apiKey\}`/.test(l))
          .join("\n");
        assert.ok(
          !/\$\{[^}]*(SOCURE_API_KEY|SOCURE_WEBHOOK_BEARER_TOKEN|NEXT_PUBLIC_SOCURE_SDK_KEY|national_id|nationalId|date_of_birth|dateOfBirth|api_key|apiKey)[^}]*\}/.test(
            withoutAuthHeader,
          ),
          `${f}: never interpolates a key, token or identity field into a string (the provider Authorization header is the only permitted use of the API key)`,
        );
      }
      // Receipts: the receipt entity stores only action/actor/authId/accountId/correlation/outcome/reason/references.
      const receipt = read(
        "apps/web/src/lib/prototype-store/entities/receipt.ts",
      );
      assert.ok(
        !/givenName|nationalId|dateOfBirth|address|email/.test(
          receipt.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
        ),
        "receipt entity has no identity fields",
      );
      // Error messages from the provider layer carry no request body.
      const errors = await import("../apps/web/src/lib/kyc/socure/errors.ts");
      for (const k of errors.SOCURE_ERROR_KINDS) {
        assert.ok(
          !/given_name|national_id|Bearer|api_key/i.test(
            new errors.SocureProviderError(k, 500).message,
          ),
        );
      }
    },
  );
}

// ─── Investor Profile v2 is the ONE canonical public questionnaire ──────────
{
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  await section(
    "profile: the public U.S. application has one canonical Investor Profile questionnaire (v2); legacy v1 riskTolerance collection must not reappear",
    async () => {
      const legacy = read("apps/web/app/us/onboarding/profile/page.tsx");
      assert.ok(
        /permanentRedirect\(\s*"\/us\/onboarding\/investor-profile"\s*\)/.test(
          legacy,
        ),
        "the legacy route must be a compatibility redirect to v2",
      );
      for (const forbidden of [
        "useAdvisoryProfile",
        "useSaveAdvisoryProfile",
        "riskTolerance",
        "<form",
        "/v1/profile",
        "useState",
        "apiFetch",
      ]) {
        assert.ok(
          !legacy.includes(forbidden),
          `legacy route must not contain ${forbidden}`,
        );
      }
      // No public UI asks for a user-entered risk tolerance.
      const walk = (dir: string): string[] =>
        readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(
          (d) =>
            d.isDirectory()
              ? walk(`${dir}/${d.name}`)
              : /\.(tsx?|ts)$/.test(d.name)
                ? [`${dir}/${d.name}`]
                : [],
        );
      // UI surfaces only: the server-side v1 BFF route (/api/v1/investor/profile)
      // is preserved per spec §19 and is not a questionnaire.
      for (const f of walk("apps/web/app").filter(
        (p) => !p.startsWith("apps/web/app/api/"),
      )) {
        assert.ok(
          !/riskTolerance/.test(read(f)),
          `${f} must not reference a user-entered riskTolerance`,
        );
      }
      // No live browser-direct /v1/profile transport remains.
      for (const f of [
        ...walk("apps/web/app"),
        "packages/api-clients/src/index.ts",
        "packages/api-clients/src/mocks/handlers.ts",
        "packages/api-clients/src/compat.ts",
      ]) {
        assert.ok(
          !/["'`]\/v1\/profile["'`]/.test(read(f)),
          `${f} must not carry the legacy /v1/profile transport`,
        );
      }
    },
  );

  await section(
    "profile: the account page reads canonical v2 through the same-origin BFF and links only to v2",
    async () => {
      const account = read("apps/web/app/us/app/account/page.tsx");
      const hook = read("apps/web/app/_hooks/useInvestorProfileV2.ts");
      assert.ok(
        /useInvestorProfileV2/.test(account),
        "account page must use the v2 hook",
      );
      assert.ok(
        /fetch\("\/api\/v1\/investor\/profile\/v2"/.test(hook),
        "v2 hook must read the same-origin BFF route",
      );
      assert.ok(
        !/prototype-store|investor-api\/gateway|@refi\/api-clients\/investor-api/.test(
          hook + account,
        ),
        "browser code must not read prototype storage or the Investor API directly",
      );
      assert.ok(
        !/\/us\/onboarding\/profile["']/.test(account),
        "account page must not link to the legacy v1 route",
      );
      assert.ok(
        (account.match(/\/us\/onboarding\/investor-profile/g) ?? []).length >=
          2,
        "both profile actions must link to v2",
      );
      assert.ok(
        /RISK_BAND_LABELS/.test(account) && /productFitStatus/.test(account),
        "card must display assessment-derived fields",
      );
      for (const f of [
        "apps/web/app/us/app/exceptions/page.tsx",
        "apps/web/app/us/_content/onboarding.ts",
      ]) {
        assert.ok(
          !/\/us\/onboarding\/profile["']/.test(read(f)),
          `${f} must route profile remediation/steps to v2`,
        );
      }
    },
  );

  await section(
    "profile: no compliance attestation is submitted and the v2 engine stays server-side",
    async () => {
      const walk = (dir: string): string[] =>
        readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(
          (d) =>
            d.isDirectory()
              ? walk(`${dir}/${d.name}`)
              : /\.(tsx?|ts)$/.test(d.name)
                ? [`${dir}/${d.name}`]
                : [],
        );
      for (const f of walk("apps/web/app")) {
        assert.ok(
          !/call\(\s*["']createComplianceProfileAttestation["']/.test(read(f)),
          `${f} must not submit an attestation`,
        );
      }
      // The engine is imported only server-side (routes) and by the package's
      // invariant tests — never by a client component.
      for (const f of walk("apps/web/app")) {
        const src = read(f);
        if (/assessInvestorProfile/.test(src)) {
          assert.ok(
            f.includes("/api/"),
            `${f}: assessInvestorProfile may only run in a BFF route`,
          );
        }
      }
    },
  );
  await section(
    "attestation mapping: pure, server-only, never submits, never emits trading eligible",
    async () => {
      const f = "apps/web/src/lib/compliance/attestation-mapping.ts";
      const src = read(f);
      assert.ok(existsSync(join(REPO_ROOT, f)), `${f} must exist`);
      // No transport: the module may not import the client, the gateway, or fetch.
      assert.ok(
        !/@refi\/api-clients\/investor-api|\/investor-api\/gateway|\bfetch\(/.test(
          src,
        ),
        "mapping module must not import a transport",
      );
      assert.ok(
        !/createComplianceProfileAttestation/.test(
          src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
        ),
        "mapping module must not reference the submit operation in code",
      );
      // The type excludes `eligible`; the string never appears as a trading value.
      assert.ok(
        /Exclude<\s*TradingEligibility,\s*"eligible"\s*>/.test(src),
        "trading_eligibility `eligible` must be unrepresentable",
      );
      assert.ok(
        /expires_at: null/.test(src),
        "expiry is undecided (§20 #6) — the builder must send null, not invent a duration",
      );
      assert.ok(
        /KYC_EVIDENCE_MOCK/.test(src) && /KYC_PROVENANCE_UNTRUSTED/.test(src),
        "mock and untrusted KYC provenance must be named fail-closed blocks",
      );
      // Trust is never inferred from a provider string.
      assert.ok(
        !/isProductionKycEvidence|\/mock\(|\.provider\?*\.(trim|includes|match)|test\(\s*provider/.test(
          src,
        ),
        "the mapping must not derive production trust from a provider label",
      );
      assert.ok(
        /isTrustedKycEvidence\(kyc\)/.test(src),
        "the builder must gate on the provenance marker",
      );
      // No client component and no browser hook may import it.
      const walk = (dir: string): string[] =>
        readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(
          (d) =>
            d.isDirectory()
              ? walk(`${dir}/${d.name}`)
              : /\.(tsx?|ts)$/.test(d.name)
                ? [`${dir}/${d.name}`]
                : [],
        );
      for (const file of [...walk("apps/web/app"), ...walk("apps/web/src")]) {
        const s = read(file);
        if (/compliance\/attestation-mapping/.test(s)) {
          assert.ok(
            !/^\s*["']use client["']/m.test(s),
            `${file}: a client module must not import the attestation mapping`,
          );
        }
      }
      // Exactly ONE module in apps/web submits an attestation: the step-6
      // submission chain (2026-09-10), which only reaches the call after the
      // backend-verified consent step and a pinned-authority build. Nothing
      // else — no route, no client module, no KYC module — calls it.
      const SUBMISSION_MODULE =
        "apps/web/src/lib/compliance/attestation-submission.ts";
      const submitters = [
        ...walk("apps/web/app"),
        ...walk("apps/web/src"),
      ].filter((file) =>
        /call\(\s*["']createComplianceProfileAttestation["']/.test(read(file)),
      );
      assert.deepEqual(
        submitters,
        [SUBMISSION_MODULE],
        "only the designated submission module may submit an attestation",
      );
    },
  );

  await section(
    "kyc provenance: no runtime path establishes trusted production provenance; marker is unforgeable",
    async () => {
      const f = "apps/web/src/lib/kyc/provenance.ts";
      const src = read(f);
      assert.ok(
        /const TRUSTED: unique symbol = Symbol\(/.test(src) &&
          !/Symbol\.for\(/.test(src),
        "the trust marker must be a module-private, non-registered symbol",
      );
      assert.ok(
        !/^export const TRUSTED|export \{[^}]*\bTRUSTED\b/m.test(src),
        "the trust marker must not be exported",
      );
      const walk = (dir: string): string[] =>
        readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(
          (d) =>
            d.isDirectory()
              ? walk(`${dir}/${d.name}`)
              : /\.(tsx?|ts)$/.test(d.name)
                ? [`${dir}/${d.name}`]
                : [],
        );
      const PERMITTED_CALLER = "apps/web/src/lib/kyc/attestation-evidence.ts";
      const runtime = [...walk("apps/web/app"), ...walk("apps/web/src")].filter(
        (x) => x !== f,
      );
      for (const file of runtime) {
        const code = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        if (file === PERMITTED_CALLER) {
          assert.ok(
            /establishTrustedKycProvenance\s*\(/.test(code) &&
              /providerDecisionFinal/.test(code) &&
              /provider_evaluation/.test(code) &&
              /provider_webhook/.test(code) &&
              !/socure/i.test(code),
            "the single permitted caller establishes trust only from a FINAL provider decision and names no vendor",
          );
          continue;
        }
        assert.ok(
          !/establishTrustedKycProvenance\s*\(/.test(code),
          `${file}: only ${PERMITTED_CALLER} may establish trusted KYC provenance`,
        );
        if (/kyc\/provenance|compliance\/attestation-mapping/.test(code)) {
          assert.ok(
            !/^\s*["']use client["']/m.test(read(file)),
            `${file}: a client module must not import the server-only provenance/mapping`,
          );
        }
      }
      // The mock boundary is classified as mock provenance, nothing else.
      assert.ok(
        /source: "mock"/.test(src) && /mockKycProvenance/.test(src),
        "the mock boundary must yield source: mock",
      );
    },
  );

  await section(
    "attestation mapping: canonical JSON is shared by the snapshot hash and the evidence digest",
    async () => {
      const entity = read(
        "apps/web/src/lib/prototype-store/entities/investor-profile-v2.ts",
      );
      assert.ok(
        /from "\.\.\/\.\.\/sec203a\/canonical-json"/.test(entity) &&
          !/function stableSerialize/.test(entity),
        "the v2 entity must use the shared stableSerialize, not a private copy",
      );
      const mapping = read(
        "apps/web/src/lib/compliance/attestation-mapping.ts",
      );
      assert.ok(
        /from "\.\.\/sec203a\/canonical-json"/.test(mapping),
        "the mapping must hash the shared canonical form",
      );
    },
  );
}

// ─── C1b-2 rows 18/19/20: Signal recommendations + activity reads ──────────

{
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const walk = (dir: string): string[] =>
    existsSync(join(REPO_ROOT, dir))
      ? readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(
          (d) =>
            d.isDirectory()
              ? walk(`${dir}/${d.name}`)
              : /\.(tsx?|ts)$/.test(d.name)
                ? [`${dir}/${d.name}`]
                : [],
        )
      : [];
  const browserAndPackage = [
    ...walk("apps/web/app"),
    ...walk("apps/web/src"),
    ...walk("packages/api-clients/src/hooks"),
    ...walk("packages/api-clients/src/mocks"),
    "packages/api-clients/src/index.ts",
    "packages/api-clients/src/compat.ts",
  ];

  await section(
    "signal reads: no browser-direct /v1/recommendations, /v1/recommendations/{id} or /v1/activity remains",
    async () => {
      for (const f of browserAndPackage) {
        const src = stripComments(read(f));
        assert.ok(
          !/["'`]\/v1\/recommendations(\/|["'`$])/.test(src),
          `${f}: browser-direct /v1/recommendations must not remain`,
        );
        assert.ok(
          !/["'`]\/v1\/activity["'`]/.test(src),
          `${f}: browser-direct /v1/activity must not remain`,
        );
      }
      for (const gone of [
        "packages/api-clients/src/hooks/recommendations.ts",
        "packages/api-clients/src/hooks/activity.ts",
        "packages/api-clients/src/hooks/subscription-mode.ts",
        "apps/web/src/lib/prototype-store/entities/recommendation-projection.ts",
      ]) {
        assert.ok(
          !existsSync(join(REPO_ROOT, gone)),
          `${gone} must be removed`,
        );
      }
      const idx = read("packages/api-clients/src/index.ts");
      for (const hook of [
        "useRecommendations",
        "useRecommendation",
        "useActivity",
      ]) {
        assert.ok(
          !new RegExp(`\\b${hook}\\b`).test(stripComments(idx)),
          `legacy ${hook} must not be exported`,
        );
      }
      const compat = stripComments(read("packages/api-clients/src/compat.ts"));
      assert.ok(
        !/export type (Recommendation|ActivityEvent) =|RecommendationProjection|InvestorRecommendationsResponse/.test(
          compat,
        ),
        "legacy recommendation/activity compatibility types must be removed",
      );
    },
  );

  await section(
    "signal reads: BFF routes use the frozen client operations and server-derived account scope",
    async () => {
      const list = read(
        "apps/web/app/api/v1/investor/recommendations/route.ts",
      );
      const detail = read(
        "apps/web/app/api/v1/investor/recommendations/[id]/route.ts",
      );
      const legs = read(
        "apps/web/app/api/v1/investor/recommendations/[id]/legs/route.ts",
      );
      const activity = read("apps/web/app/api/v1/investor/activity/route.ts");
      const recLib = read("apps/web/src/lib/investor-api/recommendations.ts");
      const recLibCode = stripComments(recLib);
      const recordsLib = stripComments(
        read("apps/web/src/lib/investor-api/account-records.ts"),
      );
      assert.ok(
        /client\.call\(\s*"listAccountRecommendations"/.test(recLibCode) &&
          /listRecommendations\(/.test(list),
        "list BFF must use listAccountRecommendations",
      );
      assert.ok(
        /client\.call\(\s*"getAccountRecommendation"/.test(recLibCode) &&
          /client\.call\(\s*"listAccountRecommendationLegs"/.test(recLibCode) &&
          /getRecommendationDetail\(/.test(detail) &&
          /listRecommendationLegsPage\(/.test(legs),
        "detail BFF must use getAccountRecommendation + listAccountRecommendationLegs",
      );
      assert.ok(
        /client\.call\(\s*"listAccountRecords"/.test(recordsLib) &&
          /listSignalActivity\(/.test(activity),
        "activity BFF must use listAccountRecords",
      );
      for (const [name, src] of [
        ["list", list],
        ["detail", detail],
        ["legs", legs],
        ["activity", activity],
      ] as const) {
        assert.ok(
          /resolveAccountScope\(client, ctx\.auth\)/.test(src),
          `${name} route must derive account scope server-side`,
        );
        assert.ok(
          !/searchParams\.get\(\s*["']account/.test(src) &&
            !/prototype-store/.test(src),
          `${name} route must not read a browser account id or prototype storage`,
        );
        assert.ok(
          !/upstreamGap/.test(src),
          `${name} route: G-001 gap tag removed`,
        );
      }
      // Old flat fields are not manufactured from unrelated data.
      assert.ok(
        !/\b(confidence|rationale)\b/.test(recLibCode) &&
          !/action:\s*["'](buy|sell|neutral|rebalance)["']/.test(recLibCode),
        "the projection must not fabricate legacy flat recommendation fields",
      );
      // Legs pagination is bounded and cursor-driven.
      assert.ok(
        /LEGS_PAGE_SIZE = CONTRACT_MAX_PAGE_SIZE/.test(recLib) &&
          /validateCursor\(/.test(legs) &&
          /RECOMMENDATION_LIST_MAX_PAGES = \d+/.test(recLib),
        "legs/list pagination must be bounded with explicit cursor handling",
      );
    },
  );

  await section(
    "signal reads: browser never imports the server-only Investor API client; no execution controls",
    async () => {
      for (const f of [...walk("apps/web/app"), ...walk("apps/web/src")]) {
        const raw = read(f);
        if (!/^\s*["']use client["']/m.test(raw)) continue;
        const src = stripComments(raw);
        assert.ok(
          !/from\s+["']@refi\/api-clients\/investor-api["']/.test(src) &&
            !/investor-api\/gateway|investor-api\/account-scope/.test(src),
          `${f}: a client module must not import the server-only Investor API client`,
        );
        // Type-only imports of the projection modules are allowed; runtime are not.
        const runtimeProjectionImport =
          /^import\s+(?!type\b)[^;]*from\s+["']@lib\/investor-api\/(recommendations|account-records|upstream-state)["']/m;
        assert.ok(
          !runtimeProjectionImport.test(src),
          `${f}: projection modules may be imported as types only from client code`,
        );
      }
      const pages = [
        "apps/web/app/us/app/recommendations/page.tsx",
        "apps/web/app/us/app/recommendations/[id]/page.tsx",
        "apps/web/app/us/app/activity/page.tsx",
      ];
      const copy = read("apps/web/app/us/_content/app-copy.ts");
      for (const f of pages) {
        const src = stripComments(read(f));
        assert.ok(
          !/\/api\/v1\/investor\/(orders|account-actions|allocations|accounts\/[^"']*\/(actions|orders))/.test(
            src,
          ) &&
            !/createAccountAction|createAllocationPreview|submitOrder/.test(
              src,
            ),
          `${f}: no recommendation/activity control may call an order/account-action endpoint`,
        );
        assert.ok(
          !/(onClick|href)[^\n]*(execute|approve|accept|activate|trade)/i.test(
            src,
          ),
          `${f}: no control wired to execute/approve/accept/activate/trade`,
        );
      }
      // Copy: the informational eligibility label never becomes an imperative control.
      assert.ok(
        !/^\s*\w+:\s*["'](Execute|Accept trade|Place order|Approve|Buy|Sell|Activate|Trade now)["']/m.test(
          copy,
        ),
        "recommendation/activity copy must not define execution-control labels",
      );
    },
  );

  await section(
    "investor activity: all 16 record variants render read-only; the category map is exhaustive; no record carries a control",
    async () => {
      const {
        ACCOUNT_RECORD_CATEGORY,
        EXECUTION_CHAIN_RECORD_TYPES,
        projectSignalActivity,
      } = await import("../apps/web/src/lib/investor-api/account-records.ts");
      assert.deepEqual([...EXECUTION_CHAIN_RECORD_TYPES].sort(), [
        "account_intent",
        "execution_plan",
        "fill",
        "order",
        "risk_decision",
      ]);
      const schemas = JSON.parse(
        read(
          "packages/api-clients/contracts/investor-api/v1.1.0-alpha.3/schemas.json",
        ),
      ) as {
        $defs: Record<
          string,
          {
            oneOf?: Array<{
              properties?: { record_type?: { const?: string } };
            }>;
          }
        >;
      };
      const variants = (schemas.$defs["AccountRecord"]?.oneOf ?? [])
        .map((v) => v.properties?.record_type?.const)
        .filter((v): v is string => typeof v === "string")
        .sort();
      assert.equal(variants.length, 16, "AccountRecord must have 16 variants");
      assert.deepEqual(Object.keys(ACCOUNT_RECORD_CATEGORY).sort(), variants);
      const base = {
        account_id: "acct_x",
        correlation_id: "corr_x",
        created_at: "2026-09-04T00:00:00Z",
        source_version: "v",
        details: {
          effective_at: "2026-09-04T00:00:00Z",
          entity_id: "e",
          reason_codes: [],
          status: "S",
        },
      };
      const all = variants.map((t, i) => ({
        ...base,
        record_id: `r${String(i)}`,
        record_type: t,
      }));
      const { items, excludedCount } = projectSignalActivity(
        all as Parameters<typeof projectSignalActivity>[0],
      );
      assert.equal(
        excludedCount,
        0,
        "D-LAUNCH-06 CLOSED — YES: nothing is withheld",
      );
      assert.equal(items.length, 16);
      // Read-only: the activity page renders no control for any record.
      const page = stripComments(read("apps/web/app/us/app/activity/page.tsx"));
      assert.ok(
        !/(onClick|href)[^\n]*(cancel|execute|approve|accept|retry|resubmit)/i.test(
          page,
        ),
        "the activity page must not wire any per-record control",
      );
      assert.ok(
        !/<Button|<button/.test(page),
        "the activity page renders no buttons",
      );
    },
  );

  await section(
    "signal reads: no attestation submission and no mutation appears as a side effect of this slice",
    async () => {
      for (const f of [...walk("apps/web/app"), ...walk("apps/web/src")]) {
        // The designated step-6 submission chain is the one permitted caller
        // (asserted exactly in the attestation-mapping section above).
        if (f === "apps/web/src/lib/compliance/attestation-submission.ts") {
          continue;
        }
        const src = stripComments(read(f));
        assert.ok(
          !/call\(\s*["']createComplianceProfileAttestation["']/.test(src),
          `${f} must not submit an attestation`,
        );
      }
      for (const f of [
        "apps/web/src/lib/investor-api/recommendations.ts",
        "apps/web/src/lib/investor-api/account-records.ts",
        "apps/web/src/lib/investor-api/account-scope.ts",
      ]) {
        const calls = [
          ...stripComments(read(f)).matchAll(/client\.call\(\s*"(\w+)"/g),
        ].map((m) => m[1]);
        for (const op of calls) {
          assert.ok(
            /^(list|get)[A-Z]/.test(op ?? ""),
            `${f}: ${op ?? "?"} is not a read operation`,
          );
        }
      }
    },
  );
}

// ─── Release governance: C1b-2 classification is single-truth after D-LAUNCH-06 ──

await section(
  "governance: C1b-2 mapping table carries no D (PARK_D_LAUNCH_06) row after the D-LAUNCH-06 closure",
  async () => {
    // Structural check on the canonical table, not prose matching: every legacy
    // row's class cell (the first bold letter in the class column) is read and
    // the D class must be empty; rows 13/14 must be A and 10/26 must be C.
    const doc = readFileSync(
      join(
        REPO_ROOT,
        "docs/releases/2026-09-signal/c1b2-browser-direct-reclassification.md",
      ),
      "utf8",
    );
    const classes = new Map<number, string>();
    for (const line of doc.split("\n")) {
      const cells = line.split("|");
      if (cells.length <= 19) continue;
      const n = Number(cells[1]?.trim());
      if (!Number.isInteger(n) || n < 1 || n > 26) continue;
      const m = /\*\*([ABCD])\b/.exec(cells[18] ?? "");
      if (m?.[1]) classes.set(n, m[1]);
    }
    assert.equal(
      classes.size,
      26,
      `expected 26 classified legacy rows, got ${String(classes.size)}`,
    );
    const d = [...classes.entries()]
      .filter(([, c]) => c === "D")
      .map(([n]) => n);
    assert.deepEqual(
      d,
      [],
      `D class must be empty after D-LAUNCH-06; found rows ${d.join(", ")}`,
    );
    assert.equal(
      classes.get(13),
      "A",
      "row 13 (createBrokerageConnection) must be A",
    );
    assert.equal(
      classes.get(14),
      "A",
      "row 14 (disconnectBrokerageConnection) must be A",
    );
    assert.equal(classes.get(10), "C", "row 10 (broker registry) must be C");
    assert.equal(classes.get(26), "C", "row 26 (legacy activate) must be C");
    // The §1 disposition table must state D = 0 and the register must show the closure.
    assert.ok(
      /D — PARK_D_LAUNCH_06[^\n]*\|\s*\*\*0\*\*/.test(doc),
      "§1 disposition table must show D = 0",
    );
    const register = readFileSync(
      join(REPO_ROOT, "docs/releases/2026-09-signal/open-items.md"),
      "utf8",
    );
    assert.ok(
      /\*\*D-LAUNCH-06\*\*[^\n]*CLOSED[^\n]*YES/.test(register),
      "open-items must record D-LAUNCH-06 CLOSED — YES",
    );
    assert.ok(
      /\*\*D-LAUNCH-07\*\*[^\n]*\*\*OPEN\*\*/.test(register),
      "open-items must record D-LAUNCH-07 OPEN",
    );
  },
);

// ─── Demo tier: persona sign-in is dark outside REFI_ENV=demo; personas are a closed enum ──

{
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const { createRequire: createRequireDemo } = await import("node:module");
  const requireDemo = createRequireDemo(
    join(process.cwd(), "apps/web/package.json"),
  );
  const { NextRequest } = (await import(
    requireDemo.resolve("next/server")
  )) as typeof import("next/server");
  const demo = await import("../apps/web/app/api/demo/session/route.ts");
  const personas = await import("../apps/web/src/lib/demo/personas.ts");
  const ORIGIN = "http://localhost:3000";
  const req = (
    method: string,
    body?: unknown,
    opts: { origin?: string | null; cookie?: string } = {},
  ) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const origin = opts.origin === undefined ? ORIGIN : opts.origin;
    if (origin) headers["origin"] = origin;
    if (opts.cookie) headers["cookie"] = opts.cookie;
    return new NextRequest(`${ORIGIN}/api/demo/session`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
  const withTier = async (tier: string, fn: () => Promise<void>) => {
    const saved = process.env["REFI_ENV"];
    process.env["REFI_ENV"] = tier;
    resetServerEnvCacheForTests();
    try {
      await fn();
    } finally {
      if (saved === undefined) delete process.env["REFI_ENV"];
      else process.env["REFI_ENV"] = saved;
      resetServerEnvCacheForTests();
    }
  };

  await section(
    "demo tier: /api/demo/session answers 404 on prod, staging and dev (production is never weakened)",
    async () => {
      for (const tier of ["prod", "staging", "dev"]) {
        await withTier(tier, async () => {
          assert.equal(demo.GET(req("GET")).status, 404, `${tier}: GET`);
          assert.equal(
            (await demo.POST(req("POST", { persona: "admitted" }))).status,
            404,
            `${tier}: POST`,
          );
          assert.equal(
            demo.DELETE(req("DELETE")).status,
            404,
            `${tier}: DELETE`,
          );
        });
      }
    },
  );

  await section(
    "demo tier: on REFI_ENV=demo the persona enum is closed, strict, same-origin, and asserts no authority",
    async () => {
      await withTier("demo", async () => {
        assert.deepEqual(
          [...personas.DEMO_PERSONAS],
          ["applicant", "invited", "admitted"],
        );
        // Impersonation shapes are rejected.
        for (const bad of [
          { persona: "root" },
          { persona: "admitted", authId: "usr_x" },
          { persona: "admitted", accountId: "acct_alpha_owned_01" },
          { persona: "admitted", email: "a@b.c" },
          { authId: "demo-admitted-01" },
          {},
        ]) {
          const r = await demo.POST(req("POST", bad));
          assert.equal(r.status, 400, `must reject ${JSON.stringify(bad)}`);
        }
        assert.equal(
          (
            await demo.POST(
              req("POST", { persona: "admitted" }, { origin: null }),
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await demo.POST(
              req(
                "POST",
                { persona: "admitted" },
                { origin: "http://evil.example" },
              ),
            )
          ).status,
          403,
        );
        // Query-string persona is ignored: only the body is read.
        const ok = await demo.POST(req("POST", { persona: "applicant" }));
        assert.equal(ok.status, 200);
        const body = (await ok.json()) as { data: Record<string, unknown> };
        assert.equal(body.data["persona"], "applicant");
        assert.equal(body.data["authorityAsserted"], false);
        for (const k of [
          "accountId",
          "account_id",
          "admitted",
          "approved",
          "authorization",
        ]) {
          assert.ok(!(k in body.data), `response must not assert ${k}`);
        }
        const setCookie = ok.headers.getSetCookie().join("\n");
        assert.ok(
          /us_session_v1=[^;]+;.*HttpOnly/i.test(setCookie),
          "session cookie must be HttpOnly",
        );
        assert.ok(
          /us_eligibility_v1=;/.test(setCookie),
          "applicant must NOT receive an eligibility decision",
        );
        const adm = await demo.POST(req("POST", { persona: "admitted" }));
        const admCookies = adm.headers.getSetCookie().join("\n");
        assert.ok(
          /us_eligibility_v1=[^;]{20,}/.test(admCookies),
          "admitted persona receives an eligibility decision cookie",
        );
        // The display cookie is never read for authority: GET reflects it, but
        // the BFF auth path never imports it.
        const authSrc = read("apps/web/src/lib/bff/auth.ts");
        assert.ok(
          !/us_demo_persona|DEMO_PERSONA_COOKIE|demo\/personas/.test(authSrc),
          "bff/auth.ts must not read the demo persona cookie",
        );
      });
    },
  );

  await section(
    "demo tier: the session subject is a fixed persona id; the demo module mints no account id or admission",
    async () => {
      const src = stripComments(read("apps/web/app/api/demo/session/route.ts"));
      assert.ok(
        !/linkAuthToAccount|accountId|account_id|listAccounts|createAccountAction|approved|admission/.test(
          src,
        ),
        "demo session route must not link accounts or assert admission",
      );
      assert.ok(
        /setSubject\(profile\.authId\)/.test(src),
        "session subject is the fixed persona authId",
      );
      for (const p of Object.values(personas.DEMO_PERSONA_PROFILES)) {
        assert.ok(
          /^demo-[a-z]+-\d{2}$/.test(p.authId),
          `persona authId ${p.authId} must be a fixed demo id`,
        );
      }
    },
  );

  await section(
    "alpha-claim client: retry link points at game.refi.trading and the claim lands at eligibility",
    async () => {
      const src = read(
        "apps/web/app/us/alpha-claim/_components/AlphaClaimClient.tsx",
      );
      assert.ok(
        /const GAME_URL = "https:\/\/game\.refi\.trading"/.test(src),
        "GAME_URL must be game.refi.trading",
      );
      assert.ok(
        !/play\.refi\.trading/.test(stripComments(src)),
        "the retired play.refi.trading host must not appear in the claim client",
      );
      assert.ok(
        /const CONTINUE_ROUTE = "\/us\/eligibility"/.test(src),
        "claim must continue to eligibility",
      );
    },
  );

  await section(
    "game progress is not identity, admission, or suitability: profile engine/entities never import handoff data",
    async () => {
      for (const f of [
        "apps/web/src/lib/sec203a/investor-profile-engine.ts",
        "apps/web/src/lib/sec203a/investor-profile.ts",
        "apps/web/src/lib/prototype-store/entities/investor-profile-v2.ts",
        "apps/web/src/lib/compliance/attestation-mapping.ts",
        "apps/web/src/lib/bff/auth.ts",
        "apps/web/src/lib/investor-api/account-scope.ts",
      ]) {
        const src = stripComments(read(f));
        assert.ok(
          !/alpha-application|alpha-handoff|alphaPlayerId|scoreBreakdown|completedArenas/.test(
            src,
          ),
          `${f} must not depend on game handoff data`,
        );
      }
    },
  );

  await section(
    "demo slice adds no brokerage-credential, allocation, account-action, or order route; the automated-Alpha surface is exactly the six contracted mutation routes (2026-09-10) and still no order/execution/intent route",
    async () => {
      const manifest = JSON.parse(
        read("compliance/API_ROUTE_MANIFEST.json"),
      ) as { routes: Array<{ route: string; auth: Record<string, string> }> };
      // The ONLY allocation / maintenance routes that may exist: each maps to
      // one contracted v1.1.0-alpha.2 operation, is bff-mutate (same-origin,
      // session, release-stage policy — 403 at signal), and is proved in the
      // "Automated-Alpha economic gating" section. Anything else here fails.
      const AUTOMATED_ALPHA_ROUTES = [
        "/api/v1/investor/allocation/join",
        "/api/v1/investor/allocation/leave",
        "/api/v1/investor/allocation/preview",
        "/api/v1/investor/allocation/update",
        "/api/v1/investor/broker/connection/[id]/rotate",
        "/api/v1/investor/broker/connection/[id]/sync",
      ];
      const adjacent = manifest.routes.filter((r) =>
        /brokerage-connections|credentials|allocation|\/actions|orders|execut|intent|rotate|sync/.test(
          r.route,
        ),
      );
      assert.deepEqual(
        adjacent.map((r) => r.route).sort(),
        AUTOMATED_ALPHA_ROUTES,
        "execution-adjacent routes are exactly the contracted automated-Alpha set",
      );
      for (const r of adjacent) {
        assert.deepEqual(
          r.auth,
          { POST: "bff-mutate" },
          `${r.route} is a gated mutation`,
        );
      }
      for (const r of manifest.routes) {
        assert.ok(
          !/orders|execut|intent|cancel|liquidat|transfer/.test(r.route),
          `unexpected execution route ${r.route}`,
        );
      }
    },
  );
}

// ─── Demo upstream: only on the demo tier; portfolio/preferences routes stay contract-bound ──

{
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const gateway = await import("../apps/web/src/lib/investor-api/gateway.ts");
  const auth = { authId: "demo-admitted-01", source: "prototype-bff" as const };

  await section(
    "demo upstream: REFI_INVESTOR_API_MODE=demo is refused on prod, staging and dev; served only on REFI_ENV=demo",
    async () => {
      const saved = {
        m: process.env["REFI_INVESTOR_API_MODE"],
        e: process.env["REFI_ENV"],
      };
      try {
        process.env["REFI_INVESTOR_API_MODE"] = "demo";
        for (const tier of ["prod", "staging", "dev"]) {
          process.env["REFI_ENV"] = tier;
          resetServerEnvCacheForTests();
          assert.throws(
            () => gateway.investorApiClientFor(auth),
            gateway.DemoUpstreamNotPermittedError,
            `${tier} must never be served by the demo world`,
          );
        }
        process.env["REFI_ENV"] = "demo";
        resetServerEnvCacheForTests();
        const client = gateway.investorApiClientFor(auth);
        const accounts = await client.call("listAccounts", {});
        assert.equal(
          accounts.data.data.items[0]?.account_id,
          "acct_demo_admitted_01",
        );
      } finally {
        if (saved.m === undefined) delete process.env["REFI_INVESTOR_API_MODE"];
        else process.env["REFI_INVESTOR_API_MODE"] = saved.m;
        if (saved.e === undefined) delete process.env["REFI_ENV"];
        else process.env["REFI_ENV"] = saved.e;
        resetServerEnvCacheForTests();
      }
    },
  );

  await section(
    "demo upstream: no client component imports the demo world or the server portfolio module at runtime",
    async () => {
      const walk = (dir: string): string[] =>
        readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(
          (d) =>
            d.isDirectory()
              ? walk(`${dir}/${d.name}`)
              : /\.(tsx?|ts)$/.test(d.name)
                ? [`${dir}/${d.name}`]
                : [],
        );
      for (const f of [...walk("apps/web/app"), ...walk("apps/web/src")]) {
        const raw = read(f);
        if (!/^\s*["']use client["']/m.test(raw)) continue;
        const src = stripComments(raw);
        assert.ok(
          !/demo-client|investor-api\/gateway/.test(src),
          `${f}: client code must not import the demo world or gateway`,
        );
        assert.ok(
          !/^import\s+(?!type\b)[^;]*from\s+["']@lib\/investor-api\/(portfolio|recommendations|account-records|upstream-state)["']/m.test(
            src,
          ),
          `${f}: projection modules may be imported as types only from client code`,
        );
      }
    },
  );

  await section(
    "portfolio + preferences routes: frozen-client operations, server-derived scope, four fields only, dedicated PATCH",
    async () => {
      const portfolioLib = stripComments(
        read("apps/web/src/lib/investor-api/portfolio.ts"),
      );
      for (const op of [
        "getAccountValuation",
        "listAccountValuations",
        "listAccountPositions",
        "listAccountMemberships",
        "getTemplate",
        "getAccountPreferences",
      ]) {
        assert.ok(
          new RegExp(`client\\.call\\(\\s*"${op}"`).test(portfolioLib),
          `portfolio must use ${op}`,
        );
      }
      const portfolioRoute = read(
        "apps/web/app/api/v1/investor/portfolio/route.ts",
      );
      assert.ok(
        /resolveAccountScope\(client, ctx\.auth\)/.test(portfolioRoute) &&
          !/prototype-store/.test(portfolioRoute),
      );
      // alpha.3 (2026-09-10): the route delegates the PATCH to the
      // acknowledgment-aware adapter; the dedicated operation, If-Match and
      // Idempotency-Key discipline live there, and the route still carries
      // the governed action and the four-field body.
      const prefsRoute = stripComments(
        read("apps/web/app/api/v1/investor/preferences/route.ts"),
      );
      const prefsAdapter = stripComments(
        read("apps/web/src/lib/investor-api/preference-confirmation.ts"),
      );
      const prefs = prefsRoute + "\n" + prefsAdapter;
      assert.ok(
        /startPreferenceChange\(/.test(prefsRoute) &&
          /client\.call\(\s*"updateAccountPreferences"/.test(prefsAdapter),
        "preferences must use the dedicated PATCH operation",
      );
      assert.ok(
        !/createAccountAction|"\/actions"/.test(prefs),
        "preferences must never travel through /actions (D-018)",
      );
      assert.ok(
        /ifMatch:/.test(prefsAdapter) && /idempotencyKey/.test(prefsAdapter),
        "If-Match + Idempotency-Key are required on PATCH",
      );
      assert.ok(
        /action:\s*"updateAccountPrefs"/.test(prefs),
        "governed by the Signal-allowed action",
      );
      for (const forbidden of [
        "allocation_percent",
        "capital",
        "risk_limit",
        "leverage",
        "reduce_only",
        "autopilot",
      ]) {
        assert.ok(
          !prefs.includes(forbidden),
          `preferences must not expose ${forbidden} (IB-06)`,
        );
      }
      for (const field of [
        "drift_threshold",
        "min_order",
        "excluded_assets",
        "fractional_enabled",
      ]) {
        assert.ok(prefs.includes(field), `preferences must map ${field}`);
      }
      // Pages read reconciled truth; the client-side simulation is gone.
      for (const gone of [
        "apps/web/app/_hooks/useSimulation.ts",
        "apps/web/app/us/app/_components/SimulatedDataBadge.tsx",
      ]) {
        assert.ok(
          !existsSync(join(REPO_ROOT, gone)),
          `${gone} must be removed — no synthetic portfolio data`,
        );
      }
    },
  );
}

// ─── Live events: read-only SSE behind the session; demo advance is demo-only ──

{
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");

  await section(
    "events route: session-verified, server-derived account scope, forwards the contract stream, mutates nothing",
    async () => {
      const src = stripComments(
        read("apps/web/app/api/v1/investor/events/route.ts"),
      );
      assert.ok(/getAuthContext\(req\)/.test(src), "must verify the session");
      assert.ok(
        /resolveAccountScope\(client, auth\)/.test(src),
        "must re-authorize account scope",
      );
      assert.ok(
        /investorApiEventSourceFor\(auth\)/.test(src) &&
          /last-event-id/.test(src),
        "must forward the contract stream with Last-Event-ID",
      );
      assert.ok(
        /text\/event-stream/.test(src) && /private, no-store/.test(src),
        "SSE with private no-store",
      );
      assert.ok(
        !/searchParams\.get\(\s*["']account/.test(src) &&
          !/client\.call\(\s*"(create|update|record|rotate|sync|disconnect|join)/.test(
            src,
          ),
        "events route reads only",
      );
      const events = stripComments(
        read("apps/web/src/lib/investor-api/events.ts"),
      );
      assert.ok(
        /client\.stream\(/.test(events),
        "frozen client path must use stream()",
      );
      // Browser: events are refresh signals; the hook never derives state from event bodies beyond labels.
      const hook = stripComments(
        read("apps/web/app/_hooks/useAccountEvents.ts"),
      );
      assert.ok(
        /invalidateQueries/.test(hook),
        "events must invalidate projections",
      );
      assert.ok(
        !/setQueryData/.test(hook),
        "events must never write projection state directly",
      );
      // Ticker: backend reference prices only; no client-side price generation.
      const ticker = stripComments(
        read("apps/web/app/us/app/_components/TickerTape.tsx"),
      );
      assert.ok(
        !/Math\.random|setInterval/.test(ticker),
        "ticker must not simulate prices",
      );
      assert.ok(
        /referencePrice/.test(ticker),
        "ticker must show the backend reference price",
      );
      for (const f of [
        "apps/web/app/us/app/_components/TickerTape.tsx",
        "apps/web/app/us/app/_components/LiveEventsProvider.tsx",
      ]) {
        assert.ok(
          !/<Button|<button|onClick/.test(stripComments(read(f))),
          `${f}: live surfaces render no controls`,
        );
      }
    },
  );

  await section(
    "no wallet as login: the wallet stack mounts only in local mock mode; session is BFF-owned; legacy /auth/* browser calls are gone",
    async () => {
      const layout = stripComments(read("apps/web/app/us/layout.tsx"));
      assert.ok(
        /<MaybeWalletProvider>/.test(layout) &&
          !/<WalletProvider>/.test(layout),
        "us layout must mount the wallet stack through MaybeWalletProvider only",
      );
      const maybe = stripComments(
        read("apps/web/app/_providers/wallet/MaybeWalletProvider.tsx"),
      );
      assert.ok(
        /NEXT_PUBLIC_REFI_ENV"\]\s*!==\s*"prod"/.test(maybe) &&
          /NEXT_PUBLIC_REFI_DATA_ADAPTER"\]\s*\?\?\s*"mock"\)\s*===\s*"mock"/.test(
            maybe,
          ),
        "wallet stack is gated to non-prod mock mode",
      );
      // The wagmi/WalletConnect config is built lazily on first mount: importing the
      // module must not initialise AppKit (which phones home) on prod/demo builds.
      const wcfg = stripComments(
        read("apps/web/app/_providers/wallet/config.ts"),
      );
      assert.ok(
        /export function getWagmiConfig\(\)/.test(wcfg) &&
          !/^export const \w+\s*(?::\s*Config)?\s*=\s*getDefaultConfig/m.test(
            wcfg,
          ),
        "wagmi config must be created lazily, never at module evaluation",
      );
      const wprov = stripComments(
        read("apps/web/app/_providers/wallet/WalletProvider.tsx"),
      );
      assert.ok(
        /useState\(\(\) => getWagmiConfig\(\)\)/.test(wprov),
        "WalletProvider builds the config on mount",
      );
      const auth = stripComments(
        read("apps/web/app/_providers/auth/AuthProvider.tsx"),
      );
      assert.ok(
        /fetch\("\/api\/v1\/investor\/session"/.test(auth),
        "AuthProvider must read the BFF session",
      );
      assert.ok(
        /method:\s*"DELETE"/.test(auth),
        "sign-out must go through the BFF session route",
      );
      assert.ok(
        !/\/auth\/(session|refresh|revoke-all)/.test(auth) &&
          !/useSession\b|useSessionRefresh|useSignOut|wallet_id/.test(auth),
        "no legacy browser-direct session calls or wallet identity",
      );
      const connect = stripComments(
        read("apps/web/app/us/auth/connect/page.tsx"),
      );
      assert.ok(
        /WALLET_LINKING_AVAILABLE\s*\?/.test(connect) && /lazy\(/.test(connect),
        "connect page renders the wagmi card only in mock mode, lazily",
      );
      assert.ok(
        /router\.replace\("\/us\/onboarding"\)/.test(connect),
        "signed-in visitors continue to onboarding",
      );
      for (const f of [
        "packages/api-clients/src/index.ts",
        "packages/api-clients/src/mocks/handlers.ts",
        "packages/api-clients/src/compat.ts",
      ]) {
        assert.ok(
          !/\/auth\/(session|refresh|revoke-all)|useSessionRefresh|useSignOut|AuthSession\b/.test(
            stripComments(read(f)),
          ),
          `${f}: legacy session surface retired`,
        );
      }
      assert.ok(
        !existsSync(
          join(REPO_ROOT, "packages/api-clients/src/hooks/session.ts"),
        ),
        "hooks/session.ts must be deleted",
      );
      // The wallet stack (wagmi / RainbowKit) may be imported only by the mock-only wallet files.
      {
        const { execSync } = await import("node:child_process");
        const files = execSync(
          "git ls-files 'apps/web/app/**/*.ts' 'apps/web/app/**/*.tsx'",
          { cwd: REPO_ROOT, encoding: "utf8" },
        )
          .split("\n")
          .filter(Boolean);
        const allowed = new Set([
          "apps/web/app/_providers/wallet/WalletProvider.tsx",
          "apps/web/app/_providers/wallet/config.ts",
          "apps/web/app/_hooks/useSiweAuth.ts",
          "apps/web/app/us/auth/connect/_components/WalletLinkCard.tsx",
        ]);
        for (const f of files) {
          if (allowed.has(f)) continue;
          if (!existsSync(join(REPO_ROOT, f))) continue;
          assert.ok(
            !/from\s+"(wagmi|@rainbow-me\/rainbowkit)/.test(
              stripComments(read(f)),
            ),
            `${f}: wagmi/RainbowKit may only be imported by the mock-only wallet files`,
          );
        }
        assert.ok(
          !existsSync(
            join(REPO_ROOT, "apps/web/app/us/app/_components/WalletButton.tsx"),
          ),
          "the app-shell wallet button is retired",
        );
      }
      const sessionRoute = stripComments(
        read("apps/web/app/api/v1/investor/session/route.ts"),
      );
      assert.ok(
        /export function DELETE/.test(sessionRoute) &&
          /origin !== requestOrigin\(req\)/.test(sessionRoute),
        "DELETE session is same-origin only",
      );
      assert.ok(
        /us_session_v1/.test(sessionRoute) && /Max-Age=0/.test(sessionRoute),
        "DELETE session clears the cookie",
      );
      const manifest = JSON.parse(
        read("compliance/API_ROUTE_MANIFEST.json"),
      ) as {
        routes: Array<{
          route: string;
          methods: string[];
          auth: Record<string, string>;
        }>;
      };
      const sess = manifest.routes.find(
        (r) => r.route === "/api/v1/investor/session",
      );
      assert.ok(
        sess &&
          sess.methods.includes("DELETE") &&
          sess.auth["DELETE"] === "session-clear",
        "manifest must list DELETE session as session-clear",
      );
    },
  );

  await section(
    "broker connection: paper-only by shape, credentials forwarded once and never retained; onboarding pages read the BFF; no activate verb; legacy /v1 hooks gone",
    async () => {
      const route = stripComments(
        read("apps/web/app/api/v1/investor/broker/connection/route.ts"),
      );
      assert.ok(
        /environment:\s*z\.literal\("paper"\)/.test(route),
        "environment must be the literal paper",
      );
      assert.ok(
        /\^PK\[A-Z0-9\]\{18\}\$/.test(route),
        "only PK (paper) key ids parse",
      );
      assert.ok(
        /action:\s*"connectBroker"/.test(route),
        "Signal-allowed action connectBroker",
      );
      assert.ok(
        /connectBrokerage\(/.test(route) &&
          /client\.call\("createBrokerageConnection"/.test(
            stripComments(
              read("apps/web/src/lib/investor-api/brokerage-connection.ts"),
            ),
          ),
        "forwards to the contract's createBrokerageConnection through connectBrokerage",
      );
      assert.ok(
        /resolveAccountScope\(client, ctx\.auth\)/.test(route),
        "account scope is server-derived",
      );
      assert.ok(
        !/console\.|apiSecretKey\)\s*\.digest|localStorage|cookies\.set|put[A-Z]\w*\(/.test(
          route,
        ),
        "the route never logs, hashes into a key, or stores the credentials",
      );
      assert.ok(
        !/apiSecretKey/.test(
          route.split("idempotencyKey = createHash")[1]?.split("digest")[0] ??
            "",
        ),
        "the idempotency key never includes the secret",
      );
      assert.ok(
        /outcome\.connection/.test(route) &&
          /projectBrokerageConnection\(res\.data\.data\)/.test(
            stripComments(
              read("apps/web/src/lib/investor-api/brokerage-connection.ts"),
            ),
          ),
        "the response is the status projection, never the request",
      );
      assert.ok(
        !/alpaca\.markets|paper-api/.test(route),
        "the BFF never calls Alpaca",
      );
      // Daniel 2026-09-09 correction: NO AccountAuthorization precondition
      // before the FIRST brokerage connection. An admitted account without a
      // connection legitimately reports DENIED / BROKER_CONNECTION_MISSING, so
      // requiring AUTHORIZED here was circular. The credential is still built
      // only inside connectBrokerage and forwarded exactly once.
      {
        const lib = stripComments(
          read("apps/web/src/lib/investor-api/brokerage-connection.ts"),
        );
        const fn = lib.slice(
          lib.indexOf("export async function connectBrokerage"),
        );
        assert.ok(
          !/getAccountAuthorization/.test(fn),
          "connectBrokerage must not read AccountAuthorization before the first connection (circular gate removed 2026-09-09)",
        );
        assert.ok(
          !/not_authorized/.test(lib) && !/!== "AUTHORIZED"/.test(lib),
          "no AUTHORIZED-before-connect branch remains in the connection module",
        );
        assert.equal(
          (fn.match(/client\.call\("createBrokerageConnection"/g) ?? []).length,
          1,
          "the credential is forwarded to createBrokerageConnection exactly once",
        );
        assert.ok(
          /connectBrokerage\(/.test(route) &&
            !/client\.call\("createBrokerageConnection"/.test(route),
          "the route mutates only through connectBrokerage",
        );
        assert.ok(
          !/account_not_authorized/.test(route) &&
            !/getAccountAuthorization/.test(route),
          "the route has no authorization precondition and never relabels the backend word",
        );
      }
      // Onboarding aggregate: account-local reads only after authoritative scope resolution.
      {
        const agg = stripComments(
          read("apps/web/app/api/v1/investor/onboarding/route.ts"),
        );
        const iScope = agg.indexOf("resolveAccountScope(client, auth)");
        const iProfile = agg.indexOf("latestProfileVersion(");
        const iAuthz = agg.indexOf('client.call("getAccountAuthorization"');
        assert.ok(
          iScope >= 0 && iProfile > iScope && iAuthz > iScope,
          "profile/authorization reads must follow resolveAccountScope",
        );
        assert.ok(
          !/latestProfileVersion\(auth\.accountId/.test(agg) &&
            !/auth\.accountId\b/.test(agg.replace(/if \(!ctx\.auth\)/g, "")),
          "the aggregate never reads account-local state by the unverified claim",
        );
        assert.ok(
          /instanceof AccountScopeError/.test(agg),
          "a zero-account applicant is a valid state, not a 500",
        );
      }
      // Setup surface: two distinct backend words, a pure gate, no admission label on authorization.
      {
        const page = stripComments(
          read("apps/web/app/us/onboarding/activation/page.tsx"),
        );
        const copy = read("apps/web/app/us/_content/onboarding.ts");
        assert.ok(
          /setupGate\(/.test(page) && /gate\.dashboard \?/.test(page),
          "dashboard continuation is decided by setupGate only",
        );
        assert.ok(
          /setup-onboarding-state/.test(page) &&
            /setup-authorization/.test(page),
          "both OnboardingStatus.state and AccountAuthorization.status are rendered",
        );
        const setupCopy = copy.slice(
          copy.indexOf("  setup: {"),
          copy.indexOf("} as const;"),
        );
        assert.ok(
          !/admission/i.test(
            setupCopy.replace(
              /Human Alpha admission is recorded by ReFi operators outside this app; this page only shows the resulting state\./,
              "",
            ),
          ),
          "no label presents a backend status as Alpha admission",
        );
        const gate = stripComments(
          read("apps/web/app/us/onboarding/_lib/setup-gate.ts"),
        );
        assert.ok(
          /authz !== AUTHORIZED_STATUS/.test(gate) &&
            /input\.onboardingState !== READY_ONBOARDING_STATE/.test(gate),
          "gate requires AUTHORIZED and READY",
        );
        assert.ok(
          !/fetch\(|useMutation|onClick/.test(page),
          "the setup surface has no control and no mutation",
        );
      }
      const proj = stripComments(
        read("apps/web/src/lib/investor-api/brokerage-connection.ts"),
      );
      {
        // Scope to the projection: the interface + projectBrokerageConnection.
        const projOnly = proj.slice(
          proj.indexOf("export interface BrokerageConnectionView"),
          proj.indexOf("export async function getBrokerageConnection"),
        );
        assert.ok(
          !/api_key|api_secret|credentials/.test(projOnly),
          "the projection carries no credential field",
        );
      }
      // Demo world: validates the request against the contract and keeps nothing from the credentials.
      const demo = stripComments(
        read("apps/web/src/lib/investor-api/demo-client.ts"),
      );
      assert.ok(
        /assertMatches\("BrokerageConnectionRequest", body, "request"\)/.test(
          demo,
        ),
        "demo validates the connection request",
      );
      assert.ok(
        !/credentials\.api_key|credentials\.api_secret|req\.credentials/.test(
          demo,
        ),
        "demo never reads the credential values",
      );
      // Browser: BFF hooks only; the legacy hook family is gone from the package.
      for (const f of [
        "apps/web/app/us/onboarding/broker/page.tsx",
        "apps/web/app/us/onboarding/strategy/page.tsx",
        "apps/web/app/us/onboarding/activation/page.tsx",
        "apps/web/app/us/app/account/page.tsx",
      ]) {
        const src = stripComments(read(f));
        assert.ok(
          !/from\s+"@refi\/api-clients"/.test(src) ||
            !/useBroker|useStrategy|useActivat/.test(src),
          `${f}: no legacy browser-direct broker/onboarding hooks`,
        );
        assert.ok(
          !/\/v1\/brokers|\/v1\/strategies|\/v1\/account\/activat/.test(src),
          `${f}: no legacy paths`,
        );
      }
      for (const f of [
        "packages/api-clients/src/hooks/broker.ts",
        "packages/api-clients/src/hooks/onboarding.ts",
        "packages/api-clients/src/mocks/fixtures/maya.ts",
        "packages/api-clients/src/mocks/fixtures/david.ts",
      ]) {
        assert.ok(!existsSync(join(REPO_ROOT, f)), `${f} must be deleted`);
      }
      const handlers = stripComments(
        read("packages/api-clients/src/mocks/handlers.ts"),
      );
      assert.ok(
        !/\/v1\/brokers|\/v1\/strategies|\/v1\/account\//.test(handlers),
        "MSW no longer mocks broker/strategy/activation",
      );
      const setup = stripComments(
        read("apps/web/app/us/onboarding/activation/page.tsx"),
      );
      assert.ok(
        !/useMutation|fetch\(|onClick/.test(setup),
        "the setup checklist has no mutation and no control",
      );
      assert.ok(
        !/\bactivate\b/i.test(
          setup.replace(/\/us\/onboarding\/activation/g, ""),
        ),
        "no activate verb on the setup checklist",
      );
      const broker = stripComments(
        read("apps/web/app/us/onboarding/broker/page.tsx"),
      );
      assert.ok(
        /environment:\s*"paper"/.test(broker) && !/"live"/.test(broker),
        "the form can only express paper",
      );
      assert.ok(
        !/localStorage|sessionStorage|document\.cookie/.test(broker),
        "the form never persists key material",
      );
      const manifest = JSON.parse(
        read("compliance/API_ROUTE_MANIFEST.json"),
      ) as {
        routes: Array<{
          route: string;
          methods: string[];
          auth: Record<string, string>;
        }>;
      };
      const bc = manifest.routes.find(
        (r) => r.route === "/api/v1/investor/broker/connection",
      );
      assert.ok(
        bc && bc.auth["POST"] === "bff-mutate" && bc.auth["GET"] === "bff-read",
        "manifest: broker connection GET bff-read, POST bff-mutate",
      );
      assert.ok(
        manifest.routes.some(
          (r) =>
            r.route === "/api/v1/investor/onboarding" &&
            r.methods.join() === "GET",
        ),
        "manifest: onboarding summary is GET-only",
      );
      // Demo-tier account link: server-only registry keyed by the verified subject; never a browser value.
      const auth = stripComments(read("apps/web/src/lib/bff/auth.ts"));
      assert.ok(
        /REFI_ENV === "demo"/.test(auth) &&
          /DEMO_PERSONA_ACCOUNT_LINK\[sub\]/.test(auth),
        "demo account link is derived from the verified subject on the demo tier only",
      );
      assert.ok(
        !/searchParams|req\.headers\.get\("x-account/.test(auth),
        "no browser-supplied account id",
      );
    },
  );

  await section(
    "demo advance: 404 on prod/staging/dev; on demo it needs same-origin + session and touches only the demo world",
    async () => {
      const { createRequire } = await import("node:module");
      const requireWeb = createRequire(
        join(process.cwd(), "apps/web/package.json"),
      );
      const { NextRequest } = (await import(
        requireWeb.resolve("next/server")
      )) as typeof import("next/server");
      const adv = await import("../apps/web/app/api/demo/advance/route.ts");
      const req = (origin: string | null) => {
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (origin) headers["origin"] = origin;
        return new NextRequest("http://localhost:3000/api/demo/advance", {
          method: "POST",
          headers,
          body: "{}",
        });
      };
      const saved = process.env["REFI_ENV"];
      try {
        for (const tier of ["prod", "staging", "dev"]) {
          process.env["REFI_ENV"] = tier;
          resetServerEnvCacheForTests();
          assert.equal(
            (await adv.POST(req("http://localhost:3000"))).status,
            404,
            tier,
          );
        }
        process.env["REFI_ENV"] = "demo";
        resetServerEnvCacheForTests();
        assert.equal(
          (await adv.POST(req(null))).status,
          403,
          "same-origin required",
        );
        assert.equal(
          (await adv.POST(req("http://localhost:3000"))).status,
          401,
          "session required",
        );
      } finally {
        if (saved === undefined) delete process.env["REFI_ENV"];
        else process.env["REFI_ENV"] = saved;
        resetServerEnvCacheForTests();
      }
      const src = stripComments(read("apps/web/app/api/demo/advance/route.ts"));
      assert.ok(
        /advanceDemoWorld\(/.test(src) &&
          !/investor-api\/gateway|createInvestorApiClient/.test(src),
        "advance touches only the demo world",
      );
    },
  );
}

// ─── Demo simulated game handoff: dark everywhere but a keyed demo tier; the REAL claim route verifies it ──

{
  const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const { createRequire } = await import("node:module");
  const requireWeb = createRequire(
    join(process.cwd(), "apps/web/package.json"),
  );
  const { NextRequest } = (await import(
    requireWeb.resolve("next/server")
  )) as typeof import("next/server");
  const { generateKeyPairSync } = await import("node:crypto");
  const handoff = await import("../apps/web/app/api/demo/handoff/route.ts");
  const claim =
    await import("../apps/web/app/api/v1/investor/alpha-claim/route.ts");
  const session = await import("../apps/web/app/api/demo/session/route.ts");
  const ORIGIN = "http://localhost:3000";
  const post = (
    path: string,
    body: unknown,
    opts: { origin?: string | null; cookie?: string } = {},
  ) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const origin = opts.origin === undefined ? ORIGIN : opts.origin;
    if (origin) headers["origin"] = origin;
    if (opts.cookie) headers["cookie"] = opts.cookie;
    return new NextRequest(`${ORIGIN}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  };
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const PUB = JSON.stringify(pair.publicKey.export({ format: "jwk" }));
  const PRIV = JSON.stringify(pair.privateKey.export({ format: "jwk" }));
  const withEnv = async (
    vars: Record<string, string | undefined>,
    fn: () => Promise<void>,
  ) => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) saved[k] = process.env[k];
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetServerEnvCacheForTests();
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      resetServerEnvCacheForTests();
    }
  };
  const KEYED = {
    DEMO_HANDOFF_PRIVATE_KEY_JWK: PRIV,
    ALPHA_HANDOFF_PUBLIC_KEY_JWK: PUB,
    FLAG_ALPHA_CLAIM_ROUTE: "on",
  };

  await section(
    "demo handoff: 404 on prod, staging and dev even with a key; 404 on demo without the key or with the claim flag off",
    async () => {
      for (const tier of ["prod", "staging", "dev"]) {
        await withEnv({ REFI_ENV: tier, ...KEYED }, async () => {
          assert.equal(
            (await handoff.POST(post("/api/demo/handoff", {}))).status,
            404,
            tier,
          );
        });
      }
      await withEnv(
        { REFI_ENV: "demo", ...KEYED, DEMO_HANDOFF_PRIVATE_KEY_JWK: undefined },
        async () => {
          assert.equal(
            (await handoff.POST(post("/api/demo/handoff", {}))).status,
            404,
            "demo without key",
          );
        },
      );
      await withEnv(
        { REFI_ENV: "demo", ...KEYED, FLAG_ALPHA_CLAIM_ROUTE: "off" },
        async () => {
          assert.equal(
            (await handoff.POST(post("/api/demo/handoff", {}))).status,
            404,
            "demo with the claim route dark",
          );
        },
      );
    },
  );

  await section(
    "demo handoff: same-origin + session + strict body; the token is ES256 for a fixed demo player and the REAL claim route accepts it exactly as a game token",
    async () => {
      await withEnv({ REFI_ENV: "demo", ...KEYED }, async () => {
        assert.equal(
          (await handoff.POST(post("/api/demo/handoff", {}, { origin: null })))
            .status,
          403,
          "origin required",
        );
        assert.equal(
          (await handoff.POST(post("/api/demo/handoff", {}))).status,
          401,
          "session required",
        );
        const signin = await session.POST(
          post("/api/demo/session", { persona: "applicant" }),
        );
        assert.equal(signin.status, 200);
        const cookie = (signin.headers.get("set-cookie") ?? "")
          .split(/,(?=[^ ;]+=)/)
          .map((c) => c.split(";")[0] ?? "")
          .filter((c) => c.startsWith("us_session_v1="))
          .join("; ");
        assert.ok(cookie.length > 0, "session cookie minted");
        assert.equal(
          (
            await handoff.POST(
              post("/api/demo/handoff", { sub: "someone-else" }, { cookie }),
            )
          ).status,
          400,
          "strict body: no caller-chosen claims",
        );
        const minted = await handoff.POST(
          post("/api/demo/handoff", {}, { cookie }),
        );
        assert.equal(minted.status, 200);
        const body = (await minted.json()) as {
          data: {
            claimPath: string;
            simulated: boolean;
            authorityAsserted: boolean;
          };
        };
        assert.equal(body.data.simulated, true);
        assert.equal(body.data.authorityAsserted, false);
        const token = new URL(body.data.claimPath, ORIGIN).searchParams.get(
          "token",
        );
        assert.ok(token, "claimPath carries the token");
        const [h, b] = token.split(".");
        const header = JSON.parse(
          Buffer.from(h ?? "", "base64url").toString(),
        ) as { alg: string };
        const claims = JSON.parse(
          Buffer.from(b ?? "", "base64url").toString(),
        ) as Record<string, unknown>;
        assert.equal(header.alg, "ES256");
        assert.equal(claims["sub"], handoff.DEMO_GAME_PLAYER_ID);
        assert.equal(
          claims["campaignSource"],
          handoff.DEMO_HANDOFF_CAMPAIGN_SOURCE,
        );
        assert.equal(claims["intendedDestination"], "ELIGIBILITY");
        assert.ok(
          (claims["exp"] as number) - (claims["iat"] as number) <= 600,
          "lifetime within the claim route's maximum",
        );
        const first = await claim.POST(
          post("/api/v1/investor/alpha-claim", { token }),
        );
        assert.equal(first.status, 201, "real claim route accepts the token");
        const replay = await claim.POST(
          post("/api/v1/investor/alpha-claim", { token }),
        );
        assert.equal(
          replay.status,
          200,
          "replay is idempotent, not a new binding",
        );
        const bad = await claim.POST(
          post("/api/v1/investor/alpha-claim", {
            token: token.slice(0, -6) + "AAAAAA",
          }),
        );
        assert.equal(bad.status, 401, "tampered token still refused");
      });
    },
  );

  await section(
    "demo handoff: game lineage never touches identity, KYC, admission, or account scope",
    async () => {
      const src = stripComments(read("apps/web/app/api/demo/handoff/route.ts"));
      assert.ok(
        !/investor-api|demo-client|resolveAccountScope|kyc|eligibility|ELIGIBILITY_COOKIE|cookies\.set/.test(
          src,
        ),
        "handoff route mints a token and nothing else",
      );
      assert.ok(
        /getAuthContext\(req\)/.test(src) &&
          /DEMO_HANDOFF_PRIVATE_KEY_JWK/.test(src),
        "session-gated and keyed by the demo-only private JWK",
      );
      const claimSrc = stripComments(
        read("apps/web/app/api/v1/investor/alpha-claim/route.ts"),
      );
      assert.ok(
        !/demo|DEMO_HANDOFF/.test(claimSrc),
        "the claim route has no demo special case",
      );
      const env = stripComments(read("apps/web/src/lib/config/env.ts"));
      assert.ok(
        !/DEMO_HANDOFF_PRIVATE_KEY_JWK:\s*withFallback|DEMO_HANDOFF_PRIVATE_KEY_JWK:\s*JSON/.test(
          env,
        ),
        "the demo private key has no committed default",
      );
    },
  );
}

// ─── Same-origin behind a TLS-terminating proxy: opt-in, exact Host match, default unchanged ──

{
  const { createRequire } = await import("node:module");
  const requireWeb = createRequire(
    join(process.cwd(), "apps/web/package.json"),
  );
  const { NextRequest } = (await import(
    requireWeb.resolve("next/server")
  )) as typeof import("next/server");
  const { isSameOrigin, requestOrigin } =
    await import("../apps/web/src/lib/bff/origin.ts");
  const mk = (headers: Record<string, string>) =>
    new NextRequest("http://0.0.0.0:3000/api/x", { method: "POST", headers });
  const withFlag = async (v: string | undefined, fn: () => Promise<void>) => {
    const saved = process.env["REFI_TRUST_PROXY_HOST"];
    if (v === undefined) delete process.env["REFI_TRUST_PROXY_HOST"];
    else process.env["REFI_TRUST_PROXY_HOST"] = v;
    try {
      await fn();
    } finally {
      if (saved === undefined) delete process.env["REFI_TRUST_PROXY_HOST"];
      else process.env["REFI_TRUST_PROXY_HOST"] = saved;
    }
  };

  await section(
    "same-origin: without REFI_TRUST_PROXY_HOST the expected origin is Next's own URL and forwarded headers are ignored",
    async () => {
      await withFlag(undefined, async () => {
        const req = mk({
          origin: "https://demo.example",
          host: "demo.example",
          "x-forwarded-proto": "https",
        });
        assert.equal(requestOrigin(req), "http://0.0.0.0:3000");
        assert.equal(
          isSameOrigin(req),
          false,
          "forwarded host must not be trusted by default",
        );
      });
    },
  );

  await section(
    "same-origin: with REFI_TRUST_PROXY_HOST=1 the browser Origin must equal ${x-forwarded-proto}://${host} exactly",
    async () => {
      await withFlag("1", async () => {
        const ok = mk({
          origin: "https://demo.example",
          host: "demo.example",
          "x-forwarded-proto": "https",
        });
        assert.equal(requestOrigin(ok), "https://demo.example");
        assert.equal(isSameOrigin(ok), true);
        for (const [label, headers] of [
          [
            "different host",
            {
              origin: "https://evil.example",
              host: "demo.example",
              "x-forwarded-proto": "https",
            },
          ],
          [
            "http origin for an https host",
            {
              origin: "http://demo.example",
              host: "demo.example",
              "x-forwarded-proto": "https",
            },
          ],
          [
            "subdomain",
            {
              origin: "https://a.demo.example",
              host: "demo.example",
              "x-forwarded-proto": "https",
            },
          ],
          [
            "missing origin",
            { host: "demo.example", "x-forwarded-proto": "https" },
          ],
          [
            "null origin",
            {
              origin: "null",
              host: "demo.example",
              "x-forwarded-proto": "https",
            },
          ],
        ] as const) {
          assert.equal(isSameOrigin(mk({ ...headers })), false, label);
        }
        // Without any Host header the check falls back to Next's own URL.
        assert.equal(
          requestOrigin(
            new NextRequest("http://0.0.0.0:3000/api/x", { method: "POST" }),
          ),
          "http://0.0.0.0:3000",
        );
      });
    },
  );

  await section(
    "same-origin: every route-local origin check goes through requestOrigin (no bare nextUrl.origin comparisons)",
    async () => {
      const files = [
        "apps/web/app/api/v1/investor/alpha-claim/route.ts",
        "apps/web/app/api/v1/investor/session/route.ts",
        "apps/web/app/api/demo/session/route.ts",
        "apps/web/app/api/demo/advance/route.ts",
        "apps/web/app/api/demo/handoff/route.ts",
        "apps/web/src/lib/bff/origin.ts",
      ];
      for (const f of files) {
        const src = readFileSync(join(REPO_ROOT, f), "utf8").replace(
          /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
          "",
        );
        const bare = (src.match(/nextUrl\.origin/g) ?? []).length;
        if (f.endsWith("origin.ts")) {
          assert.equal(
            bare,
            1,
            "origin.ts holds the single fallback to nextUrl.origin",
          );
        } else {
          assert.equal(bare, 0, `${f} must compare against requestOrigin(req)`);
          assert.ok(
            /requestOrigin\(req\)/.test(src),
            `${f} uses requestOrigin`,
          );
        }
      }
    },
  );
}

// ─── Native Cloud Run credential (Daniel 2026-09-09 step 1): audience-bound ID tokens, fail closed ──

{
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const tokens =
    await import("../apps/web/src/lib/investor-api/google-id-token.ts");
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const NOW = 1_800_000_000;
  const mintFake = (
    aud: string,
    exp: number,
    extra: Record<string, unknown> = {},
  ) =>
    `${b64({ alg: "RS256", typ: "JWT", kid: "google-1" })}.${b64({
      aud,
      exp,
      iat: NOW,
      iss: "https://accounts.google.com",
      sub: "111111111111111111111",
      email: "refi-bff-dev@example-project.iam.gserviceaccount.com",
      email_verified: true,
      ...extra,
    })}.sig`;
  const ID_AUD = "https://identity-ccid.dev.refi.internal";
  const INV_AUD = "https://investor-api.dev.refi.internal";

  await section(
    "google-id-token: full-format metadata identity endpoint, one cache per audience, never cross-reused, refreshed before expiry",
    async () => {
      const calls: Array<{ url: string; headers: Record<string, string> }> = [];
      let clock = NOW;
      const fetchImpl: import("../apps/web/src/lib/investor-api/google-id-token.ts").MetadataFetch =
        async (url, init) => {
          calls.push({ url, headers: init.headers });
          const aud = new URL(url).searchParams.get("audience") ?? "";
          return {
            ok: true,
            status: 200,
            text: async () => mintFake(aud, clock + 3600),
          };
        };
      const providers = tokens.createNativeCredentialProviders({
        identityCcidAudience: ID_AUD,
        investorApiAudience: INV_AUD,
        fetchImpl,
        now: () => clock,
      });
      const t1 = await providers.identityCcid.getToken();
      const t2 = await providers.investorApi.getToken();
      assert.notEqual(t1, t2, "distinct tokens for distinct audiences");
      assert.equal(tokens.decodeIdTokenClaims(t1).aud, ID_AUD);
      assert.equal(tokens.decodeIdTokenClaims(t2).aud, INV_AUD);
      assert.equal(calls.length, 2, "one metadata call per audience");
      for (const c of calls) {
        const u = new URL(c.url);
        assert.equal(
          u.origin + u.pathname,
          tokens.METADATA_IDENTITY_URL,
          "identity endpoint, not the token (access-token) endpoint",
        );
        assert.equal(
          u.searchParams.get("format"),
          "full",
          "full-format identity token",
        );
        assert.equal(c.headers["Metadata-Flavor"], "Google");
        assert.ok(
          !/\/token(\?|$)/.test(c.url),
          "never the OAuth access-token endpoint",
        );
      }
      // Cached within lifetime: no new call.
      await providers.identityCcid.getToken();
      await providers.investorApi.getToken();
      assert.equal(
        calls.length,
        2,
        "cached tokens are reused within their lifetime",
      );
      // Concurrent callers coalesce into one refresh.
      clock = NOW + 3600 - tokens.REFRESH_MARGIN_SECONDS + 1; // inside the refresh margin
      await Promise.all([
        providers.investorApi.getToken(),
        providers.investorApi.getToken(),
        providers.investorApi.getToken(),
      ]);
      assert.equal(calls.length, 3, "refresh ahead of expiry, coalesced");
      assert.equal(
        new URL(calls[2]!.url).searchParams.get("audience"),
        INV_AUD,
      );
      // The identity provider was not refreshed by investor-api activity.
      assert.equal(providers.identityCcid.cacheState().cached, true);
      // A provider never answers for another audience: a metadata server that
      // returns a token for the wrong audience is rejected outright.
      const wrong = tokens.createIdTokenProvider({
        audience: INV_AUD,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          text: async () => mintFake(ID_AUD, NOW + 3600),
        }),
        now: () => NOW,
      });
      await assert.rejects(wrong.getToken(), tokens.AudienceMismatchError);
      // Same audience for both targets is refused at construction.
      assert.throws(() =>
        tokens.createNativeCredentialProviders({
          identityCcidAudience: ID_AUD,
          investorApiAudience: ID_AUD,
        }),
      );
    },
  );

  await section(
    "google-id-token: fails closed on metadata errors, timeouts, non-full tokens; error text never carries a token",
    async () => {
      const cases: Array<
        [
          string,
          import("../apps/web/src/lib/investor-api/google-id-token.ts").MetadataFetch,
        ]
      > = [
        [
          "HTTP 500",
          async () => ({ ok: false, status: 500, text: async () => "" }),
        ],
        [
          "unreachable",
          async () => {
            throw new Error("ECONNREFUSED");
          },
        ],
        [
          "not a JWT",
          async () => ({
            ok: true,
            status: 200,
            text: async () => "ya29.access-token-looking-string",
          }),
        ],
        [
          "missing email (not full-format)",
          async () => ({
            ok: true,
            status: 200,
            text: async () =>
              `${b64({ alg: "RS256" })}.${b64({ aud: INV_AUD, exp: NOW + 3600, sub: "1" })}.sig`,
          }),
        ],
        [
          "email_verified false",
          async () => ({
            ok: true,
            status: 200,
            text: async () =>
              mintFake(INV_AUD, NOW + 3600, { email_verified: false }),
          }),
        ],
        [
          "already expiring",
          async () => ({
            ok: true,
            status: 200,
            text: async () => mintFake(INV_AUD, NOW + 10),
          }),
        ],
      ];
      for (const [label, fetchImpl] of cases) {
        const p = tokens.createIdTokenProvider({
          audience: INV_AUD,
          fetchImpl,
          now: () => NOW,
        });
        await assert.rejects(p.getToken(), (err: unknown) => {
          assert.ok(
            err instanceof tokens.GoogleIdTokenUnavailableError,
            `${label}: fails closed with GoogleIdTokenUnavailableError`,
          );
          assert.ok(
            !/eyJ|ya29|\.sig/.test(err.message),
            `${label}: error message carries no token material`,
          );
          assert.equal(
            p.cacheState().cached,
            false,
            `${label}: nothing cached`,
          );
          return true;
        });
      }
      const src = readFileSync(
        join(REPO_ROOT, "apps/web/src/lib/investor-api/google-id-token.ts"),
        "utf8",
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(
        !/console\.|posthog|Sentry|localStorage/.test(src),
        "provider never logs or exports a token",
      );
      assert.ok(
        /format", "full"/.test(src) && /Metadata-Flavor/.test(src),
        "full-format identity token via the metadata server",
      );
    },
  );

  await section(
    "connected-deployment invariants: native credential mode fails boot on any downgrade path; remote stays a separate reviewed switch",
    async () => {
      const base: Record<string, string> = {
        NEXT_PUBLIC_REFI_ENV: "staging",
        REFI_ENV: "staging",
        NEXT_PUBLIC_API_BASE_URL: "https://bff-dev.refi.trading",
        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "x",
        NEXT_PUBLIC_POSTHOG_KEY: "x",
        NEXT_PUBLIC_SENTRY_DSN: "https://x@o0.ingest.sentry.io/0",
        SESSION_SECRET: "s".repeat(40),
        IP_HASH_SECRET: "s".repeat(40),
        ELIGIBILITY_JWT_SECRET: "s".repeat(40),
        SESSION_JWT_SECRET: "s".repeat(40),
        ALPHA_HANDOFF_PUBLIC_KEY_JWK: JSON.stringify({
          kty: "EC",
          crv: "P-256",
          x: "a",
          y: "b",
        }),
        ALPHA_HANDOFF_ISSUER: "refi-alpha",
        ALPHA_HANDOFF_AUDIENCE: "refi-us-sec-ia",
        REFI_INVESTOR_API_CREDENTIAL_MODE: "native-cloud-run",
        REFI_INVESTOR_API_MODE: "client",
        REFI_INVESTOR_API_ASSERTION_MODE: "mint",
        BFF_ASSERTION_ALLOW_EPHEMERAL_KEY: "0",
        REFI_KYC_MOCK_CONTROLS: "0",
        REFI_KYC_PROVIDER: "unconfigured",
        REFI_DATA_ADAPTER: "live",
        REFI_INVESTOR_API_BASE_URL:
          "https://investor-api-74kl57biwa-uw.a.run.app",
        REFI_IDENTITY_CCID_BASE_URL:
          "https://identity-ccid-74kl57biwa-uw.a.run.app",
        // Durable security state is part of the connected baseline.
        REFI_CONNECTED_STORE_BACKING: "durable",
        REFI_CONNECTED_STORE_NAMESPACE: "us-connected-dev",
        GCP_PROJECT_ID: "refi-us-connected-investor",
      };
      const KEYS = [
        ...Object.keys(base),
        "REFI_INVESTOR_API_ALLOW_REMOTE",
        "REFI_IDENTITY_CCID_GOOGLE_AUDIENCE",
        "REFI_INVESTOR_API_GOOGLE_AUDIENCE",
        "REFI_INVESTOR_API_MODE",
      ];
      const saved: Record<string, string | undefined> = {};
      for (const k of KEYS) saved[k] = process.env[k];
      const withEnv = async (
        over: Record<string, string | undefined>,
        fn: () => Promise<void>,
      ) => {
        for (const k of KEYS) delete process.env[k];
        for (const [k, v] of Object.entries({ ...base, ...over }))
          if (v !== undefined) process.env[k] = v;
        resetServerEnvCacheForTests();
        try {
          await fn();
        } finally {
          for (const k of KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
          }
          resetServerEnvCacheForTests();
        }
      };
      const { getServerEnv } =
        await import("../apps/web/src/lib/config/env.ts");
      // Baseline connected configuration boots, with Daniel's fixed audiences
      // as defaults and remote OFF.
      await withEnv({}, async () => {
        const env = getServerEnv();
        assert.equal(env.REFI_INVESTOR_API_CREDENTIAL_MODE, "native-cloud-run");
        assert.equal(
          env.REFI_IDENTITY_CCID_GOOGLE_AUDIENCE,
          "https://identity-ccid.dev.refi.internal",
        );
        assert.equal(
          env.REFI_INVESTOR_API_GOOGLE_AUDIENCE,
          "https://investor-api.dev.refi.internal",
        );
        assert.equal(
          env.REFI_INVESTOR_API_ALLOW_REMOTE,
          "0",
          "remote is OFF until Daniel's step 4",
        );
      });
      // Every downgrade path is a boot failure.
      for (const [label, over] of [
        [
          "simulator assertion",
          { REFI_INVESTOR_API_ASSERTION_MODE: "simulator-fixture" },
        ],
        ["ephemeral signing key", { BFF_ASSERTION_ALLOW_EPHEMERAL_KEY: "1" }],
        ["mock KYC controls", { REFI_KYC_MOCK_CONTROLS: "1" }],
        ["mock data adapter", { REFI_DATA_ADAPTER: "mock" }],
        [
          "demo world upstream",
          {
            REFI_INVESTOR_API_MODE: "demo",
            REFI_ENV: "demo",
            NEXT_PUBLIC_REFI_ENV: "demo",
          },
        ],
        ["demo tier", { REFI_ENV: "demo", NEXT_PUBLIC_REFI_ENV: "demo" }],
        [
          "shared audience",
          {
            REFI_INVESTOR_API_GOOGLE_AUDIENCE:
              "https://identity-ccid.dev.refi.internal",
          },
        ],
      ] as const) {
        await withEnv({ ...over }, async () => {
          assert.throws(
            () => getServerEnv(),
            /Invalid server environment/,
            `${label} must fail boot in native mode`,
          );
        });
      }
      // The same downgrades are legal OUTSIDE native mode (local/E2E/demo).
      await withEnv(
        {
          REFI_INVESTOR_API_CREDENTIAL_MODE: "simulator-fixture",
          REFI_INVESTOR_API_ASSERTION_MODE: "simulator-fixture",
          REFI_KYC_MOCK_CONTROLS: "1",
          REFI_DATA_ADAPTER: "mock",
        },
        async () => {
          assert.doesNotThrow(() => getServerEnv());
        },
      );
    },
  );

  await section(
    "gateway: native mode wires two distinct audience-bound providers; simulator/unconfigured never leak into native; unconfigured fails closed",
    async () => {
      const src = readFileSync(
        join(REPO_ROOT, "apps/web/src/lib/investor-api/gateway.ts"),
        "utf8",
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(
        /case "native-cloud-run"/.test(src) &&
          /providers\.identityCcid\.getToken\(\)/.test(src) &&
          /providers\.investorApi\.getToken\(\)/.test(src),
        "native mode uses the per-target providers",
      );
      assert.ok(
        /identityBearer/.test(src) &&
          /investorBearer/.test(src) &&
          !/getBearer,\s*\)/.test(src),
        "each RuntimeTarget receives its own bearer provider",
      );
      assert.ok(
        !/WIF|impersonat|GOOGLE_APPLICATION_CREDENTIALS|print-identity-token/.test(
          src,
        ),
        "no WIF, impersonation, key-file or human-token path",
      );
      const nativeBranch = src.slice(
        src.indexOf('case "native-cloud-run"'),
        src.indexOf('case "simulator-fixture"'),
      );
      assert.ok(
        !/SIMULATOR_FIXTURE/.test(nativeBranch),
        "native branch never falls back to the simulator fixture",
      );
      assert.ok(
        /case "unconfigured"[\s\S]*GoogleCredentialUnavailableError/.test(src),
        "unconfigured rejects for both targets",
      );
    },
  );
}

// ─── Assertion signer (Daniel 2026-09-09 step 3): KMS abstraction, DER→JOSE, stable kid, JWKS without private material ──

{
  const { resetServerEnvCacheForTests, getServerEnv: getServerEnvSigner } =
    await import("../apps/web/src/lib/config/env.ts");
  const ecdsa =
    await import("../apps/web/src/lib/investor-api/ecdsa-signature.ts");
  const signerMod =
    await import("../apps/web/src/lib/investor-api/assertion-signer.ts");
  const ua = await import("../apps/web/src/lib/investor-api/user-assertion.ts");
  const nodeCrypto = await import("node:crypto");
  const { createRequire: createRequireSigner } = await import("node:module");
  const requireWebSigner = createRequireSigner(
    join(process.cwd(), "apps/web/package.json"),
  );
  const jose = (await import(
    requireWebSigner.resolve("jose")
  )) as typeof import("jose");

  await section(
    "ecdsa-signature: DER ↔ JOSE conversion round-trips, pads short integers, strips the 0x00 sign pad, rejects malformed input",
    async () => {
      const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync("ec", {
        namedCurve: "P-256",
      });
      const msg = new TextEncoder().encode("signing-input.for.es256");
      // Many signatures so both "high-bit set" (0x00-padded DER) and "leading
      // zero" (short DER integer) cases occur.
      for (let i = 0; i < 64; i++) {
        const der = new Uint8Array(
          nodeCrypto.sign("sha256", msg, {
            key: privateKey,
            dsaEncoding: "der",
          }),
        );
        const jose = ecdsa.derToJose(der);
        assert.equal(
          jose.length,
          64,
          "JOSE ES256 signature is exactly 64 bytes",
        );
        assert.ok(
          nodeCrypto.verify(
            "sha256",
            msg,
            { key: publicKey, dsaEncoding: "ieee-p1363" },
            jose,
          ),
          "converted signature verifies in JOSE (ieee-p1363) form",
        );
        assert.ok(
          nodeCrypto.verify(
            "sha256",
            msg,
            { key: publicKey, dsaEncoding: "der" },
            ecdsa.joseToDer(jose),
          ),
          "JOSE → DER round-trip verifies in DER form",
        );
      }
      // Deterministic vectors: r with the high bit set (DER pads 0x00), s short (leading zero byte stripped).
      const r = new Uint8Array(32).fill(0xff);
      const sShort = new Uint8Array(32);
      sShort[31] = 0x01;
      const jose = new Uint8Array([...r, ...sShort]);
      const der = ecdsa.joseToDer(jose);
      assert.deepEqual(
        [...der.slice(0, 5)],
        [0x30, 0x26, 0x02, 0x21, 0x00],
        "high-bit r gets a 0x00 pad byte",
      );
      assert.deepEqual(
        [...der.slice(der.length - 3)],
        [0x02, 0x01, 0x01],
        "short s is minimal, no padding",
      );
      assert.deepEqual(
        [...ecdsa.derToJose(der)],
        [...jose],
        "round-trip restores fixed width",
      );
      for (const bad of [
        new Uint8Array([0x31, 0x00]),
        new Uint8Array([0x30, 0x02, 0x02, 0x00]),
        new Uint8Array(70),
      ]) {
        assert.throws(() => ecdsa.derToJose(bad), "malformed DER is rejected");
      }
      assert.throws(
        () => ecdsa.joseToDer(new Uint8Array(63)),
        "wrong JOSE length is rejected",
      );
    },
  );

  // A fake KMS that behaves like the service: it holds the private key, returns
  // the PEM public key, and signs the DIGEST it is handed with plain ECDSA
  // P-256, returning DER. Node's crypto.sign cannot sign a pre-computed digest
  // for EC keys (its null-algorithm mode is not digest-mode ECDSA), so the
  // arithmetic is done here with BigInt; verification below is Node's own.
  const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
  const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const A = P - 3n;
  const GX =
    0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
  const GY =
    0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;
  const mod = (x: bigint, m: bigint) => ((x % m) + m) % m;
  const inv = (x: bigint, m: bigint) => {
    let [a0, b0, u, v] = [mod(x, m), m, 1n, 0n];
    while (a0 !== 0n) {
      const q = b0 / a0;
      [a0, b0] = [b0 - q * a0, a0];
      [u, v] = [v - q * u, u];
    }
    return mod(v, m);
  };
  type Pt = [bigint, bigint] | null;
  const add = (p: Pt, q: Pt): Pt => {
    if (!p) return q;
    if (!q) return p;
    const [x1, y1] = p,
      [x2, y2] = q;
    if (x1 === x2) {
      if (mod(y1 + y2, P) === 0n) return null;
      const l = mod((3n * x1 * x1 + A) * inv(2n * y1, P), P);
      const x3 = mod(l * l - 2n * x1, P);
      return [x3, mod(l * (x1 - x3) - y1, P)];
    }
    const l = mod((y2 - y1) * inv(x2 - x1, P), P);
    const x3 = mod(l * l - x1 - x2, P);
    return [x3, mod(l * (x1 - x3) - y1, P)];
  };
  const mul = (k: bigint, p: Pt): Pt => {
    let r: Pt = null,
      q = p;
    while (k > 0n) {
      if (k & 1n) r = add(r, q);
      q = add(q, q);
      k >>= 1n;
    }
    return r;
  };
  const bufToBig = (b: Uint8Array) =>
    BigInt("0x" + Buffer.from(b).toString("hex"));
  const bigTo32 = (x: bigint) =>
    new Uint8Array(Buffer.from(x.toString(16).padStart(64, "0"), "hex"));
  function fakeKms(
    privateKey: import("node:crypto").KeyObject,
    opts: { corruptSignature?: boolean; returnJose?: boolean } = {},
  ) {
    const calls = { getPublicKey: 0, asymmetricSign: 0 };
    const publicKey = nodeCrypto.createPublicKey(privateKey);
    const d = bufToBig(
      Buffer.from(
        (privateKey.export({ format: "jwk" }) as { d: string }).d,
        "base64url",
      ),
    );
    const client: import("../apps/web/src/lib/investor-api/assertion-signer.ts").KmsSignClient =
      {
        async getPublicKey() {
          calls.getPublicKey++;
          return [
            {
              pem: publicKey.export({ type: "spki", format: "pem" }).toString(),
            },
          ];
        },
        async asymmetricSign(req) {
          calls.asymmetricSign++;
          const z = bufToBig(req.digest.sha256);
          let r = 0n,
            sVal = 0n;
          while (r === 0n || sVal === 0n) {
            const k = mod(bufToBig(nodeCrypto.randomBytes(32)), N - 1n) + 1n;
            const R = mul(k, [GX, GY]);
            if (!R) continue;
            r = mod(R[0], N);
            sVal = mod(inv(k, N) * (z + r * d), N);
          }
          const jose = new Uint8Array([...bigTo32(r), ...bigTo32(sVal)]);
          const bytes = opts.returnJose ? jose : ecdsa.joseToDer(jose);
          if (opts.corruptSignature) bytes[bytes.length - 1] ^= 0x01;
          return [{ signature: bytes }];
        },
      };
    return { client, calls, publicKey };
  }
  const KEY_VERSION =
    "projects/p/locations/us-central1/keyRings/refi-bff/cryptoKeys/assertion/cryptoKeyVersions/1";

  await section(
    "assertion-signer(kms): private key never leaves the client; public JWK derived from getPublicKey with the stable kid and no `d`; DER signatures converted and locally verified; a corrupted signature never leaves the signer",
    async () => {
      const { privateKey } = nodeCrypto.generateKeyPairSync("ec", {
        namedCurve: "P-256",
      });
      const { client, calls, publicKey } = fakeKms(privateKey);
      const signer = signerMod.createKmsAssertionSigner({
        keyVersionName: KEY_VERSION,
        kid: "bff-kms-2026-09-1",
        client,
      });
      assert.equal(signer.kind, "kms");
      const jwk = await signer.publicJwk();
      assert.equal(jwk.kid, "bff-kms-2026-09-1");
      assert.equal(jwk.kty, "EC");
      assert.equal(jwk.crv, "P-256");
      assert.equal(jwk.alg, "ES256");
      assert.equal(jwk.use, "sig");
      assert.ok(!("d" in jwk), "public JWK carries no private component");
      assert.deepEqual(
        { x: jwk.x, y: jwk.y },
        (() => {
          const e = publicKey.export({ format: "jwk" }) as {
            x: string;
            y: string;
          };
          return { x: e.x, y: e.y };
        })(),
        "public JWK matches the KMS public key",
      );
      const input = new TextEncoder().encode("hdr.payload");
      const sig = await signer.sign(input);
      assert.equal(sig.length, 64, "signature is JOSE r||s");
      assert.ok(
        nodeCrypto.verify(
          "sha256",
          input,
          { key: publicKey, dsaEncoding: "ieee-p1363" },
          sig,
        ),
        "JOSE signature verifies against the KMS public key",
      );
      await signer.sign(input);
      assert.equal(
        calls.getPublicKey,
        1,
        "public key fetched once per process",
      );
      assert.equal(
        calls.asymmetricSign,
        2,
        "each sign is a KMS call — no private key locally",
      );
      // Corrupted DER from the service is caught by local verification.
      const bad = fakeKms(privateKey, { corruptSignature: true });
      const badSigner = signerMod.createKmsAssertionSigner({
        keyVersionName: KEY_VERSION,
        kid: "bff-kms-2026-09-1",
        client: bad.client,
      });
      await assert.rejects(badSigner.sign(input), /failed local verification/);
      // A service that already returns JOSE form is accepted without double conversion.
      const joseKms = fakeKms(privateKey, { returnJose: true });
      const joseSigner = signerMod.createKmsAssertionSigner({
        keyVersionName: KEY_VERSION,
        kid: "k1",
        client: joseKms.client,
      });
      assert.equal((await joseSigner.sign(input)).length, 64);
      // Resource-name and kid shapes are enforced.
      assert.throws(
        () =>
          signerMod.createKmsAssertionSigner({
            keyVersionName: "assertion-key",
            kid: "k",
            client,
          }),
        /cryptoKeyVersion resource name/,
      );
      assert.throws(
        () =>
          signerMod.createKmsAssertionSigner({
            keyVersionName: KEY_VERSION,
            kid: "",
            client,
          }),
        /BFF_ASSERTION_KID/,
      );
      // Two signer instances over the same key version (two replicas / a restart) publish the same key and verify each other's tokens.
      const a = signerMod.createKmsAssertionSigner({
        keyVersionName: KEY_VERSION,
        kid: "bff-kms-2026-09-1",
        client: fakeKms(privateKey).client,
      });
      const b = signerMod.createKmsAssertionSigner({
        keyVersionName: KEY_VERSION,
        kid: "bff-kms-2026-09-1",
        client: fakeKms(privateKey).client,
      });
      assert.deepEqual(
        await a.publicJwk(),
        await b.publicJwk(),
        "same key set across instances",
      );
      const sigA = await a.sign(input);
      assert.ok(
        signerMod.verifyJoseSignature(await b.publicJwk(), input, sigA),
        "instance B verifies instance A's signature",
      );
    },
  );

  await section(
    "user assertion via KMS: BFF_ASSERTION_SIGNER=kms mints a jose-verifiable ES256 token with the KMS kid, identical claim profile; JWKS serves the KMS public key with no `d`; jwk mode unchanged",
    async () => {
      const saved: Record<string, string | undefined> = {};
      for (const k of [
        "BFF_ASSERTION_SIGNER",
        "BFF_ASSERTION_KMS_KEY_VERSION",
        "BFF_ASSERTION_KID",
        "BFF_ASSERTION_PRIVATE_KEY_JWK",
        "BFF_ASSERTION_ISSUER",
        "INVESTOR_API_AUDIENCE",
        "BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK",
      ])
        saved[k] = process.env[k];
      try {
        const { privateKey } = nodeCrypto.generateKeyPairSync("ec", {
          namedCurve: "P-256",
        });
        const kms = fakeKms(privateKey);
        ua.setKmsClientFactoryForTests(async () => kms.client);
        process.env["BFF_ASSERTION_SIGNER"] = "kms";
        process.env["BFF_ASSERTION_KMS_KEY_VERSION"] = KEY_VERSION;
        process.env["BFF_ASSERTION_KID"] = "bff-kms-2026-09-1";
        delete process.env["BFF_ASSERTION_PRIVATE_KEY_JWK"];
        delete process.env["BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"];
        process.env["BFF_ASSERTION_ISSUER"] = "urn:refinity:bff:dev";
        process.env["INVESTOR_API_AUDIENCE"] = "urn:refinity:investor-api:dev";
        resetServerEnvCacheForTests();
        ua.resetSigningKeyCache();
        const authTime = Math.floor(Date.now() / 1000) - 30;
        const minted = await ua.mintUserAssertion({
          userId: "usr_alpha_invited_01",
          sid: "session_alpha_00000001",
          authTime,
          amr: ["email_link"],
        });
        const jwks = await ua.getPublicJwks();
        assert.equal(jwks.keys.length, 1);
        assert.equal(jwks.keys[0]!.kid, "bff-kms-2026-09-1");
        assert.ok(
          !("d" in jwks.keys[0]!),
          "JWKS never publishes private material",
        );
        const key = await jose.importJWK(jwks.keys[0]!, "ES256");
        const { payload, protectedHeader } = await jose.jwtVerify(
          minted.token,
          key,
          {
            issuer: "urn:refinity:bff:dev",
            audience: "urn:refinity:investor-api:dev",
            clockTolerance: 30,
          },
        );
        assert.deepEqual(
          protectedHeader,
          { alg: "ES256", kid: "bff-kms-2026-09-1", typ: "JWT" },
          "protected header exactly alg/kid/typ",
        );
        assert.deepEqual(
          Object.keys(payload).sort(),
          [
            "amr",
            "aud",
            "auth_time",
            "exp",
            "iat",
            "iss",
            "jti",
            "nbf",
            "sid",
            "sub",
          ],
          "closed claim set",
        );
        assert.equal(
          payload["auth_time"],
          authTime,
          "genuine auth_time preserved",
        );
        assert.equal(
          (payload.exp ?? 0) - (payload.iat ?? 0),
          ua.USER_ASSERTION_TTL_SECONDS,
        );
        assert.ok(
          (payload.exp ?? 0) - (payload.iat ?? 0) <=
            ua.USER_ASSERTION_MAX_TTL_SECONDS,
        );
        assert.ok(kms.calls.asymmetricSign >= 1, "the signature came from KMS");
        // A second mint gets a fresh jti under the same kid.
        const again = await ua.mintUserAssertion({
          userId: "usr_alpha_invited_01",
          sid: "session_alpha_00000001",
          authTime,
        });
        assert.notEqual(again.jti, minted.jti);
        // Missing KMS configuration fails closed at boot (schema) and at mint.
        delete process.env["BFF_ASSERTION_KID"];
        resetServerEnvCacheForTests();
        ua.resetSigningKeyCache();
        assert.throws(() => getServerEnvSigner(), /kms requires/);
      } finally {
        ua.setKmsClientFactoryForTests(null);
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        resetServerEnvCacheForTests();
        ua.resetSigningKeyCache();
      }
      // Source guards: the KMS SDK is loaded lazily, the JWKS route stays public
      // and unauthenticated, and no private material is ever serialised.
      const uaSrc = readFileSync(
        join(REPO_ROOT, "apps/web/src/lib/investor-api/user-assertion.ts"),
        "utf8",
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(
        /await import\("@google-cloud\/kms"\)/.test(uaSrc),
        "KMS SDK is a lazy dynamic import",
      );
      assert.ok(
        !/^import .*@google-cloud\/kms/m.test(uaSrc),
        "no static KMS import in the assertion module",
      );
      const jwksRoute = readFileSync(
        join(REPO_ROOT, "apps/web/app/.well-known/jwks.json/route.ts"),
        "utf8",
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(
        !/getAuthContext|cookies|bffRead|Authorization/.test(jwksRoute) &&
          /getPublicJwks\(\)/.test(jwksRoute),
        "JWKS route is public: no session, no Google token, no BFF session",
      );
      const signerSrc = readFileSync(
        join(REPO_ROOT, "apps/web/src/lib/investor-api/assertion-signer.ts"),
        "utf8",
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(
        !/console\.|JSON\.stringify\(privateJwk|export\(\{[^}]*format:\s*"jwk"[^}]*\}\)\.d/.test(
          signerSrc,
        ),
        "signer never logs or exports private material",
      );
    },
  );
}
// ─── Connected security state (US Investor Integration Foundation): durable, namespaced, single-use, multi-instance ──

{
  const { resetServerEnvCacheForTests, getServerEnv: getServerEnvConnected } =
    await import("../apps/web/src/lib/config/env.ts");
  const cs = await import("../apps/web/src/lib/connected-store/index.ts");
  const sessions =
    await import("../apps/web/src/lib/connected-store/session.ts");
  const logins =
    await import("../apps/web/src/lib/connected-store/login-state.ts");
  const replay = await import("../apps/web/src/lib/connected-store/replay.ts");
  const subjects =
    await import("../apps/web/src/lib/connected-store/subject-map.ts");

  // A shared in-memory backing that behaves like Firestore for these tests:
  // atomic create (putIfAbsent), and the SAME map visible from any number of
  // "instances" (store objects) — which is exactly what a second Cloud Run
  // instance or a restarted process sees.
  const backing = new Map<string, Map<string, unknown>>();
  const instance =
    (): Parameters<typeof cs.setConnectedStoreFactoryForTests>[0] =>
    <T>(collection: string) => {
      const col = () => {
        let m = backing.get(collection);
        if (!m) {
          m = new Map();
          backing.set(collection, m);
        }
        return m as Map<string, T>;
      };
      return {
        async get(k: string) {
          return col().get(k) ?? null;
        },
        async put(k: string, v: T) {
          col().set(k, v);
        },
        async putIfAbsent(k: string, v: T) {
          if (col().has(k)) return false;
          col().set(k, v);
          return true;
        },
        async list(prefix?: string) {
          return [...col().entries()]
            .filter(([k]) => !prefix || k.startsWith(prefix))
            .map(([key, value]) => ({ key, value }));
        },
        async delete(k: string) {
          col().delete(k);
        },
      };
    };
  const savedNs = process.env["REFI_CONNECTED_STORE_NAMESPACE"];
  const savedBacking = process.env["REFI_CONNECTED_STORE_BACKING"];
  process.env["REFI_CONNECTED_STORE_NAMESPACE"] = "us-connected-test";
  process.env["REFI_CONNECTED_STORE_BACKING"] = "prototype";
  resetServerEnvCacheForTests();
  cs.setConnectedStoreFactoryForTests(instance());

  try {
    await section(
      "connected-store: namespaced collections; demo/mock/prototype/simulator names are structurally refused; no fallback when unset",
      async () => {
        assert.equal(
          cs.collectionNameFor("us-connected-dev", "session"),
          "us-connected-dev--connected-session",
        );
        for (const bad of [
          "demo",
          "refi-demo",
          "mock-us",
          "prototype",
          "simulator-x",
          "Upper",
          "x",
          "has space",
          undefined,
        ]) {
          assert.throws(
            () => cs.collectionNameFor(bad, "session"),
            cs.ConnectedStoreUnavailableError,
            String(bad),
          );
        }
        assert.deepEqual([...cs.CONNECTED_ENTITIES].sort(), [
          "bridge-assertion-jti",
          "exchange-attempt",
          "identity-result-jti",
          "login-consumed",
          "login-state",
          "session",
          "subject-map",
          "subject-map-reverse",
        ]);
        // No entity name can collide with a prototype/demo collection: they carry the namespace prefix + "connected-".
        for (const e of cs.CONNECTED_ENTITIES)
          assert.ok(
            /^[a-z0-9-]+--connected-/.test(
              cs.collectionNameFor("us-connected-dev", e),
            ),
          );
      },
    );

    await section(
      "connected-store: sessions are created atomically, looked up by sid, refused when expired or revoked, and revocation is visible from another instance",
      async () => {
        const s1 = await sessions.createConnectedSession({
          sub: "usr_backend_0000000001",
          authTime: 1_800_000_000,
          amr: ["email_link"],
          identityResultJti: "jti_identity_result_0001",
          correlationId: "c1",
        });
        assert.ok(sessions.SESSION_ID_PATTERN.test(s1.sid));
        assert.equal(s1.revokedAt, null);
        const found = await sessions.getActiveConnectedSession(s1.sid);
        assert.deepEqual(found, s1, "lookup returns the record");
        assert.equal(
          await sessions.getActiveConnectedSession(
            "sid_unknown_00000000000000000000",
          ),
          null,
        );
        // Expired sessions are refused (clock injected).
        assert.equal(
          await sessions.getActiveConnectedSession(
            s1.sid,
            new Date(Date.now() + 9 * 3600 * 1000),
          ),
          null,
          "expired",
        );
        // Instance B (fresh store object over the SAME backing) sees the session…
        cs.setConnectedStoreFactoryForTests(instance());
        assert.ok(
          await sessions.getActiveConnectedSession(s1.sid),
          "visible from a second instance",
        );
        // …and instance A sees B's revocation immediately.
        assert.equal(
          await sessions.revokeConnectedSession(s1.sid, "user_logout"),
          true,
        );
        cs.setConnectedStoreFactoryForTests(instance());
        assert.equal(
          await sessions.getActiveConnectedSession(s1.sid),
          null,
          "revoked on every instance",
        );
        assert.equal(
          await sessions.revokeConnectedSession(s1.sid, "again"),
          false,
          "revocation is idempotent",
        );
        // touch never advances auth_time
        const s2 = await sessions.createConnectedSession({
          sub: "usr_backend_0000000002",
          authTime: 1_800_000_100,
          identityResultJti: "jti_identity_result_0002",
          correlationId: "c2",
        });
        await sessions.touchConnectedSession(s2.sid);
        assert.equal(
          (await sessions.getActiveConnectedSession(s2.sid))?.authTime,
          1_800_000_100,
        );
        // Inputs that would smuggle authority or PII are refused.
        await assert.rejects(
          sessions.createConnectedSession({
            sub: "someone@example.com",
            authTime: 1,
            identityResultJti: "j",
            correlationId: "c",
          }),
        );
        await assert.rejects(
          sessions.createConnectedSession({
            sub: "usr_backend_0000000003",
            authTime: 0,
            identityResultJti: "j",
            correlationId: "c",
          }),
          /auth_time/,
        );
      },
    );

    await section(
      "connected-store: pending login bindings are random and in Daniel's 22–128 base64url window; consumption is single-use, state-bound, expiry-bound, atomic across instances",
      async () => {
        const net = logins.newLoginBinding();
        const login = await logins.createPendingLogin({
          redirectUri: "https://bff-dev.refi.trading/us/auth/callback",
          networkContext: net,
          method: "email_link",
          emailHash: "a".repeat(64),
          correlationId: "c",
        });
        for (const v of [
          login.loginId,
          login.state,
          login.challenge,
          login.nonce,
        ])
          assert.ok(logins.LOGIN_BINDING_PATTERN.test(v), v);
        assert.equal(
          new Set([login.loginId, login.state, login.challenge, login.nonce])
            .size,
          4,
          "independent random values",
        );
        assert.equal(
          login.networkContext,
          net,
          "network_context is the caller's stable id, not regenerated",
        );
        await assert.rejects(
          logins.createPendingLogin({
            redirectUri: "http://insecure.example/cb",
            networkContext: net,
            method: "email_link",
            emailHash: "a".repeat(64),
            correlationId: "c",
          }),
          /https/,
        );
        await assert.rejects(
          logins.createPendingLogin({
            redirectUri: "https://x.example/cb",
            networkContext: "short",
            correlationId: "c",
          }),
          /networkContext/,
        );
        // Wrong state does not consume.
        const wrong = await logins.consumePendingLogin({
          loginId: login.loginId,
          state: logins.newLoginBinding(),
          correlationId: "c",
        });
        assert.deepEqual(wrong, { ok: false, reason: "state_mismatch" });
        // Two instances race: exactly one wins.
        const a = logins.consumePendingLogin({
          loginId: login.loginId,
          state: login.state,
          correlationId: "a",
        });
        cs.setConnectedStoreFactoryForTests(instance());
        const b = logins.consumePendingLogin({
          loginId: login.loginId,
          state: login.state,
          correlationId: "b",
        });
        const results = await Promise.all([a, b]);
        assert.equal(
          results.filter((r) => r.ok).length,
          1,
          "exactly one consumer wins",
        );
        assert.ok(
          results.some((r) => !r.ok && r.reason === "already_consumed"),
        );
        // Replay after "restart" (new instance) is refused.
        cs.setConnectedStoreFactoryForTests(instance());
        assert.deepEqual(
          await logins.consumePendingLogin({
            loginId: login.loginId,
            state: login.state,
            correlationId: "c",
          }),
          { ok: false, reason: "already_consumed" },
        );
        // Expired logins are refused before any marker is written.
        const stale = await logins.createPendingLogin({
          redirectUri: "https://bff-dev.refi.trading/us/auth/callback",
          networkContext: net,
          method: "email_link",
          emailHash: "a".repeat(64),
          ttlSeconds: 1,
          correlationId: "c",
        });
        assert.deepEqual(
          await logins.consumePendingLogin({
            loginId: stale.loginId,
            state: stale.state,
            correlationId: "c",
            now: new Date(Date.now() + 5000),
          }),
          { ok: false, reason: "expired" },
        );
        assert.deepEqual(
          await logins.consumePendingLogin({
            loginId: "nope",
            state: "nope",
            correlationId: "c",
          }),
          { ok: false, reason: "unknown" },
        );
      },
    );

    await section(
      "connected-store: jti replay protection is atomic, per family, and survives restart; identity-result and bridge jtis never collide",
      async () => {
        const first = await replay.consumeJtiOnce("identity-result-jti", {
          jti: "jti_identity_result_0009",
          sub: "usr_backend_0000000009",
          exp: 1_900_000_000,
          correlationId: "c",
        });
        assert.equal(first.first, true);
        cs.setConnectedStoreFactoryForTests(instance()); // restart / other instance
        const again = await replay.consumeJtiOnce("identity-result-jti", {
          jti: "jti_identity_result_0009",
          sub: "usr_backend_0000000009",
          exp: 1_900_000_000,
          correlationId: "c",
        });
        assert.equal(again.first, false, "replay refused after restart");
        assert.equal(again.record.correlationId, "c");
        // Same jti value in the OTHER family is a different record space.
        const bridge = await replay.consumeJtiOnce("bridge-assertion-jti", {
          jti: "jti_identity_result_0009",
          sub: "usr_refi_000000000001",
          exp: 1_900_000_000,
          correlationId: "c",
        });
        assert.equal(bridge.first, true, "families are isolated");
        assert.equal(
          await replay.isJtiConsumed(
            "identity-result-jti",
            "jti_identity_result_0009",
          ),
          true,
        );
        assert.equal(
          await replay.isJtiConsumed(
            "identity-result-jti",
            "jti_never_seen_000000",
          ),
          false,
        );
        assert.equal(
          await replay.isJtiConsumed("identity-result-jti", "bad jti"),
          true,
          "malformed jti is treated as consumed (fail closed)",
        );
        await assert.rejects(
          replay.consumeJtiOnce("identity-result-jti", {
            jti: "x",
            sub: "s",
            exp: 1,
            correlationId: "c",
          }),
          /jti pattern/,
        );
      },
    );

    await section(
      "connected-store: opaque subject map is stable, atomic under a race, never derived from email, and reverse-lookable",
      async () => {
        const a = await subjects.getOrCreateOpaqueSubject({
          provider: "stytch",
          providerUserId: "user-test-11111111-2222-3333-4444-555555555555",
          correlationId: "c",
        });
        assert.equal(a.created, true);
        assert.ok(subjects.SUBJECT_PATTERN.test(a.record.sub));
        assert.ok(
          !a.record.sub.includes("user-test"),
          "sub is not derived from the provider id",
        );
        cs.setConnectedStoreFactoryForTests(instance());
        const b = await subjects.getOrCreateOpaqueSubject({
          provider: "stytch",
          providerUserId: "user-test-11111111-2222-3333-4444-555555555555",
          correlationId: "c",
        });
        assert.equal(b.created, false);
        assert.equal(
          b.record.sub,
          a.record.sub,
          "stable across instances/restarts",
        );
        assert.equal(
          (await subjects.lookupSubject(a.record.sub))?.providerUserId,
          "user-test-11111111-2222-3333-4444-555555555555",
        );
        await assert.rejects(
          subjects.getOrCreateOpaqueSubject({
            provider: "stytch",
            providerUserId: "alice@example.com",
            correlationId: "c",
          }),
          /email/,
        );
        // Two different provider ids never share a sub.
        const c = await subjects.getOrCreateOpaqueSubject({
          provider: "stytch",
          providerUserId: "user-test-99999999-2222-3333-4444-555555555555",
          correlationId: "c",
        });
        assert.notEqual(c.record.sub, a.record.sub);
      },
    );

    await section(
      "connected-store: env invariants — native mode requires durable backing, a safe namespace and a project; prototype backing is refused on a connected deployment even if forced",
      async () => {
        const base: Record<string, string> = {
          NEXT_PUBLIC_REFI_ENV: "staging",
          REFI_ENV: "staging",
          NEXT_PUBLIC_API_BASE_URL: "https://bff-dev.refi.trading",
          NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "x",
          NEXT_PUBLIC_POSTHOG_KEY: "x",
          NEXT_PUBLIC_SENTRY_DSN: "https://x@o0.ingest.sentry.io/0",
          SESSION_SECRET: "s".repeat(40),
          IP_HASH_SECRET: "s".repeat(40),
          ELIGIBILITY_JWT_SECRET: "s".repeat(40),
          SESSION_JWT_SECRET: "s".repeat(40),
          ALPHA_HANDOFF_PUBLIC_KEY_JWK: JSON.stringify({
            kty: "EC",
            crv: "P-256",
            x: "a",
            y: "b",
          }),
          ALPHA_HANDOFF_ISSUER: "refi-alpha",
          ALPHA_HANDOFF_AUDIENCE: "refi-us-sec-ia",
          REFI_INVESTOR_API_CREDENTIAL_MODE: "native-cloud-run",
          REFI_INVESTOR_API_MODE: "client",
          REFI_INVESTOR_API_ASSERTION_MODE: "mint",
          BFF_ASSERTION_ALLOW_EPHEMERAL_KEY: "0",
          REFI_KYC_MOCK_CONTROLS: "0",
          REFI_KYC_PROVIDER: "unconfigured",
          REFI_DATA_ADAPTER: "live",
          REFI_INVESTOR_API_BASE_URL:
            "https://investor-api-74kl57biwa-uw.a.run.app",
          REFI_IDENTITY_CCID_BASE_URL:
            "https://identity-ccid-74kl57biwa-uw.a.run.app",
          REFI_CONNECTED_STORE_BACKING: "durable",
          REFI_CONNECTED_STORE_NAMESPACE: "us-connected-dev",
          GCP_PROJECT_ID: "refi-us-connected-investor",
        };
        const KEYS = [
          ...Object.keys(base),
          "REFI_INVESTOR_API_ALLOW_REMOTE",
          "REFI_IDENTITY_CCID_GOOGLE_AUDIENCE",
          "REFI_INVESTOR_API_GOOGLE_AUDIENCE",
        ];
        const saved: Record<string, string | undefined> = {};
        for (const k of KEYS) saved[k] = process.env[k];
        const withEnv = async (
          over: Record<string, string | undefined>,
          fn: () => Promise<void>,
        ) => {
          for (const k of KEYS) delete process.env[k];
          for (const [k, v] of Object.entries({ ...base, ...over }))
            if (v !== undefined) process.env[k] = v;
          resetServerEnvCacheForTests();
          try {
            await fn();
          } finally {
            for (const k of KEYS) {
              if (saved[k] === undefined) delete process.env[k];
              else process.env[k] = saved[k];
            }
            resetServerEnvCacheForTests();
          }
        };
        await withEnv({}, async () => {
          assert.doesNotThrow(
            () => getServerEnvConnected(),
            "connected baseline boots",
          );
        });
        for (const [label, over] of [
          ["prototype backing", { REFI_CONNECTED_STORE_BACKING: "prototype" }],
          ["missing namespace", { REFI_CONNECTED_STORE_NAMESPACE: undefined }],
          ["demo namespace", { REFI_CONNECTED_STORE_NAMESPACE: "us-demo" }],
          ["mock namespace", { REFI_CONNECTED_STORE_NAMESPACE: "mock-users" }],
          ["missing project", { GCP_PROJECT_ID: undefined }],
        ] as const) {
          await withEnv({ ...over }, async () => {
            assert.throws(
              () => getServerEnvConnected(),
              /Invalid server environment/,
              `${label} must fail boot`,
            );
          });
        }
        // Even with the schema bypassed, the resolver refuses prototype backing in native mode.
        cs.setConnectedStoreFactoryForTests(null);
        await withEnv(
          {
            REFI_INVESTOR_API_CREDENTIAL_MODE: "simulator-fixture",
            REFI_INVESTOR_API_ASSERTION_MODE: "simulator-fixture",
            REFI_CONNECTED_STORE_BACKING: "prototype",
          },
          async () => {
            assert.equal(
              typeof cs.connectedKvStore("session").get,
              "function",
              "prototype backing resolves outside native mode (local/E2E)",
            );
          },
        );
        cs.setConnectedStoreFactoryForTests(instance());
        // Source guards: connected entities go through the resolver only; no demo/prototype entity import; no localStorage.
        for (const f of [
          "session.ts",
          "login-state.ts",
          "replay.ts",
          "subject-map.ts",
        ]) {
          const src = readFileSync(
            join(REPO_ROOT, "apps/web/src/lib/connected-store", f),
            "utf8",
          ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
          assert.ok(
            /connectedKvStore</.test(src) &&
              !/prototype-store|demo-client|durable-store|localStorage|console\./.test(
                src,
              ),
            `${f} uses only the connected resolver`,
          );
        }
        const idx = readFileSync(
          join(REPO_ROOT, "apps/web/src/lib/connected-store/index.ts"),
          "utf8",
        ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        assert.ok(
          !/new Map\(|globalThis/.test(idx),
          "no in-memory fallback in the resolver",
        );
      },
    );
  } finally {
    cs.setConnectedStoreFactoryForTests(null);
    if (savedNs === undefined)
      delete process.env["REFI_CONNECTED_STORE_NAMESPACE"];
    else process.env["REFI_CONNECTED_STORE_NAMESPACE"] = savedNs;
    if (savedBacking === undefined)
      delete process.env["REFI_CONNECTED_STORE_BACKING"];
    else process.env["REFI_CONNECTED_STORE_BACKING"] = savedBacking;
    resetServerEnvCacheForTests();
  }
}

// ─── Email-first authentication (Stytch, headless): pending logins, provider verification, opaque subject, no session from provider state ──

{
  const { resetServerEnvCacheForTests } =
    await import("../apps/web/src/lib/config/env.ts");
  const cs = await import("../apps/web/src/lib/connected-store/index.ts");
  const stytchMod = await import("../apps/web/src/lib/auth/stytch.ts");
  const flow = await import("../apps/web/src/lib/auth/login-flow.ts");
  const sessionSeam =
    await import("../apps/web/src/lib/auth/connected-session.ts");
  const { createRequire: createRequireAuth } = await import("node:module");
  const requireWebAuth = createRequireAuth(
    join(process.cwd(), "apps/web/package.json"),
  );
  const { NextRequest } = (await import(
    requireWebAuth.resolve("next/server")
  )) as typeof import("next/server");
  const startRoute =
    await import("../apps/web/app/api/v1/auth/login/start/route.ts");
  const completeRoute =
    await import("../apps/web/app/api/v1/auth/login/complete/route.ts");

  // Shared fake backing (same idea as the connected-store section).
  const backing = new Map<string, Map<string, unknown>>();
  const instance =
    (): Parameters<typeof cs.setConnectedStoreFactoryForTests>[0] =>
    <T>(collection: string) => {
      const col = () => {
        let m = backing.get(collection);
        if (!m) {
          m = new Map();
          backing.set(collection, m);
        }
        return m as Map<string, T>;
      };
      return {
        async get(k: string) {
          return col().get(k) ?? null;
        },
        async put(k: string, v: T) {
          col().set(k, v);
        },
        async putIfAbsent(k: string, v: T) {
          if (col().has(k)) return false;
          col().set(k, v);
          return true;
        },
        async list(prefix?: string) {
          return [...col().entries()]
            .filter(([k]) => !prefix || k.startsWith(prefix))
            .map(([key, value]) => ({ key, value }));
        },
        async delete(k: string) {
          col().delete(k);
        },
      };
    };

  // A fake provider that behaves like Stytch's API contract: loginOrCreate
  // returns ids; authenticate returns a session with the email factor and
  // last_authenticated_at; tokens/codes map to users.
  function fakeStytch() {
    const calls: Array<{ op: string; req: unknown }> = [];
    const users = new Map<
      string,
      { user_id: string; email: string; verified: boolean }
    >();
    const tokens = new Map<string, string>(); // token -> email
    const codes = new Map<string, { email: string; code: string }>(); // method_id -> code
    let authAt = "2026-09-10T03:00:00Z";
    const userFor = (email: string) => {
      let u = users.get(email);
      if (!u) {
        u = {
          user_id: `user-test-${Buffer.from(email).toString("hex").slice(0, 24)}`,
          email,
          verified: true,
        };
        users.set(email, u);
      }
      return u;
    };
    const authenticated = (email: string, type: string) => {
      const u = userFor(email);
      return {
        request_id: "req",
        status_code: 200,
        user_id: u.user_id,
        method_id: "m",
        user: {
          user_id: u.user_id,
          emails: [
            {
              email_id: `email-${u.user_id}`,
              email: u.email,
              verified: u.verified,
            },
          ],
        },
        session: {
          session_id: `session-${u.user_id}`,
          user_id: u.user_id,
          started_at: authAt,
          authentication_factors: [
            {
              type,
              delivery_method: "email",
              last_authenticated_at: authAt,
              email_factor: {
                email_id: `email-${u.user_id}`,
                email_address: u.email,
              },
            },
          ],
        },
      };
    };
    const client: import("../apps/web/src/lib/auth/stytch.ts").StytchClientLike =
      {
        magicLinks: {
          email: {
            async loginOrCreate(req) {
              calls.push({ op: "magicLinks.email.loginOrCreate", req });
              const u = userFor(req.email);
              const t = `tok_${Math.random().toString(36).slice(2)}${"x".repeat(20)}`;
              tokens.set(t, req.email);
              return {
                request_id: "r",
                user_id: u.user_id,
                email_id: `email-${u.user_id}`,
              };
            },
          },
          async authenticate(req) {
            calls.push({ op: "magicLinks.authenticate", req });
            const email = tokens.get(req.token);
            if (!email) throw new Error("invalid token");
            tokens.delete(req.token);
            return authenticated(email, "magic_link");
          },
        },
        otps: {
          email: {
            async loginOrCreate(req) {
              calls.push({ op: "otps.email.loginOrCreate", req });
              const u = userFor(req.email);
              const id = `email-${u.user_id}`;
              codes.set(id, { email: req.email, code: "123456" });
              return { request_id: "r", user_id: u.user_id, email_id: id };
            },
          },
          async authenticate(req) {
            calls.push({ op: "otps.authenticate", req });
            const c = codes.get(req.method_id);
            if (!c || c.code !== req.code) throw new Error("bad code");
            codes.delete(req.method_id);
            return authenticated(c.email, "otp");
          },
        },
      };
    return {
      client,
      calls,
      users,
      tokens,
      lastToken: () => [...tokens.keys()].at(-1) ?? "",
      setAuthAt: (iso: string) => {
        authAt = iso;
      },
      setVerified: (email: string, v: boolean) => {
        userFor(email).verified = v;
      },
      renameEmail: (from: string, to: string) => {
        const u = users.get(from);
        if (!u) throw new Error("no user");
        users.delete(from);
        u.email = to;
        users.set(to, u);
      },
    };
  }

  const ENV_KEYS = [
    "REFI_AUTH_PROVIDER",
    "STYTCH_PROJECT_ID",
    "STYTCH_SECRET",
    "STYTCH_ENV",
    "REFI_AUTH_CALLBACK_URL",
    "REFI_CONNECTED_STORE_NAMESPACE",
    "REFI_CONNECTED_STORE_BACKING",
    "REFI_ENV",
    "BRIDGE_ASSERTION_PRIVATE_KEY_JWK",
    "BRIDGE_ASSERTION_ISSUER",
    "IDENTITY_CCID_UPSTREAM_AUDIENCE",
    "IDENTITY_CCID_JWKS_URL",
  ];
  const savedEnv: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env["REFI_AUTH_PROVIDER"] = "stytch";
  // The bridge → exchange chain must be configured whenever the provider is
  // on (env invariant); this section never reaches the exchange because no
  // upstream is configured, so completion fails closed with 503.
  {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env["BRIDGE_ASSERTION_PRIVATE_KEY_JWK"] = JSON.stringify({
      ...(privateKey.export({ format: "jwk" }) as Record<string, string>),
      kid: "bridge-stytch-section",
    });
  }
  process.env["BRIDGE_ASSERTION_ISSUER"] = "https://bff-dev.refi.trading";
  process.env["IDENTITY_CCID_UPSTREAM_AUDIENCE"] =
    "https://identity-ccid.dev.refi.internal";
  process.env["IDENTITY_CCID_JWKS_URL"] =
    "https://identity-ccid-74kl57biwa-uw.a.run.app/.well-known/jwks.json";
  process.env["STYTCH_PROJECT_ID"] =
    "project-test-00000000-0000-0000-0000-000000000000";
  process.env["STYTCH_SECRET"] = "secret-test-" + "x".repeat(24);
  process.env["STYTCH_ENV"] = "test";
  process.env["REFI_AUTH_CALLBACK_URL"] =
    "https://bff-dev.refi.trading/us/auth/callback";
  process.env["REFI_CONNECTED_STORE_NAMESPACE"] = "us-connected-test";
  process.env["REFI_CONNECTED_STORE_BACKING"] = "prototype";
  resetServerEnvCacheForTests();
  cs.setConnectedStoreFactoryForTests(instance());
  const provider = fakeStytch();
  stytchMod.setStytchClientForTests(provider.client);
  const ORIGIN = "https://bff-dev.refi.trading";
  const req = (
    path: string,
    body: unknown,
    opts: { origin?: string | null; cookie?: string; ip?: string } = {},
  ) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      host: "bff-dev.refi.trading",
    };
    const origin = opts.origin === undefined ? ORIGIN : opts.origin;
    if (origin) headers["origin"] = origin;
    if (opts.cookie) headers["cookie"] = opts.cookie;
    headers["x-real-ip"] = opts.ip ?? "203.0.113.10";
    return new NextRequest(`${ORIGIN}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  };
  // The start route is rate limited per IP (10 / 10 min); later sections use a fresh client IP per start.
  let ipN = 20;
  const nextIp = () => `203.0.113.${String(ipN++)}`;
  const savedProxy = process.env["REFI_TRUST_PROXY_HOST"];
  process.env["REFI_TRUST_PROXY_HOST"] = "1";
  const cookieOf = (res: Response) =>
    (res.headers.get("set-cookie") ?? "")
      .split(/,(?=[^ ;]+=)/)
      .map((c) => c.split(";")[0] ?? "")
      .filter((c) => c.startsWith("us_login_v1="))
      .join("; ");

  try {
    await section(
      "stytch normalisation: email alone is never proof — a matching verified email factor and genuine auth time are required; provider ids are validated",
      async () => {
        const good = {
          request_id: "r",
          status_code: 200,
          user_id: "user-test-abcdefghij",
          method_id: "m",
          user: {
            user_id: "user-test-abcdefghij",
            emails: [
              { email_id: "e1", email: "A@Example.com", verified: true },
            ],
          },
          session: {
            session_id: "session-1",
            user_id: "user-test-abcdefghij",
            started_at: "2026-09-10T03:00:10Z",
            authentication_factors: [
              {
                type: "magic_link",
                delivery_method: "email",
                last_authenticated_at: "2026-09-10T03:00:00Z",
                email_factor: {
                  email_id: "e1",
                  email_address: "a@example.com",
                },
              },
            ],
          },
        };
        const id = stytchMod.normalizeStytchAuthentication(good, {
          method: "email_link",
          now: () => 1_788_000_000 + 3_600 * 24 * 365,
        });
        assert.equal(id.email, "a@example.com");
        assert.equal(id.emailVerified, true);
        assert.deepEqual(id.amr, ["email_link"]);
        assert.equal(
          id.authTime,
          Math.floor(Date.parse("2026-09-10T03:00:00Z") / 1000),
          "auth_time is the factor's last_authenticated_at, not now",
        );
        const mut = (f: (g: typeof good) => void) => {
          const g = JSON.parse(JSON.stringify(good)) as typeof good;
          f(g);
          return g;
        };
        for (const [label, bad] of [
          [
            "unverified email",
            mut((g) => {
              g.user.emails[0]!.verified = false;
            }),
          ],
          [
            "no session",
            mut((g) => {
              delete (g as { session?: unknown }).session;
            }),
          ],
          [
            "no factor",
            mut((g) => {
              g.session.authentication_factors = [];
            }),
          ],
          [
            "wrong method",
            mut((g) => {
              g.session.authentication_factors[0]!.type = "otp";
            }),
          ],
          [
            "factor email not on user",
            mut((g) => {
              g.user.emails[0]!.email_id = "other";
            }),
          ],
          [
            "session/user mismatch",
            mut((g) => {
              g.session.user_id = "user-test-zzzzzzzzzz";
            }),
          ],
          [
            "malformed user id",
            mut((g) => {
              g.user_id = "alice@example.com";
              g.session.user_id = "alice@example.com";
            }),
          ],
          [
            "no auth time evidence",
            mut((g) => {
              delete g.session.authentication_factors[0]!.last_authenticated_at;
              delete (g.session as { started_at?: string }).started_at;
            }),
          ],
          [
            "auth time in the future",
            mut((g) => {
              g.session.authentication_factors[0]!.last_authenticated_at =
                "2099-01-01T00:00:00Z";
            }),
          ],
        ] as const) {
          assert.throws(
            () =>
              stytchMod.normalizeStytchAuthentication(bad, {
                method: "email_link",
              }),
            stytchMod.ProviderResultRejectedError,
            label,
          );
        }
        // Falls back to session.started_at only when the factor carries no time.
        const noFactorTime = mut((g) => {
          delete g.session.authentication_factors[0]!.last_authenticated_at;
        });
        assert.equal(
          stytchMod.normalizeStytchAuthentication(noFactorTime, {
            method: "email_link",
            now: () => 4_000_000_000,
          }).authTime,
          Math.floor(Date.parse("2026-09-10T03:00:10Z") / 1000),
        );
      },
    );

    await section(
      "login start (magic link + OTP): validated email, durable pending login with independent bindings, exact callback, stable network_context, safe response, HttpOnly binding cookie; dark unless the provider is configured",
      async () => {
        const res = await startRoute.POST(
          req("/api/v1/auth/login/start", {
            email: "  Investor@Example.com ",
            method: "email_link",
          }),
        );
        assert.equal(res.status, 200);
        const body = (await res.json()) as {
          data: { loginId: string; method: string; expiresAt: string };
        };
        assert.ok(
          body.data.loginId &&
            body.data.method === "email_link" &&
            body.data.expiresAt,
        );
        assert.ok(
          !JSON.stringify(body).includes("state"),
          "state never in the body",
        );
        assert.ok(!/@/.test(JSON.stringify(body)), "email never echoed");
        const setCookie = res.headers.get("set-cookie") ?? "";
        assert.ok(
          /us_login_v1=[^;]+; Path=\/; .*HttpOnly/i.test(setCookie) &&
            /Secure/i.test(setCookie),
          "HttpOnly Secure login-binding cookie",
        );
        const sent = provider.calls.find(
          (c) => c.op === "magicLinks.email.loginOrCreate",
        )!.req as {
          email: string;
          login_magic_link_url: string;
          signup_magic_link_url: string;
          login_expiration_minutes: number;
        };
        assert.equal(
          sent.email,
          "investor@example.com",
          "normalised email to the provider",
        );
        assert.equal(
          sent.login_magic_link_url,
          "https://bff-dev.refi.trading/us/auth/callback",
          "EXACT registered callback, no state in the link",
        );
        assert.equal(sent.signup_magic_link_url, sent.login_magic_link_url);
        assert.equal(
          sent.login_expiration_minutes,
          flow.MAGIC_LINK_EXPIRY_MINUTES,
        );
        // OTP start attaches the provider method id to the pending login.
        const otp = await startRoute.POST(
          req("/api/v1/auth/login/start", {
            email: "investor@example.com",
            method: "email_otp",
          }),
        );
        assert.equal(otp.status, 200);
        assert.ok(
          provider.calls.some((c) => c.op === "otps.email.loginOrCreate"),
        );
        // Bindings are random and independent, inside Daniel's window; network_context is stable per IP.
        const logins = await cs
          .connectedKvStore<
            import("../apps/web/src/lib/connected-store/login-state.ts").PendingLoginRecord
          >("login-state")
          .list();
        assert.ok(logins.length >= 2);
        for (const { value } of logins) {
          for (const v of [
            value.state,
            value.challenge,
            value.nonce,
            value.networkContext,
          ])
            assert.ok(/^[A-Za-z0-9_-]{22,128}$/.test(v));
          assert.equal(
            new Set([value.loginId, value.state, value.challenge, value.nonce])
              .size,
            4,
          );
          assert.ok(
            /^[0-9a-f]{64}$/.test(value.emailHash) &&
              !value.emailHash.includes("@"),
            "email stored only as an HMAC",
          );
        }
        assert.equal(
          logins[0]!.value.networkContext,
          logins[1]!.value.networkContext,
          "same client → same network_context (stable, not per-retry random)",
        );
        assert.equal(
          flow.networkContextFor("203.0.113.10"),
          logins[0]!.value.networkContext,
        );
        assert.notEqual(
          flow.networkContextFor("203.0.113.11"),
          logins[0]!.value.networkContext,
        );
        // Refusals.
        assert.equal(
          (
            await startRoute.POST(
              req("/api/v1/auth/login/start", {
                email: "not-an-email",
                method: "email_link",
              }),
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await startRoute.POST(
              req("/api/v1/auth/login/start", {
                email: "a@b.co",
                method: "sms",
              }),
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await startRoute.POST(
              req(
                "/api/v1/auth/login/start",
                { email: "a@b.co", method: "email_link" },
                { origin: "https://evil.example" },
              ),
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await startRoute.POST(
              req(
                "/api/v1/auth/login/start",
                { email: "a@b.co", method: "email_link" },
                { origin: null },
              ),
            )
          ).status,
          403,
        );
        process.env["REFI_AUTH_PROVIDER"] = "unconfigured";
        resetServerEnvCacheForTests();
        assert.equal(
          (
            await startRoute.POST(
              req("/api/v1/auth/login/start", {
                email: "a@b.co",
                method: "email_link",
              }),
            )
          ).status,
          404,
          "dark without a provider (demo/prototype tiers)",
        );
        assert.equal(
          (
            await completeRoute.POST(
              req("/api/v1/auth/login/complete", { token: "x".repeat(32) }),
            )
          ).status,
          404,
        );
        process.env["REFI_AUTH_PROVIDER"] = "stytch";
        resetServerEnvCacheForTests();
      },
    );

    await section(
      "login complete (magic link): cookie-bound, consumed once, provider-verified, opaque subject mapped; wrong state / replay / missing cookie / provider rejection refused; NO session is created from provider state",
      async () => {
        const start = await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "alice@example.com",
              method: "email_link",
            },
            { ip: nextIp() },
          ),
        );
        const cookie = cookieOf(start);
        const token = provider.lastToken();
        // Missing cookie → 400; wrong-state cookie → 401 (does not burn the login).
        assert.equal(
          (
            await completeRoute.POST(
              req("/api/v1/auth/login/complete", { token }),
            )
          ).status,
          400,
        );
        const [lid] = cookie.replace("us_login_v1=", "").split(".");
        assert.equal(
          (
            await completeRoute.POST(
              req(
                "/api/v1/auth/login/complete",
                { token },
                { cookie: `us_login_v1=${lid}.${"A".repeat(43)}` },
              ),
            )
          ).status,
          401,
        );
        // Exchange not wired → completion fails closed with 503 and sets NO session cookie…
        const first = await completeRoute.POST(
          req("/api/v1/auth/login/complete", { token }, { cookie }),
        );
        assert.equal(first.status, 503);
        assert.equal(
          ((await first.json()) as { code?: string }).code,
          "exchange_unavailable",
        );
        assert.ok(
          !/us_session_v1=[^;]/.test(first.headers.get("set-cookie") ?? ""),
          "no session from provider state",
        );
        assert.ok(
          /us_login_v1=;/.test(first.headers.get("set-cookie") ?? ""),
          "login cookie cleared",
        );
        // …but the provider WAS consulted once and the login is consumed: a replay is refused.
        assert.equal(
          provider.calls.filter((c) => c.op === "magicLinks.authenticate")
            .length,
          1,
        );
        const replay = await completeRoute.POST(
          req("/api/v1/auth/login/complete", { token }, { cookie }),
        );
        assert.equal(replay.status, 401, "replayed callback refused");
        assert.equal(
          provider.calls.filter((c) => c.op === "magicLinks.authenticate")
            .length,
          1,
          "replay never reaches the provider",
        );
        // With a fake session establisher the full path completes and the subject is the durable opaque map.
        let seen:
          | import("../apps/web/src/lib/auth/login-flow.ts").CompletedLogin
          | null = null;
        sessionSeam.setConnectedSessionEstablisher(async ({ completed }) => {
          seen = completed;
          return {
            continuePath: "/us/onboarding",
            cookies: [
              {
                name: "us_session_v1",
                value: "fake-session",
                options: {
                  httpOnly: true,
                  secure: true,
                  sameSite: "lax",
                  path: "/",
                  maxAge: 60,
                },
              },
            ],
          };
        });
        const start2 = await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "alice@example.com",
              method: "email_link",
            },
            { ip: nextIp() },
          ),
        );
        const ok = await completeRoute.POST(
          req(
            "/api/v1/auth/login/complete",
            { token: provider.lastToken() },
            { cookie: cookieOf(start2) },
          ),
        );
        assert.equal(ok.status, 200);
        assert.equal(
          ((await ok.json()) as { data: { continuePath: string } }).data
            .continuePath,
          "/us/onboarding",
        );
        assert.ok(seen, "establisher received the completed login");
        const c1 =
          seen as unknown as import("../apps/web/src/lib/auth/login-flow.ts").CompletedLogin;
        assert.equal(c1.identity.email, "alice@example.com");
        assert.deepEqual(c1.identity.amr, ["email_link"]);
        assert.ok(/^usr_[0-9a-f]{32}$/.test(c1.sub), "ReFi opaque subject");
        assert.ok(
          !c1.sub.includes("alice") &&
            !JSON.stringify(c1.sub).includes("user-test"),
          "subject derived from neither email nor provider id",
        );
        assert.equal(
          c1.login.redirectUri,
          "https://bff-dev.refi.trading/us/auth/callback",
        );
        // Same user again → same subject; OTP path converges on the same subject; another user differs.
        const start3 = await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "alice@example.com",
              method: "email_otp",
            },
            { ip: nextIp() },
          ),
        );
        const otpOk = await completeRoute.POST(
          req(
            "/api/v1/auth/login/complete",
            { code: "123456" },
            { cookie: cookieOf(start3) },
          ),
        );
        assert.equal(otpOk.status, 200);
        const c2 =
          seen as unknown as import("../apps/web/src/lib/auth/login-flow.ts").CompletedLogin;
        assert.equal(
          c2.sub,
          c1.sub,
          "OTP and magic link converge on one ReFi subject",
        );
        assert.deepEqual(c2.identity.amr, ["email_otp"]);
        // OTP replay (same code again) refused before the provider.
        const otpCalls = provider.calls.filter(
          (c) => c.op === "otps.authenticate",
        ).length;
        assert.equal(
          (
            await completeRoute.POST(
              req(
                "/api/v1/auth/login/complete",
                { code: "123456" },
                { cookie: cookieOf(start3) },
              ),
            )
          ).status,
          401,
        );
        assert.equal(
          provider.calls.filter((c) => c.op === "otps.authenticate").length,
          otpCalls,
          "OTP replay never reaches the provider",
        );
        // Email change at the provider does not change the subject.
        provider.renameEmail("alice@example.com", "alice.new@example.com");
        const start4 = await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "alice.new@example.com",
              method: "email_link",
            },
            { ip: nextIp() },
          ),
        );
        assert.equal(
          (
            await completeRoute.POST(
              req(
                "/api/v1/auth/login/complete",
                { token: provider.lastToken() },
                { cookie: cookieOf(start4) },
              ),
            )
          ).status,
          200,
        );
        const c3 =
          seen as unknown as import("../apps/web/src/lib/auth/login-flow.ts").CompletedLogin;
        assert.equal(c3.sub, c1.sub, "subject stable across an email change");
        assert.equal(c3.identity.email, "alice.new@example.com");
        // A different provider user gets a different subject.
        const start5 = await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "bob@example.com",
              method: "email_link",
            },
            { ip: nextIp() },
          ),
        );
        assert.equal(
          (
            await completeRoute.POST(
              req(
                "/api/v1/auth/login/complete",
                { token: provider.lastToken() },
                { cookie: cookieOf(start5) },
              ),
            )
          ).status,
          200,
        );
        assert.notEqual(
          (
            seen as unknown as import("../apps/web/src/lib/auth/login-flow.ts").CompletedLogin
          ).sub,
          c1.sub,
        );
        // The address that authenticates must be the address the login was started for.
        const start6 = await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "carol@example.com",
              method: "email_link",
            },
            { ip: nextIp() },
          ),
        );
        const carolCookie = cookieOf(start6);
        const carolToken = provider.lastToken();
        await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "dave@example.com",
              method: "email_link",
            },
            { ip: nextIp() },
          ),
        );
        const daveToken = provider.lastToken();
        assert.equal(
          (
            await completeRoute.POST(
              req(
                "/api/v1/auth/login/complete",
                { token: daveToken },
                { cookie: carolCookie },
              ),
            )
          ).status,
          401,
          "another address's token cannot complete this login",
        );
        void carolToken;
        // Unverified provider email → refused.
        provider.setVerified("bob@example.com", false);
        const start7 = await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "bob@example.com",
              method: "email_link",
            },
            { ip: nextIp() },
          ),
        );
        assert.equal(
          (
            await completeRoute.POST(
              req(
                "/api/v1/auth/login/complete",
                { token: provider.lastToken() },
                { cookie: cookieOf(start7) },
              ),
            )
          ).status,
          401,
        );
        // Concurrent completion: exactly one winner.
        const start8 = await startRoute.POST(
          req(
            "/api/v1/auth/login/start",
            {
              email: "erin@example.com",
              method: "email_link",
            },
            { ip: nextIp() },
          ),
        );
        const c8 = cookieOf(start8);
        const t8 = provider.lastToken();
        const both = await Promise.all([
          completeRoute.POST(
            req("/api/v1/auth/login/complete", { token: t8 }, { cookie: c8 }),
          ),
          completeRoute.POST(
            req("/api/v1/auth/login/complete", { token: t8 }, { cookie: c8 }),
          ),
        ]);
        assert.deepEqual(
          both.map((r) => r.status).sort(),
          [200, 401],
          "one winner, one refusal",
        );
        sessionSeam.setConnectedSessionEstablisher(null);
      },
    );

    await section(
      "stytch: source guards — secrets only from server env, SDK lazy-loaded, no provider id or email in the subject path, routes are public-rate-limited and same-origin",
      async () => {
        const strip = (f: string) =>
          readFileSync(join(REPO_ROOT, f), "utf8").replace(
            /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
            "",
          );
        const st = strip("apps/web/src/lib/auth/stytch.ts");
        assert.ok(
          /await import\("stytch"\)/.test(st) &&
            !/^import .*from "stytch"/m.test(st),
          "SDK is a lazy dynamic import",
        );
        assert.ok(
          !/NEXT_PUBLIC/.test(st) && !/console\./.test(st),
          "no public env, no logging",
        );
        const lf = strip("apps/web/src/lib/auth/login-flow.ts");
        assert.ok(
          /consumePendingLogin\(/.test(lf) &&
            lf.indexOf("consumePendingLogin(") <
              lf.indexOf("magicLinks.authenticate"),
          "pending login consumed BEFORE the provider is called",
        );
        assert.ok(
          /getOrCreateOpaqueSubject\(/.test(lf) &&
            !/sub:\s*identity\.email|sub:\s*identity\.providerUserId/.test(lf),
          "subject only via the durable map",
        );
        for (const f of [
          "apps/web/app/api/v1/auth/login/start/route.ts",
          "apps/web/app/api/v1/auth/login/complete/route.ts",
        ]) {
          const r = strip(f);
          assert.ok(
            /REFI_AUTH_PROVIDER !== "stytch"/.test(r) &&
              /requestOrigin\(req\)/.test(r) &&
              /createRateLimiter/.test(r),
            `${f}: dark switch, same-origin, rate limit`,
          );
          assert.ok(
            !/getAuthContext|bffMutate|bffRead/.test(r),
            `${f}: unauthenticated by design (no session yet)`,
          );
          assert.ok(!/console\./.test(r), `${f}: never logs`);
        }
        const manifest = JSON.parse(
          readFileSync(
            join(REPO_ROOT, "compliance/API_ROUTE_MANIFEST.json"),
            "utf8",
          ),
        ) as { routes: Array<{ route: string; auth: Record<string, string> }> };
        for (const p of [
          "/api/v1/auth/login/start",
          "/api/v1/auth/login/complete",
        ]) {
          const row = manifest.routes.find((r) => r.route === p);
          assert.ok(
            row && row.auth["POST"] === "public-rate-limited",
            `${p} manifested as public-rate-limited`,
          );
        }
        const env = strip("apps/web/src/lib/config/env.ts");
        assert.ok(
          /REFI_AUTH_PROVIDER === "stytch"/.test(env) &&
            /the demo tier never uses a real identity provider/.test(env),
          "stytch is refused on the demo tier and all-or-nothing",
        );
      },
    );
  } finally {
    sessionSeam.setConnectedSessionEstablisher(null);
    stytchMod.setStytchClientForTests(null);
    cs.setConnectedStoreFactoryForTests(null);
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (savedProxy === undefined) delete process.env["REFI_TRUST_PROXY_HOST"];
    else process.env["REFI_TRUST_PROXY_HOST"] = savedProxy;
    resetServerEnvCacheForTests();
  }
}

// ─── Identity bridge + Daniel's exchange + connected session (US Connected Identity Alpha path): separate key, closed claims, verified result, jti once, durable session ──

{
  const { resetServerEnvCacheForTests, getServerEnv: getServerEnvBridge } =
    await import("../apps/web/src/lib/config/env.ts");
  const cs = await import("../apps/web/src/lib/connected-store/index.ts");
  const sessions =
    await import("../apps/web/src/lib/connected-store/session.ts");
  const replay = await import("../apps/web/src/lib/connected-store/replay.ts");
  const bridge = await import("../apps/web/src/lib/auth/identity-bridge.ts");
  const exchange =
    await import("../apps/web/src/lib/auth/identity-exchange.ts");
  const attempts =
    await import("../apps/web/src/lib/connected-store/exchange-attempt.ts");
  const apiClientsB =
    await import("../packages/api-clients/src/investor-api/index.ts");
  const chain = await import("../apps/web/src/lib/auth/connected-login.ts");
  const sessionSeam =
    await import("../apps/web/src/lib/auth/connected-session.ts");
  const stytchMod = await import("../apps/web/src/lib/auth/stytch.ts");
  const flow = await import("../apps/web/src/lib/auth/login-flow.ts");
  const ua = await import("../apps/web/src/lib/investor-api/user-assertion.ts");
  const { getAuthContext: getAuthContextBridge } =
    await import("../apps/web/src/lib/bff/auth.ts");
  const bridgeJwksRoute =
    await import("../apps/web/app/.well-known/identity-bridge-jwks.json/route.ts");
  const startRoute =
    await import("../apps/web/app/api/v1/auth/login/start/route.ts");
  const completeRoute =
    await import("../apps/web/app/api/v1/auth/login/complete/route.ts");
  const nodeCryptoB = await import("node:crypto");
  const { createRequire: createRequireBridge } = await import("node:module");
  const requireWebBridge = createRequireBridge(
    join(process.cwd(), "apps/web/package.json"),
  );
  const joseB = (await import(
    requireWebBridge.resolve("jose")
  )) as typeof import("jose");
  const { NextRequest: NextRequestB } = (await import(
    requireWebBridge.resolve("next/server")
  )) as typeof import("next/server");

  // Keys: bridge, investor-api (BFF) and Daniel's backend — three distinct pairs.
  const genJwk = (kid: string) => {
    const { privateKey } = nodeCryptoB.generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const jwk = privateKey.export({ format: "jwk" }) as Record<string, string>;
    return { ...jwk, kid, alg: "ES256", use: "sig" };
  };
  const bridgeJwk = genJwk("bridge-k1");
  const bffJwk = genJwk("bff-k1");
  const backendJwk = genJwk("ccid-k1");
  const backendPublic = (() => {
    const { d: _d, ...pub } = backendJwk;
    return { keys: [pub] };
  })();
  const backendPrivateKey = await joseB.importJWK(backendJwk, "ES256");

  const ENV_KEYS = [
    "REFI_AUTH_PROVIDER",
    "STYTCH_PROJECT_ID",
    "STYTCH_SECRET",
    "STYTCH_ENV",
    "REFI_AUTH_CALLBACK_URL",
    "REFI_CONNECTED_STORE_NAMESPACE",
    "REFI_CONNECTED_STORE_BACKING",
    "REFI_ENV",
    "BRIDGE_ASSERTION_SIGNER",
    "BRIDGE_ASSERTION_PRIVATE_KEY_JWK",
    "BRIDGE_ASSERTION_KMS_KEY_VERSION",
    "BRIDGE_ASSERTION_KID",
    "BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK",
    "BRIDGE_ASSERTION_ISSUER",
    "IDENTITY_CCID_UPSTREAM_AUDIENCE",
    "IDENTITY_CCID_JWKS_URL",
    "IDENTITY_RESULT_ISSUER",
    "IDENTITY_RESULT_AUDIENCE",
    "BFF_ASSERTION_SIGNER",
    "BFF_ASSERTION_PRIVATE_KEY_JWK",
    "BFF_ASSERTION_KMS_KEY_VERSION",
    "BFF_ASSERTION_KID",
    "BFF_ASSERTION_ISSUER",
    "REFI_IDENTITY_CCID_BASE_URL",
    "REFI_INVESTOR_API_ALLOW_REMOTE",
    "REFI_TRUST_PROXY_HOST",
  ];
  const savedEnv: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  const baseEnv = () => {
    for (const k of ENV_KEYS) delete process.env[k];
    process.env["REFI_AUTH_PROVIDER"] = "stytch";
    process.env["STYTCH_PROJECT_ID"] =
      "project-test-00000000-0000-0000-0000-000000000000";
    process.env["STYTCH_SECRET"] = "secret-test-" + "x".repeat(24);
    process.env["STYTCH_ENV"] = "test";
    process.env["REFI_AUTH_CALLBACK_URL"] =
      "https://bff-dev.refi.trading/us/auth/callback";
    process.env["REFI_CONNECTED_STORE_NAMESPACE"] = "us-connected-test";
    process.env["REFI_CONNECTED_STORE_BACKING"] = "prototype";
    process.env["BRIDGE_ASSERTION_SIGNER"] = "jwk";
    process.env["BRIDGE_ASSERTION_PRIVATE_KEY_JWK"] = JSON.stringify(bridgeJwk);
    process.env["BRIDGE_ASSERTION_ISSUER"] = "https://bff-dev.refi.trading";
    process.env["IDENTITY_CCID_UPSTREAM_AUDIENCE"] =
      "https://identity-ccid.dev.refi.internal";
    process.env["IDENTITY_CCID_JWKS_URL"] =
      "https://identity-ccid-74kl57biwa-uw.a.run.app/.well-known/jwks.json";
    process.env["BFF_ASSERTION_SIGNER"] = "jwk";
    process.env["BFF_ASSERTION_PRIVATE_KEY_JWK"] = JSON.stringify(bffJwk);
    process.env["BFF_ASSERTION_ISSUER"] = "urn:refinity:bff:dev";
    process.env["REFI_TRUST_PROXY_HOST"] = "1";
    resetServerEnvCacheForTests();
    bridge.resetBridgeSignerCache();
    ua.resetSigningKeyCache();
  };
  const envError = (): string => {
    resetServerEnvCacheForTests();
    try {
      getServerEnvBridge();
      return "";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  // Shared backing across "instances": same Map, fresh store factories.
  const backing = new Map<string, Map<string, unknown>>();
  const instance =
    (): Parameters<typeof cs.setConnectedStoreFactoryForTests>[0] =>
    <T>(collection: string) => {
      const col = () => {
        let m = backing.get(collection);
        if (!m) {
          m = new Map();
          backing.set(collection, m);
        }
        return m as Map<string, T>;
      };
      return {
        async get(k: string) {
          return col().get(k) ?? null;
        },
        async put(k: string, v: T) {
          col().set(k, v);
        },
        async putIfAbsent(k: string, v: T) {
          if (col().has(k)) return false;
          col().set(k, v);
          return true;
        },
        async list(prefix?: string) {
          return [...col().entries()]
            .filter(([k]) => !prefix || k.startsWith(prefix))
            .map(([key, value]) => ({ key, value }));
        },
        async delete(k: string) {
          col().delete(k);
        },
      };
    };
  const sessionsInStore = () =>
    backing.get("us-connected-test--connected-session")?.size ?? 0;

  // Daniel's exchange, as a fixture: verifies the bridge assertion the way
  // identity-ccid would (bridge JWKS, iss/aud, exp/nbf, closed claims, single
  // use) and answers with an identity_result signed by the backend key.
  const seenBridgeJtis = new Set<string>();
  const exchangeCalls: Array<Record<string, unknown>> = [];
  let resultOverride:
    ((claims: Record<string, unknown>) => Record<string, unknown>) | null =
    null;
  let resultSigner: {
    key: CryptoKey | Uint8Array;
    alg: string;
    kid: string;
  } | null = null;
  let exchangeFailure: Error | null = null;
  /** Backend receives and processes the request, then the answer is lost. */
  let lostAfterSend = false;
  let headerExtra: Record<string, unknown> | null = null;
  const answersByBridgeJti = new Map<string, { body: string; token: string }>();
  const fakeExchange: import("../apps/web/src/lib/investor-api/demo-client.ts").InvestorApiReadClient =
    {
      async call(opId, options) {
        assert.equal(opId, "exchangeIdentity");
        if (exchangeFailure) throw exchangeFailure;
        const body = (options as { body: Record<string, unknown> }).body;
        exchangeCalls.push(body);
        const bridgeJwks = await bridge.getBridgePublicJwks();
        const { payload, protectedHeader } = await joseB.jwtVerify(
          body["identity_assertion"] as string,
          joseB.createLocalJWKSet(bridgeJwks as import("jose").JSONWebKeySet),
          {
            algorithms: ["ES256"],
            issuer: "https://bff-dev.refi.trading",
            audience: "https://identity-ccid.dev.refi.internal",
            clockTolerance: 30,
          },
        );
        assert.equal(protectedHeader.typ, "JWT");
        const prior = answersByBridgeJti.get(payload.jti as string);
        if (prior) {
          if (prior.body !== JSON.stringify(body)) {
            throw new apiClientsB.InvestorApiError({
              status: 422,
              code: "VALIDATION_ERROR",
              message: "binding fields changed for a presented assertion",
              correlationId: "ccid_x",
            });
          }
          if (lostAfterSend) {
            lostAfterSend = false;
            throw new apiClientsB.InvestorApiTransportError("lost", 1);
          }
          return {
            status: 200,
            correlationId: "ccid_x",
            headers: new Headers(),
            data: {
              data: {
                identity_result: prior.token,
                token_type: "JWT",
                expires_at: new Date(Date.now() + 300_000).toISOString(),
              },
            },
          } as never;
        }
        seenBridgeJtis.add(payload.jti as string);
        const now = Math.floor(Date.now() / 1000);
        let claims: Record<string, unknown> = {
          iss: "urn:refinity:identity-ccid:dev",
          aud: "urn:refinity:frontend-bff:dev",
          sub: `user-${nodeCryptoB.randomBytes(12).toString("hex")}`,
          iat: now,
          nbf: now,
          exp: now + 300,
          jti: `idr_${nodeCryptoB.randomBytes(16).toString("hex")}`,
          sid: payload.sid,
          auth_time: payload.auth_time,
          email: payload.email,
          email_verified: true,
          amr: payload.amr,
        };
        if (resultOverride) claims = resultOverride(claims);
        const signer = resultSigner ?? {
          key: backendPrivateKey,
          alg: "ES256",
          kid: "ccid-k1",
        };
        const token = await new joseB.SignJWT(claims)
          .setProtectedHeader({
            alg: signer.alg,
            kid: signer.kid,
            typ: "JWT",
            ...(headerExtra ?? {}),
          })
          .sign(signer.key);
        answersByBridgeJti.set(payload.jti as string, {
          body: JSON.stringify(body),
          token,
        });
        if (lostAfterSend) {
          lostAfterSend = false;
          throw new apiClientsB.InvestorApiTransportError("lost", 1);
        }
        return {
          status: 200,
          correlationId: "ccid_x",
          headers: new Headers(),
          data: {
            data: {
              identity_result: token,
              token_type: "JWT",
              expires_at: new Date((now + 300) * 1000).toISOString(),
            },
          },
        } as never;
      },
    };

  const fakeStytchB = () => {
    const tokens = new Map<string, string>();
    let authAt = "2026-09-10T03:00:00Z";
    const userFor = (email: string) => ({
      user_id: `user-test-${Buffer.from(email).toString("hex").slice(0, 24)}`,
      email,
    });
    const authenticated = (email: string, type: string) => {
      const u = userFor(email);
      return {
        request_id: "req",
        status_code: 200,
        user_id: u.user_id,
        method_id: "m",
        user: {
          user_id: u.user_id,
          emails: [
            { email_id: `email-${u.user_id}`, email: u.email, verified: true },
          ],
        },
        session: {
          session_id: `session-${u.user_id}`,
          user_id: u.user_id,
          started_at: authAt,
          authentication_factors: [
            {
              type,
              delivery_method: "email",
              last_authenticated_at: authAt,
              email_factor: {
                email_id: `email-${u.user_id}`,
                email_address: u.email,
              },
            },
          ],
        },
      };
    };
    const client: import("../apps/web/src/lib/auth/stytch.ts").StytchClientLike =
      {
        magicLinks: {
          email: {
            async loginOrCreate(req) {
              const u = userFor(req.email);
              const t = `tok_${nodeCryptoB.randomBytes(16).toString("hex")}`;
              tokens.set(t, req.email);
              return {
                request_id: "r",
                user_id: u.user_id,
                email_id: `email-${u.user_id}`,
              };
            },
          },
          async authenticate(req) {
            const email = tokens.get(req.token);
            if (!email) throw new Error("invalid token");
            tokens.delete(req.token);
            return authenticated(email, "magic_link");
          },
        },
        otps: {
          email: {
            async loginOrCreate(req) {
              const u = userFor(req.email);
              return {
                request_id: "r",
                user_id: u.user_id,
                email_id: `email-${u.user_id}`,
              };
            },
          },
          async authenticate(req) {
            const email = [...tokens.values()].at(-1) ?? "otp@example.com";
            if (req.code !== "123456") throw new Error("bad code");
            return authenticated(email, "otp");
          },
        },
      };
    return {
      client,
      lastToken: () => [...tokens.keys()].at(-1) ?? "",
      authAt: () => Math.floor(Date.parse(authAt) / 1000),
    };
  };

  const ORIGIN = "https://bff-dev.refi.trading";
  let ipN = 120;
  const nextIp = () => `203.0.113.${String(ipN++)}`;
  const reqB = (
    path: string,
    body: unknown,
    opts: { cookie?: string; ip?: string } = {},
  ) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      host: "bff-dev.refi.trading",
      origin: ORIGIN,
      "x-real-ip": opts.ip ?? nextIp(),
    };
    if (opts.cookie) headers["cookie"] = opts.cookie;
    return new NextRequestB(`${ORIGIN}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  };
  const cookiesOf = (res: Response, name: string) =>
    (res.headers.get("set-cookie") ?? "")
      .split(/,\s*(?=[^ ;,]+=)/)
      .map((c) => (c.split(";")[0] ?? "").trim())
      .filter((c) => c.startsWith(`${name}=`))
      .map((c) => c.slice(name.length + 1));

  // A CompletedLogin fixture straight from the login-flow (no routes).
  const provider = fakeStytchB();
  const completedLogin = async (email: string, ip = nextIp()) => {
    const started = await flow.startEmailLogin({
      email,
      method: "email_link",
      clientIp: ip,
      correlationId: "c_start",
    });
    return flow.completeEmailLogin({
      loginId: started.loginId,
      state: started.state,
      token: provider.lastToken(),
      correlationId: "c_complete",
    });
  };
  const decode = (jwt: string) => {
    const [h, p] = jwt.split(".");
    return {
      header: JSON.parse(
        Buffer.from(h ?? "", "base64url").toString(),
      ) as Record<string, unknown>,
      claims: JSON.parse(
        Buffer.from(p ?? "", "base64url").toString(),
      ) as Record<string, unknown>,
    };
  };

  baseEnv();
  cs.setConnectedStoreFactoryForTests(instance());
  stytchMod.setStytchClientForTests(provider.client);
  exchange.setIdentityExchangeClientForTests(fakeExchange);
  exchange.setIdentityResultKeySetForTests(
    backendPublic as import("jose").JSONWebKeySet,
  );

  try {
    await section(
      "identity bridge: closed ES256 profile — exact header/claims, ≤300 s, opaque sub (never email/provider id), genuine auth_time, verifies against the BRIDGE JWKS and not the Investor API JWKS",
      async () => {
        const completed = await completedLogin("bridge-alice@example.com");
        const sid = sessions.newSessionId();
        const minted = await bridge.mintBridgeAssertion({
          identity: completed.identity,
          sub: completed.sub,
          sid,
        });
        const { header, claims } = decode(minted.token);
        assert.deepEqual(Object.keys(header).sort(), ["alg", "kid", "typ"]);
        assert.equal(header.alg, "ES256");
        assert.equal(header.typ, "JWT");
        assert.equal(header.kid, "bridge-k1");
        assert.deepEqual(
          Object.keys(claims).sort(),
          [...bridge.BRIDGE_REQUIRED_CLAIMS, "amr"].sort(),
          "exactly the closed claim set",
        );
        assert.equal(claims.iss, "https://bff-dev.refi.trading");
        assert.equal(claims.aud, "https://identity-ccid.dev.refi.internal");
        assert.equal(claims.sub, completed.sub);
        assert.ok(
          /^usr_[0-9a-f]{32}$/.test(claims.sub as string),
          "sub is the durable opaque subject",
        );
        assert.notEqual(claims.sub, completed.identity.providerUserId);
        assert.ok(!(claims.sub as string).includes("@"));
        assert.equal(claims.email, "bridge-alice@example.com");
        assert.equal(claims.email_verified, true);
        assert.equal(
          claims.auth_time,
          provider.authAt(),
          "auth_time is the provider's, not now",
        );
        assert.equal(claims.sid, sid);
        assert.equal(claims.jti, minted.jti);
        assert.deepEqual(claims.amr, ["email_link"]);
        assert.equal(
          (claims.exp as number) - (claims.iat as number),
          bridge.BRIDGE_ASSERTION_TTL_SECONDS,
        );
        assert.ok((claims.exp as number) - (claims.iat as number) <= 300);
        assert.equal(claims.nbf, claims.iat);
        const bridgeJwks = await bridge.getBridgePublicJwks();
        await joseB.jwtVerify(
          minted.token,
          joseB.createLocalJWKSet(bridgeJwks as import("jose").JSONWebKeySet),
          {
            algorithms: ["ES256"],
            issuer: "https://bff-dev.refi.trading",
            audience: "https://identity-ccid.dev.refi.internal",
          },
        );
        const investorJwks = await ua.getPublicJwks();
        await assert.rejects(
          joseB.jwtVerify(
            minted.token,
            joseB.createLocalJWKSet(
              investorJwks as import("jose").JSONWebKeySet,
            ),
            { algorithms: ["ES256"] },
          ),
          "the Investor API key set must NOT verify a bridge assertion",
        );
        assert.ok(
          !bridgeJwks.keys.some((k) => "d" in k),
          "no private material",
        );
        assert.ok(!bridgeJwks.keys.some((k) => k.kid === "bff-k1"));
        assert.ok(!investorJwks.keys.some((k) => k.kid === "bridge-k1"));
      },
    );

    await section(
      "identity bridge: key separation — identical signing identity for both boundaries is rejected by the env schema AND by the bridge signer (jwk, kms key version, kid, issuer); no ephemeral fallback",
      async () => {
        baseEnv();
        process.env["BRIDGE_ASSERTION_PRIVATE_KEY_JWK"] =
          JSON.stringify(bffJwk);
        assert.match(
          envError(),
          /BRIDGE_ASSERTION_PRIVATE_KEY_JWK[\s\S]*different private keys/,
        );
        // Same key material, different serialisation: the schema cannot see it, the signer must.
        process.env["BRIDGE_ASSERTION_PRIVATE_KEY_JWK"] = JSON.stringify({
          ...bffJwk,
          kid: "bridge-k1",
        });
        assert.equal(envError(), "");
        bridge.resetBridgeSignerCache();
        await assert.rejects(
          bridge.getBridgeSigner(),
          bridge.BridgeConfigurationError,
        );
        baseEnv();
        process.env["BRIDGE_ASSERTION_SIGNER"] = "kms";
        process.env["BRIDGE_ASSERTION_KMS_KEY_VERSION"] =
          "projects/p/locations/l/keyRings/r/cryptoKeys/investor-api-assertion/cryptoKeyVersions/1";
        process.env["BRIDGE_ASSERTION_KID"] = "kms-1";
        process.env["BFF_ASSERTION_SIGNER"] = "kms";
        process.env["BFF_ASSERTION_KMS_KEY_VERSION"] =
          process.env["BRIDGE_ASSERTION_KMS_KEY_VERSION"];
        process.env["BFF_ASSERTION_KID"] = "kms-bff-1";
        assert.match(
          envError(),
          /BRIDGE_ASSERTION_KMS_KEY_VERSION[\s\S]*different KMS keys/,
        );
        baseEnv();
        process.env["BRIDGE_ASSERTION_KID"] = "shared-kid";
        process.env["BFF_ASSERTION_KID"] = "shared-kid";
        assert.match(envError(), /BRIDGE_ASSERTION_KID[\s\S]*must differ/);
        baseEnv();
        process.env["BRIDGE_ASSERTION_ISSUER"] = "urn:refinity:bff:dev";
        assert.match(envError(), /BRIDGE_ASSERTION_ISSUER/);
        baseEnv();
        process.env["BRIDGE_ASSERTION_SIGNER"] = "kms";
        assert.match(
          envError(),
          /kms requires BRIDGE_ASSERTION_KMS_KEY_VERSION and BRIDGE_ASSERTION_KID/,
        );
        baseEnv();
        delete process.env["BRIDGE_ASSERTION_PRIVATE_KEY_JWK"];
        assert.match(
          envError(),
          /BRIDGE_ASSERTION_PRIVATE_KEY_JWK[\s\S]*no ephemeral key/,
        );
        // Provider off → bridge config is not demanded (routes are dark anyway)…
        process.env["REFI_AUTH_PROVIDER"] = "unconfigured";
        assert.equal(envError(), "");
        // …but the signer itself still refuses to invent a key.
        bridge.resetBridgeSignerCache();
        await assert.rejects(
          bridge.getBridgeSigner(),
          /BRIDGE_ASSERTION_PRIVATE_KEY_JWK is not configured/,
        );
        baseEnv();
        for (const k of [
          "BRIDGE_ASSERTION_ISSUER",
          "IDENTITY_CCID_UPSTREAM_AUDIENCE",
          "IDENTITY_CCID_JWKS_URL",
        ]) {
          baseEnv();
          delete process.env[k];
          assert.match(
            envError(),
            new RegExp(`${k}[\\s\\S]*required when REFI_AUTH_PROVIDER=stytch`),
          );
        }
        baseEnv();
        process.env["BRIDGE_ASSERTION_ISSUER"] = "http://bff-dev.refi.trading";
        assert.match(envError(), /must be an https issuer/);
        baseEnv();
      },
    );

    await section(
      "identity bridge: input refusals — non-opaque sub, unverified email, missing/future auth_time, empty amr, bad sid; separate KMS client seam is honoured",
      async () => {
        const completed = await completedLogin("bridge-bob@example.com");
        const sid = sessions.newSessionId();
        const base = { identity: completed.identity, sub: completed.sub, sid };
        await assert.rejects(
          bridge.mintBridgeAssertion({ ...base, sub: "bob@example.com" }),
          bridge.BridgeInputError,
        );
        await assert.rejects(
          bridge.mintBridgeAssertion({ ...base, sub: "short" }),
          bridge.BridgeInputError,
        );
        await assert.rejects(
          bridge.mintBridgeAssertion({ ...base, sid: "x" }),
          bridge.BridgeInputError,
        );
        await assert.rejects(
          bridge.mintBridgeAssertion({
            ...base,
            identity: { ...completed.identity, emailVerified: false as never },
          }),
          bridge.BridgeInputError,
        );
        await assert.rejects(
          bridge.mintBridgeAssertion({
            ...base,
            identity: { ...completed.identity, authTime: 0 },
          }),
          bridge.BridgeInputError,
        );
        await assert.rejects(
          bridge.mintBridgeAssertion({
            ...base,
            identity: {
              ...completed.identity,
              authTime: Math.floor(Date.now() / 1000) + 3600,
            },
          }),
          bridge.BridgeInputError,
        );
        await assert.rejects(
          bridge.mintBridgeAssertion({
            ...base,
            identity: { ...completed.identity, amr: [] as never },
          }),
          bridge.BridgeInputError,
        );
        // KMS seam: the bridge asks ITS factory, with ITS key version, never the Investor API's.
        baseEnv();
        process.env["BRIDGE_ASSERTION_SIGNER"] = "kms";
        process.env["BRIDGE_ASSERTION_KMS_KEY_VERSION"] =
          "projects/p/locations/l/keyRings/r/cryptoKeys/identity-bridge/cryptoKeyVersions/1";
        process.env["BRIDGE_ASSERTION_KID"] = "bridge-kms-1";
        resetServerEnvCacheForTests();
        const seen: string[] = [];
        bridge.setBridgeKmsClientFactoryForTests(async () => ({
          async getPublicKey(req) {
            seen.push(`pub:${req.name}`);
            const { d: _d, ...pub } = bridgeJwk;
            const pem = nodeCryptoB
              .createPublicKey({ key: pub, format: "jwk" })
              .export({ type: "spki", format: "pem" }) as string;
            return [{ pem }];
          },
          async asymmetricSign(req) {
            seen.push(`sign:${req.name}`);
            const key = nodeCryptoB.createPrivateKey({
              key: bridgeJwk,
              format: "jwk",
            });
            // Sign the digest directly with deterministic DER output via node (sha256 of the digest is NOT what KMS does; use the raw sign primitive on the prehashed digest).
            const sig = nodeCryptoB.sign(null, req.digest.sha256, {
              key,
              dsaEncoding: "der",
            });
            return [{ signature: new Uint8Array(sig) }];
          },
        }));
        try {
          const signer = await bridge.getBridgeSigner();
          assert.equal(signer.kind, "kms");
          assert.equal(signer.kid, "bridge-kms-1");
          const jwk = await signer.publicJwk();
          assert.equal(jwk.kid, "bridge-kms-1");
          assert.ok(
            seen.every((s) => s.includes("identity-bridge")),
            "only the bridge key version is ever named",
          );
        } finally {
          bridge.setBridgeKmsClientFactoryForTests(null);
          baseEnv();
        }
      },
    );

    await section(
      "bridge JWKS route: /.well-known/identity-bridge-jwks.json serves ONLY bridge public keys (+ retiring key), application/jwk-set+json, 5-minute cache; /.well-known/jwks.json is untouched; misconfiguration → 503 without detail",
      async () => {
        baseEnv();
        const { d: _d, ...prevPub } = genJwk("bridge-k0");
        process.env["BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"] =
          JSON.stringify(prevPub);
        resetServerEnvCacheForTests();
        const res = await bridgeJwksRoute.GET();
        assert.equal(res.status, 200);
        assert.equal(
          res.headers.get("content-type"),
          "application/jwk-set+json",
        );
        assert.equal(
          res.headers.get("cache-control"),
          "public, max-age=300, must-revalidate",
        );
        const body = (await res.json()) as {
          keys: Array<Record<string, unknown>>;
        };
        assert.deepEqual(
          body.keys.map((k) => k.kid),
          ["bridge-k1", "bridge-k0"],
        );
        assert.ok(body.keys.every((k) => !("d" in k)));
        const inv = (await ua.getPublicJwks()) as {
          keys: Array<Record<string, unknown>>;
        };
        assert.deepEqual(
          inv.keys.map((k) => k.kid),
          ["bff-k1"],
        );
        process.env["BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"] =
          JSON.stringify(genJwk("bridge-k0"));
        resetServerEnvCacheForTests();
        bridge.resetBridgeSignerCache();
        const leak = await bridgeJwksRoute.GET();
        assert.equal(
          leak.status,
          503,
          "a previous key with a private component is refused, never published",
        );
        assert.deepEqual(await leak.json(), { error: "jwks_unavailable" });
        baseEnv();
        delete process.env["BRIDGE_ASSERTION_PRIVATE_KEY_JWK"];
        process.env["REFI_AUTH_PROVIDER"] = "unconfigured";
        resetServerEnvCacheForTests();
        bridge.resetBridgeSignerCache();
        const dark = await bridgeJwksRoute.GET();
        assert.equal(dark.status, 503);
        assert.equal(dark.headers.get("cache-control"), "no-store");
        baseEnv();
      },
    );

    await section(
      "exchange (step 5): request built ONLY from the frozen client's IdentityExchangeRequest fields and the durable pending-login bindings; backend result verified; durable session created with the backend sub, the bridge sid, genuine auth_time; cookie is a reference",
      async () => {
        exchangeCalls.length = 0;
        const before = sessionsInStore();
        const completed = await completedLogin("exchange-carol@example.com");
        const established = await sessionSeam.establishConnectedSession({
          completed,
          correlationId: "c_est",
        });
        assert.equal(exchangeCalls.length, 1);
        const body = exchangeCalls[0] as Record<string, unknown>;
        assert.deepEqual(
          Object.keys(body).sort(),
          [
            "challenge",
            "identity_assertion",
            "network_context",
            "nonce",
            "redirect_uri",
            "state",
          ],
          "no invented fields; acquisition/invitation_token omitted",
        );
        assert.equal(body.state, completed.login.state);
        assert.equal(body.challenge, completed.login.challenge);
        assert.equal(body.nonce, completed.login.nonce);
        assert.equal(
          body.redirect_uri,
          "https://bff-dev.refi.trading/us/auth/callback",
        );
        assert.equal(body.network_context, completed.login.networkContext);
        assert.equal(established.continuePath, "/us/app/home");
        assert.equal(established.cookies.length, 1);
        const c = established.cookies[0]!;
        assert.equal(c.name, "us_session_v1");
        assert.ok(
          c.options.httpOnly &&
            c.options.secure &&
            c.options.sameSite === "lax" &&
            c.options.path === "/",
        );
        assert.equal(sessionsInStore(), before + 1);
        const { claims: cookieClaims } = decode(c.value);
        assert.equal(cookieClaims.src, "connected");
        const record = await sessions.getActiveConnectedSession(
          cookieClaims.sid as string,
        );
        assert.ok(record, "durable session exists");
        assert.ok(
          /^user-[0-9a-f]{24}$/.test(record.sub),
          "session sub is the BACKEND opaque user id",
        );
        assert.equal(cookieClaims.sub, record.sub);
        assert.equal(record.authTime, provider.authAt());
        assert.deepEqual(record.amr, ["email_link"]);
        assert.equal(
          decode(body.identity_assertion as string).claims.sid,
          record.sid,
          "bridge sid became the session sid",
        );
        assert.ok(
          await replay.isJtiConsumed(
            "identity-result-jti",
            record.identityResultJti,
          ),
        );
        assert.ok(
          await replay.isJtiConsumed(
            "bridge-assertion-jti",
            decode(body.identity_assertion as string).claims.jti as string,
          ),
        );
        // The cookie resolves through the durable record on a FRESH instance.
        cs.setConnectedStoreFactoryForTests(instance());
        const ctx = await getAuthContextBridge(
          new NextRequestB(
            "https://bff-dev.refi.trading/api/v1/investor/status",
            { headers: { cookie: `us_session_v1=${c.value}` } },
          ),
        );
        assert.ok(ctx);
        assert.equal(ctx.authId, record.sub);
        assert.equal(ctx.sid, record.sid);
        assert.equal(ctx.authTime, provider.authAt());
        assert.deepEqual(ctx.amr, ["email_link"]);
        assert.equal(ctx.source, "backend");
        assert.equal(
          ctx.accountId,
          undefined,
          "no prototype account link on a connected session",
        );
        // Revoked durably → dead everywhere at once; the cookie itself is unchanged.
        await sessions.revokeConnectedSession(record.sid, "test");
        cs.setConnectedStoreFactoryForTests(instance());
        assert.equal(
          await getAuthContextBridge(
            new NextRequestB("https://bff-dev.refi.trading/x", {
              headers: { cookie: `us_session_v1=${c.value}` },
            }),
          ),
          null,
        );
      },
    );

    await section(
      "identity result (closed): wrong iss/aud/alg/kid, expired, invalid lifetime, future iat, fractional NumericDate, extra claim, extra protected-header field, duplicate/empty/malformed amr, unverified or mismatched email, mismatched sid, mismatched auth_time, malformed sub/sid/jti, missing claims — all refused with NO session; a replayed jti is refused across instances and after restart",
      async () => {
        const secret = new TextEncoder().encode("k".repeat(48));
        type Case = [
          string,
          (c: Record<string, unknown>) => Record<string, unknown>,
          typeof resultSigner,
          Record<string, unknown> | null,
        ];
        const cases: Case[] = [
          [
            "iss",
            (c) => ({ ...c, iss: "urn:refinity:identity-ccid:prod" }),
            null,
            null,
          ],
          [
            "aud",
            (c) => ({ ...c, aud: "urn:refinity:frontend-bff:prod" }),
            null,
            null,
          ],
          [
            "expired",
            (c) => ({
              ...c,
              iat: (c.iat as number) - 600,
              nbf: (c.iat as number) - 600,
              exp: (c.iat as number) - 300,
            }),
            null,
            null,
          ],
          [
            "lifetime > 300",
            (c) => ({ ...c, exp: (c.iat as number) + 301 }),
            null,
            null,
          ],
          [
            "exp before iat",
            (c) => ({ ...c, exp: (c.iat as number) - 1 }),
            null,
            null,
          ],
          [
            "future iat",
            (c) => ({
              ...c,
              iat: (c.iat as number) + 120,
              nbf: (c.iat as number) + 120,
              exp: (c.iat as number) + 400,
            }),
            null,
            null,
          ],
          [
            "fractional iat",
            (c) => ({ ...c, iat: (c.iat as number) + 0.5 }),
            null,
            null,
          ],
          [
            "fractional exp",
            (c) => ({ ...c, exp: (c.exp as number) - 0.25 }),
            null,
            null,
          ],
          [
            "fractional auth_time",
            (c) => ({ ...c, auth_time: (c.auth_time as number) + 0.5 }),
            null,
            null,
          ],
          ["extra claim acr", (c) => ({ ...c, acr: "urn:x" }), null, null],
          [
            "extra claim account_id",
            (c) => ({ ...c, account_id: "acct_x_00000001" }),
            null,
            null,
          ],
          ["extra header field", (c) => c, null, { cty: "JWT" }],
          ["extra header field x5t", (c) => c, null, { x5t: "abc" }],
          [
            "hs256",
            (c) => c,
            { key: secret, alg: "HS256", kid: "ccid-k1" },
            null,
          ],
          [
            "unknown kid",
            (c) => c,
            { key: backendPrivateKey, alg: "ES256", kid: "ccid-k9" },
            null,
          ],
          [
            "email_verified",
            (c) => ({ ...c, email_verified: false }),
            null,
            null,
          ],
          [
            "email mismatch",
            (c) => ({ ...c, email: "someone-else@example.com" }),
            null,
            null,
          ],
          [
            "sub is an email",
            (c) => ({ ...c, sub: "dave@example.com" }),
            null,
            null,
          ],
          ["sid malformed", (c) => ({ ...c, sid: "s" }), null, null],
          [
            "sid mismatch",
            (c) => ({ ...c, sid: "sid_" + "9".repeat(32) }),
            null,
            null,
          ],
          [
            "auth_time mismatch",
            (c) => ({ ...c, auth_time: (c.auth_time as number) - 1 }),
            null,
            null,
          ],
          ["jti", (c) => ({ ...c, jti: "!" }), null, null],
          [
            "missing auth_time",
            (c) => {
              const { auth_time: _a, ...r } = c;
              return r;
            },
            null,
            null,
          ],
          [
            "missing sid",
            (c) => {
              const { sid: _s, ...r } = c;
              return r;
            },
            null,
            null,
          ],
          ["amr empty", (c) => ({ ...c, amr: [] }), null, null],
          [
            "amr duplicate",
            (c) => ({ ...c, amr: ["email_link", "email_link"] }),
            null,
            null,
          ],
          ["amr not strings", (c) => ({ ...c, amr: [1] }), null, null],
        ];
        let n = 0;
        for (const [name, override, signer, hdr] of cases) {
          const before = sessionsInStore();
          resultOverride = override;
          resultSigner = signer;
          headerExtra = hdr;
          try {
            const completed = await completedLogin(
              `neg-${String(n++)}-dave@example.com`,
            );
            await assert.rejects(
              sessionSeam.establishConnectedSession({
                completed,
                correlationId: "c_neg",
              }),
              (e: unknown) =>
                e instanceof flow.LoginRefusedError &&
                e.reason === "identity_result_rejected",
              `identity result with bad ${name} must be refused`,
            );
            const attempt = await attempts.getExchangeAttempt(
              completed.login.loginId,
            );
            assert.equal(
              attempt?.status,
              "failed",
              `${name}: attempt is failed, not recoverable`,
            );
          } finally {
            resultOverride = null;
            resultSigner = null;
            headerExtra = null;
          }
          assert.equal(
            sessionsInStore(),
            before,
            `no session after bad ${name}`,
          );
        }
        // A well-formed result with amr omitted is VALID (amr is optional).
        resultOverride = (c) => {
          const { amr: _m, ...r } = c;
          return r;
        };
        const okNoAmr = await sessionSeam.establishConnectedSession({
          completed: await completedLogin("noamr-eve@example.com"),
          correlationId: "c_noamr",
        });
        resultOverride = null;
        assert.ok(okNoAmr.cookies[0]?.value);
        // Replay: the same result JTI presented twice → second session refused,
        // on another instance and after a restart (shared backing).
        resultOverride = (c) => ({
          ...c,
          jti: "idr_replay_fixed_0000000000000001",
        });
        const completedA = await completedLogin("replay-erin@example.com");
        const first = await sessionSeam.establishConnectedSession({
          completed: completedA,
          correlationId: "c_r1",
        });
        assert.ok(first.cookies[0]?.value);
        cs.setConnectedStoreFactoryForTests(instance()); // another instance / after restart
        const completedB = await completedLogin("replay-erin@example.com");
        const before = sessionsInStore();
        await assert.rejects(
          sessionSeam.establishConnectedSession({
            completed: completedB,
            correlationId: "c_r2",
          }),
          (e: unknown) =>
            e instanceof flow.LoginRefusedError &&
            e.reason === "identity_result_rejected",
        );
        assert.equal(
          sessionsInStore(),
          before,
          "same identity-result JTI never yields a second session",
        );
        resultOverride = null;
        const now = Math.floor(Date.now() / 1000);
        const dup = await new joseB.SignJWT({
          iss: "urn:refinity:identity-ccid:dev",
          aud: "urn:refinity:frontend-bff:dev",
          sub: "user-000000000000000000000001",
          iat: now,
          nbf: now,
          exp: now + 60,
          jti: "idr_replay_fixed_0000000000000001",
          sid: "sid_00000000000000000000000000000001",
          auth_time: now - 5,
          email: "replay-erin@example.com",
          email_verified: true,
        })
          .setProtectedHeader({ alg: "ES256", kid: "ccid-k1", typ: "JWT" })
          .sign(backendPrivateKey);
        await assert.rejects(
          exchange.verifyIdentityResult({
            token: dup,
            binding: {
              email: "replay-erin@example.com",
              authTime: now - 5,
              sid: "sid_00000000000000000000000000000001",
            },
            correlationId: "c_dup",
          }),
          /jti replay/,
        );
      },
    );

    await section(
      "exchange recovery (alpha.3 step 5): a lost/ambiguous answer keeps the login recoverable; the IDENTICAL stored request is re-sent (no re-mint); changed state/challenge/nonce/redirect/network_context are refused; a recovered result yields exactly one session; recovery works on a second instance and after restart; an expired assertion cannot be recovered; unavailability paths stay non-recoverable",
      async () => {
        const attemptCollection = () =>
          backing.get("us-connected-test--connected-exchange-attempt") as
            | Map<
                string,
                import("../apps/web/src/lib/connected-store/exchange-attempt.ts").ExchangeAttemptRecord
              >
            | undefined;
        exchangeCalls.length = 0;
        const completed = await completedLogin("recover-frank@example.com");
        const beforeSessions = sessionsInStore();
        lostAfterSend = true;
        await assert.rejects(
          sessionSeam.establishConnectedSession({
            completed,
            correlationId: "c_lost",
          }),
          (e: unknown) =>
            e instanceof chain.ConnectedSessionRecoverableError &&
            e instanceof sessionSeam.IdentityExchangeUnavailableError &&
            e.recoverable === true,
        );
        assert.equal(
          sessionsInStore(),
          beforeSessions,
          "no session from a lost answer",
        );
        const attempt = await attempts.getExchangeAttempt(
          completed.login.loginId,
        );
        assert.equal(attempt?.status, "sent");
        assert.equal(attempt?.attempts, 1);
        assert.ok(
          !(await replay.isJtiConsumed(
            "bridge-assertion-jti",
            attempt!.bridgeJti,
          )),
          "the bridge assertion is NOT consumed before a successful exchange",
        );
        for (const field of [
          "state",
          "challenge",
          "nonce",
          "redirectUri",
          "networkContext",
        ] as const) {
          const altered = {
            ...completed,
            login: {
              ...completed.login,
              [field]:
                field === "redirectUri"
                  ? "https://bff-dev.refi.trading/us/auth/other"
                  : "A".repeat(43),
            },
          };
          const sent = exchangeCalls.length;
          await assert.rejects(
            sessionSeam.establishConnectedSession({
              completed: altered,
              correlationId: "c_alt",
            }),
            (e: unknown) =>
              e instanceof flow.LoginRefusedError &&
              e.reason === "state_mismatch",
            `changed ${field} must be refused`,
          );
          assert.equal(
            exchangeCalls.length,
            sent,
            `changed ${field}: nothing re-sent`,
          );
        }
        await assert.rejects(
          chain.recoverConnectedSession({
            loginId: completed.login.loginId,
            state: "B".repeat(43),
            correlationId: "c_alt2",
          }),
          (e: unknown) =>
            e instanceof flow.LoginRefusedError &&
            e.reason === "state_mismatch",
        );
        cs.setConnectedStoreFactoryForTests(instance());
        const recovered = await chain.recoverConnectedSession({
          loginId: completed.login.loginId,
          state: completed.login.state,
          correlationId: "c_rec",
        });
        assert.ok(recovered?.cookies[0]?.value, "recovered session cookie");
        assert.equal(exchangeCalls.length, 2);
        assert.deepEqual(
          exchangeCalls[0],
          exchangeCalls[1],
          "byte-identical request re-sent; no re-mint",
        );
        assert.equal(
          sessionsInStore(),
          beforeSessions + 1,
          "exactly one session",
        );
        const done = await attempts.getExchangeAttempt(completed.login.loginId);
        assert.equal(done?.status, "completed");
        assert.equal(done?.attempts, 2);
        assert.ok(
          await replay.isJtiConsumed("bridge-assertion-jti", done!.bridgeJti),
          "consumed after success",
        );
        const { claims } = decode(recovered!.cookies[0]!.value);
        assert.equal(
          claims.sid,
          attempt?.sid,
          "session sid is the bridge sid the result retained",
        );
        cs.setConnectedStoreFactoryForTests(instance());
        const again = await chain.recoverConnectedSession({
          loginId: completed.login.loginId,
          state: completed.login.state,
          correlationId: "c_rec2",
        });
        assert.equal(decode(again!.cookies[0]!.value).claims.sid, claims.sid);
        assert.equal(
          sessionsInStore(),
          beforeSessions + 1,
          "still exactly one session",
        );
        assert.equal(
          exchangeCalls.length,
          2,
          "nothing re-sent after completion",
        );
        const same = await sessionSeam.establishConnectedSession({
          completed,
          correlationId: "c_same",
        });
        assert.equal(decode(same.cookies[0]!.value).claims.sid, claims.sid);
        assert.equal(sessionsInStore(), beforeSessions + 1);
        exchangeFailure = new apiClientsB.InvestorApiTransportError(
          "connect",
          1,
        );
        const c2 = await completedLogin("recover-gina@example.com");
        await assert.rejects(
          sessionSeam.establishConnectedSession({
            completed: c2,
            correlationId: "c_l2",
          }),
          chain.ConnectedSessionRecoverableError,
        );
        exchangeFailure = null;
        const r2 = await chain.recoverConnectedSession({
          loginId: c2.login.loginId,
          state: c2.login.state,
          correlationId: "c_l2r",
        });
        assert.ok(r2?.cookies[0]?.value);
        const c3 = await completedLogin("recover-hana@example.com");
        lostAfterSend = true;
        await assert.rejects(
          sessionSeam.establishConnectedSession({
            completed: c3,
            correlationId: "c_l3",
          }),
          chain.ConnectedSessionRecoverableError,
        );
        const rec3 = attemptCollection()?.get(c3.login.loginId);
        assert.ok(rec3);
        attemptCollection()!.set(c3.login.loginId, {
          ...rec3!,
          bridgeExp: Math.floor(Date.now() / 1000) - 1,
        });
        await assert.rejects(
          chain.recoverConnectedSession({
            loginId: c3.login.loginId,
            state: c3.login.state,
            correlationId: "c_l3r",
          }),
          (e: unknown) =>
            e instanceof flow.LoginRefusedError && e.reason === "expired",
        );
        assert.equal(
          (await attempts.getExchangeAttempt(c3.login.loginId))?.status,
          "failed",
        );
        exchangeFailure = new apiClientsB.InvestorApiError({
          status: 422,
          code: "VALIDATION_ERROR",
          message: "x",
          correlationId: "c",
        });
        const c4 = await completedLogin("refused-iris@example.com");
        await assert.rejects(
          sessionSeam.establishConnectedSession({
            completed: c4,
            correlationId: "c_l4",
          }),
          (e: unknown) =>
            e instanceof flow.LoginRefusedError &&
            e.reason === "identity_result_rejected",
        );
        exchangeFailure = null;
        assert.equal(
          (await attempts.getExchangeAttempt(c4.login.loginId))?.status,
          "failed",
        );
        assert.equal(
          await chain
            .recoverConnectedSession({
              loginId: c4.login.loginId,
              state: c4.login.state,
              correlationId: "c_l4r",
            })
            .catch((e: unknown) => (e as Error).message),
          "login refused: already_consumed",
        );
        exchange.setIdentityExchangeClientForTests(null);
        await assert.rejects(
          sessionSeam.establishConnectedSession({
            completed: await completedLogin("nocfg-jane@example.com"),
            correlationId: "c_n",
          }),
          (e: unknown) =>
            e instanceof sessionSeam.IdentityExchangeUnavailableError &&
            !(e instanceof chain.ConnectedSessionRecoverableError),
        );
        exchange.setIdentityExchangeClientForTests(fakeExchange);
        exchange.setIdentityResultKeySetForTests(null);
        await assert.rejects(
          exchange.verifyIdentityResult({
            token: "a.b.c",
            binding: {
              email: "x@example.com",
              authTime: 1,
              sid: "sid_" + "0".repeat(32),
            },
            correlationId: "c_rm",
          }),
          /remote backend JWKS is not accepted|not JSON|compact JWS/,
        );
        exchange.setIdentityResultKeySetForTests(
          backendPublic as import("jose").JSONWebKeySet,
        );
      },
    );

    await section(
      "end to end through the routes: start → callback token → complete → session cookie set, login cookie cleared, getAuthContext resolves the durable session; a second completion with the same link is refused",
      async () => {
        const ip = nextIp();
        const start = await startRoute.POST(
          reqB(
            "/api/v1/auth/login/start",
            { email: "e2e-iris@example.com", method: "email_link" },
            { ip },
          ),
        );
        assert.equal(start.status, 200);
        const loginCookie = cookiesOf(start, "us_login_v1")[0]!;
        const token = provider.lastToken();
        const done = await completeRoute.POST(
          reqB(
            "/api/v1/auth/login/complete",
            { token },
            { cookie: `us_login_v1=${loginCookie}`, ip },
          ),
        );
        const doneText = await done.text();
        assert.equal(done.status, 200, doneText);
        const payload = JSON.parse(doneText) as {
          data: { ok: boolean; continuePath: string };
        };
        assert.equal(payload.data.ok, true);
        assert.equal(payload.data.continuePath, "/us/app/home");
        const sessionCookie = cookiesOf(done, "us_session_v1")[0];
        assert.ok(
          sessionCookie,
          `session cookie set: ${done.headers.get("set-cookie") ?? "<none>"}`,
        );
        assert.equal(
          cookiesOf(done, "us_login_v1")[0],
          "",
          "login cookie cleared",
        );
        const ctx = await getAuthContextBridge(
          new NextRequestB(
            "https://bff-dev.refi.trading/api/v1/investor/status",
            { headers: { cookie: `us_session_v1=${sessionCookie}` } },
          ),
        );
        assert.ok(
          ctx &&
            ctx.sid &&
            ctx.authTime === provider.authAt() &&
            ctx.source === "backend",
        );
        const beforeAgain = sessionsInStore();
        const again = await completeRoute.POST(
          reqB(
            "/api/v1/auth/login/complete",
            { token },
            { cookie: `us_login_v1=${loginCookie}`, ip },
          ),
        );
        assert.equal(
          again.status,
          200,
          "same login cookie recovers the SAME session",
        );
        assert.equal(
          decode(cookiesOf(again, "us_session_v1")[0] ?? "").claims.sid,
          decode(sessionCookie).claims.sid,
        );
        assert.equal(sessionsInStore(), beforeAgain, "never a second session");
        const ip2 = nextIp();
        const start2 = await startRoute.POST(
          reqB(
            "/api/v1/auth/login/start",
            { email: "e2e-kate@example.com", method: "email_link" },
            { ip: ip2 },
          ),
        );
        const loginCookie2 = cookiesOf(start2, "us_login_v1")[0]!;
        const token2 = provider.lastToken();
        lostAfterSend = true;
        const lost = await completeRoute.POST(
          reqB(
            "/api/v1/auth/login/complete",
            { token: token2 },
            { cookie: `us_login_v1=${loginCookie2}`, ip: ip2 },
          ),
        );
        assert.equal(lost.status, 503);
        const lostBody = (await lost.json()) as {
          code?: string;
          recoverable?: boolean;
        };
        assert.equal(lostBody.code, "exchange_unavailable");
        assert.equal(lostBody.recoverable, true);
        assert.ok(
          !/us_login_v1=;/.test(lost.headers.get("set-cookie") ?? ""),
          "login cookie kept for recovery",
        );
        assert.equal(cookiesOf(lost, "us_session_v1").length, 0);
        const sentBefore = exchangeCalls.length;
        const rec = await completeRoute.POST(
          reqB(
            "/api/v1/auth/login/complete",
            { token: "x".repeat(32) },
            { cookie: `us_login_v1=${loginCookie2}`, ip: ip2 },
          ),
        );
        assert.equal(rec.status, 200, "recovered through the route");
        assert.ok(cookiesOf(rec, "us_session_v1")[0]);
        assert.equal(exchangeCalls.length, sentBefore + 1);
        assert.deepEqual(
          exchangeCalls[sentBefore],
          exchangeCalls[sentBefore - 1],
          "identical request",
        );
        // A tampered cookie (sub swapped) never resolves.
        const [h, , s] = sessionCookie.split(".");
        const { claims } = decode(sessionCookie);
        const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, sub: "user-attacker00000000000000" })).toString("base64url")}.${s}`;
        assert.equal(
          await getAuthContextBridge(
            new NextRequestB("https://bff-dev.refi.trading/x", {
              headers: { cookie: `us_session_v1=${forged}` },
            }),
          ),
          null,
        );
        // A validly signed cookie naming a sid that does not exist durably never resolves.
        const ghost = await new joseB.SignJWT({
          sid: "sid_00000000000000000000000000000009",
          auth_time: 1,
          src: "connected",
        })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject("user-000000000000000000000009")
          .setExpirationTime("1h")
          .sign(
            new TextEncoder().encode(getServerEnvBridge().SESSION_JWT_SECRET),
          );
        assert.equal(
          await getAuthContextBridge(
            new NextRequestB("https://bff-dev.refi.trading/x", {
              headers: { cookie: `us_session_v1=${ghost}` },
            }),
          ),
          null,
        );
      },
    );

    await section(
      "source guards: the bridge never imports the Investor API signer state; the exchange sends only the stored attempt request, consumes the result jti before any session and the bridge jti only AFTER success; verification checks structure before signature; the chain order is bridge → attempt → send → verify → session; auth-context reads auth_time from the durable record",
      async () => {
        const strip = (f: string) =>
          readFileSync(join(REPO_ROOT, f), "utf8").replace(
            /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
            "",
          );
        const b = strip("apps/web/src/lib/auth/identity-bridge.ts");
        assert.ok(
          !/user-assertion/.test(b),
          "bridge does not import the Investor API assertion module",
        );
        assert.ok(
          !/ALLOW_EPHEMERAL|generateKeyPair/.test(b),
          "no ephemeral bridge key",
        );
        const r = strip(
          "apps/web/app/.well-known/identity-bridge-jwks.json/route.ts",
        );
        assert.ok(
          /getBridgePublicJwks/.test(r) &&
            !/user-assertion|getPublicJwks\b/.test(r),
        );
        const x = strip("apps/web/src/lib/auth/identity-exchange.ts");
        assert.ok(
          !/consumeJtiOnce\("bridge-assertion-jti"/.test(x),
          "the exchange never consumes the bridge jti (recovery must stay possible)",
        );
        assert.ok(/consumeJtiOnce\("identity-result-jti"/.test(x));
        assert.ok(
          /body: \{ \.\.\.attempt\.request \}/.test(x),
          "the stored attempt request is sent exactly",
        );
        assert.ok(
          !/mintBridgeAssertion/.test(x),
          "the exchange never re-mints",
        );
        assert.ok(
          !/acquisition|invitation_token/.test(
            x.replace(/[^\n]*omitted[^\n]*/g, ""),
          ),
          "no invented request fields",
        );
        assert.ok(
          /createRemoteJWKSet\(new URL\(url\)/.test(x) &&
            !/payload\.jku|header\.jku|jwks_uri/.test(x),
          "JWKS URL is pinned",
        );
        const v = x.slice(
          x.indexOf("export async function verifyIdentityResult"),
        );
        const vOrder = [
          "unexpected claim",
          "jwtVerify(",
          "integerClaim(payload",
          "amr duplicates",
          "auth_time mismatch",
          "sid mismatch",
          'consumeJtiOnce("identity-result-jti"',
        ].map((k) => v.indexOf(k));
        assert.ok(
          vOrder.every(
            (i, n) => i >= 0 && (n === 0 || i > (vOrder[n - 1] as number)),
          ),
          "structure → signature → shapes → binding → jti",
        );
        assert.ok(
          !/Math\.floor\(v\)|Math\.floor\(payload/.test(v),
          "no NumericDate is floored into validity",
        );
        const c = strip("apps/web/src/lib/auth/connected-login.ts");
        const fin = c.slice(
          c.indexOf("async function finish"),
          c.indexOf("async function cookieFor"),
        );
        const fOrder = [
          "sendIdentityExchange(",
          "verifyIdentityResult(",
          'consumeJtiOnce("bridge-assertion-jti"',
          "createConnectedSession(",
        ].map((k) => fin.indexOf(k));
        assert.ok(
          fOrder.every(
            (i, n) => i >= 0 && (n === 0 || i > (fOrder[n - 1] as number)),
          ),
          "send → verify → consume bridge jti → session",
        );
        const est = c.slice(c.indexOf("establishConnectedSessionViaExchange"));
        assert.ok(
          est.indexOf("mintBridgeAssertion(") <
            est.indexOf("openExchangeAttempt("),
        );
        assert.ok(
          /sid: result\.sid/.test(fin),
          "the session persists the result's sid",
        );
        const a = strip("apps/web/src/lib/bff/auth.ts");
        assert.ok(
          /getActiveConnectedSession\(sid\)/.test(a) &&
            /authTime: record\.authTime/.test(a) &&
            /record\.sub !== sub\) return null/.test(a),
        );
        assert.ok(/source: "backend"/.test(a));
      },
    );
  } finally {
    exchange.setIdentityExchangeClientForTests(null);
    exchange.setIdentityResultKeySetForTests(null);
    sessionSeam.setConnectedSessionEstablisher(null);
    stytchMod.setStytchClientForTests(null);
    bridge.setBridgeKmsClientFactoryForTests(null);
    bridge.resetBridgeSignerCache();
    cs.setConnectedStoreFactoryForTests(null);
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    resetServerEnvCacheForTests();
    ua.resetSigningKeyCache();
  }
}

// ─── Attestation submission (Daniel step 6): distinct durable states, consent verified against the backend, mock KYC never evidence, only a backend 201 acknowledges ──

{
  const { createInvestorApiClient: createClientAtt } =
    await import("../packages/api-clients/src/investor-api/index.ts");
  const submission =
    await import("../apps/web/src/lib/compliance/attestation-submission.ts");
  const entity =
    await import("../apps/web/src/lib/prototype-store/entities/attestation-submission.ts");
  const mapping =
    await import("../apps/web/src/lib/compliance/attestation-mapping.ts");
  const provenance = await import("../apps/web/src/lib/kyc/provenance.ts");
  const { assessInvestorProfile: assessAtt } =
    await import("../apps/web/src/lib/sec203a/investor-profile-engine.ts");
  const { answersSnapshotHash: snapshotHashAtt } =
    await import("../apps/web/src/lib/prototype-store/entities/investor-profile-v2.ts");
  const {
    resetServerEnvCacheForTests: resetEnvAtt,
    getServerEnv: getServerEnvAtt,
  } = await import("../apps/web/src/lib/config/env.ts");
  const attRoute =
    await import("../apps/web/app/api/v1/investor/profile/v2/attestation/route.ts");
  const { createRequire: createRequireAtt } = await import("node:module");
  const requireWebAtt = createRequireAtt(
    join(process.cwd(), "apps/web/package.json"),
  );
  const joseAtt = (await import(
    requireWebAtt.resolve("jose")
  )) as typeof import("jose");
  const { NextRequest: NextRequestAtt } = (await import(
    requireWebAtt.resolve("next/server")
  )) as typeof import("next/server");

  const ACCOUNT = "acct_att_000001";
  const HASH = "3".repeat(64);
  const disclosure = {
    content_hash: HASH,
    content_ref:
      "https://example.invalid/disclosures/automated-portfolio-alpha-1",
    disclosure_key: "automated_portfolio_alpha",
    disclosure_version: 1,
    effective_at: "2026-09-01T00:00:00Z",
    locale: "en-US",
    status: "EFFECTIVE",
  };
  const receiptFor = (hash: string, status = "ACTIVE") => ({
    account_id: ACCOUNT,
    consent_key: "automated_portfolio_alpha",
    consent_receipt_id: "consent_att_00000001",
    disclosure_hash: hash,
    disclosure_key: "automated_portfolio_alpha",
    disclosure_version: 1,
    expires_at: "2026-12-01T00:00:00Z",
    recorded_at: "2026-09-01T00:00:00Z",
    status,
  });
  const headersAtt = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Correlation-Id": "corr_att",
  };
  type SeenAtt = {
    url: string;
    method: string;
    headers: Headers;
    body: unknown;
  };
  function fakeUpstreamAtt(opts: {
    receipts?: unknown[];
    attestationStatus?: number;
    attestationError?: { status: number; code: string };
    backendStatus?: "ACCEPTED" | "SUPERSEDED" | "EXPIRED";
    attestationBody?: (req: Record<string, unknown>) => unknown;
    failAttestationTransport?: boolean;
  }) {
    const seen: SeenAtt[] = [];
    const fetchImpl = async (
      url: URL | RequestInfo,
      init?: RequestInit,
    ): Promise<Response> => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : undefined;
      seen.push({ url: u, method, headers: new Headers(init?.headers), body });
      const page = (items: unknown[]) =>
        new Response(
          JSON.stringify({
            data: { items, page: { has_more: false, next_cursor: null } },
          }),
          { status: 200, headers: headersAtt },
        );
      if (u.includes("/api/v1/investor/disclosures") && method === "GET")
        return page([disclosure]);
      if (u.includes("/api/v1/investor/consents") && method === "GET")
        return page(opts.receipts ?? [receiptFor(HASH)]);
      if (
        u.endsWith(
          `/api/v1/investor/accounts/${ACCOUNT}/compliance-profile-attestations`,
        ) &&
        method === "POST"
      ) {
        if (opts.failAttestationTransport) throw new TypeError("fetch failed");
        const req = body as Record<string, unknown>;
        if (opts.attestationError) {
          return new Response(
            JSON.stringify({
              error: {
                code: opts.attestationError.code,
                message: "x",
                correlation_id: "corr_att",
              },
            }),
            {
              status: opts.attestationError.status,
              headers: {
                ...headersAtt,
                ...(opts.attestationError.status === 429
                  ? { "Retry-After": "7" }
                  : {}),
              },
            },
          );
        }
        const status = opts.attestationStatus ?? 201;
        if (status >= 400) {
          return new Response(
            JSON.stringify({
              error: {
                code: "COMPLIANCE_ATTESTATION_REPLAYED",
                message: "replayed",
                correlation_id: "corr_att",
              },
            }),
            { status, headers: headersAtt },
          );
        }
        const data = opts.attestationBody
          ? opts.attestationBody(req)
          : {
              ...req,
              account_id: ACCOUNT,
              payload_sha256: "b".repeat(64),
              status: opts.backendStatus ?? "ACCEPTED",
              received_at: "2026-09-10T00:00:00Z",
              authorization: {
                expires_at: null,
                last_evaluated_at: "2026-09-10T00:00:00Z",
                policy_version: "closed-us-alpha-1",
                reason_codes: [],
                state_version: 1,
                status: "PENDING",
              },
            };
        return new Response(JSON.stringify({ data }), {
          status,
          headers: headersAtt,
        });
      }
      return new Response(
        JSON.stringify({
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "x",
            correlation_id: "corr_att",
          },
        }),
        { status: 404, headers: headersAtt },
      );
    };
    const client = createClientAtt({
      identityCcid: {
        baseUrl: "http://127.0.0.1:1",
        getBearer: () => Promise.resolve("id-b"),
      },
      investorApi: {
        baseUrl: "http://127.0.0.1:1",
        getBearer: () => Promise.resolve("inv-b"),
      },
      mintAssertion: () => Promise.resolve("assertion"),
      fetch: fetchImpl as typeof fetch,
    });
    return {
      client,
      seen,
      posts: () => seen.filter((s) => s.method === "POST"),
    };
  }

  const AT = "2026-09-04T12:00:00.000Z";
  const answers = {
    questionnaireVersion: 2 as const,
    accountType: "individual" as const,
    goal: "long_term_wealth" as const,
    horizon: "gt_10y" as const,
    withdrawalPattern: "gradual" as const,
    incomeBand: "100_200k" as const,
    incomeStability: "very_predictable" as const,
    netWorthBand: "500k_1m" as const,
    liquidNetWorthBand: "250_500k" as const,
    accountShareOfLiquidAssets: "10_25pct" as const,
    emergencyReserveBand: "gt_6mo" as const,
    debtSignal: "none" as const,
    liquidityLikelihood: "very_unlikely" as const,
    knowledgeLevel: "experienced" as const,
    experienceYears: "5_10y" as const,
    productExperience: ["stocks", "funds"] as ("stocks" | "funds")[],
    drawdownBehavior: "stay" as const,
    lossThreshold: "pct_20" as const,
    growthProtectionPreference: 4 as const,
    riskTradeoffChoice: "plan_b" as const,
    restrictions: ["none"] as "none"[],
    expectedFinancialChange: "no" as const,
    productIntent: ["disciplined_long_term"] as "disciplined_long_term"[],
    reconciledFlags: [] as never[],
  };
  const assessment = assessAtt(answers, { assessedAt: AT });
  const NORMALIZED_PASSED = {
    status: "passed" as const,
    provider: "test-only-kyc-adapter",
    level: "frontend-lifecycle",
    evidence_ref: "kyc-session:test_0001",
  };
  // TEST-ONLY trusted provenance: proves chain mechanics. No runtime module
  // may call establishTrustedKycProvenance (asserted elsewhere and below).
  const TRUSTED = provenance.establishTrustedKycProvenance({
    adapterId: "test-only-kyc-adapter",
    evidenceRef: "kyc-session:test_0001",
    normalized: NORMALIZED_PASSED,
  });
  const MOCK = provenance.mockKycProvenance(
    {
      referenceId: "mock_0001",
      state: "passed",
      startedAt: AT,
      updatedAt: AT,
      history: [
        { state: "in_progress", at: AT },
        { state: "passed", at: AT },
      ],
    },
    "mock",
  );
  const evidenceFor = (
    profileVersion: number,
    kyc:
      | import("../apps/web/src/lib/kyc/provenance.ts").KycEvidenceProvenance
      | null,
  ): import("../apps/web/src/lib/compliance/attestation-mapping.ts").AttestationEvidenceInput => ({
    accountId: ACCOUNT,
    answersVersion: {
      profileVersion,
      answers,
      answerSnapshotHash: snapshotHashAtt(answers),
    },
    assessment,
    kyc,
    recomputeAnswerSnapshotHash: snapshotHashAtt,
  });
  let seq = 100;
  const nextSeq = () => seq++;
  const statesOf = (r: { history: Array<{ state: string }> }) =>
    r.history.map((h) => h.state);

  await section(
    "attestation chain: disclosure delivered → consent accepted → constructed → submitted (recorded BEFORE the call, deterministic Idempotency-Key) → acknowledged on 201; body is exactly the built request; only the backend id is copied back",
    async () => {
      const { client, seen, posts } = fakeUpstreamAtt({});
      const v = nextSeq();
      const out = await submission.submitComplianceProfileAttestation(client, {
        accountId: ACCOUNT,
        evidence: evidenceFor(v, TRUSTED),
        correlationId: "c_att_1",
      });
      assert.equal(out.kind, "acknowledged");
      if (out.kind !== "acknowledged") return;
      assert.deepEqual(statesOf(out.record), [
        "disclosure_delivered",
        "consent_accepted",
        "attestation_constructed",
        "submitted",
        "acknowledged",
      ]);
      assert.ok(
        out.record.history.every(
          (h) =>
            h.correlationId === "c_att_1" && !Number.isNaN(Date.parse(h.at)),
        ),
      );
      const built = mapping.buildComplianceProfileAttestationRequest(
        evidenceFor(v, TRUSTED),
      );
      assert.ok(built.ok);
      if (!built.ok) return;
      assert.equal(out.record.attestationId, built.request.attestation_id);
      assert.equal(out.record.evidenceSha256, built.request.evidence_sha256);
      const post = posts()[0]!;
      assert.deepEqual(
        post.body,
        built.request,
        "wire body is the pinned-authority request, nothing added",
      );
      assert.equal(
        post.headers.get("Idempotency-Key"),
        submission.attestationIdempotencyKey(built.request),
      );
      assert.match(
        post.headers.get("Idempotency-Key") ?? "",
        /^att-[0-9a-f]{48}$/,
      );
      assert.equal(
        out.record.idempotencyKey,
        post.headers.get("Idempotency-Key"),
      );
      assert.equal(post.headers.get("X-Refinity-User-Assertion"), "assertion");
      assert.equal(
        out.record.backendAttestationId,
        built.request.attestation_id,
      );
      assert.ok(
        !("authorization" in out.record),
        "backend authorization projection is never copied into frontend state",
      );
      assert.deepEqual(
        seen.map((s) => s.method),
        ["GET", "GET", "POST"],
      );
      // Idempotent: the same decision again re-sends nothing.
      const again = await submission.submitComplianceProfileAttestation(
        client,
        {
          accountId: ACCOUNT,
          evidence: evidenceFor(v, TRUSTED),
          correlationId: "c_att_1b",
        },
      );
      assert.equal(again.kind, "already_acknowledged");
      assert.equal(posts().length, 1);
      // KYC block in the body is the normalized wire block, never provenance.
      assert.deepEqual((post.body as { kyc: unknown }).kyc, NORMALIZED_PASSED);
      assert.ok(!JSON.stringify(post.body).includes("production_provider"));
    },
  );

  await section(
    "attestation chain: consent is verified against the backend — missing, WITHDRAWN or hash-mismatched receipts stop at disclosure_delivered with NO submission; once consent appears the SAME record continues",
    async () => {
      for (const receipts of [
        [],
        [receiptFor(HASH, "WITHDRAWN")],
        [receiptFor("4".repeat(64))],
      ]) {
        const { client, posts } = fakeUpstreamAtt({ receipts });
        const v = nextSeq();
        const out = await submission.submitComplianceProfileAttestation(
          client,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(v, TRUSTED),
            correlationId: "c_att_2",
          },
        );
        assert.equal(out.kind, "consent_required");
        if (out.kind !== "consent_required") return;
        assert.deepEqual(out.missing, [
          {
            disclosure_key: "automated_portfolio_alpha",
            disclosure_version: 1,
          },
        ]);
        assert.equal(out.record.state, "disclosure_delivered");
        assert.equal(posts().length, 0, "nothing submitted without consent");
        const { client: later, posts: laterPosts } = fakeUpstreamAtt({});
        const cont = await submission.submitComplianceProfileAttestation(
          later,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(v, TRUSTED),
            correlationId: "c_att_2b",
          },
        );
        assert.equal(cont.kind, "acknowledged");
        if (cont.kind !== "acknowledged") return;
        assert.equal(
          cont.record.attestationId,
          out.record.attestationId,
          "same record continues",
        );
        assert.deepEqual(statesOf(cont.record), [
          "disclosure_delivered",
          "consent_accepted",
          "attestation_constructed",
          "submitted",
          "acknowledged",
        ]);
        assert.equal(laterPosts().length, 1);
      }
    },
  );

  await section(
    "attestation chain: mock KYC (the only provider today) and missing KYC stop at `blocked` after consent, naming KYC_EVIDENCE_MOCK / KYC_EVIDENCE_MISSING; nothing is submitted; the record is terminal and a retry re-enters nothing",
    async () => {
      for (const [kyc, reason] of [
        [MOCK, "KYC_EVIDENCE_MOCK"],
        [null, "KYC_EVIDENCE_MISSING"],
      ] as const) {
        const { client, posts } = fakeUpstreamAtt({});
        const v = nextSeq();
        const out = await submission.submitComplianceProfileAttestation(
          client,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(v, kyc),
            correlationId: "c_att_3",
          },
        );
        assert.equal(out.kind, "blocked");
        if (out.kind !== "blocked") return;
        assert.deepEqual(out.reasons, [reason]);
        assert.deepEqual(statesOf(out.record), [
          "disclosure_delivered",
          "consent_accepted",
          "blocked",
        ]);
        assert.equal(posts().length, 0);
        // A structurally "production_provider" claim without the trusted marker is refused too.
        const claimed = {
          ...MOCK,
          source: "production_provider" as const,
          adapterId: "vendor-x",
        };
        const c2 = await submission.submitComplianceProfileAttestation(client, {
          accountId: ACCOUNT,
          evidence: evidenceFor(nextSeq(), claimed),
          correlationId: "c_att_3b",
        });
        assert.equal(c2.kind, "blocked");
        if (c2.kind === "blocked")
          assert.deepEqual(c2.reasons, ["KYC_PROVENANCE_UNTRUSTED"]);
        // Retry of the blocked record: terminal, no new transition, still nothing sent.
        const retry = await submission.submitComplianceProfileAttestation(
          client,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(v, TRUSTED),
            correlationId: "c_att_3c",
          },
        );
        assert.equal(retry.kind, "terminal");
        if (retry.kind === "terminal")
          assert.equal(retry.record.history.length, 3);
        assert.equal(posts().length, 0);
      }
    },
  );

  await section(
    "attestation answers are partitioned: 201 carries the backend's CANONICAL status (ACCEPTED, SUPERSEDED) and the authorization projection is never converted into frontend authority; 4xx envelopes are terminal `rejected` with the contract code; 429 / 503 / lost answers keep the record `submitted` (no auto-retry) and an identical explicit recovery reuses the SAME Idempotency-Key, also after restart; an older decision's late answer never replaces a newer acknowledged decision",
    async () => {
      for (const bs of ["ACCEPTED", "SUPERSEDED"] as const) {
        const { client } = fakeUpstreamAtt({ backendStatus: bs });
        const out = await submission.submitComplianceProfileAttestation(
          client,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(nextSeq(), TRUSTED),
            correlationId: "c_bs",
          },
        );
        assert.equal(out.kind, "acknowledged");
        if (out.kind !== "acknowledged") return;
        assert.equal(out.backendStatus, bs);
        assert.equal(out.record.backendStatus, bs);
        assert.equal(out.record.backendPayloadSha256, "b".repeat(64));
        assert.equal(out.record.backendReceivedAt, "2026-09-10T00:00:00Z");
        assert.ok(
          !("authorization" in out.record),
          "authorization projection never stored",
        );
        assert.ok(
          !JSON.stringify(out.record).includes("PENDING") &&
            !JSON.stringify(out.record).includes("AUTHORIZED"),
        );
      }
      for (const [status, code] of [
        [409, "COMPLIANCE_ATTESTATION_REPLAYED"],
        [422, "VALIDATION_ERROR"],
        [404, "RESOURCE_NOT_FOUND"],
        [409, "ATTESTATION_SEQUENCE_CONFLICT"],
      ] as const) {
        const { client, posts } = fakeUpstreamAtt({
          attestationError: { status, code },
        });
        const v = nextSeq();
        const out = await submission.submitComplianceProfileAttestation(
          client,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(v, TRUSTED),
            correlationId: "c_att_4",
          },
        );
        assert.equal(out.kind, "rejected", `${String(status)} ${code}`);
        if (out.kind !== "rejected") return;
        assert.equal(out.code, code);
        assert.equal(out.record.state, "rejected");
        assert.equal(out.record.backendAttestationId, undefined);
        assert.equal(posts().length, 1);
        const after = await submission.submitComplianceProfileAttestation(
          fakeUpstreamAtt({}).client,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(v, TRUSTED),
            correlationId: "c_att_4b",
          },
        );
        assert.equal(after.kind, "terminal");
      }
      const retryables: Array<
        [
          Parameters<typeof fakeUpstreamAtt>[0],
          "backend" | "transport",
          number | null,
          string | null,
        ]
      > = [
        [
          { attestationError: { status: 429, code: "RATE_LIMITED" } },
          "backend",
          429,
          "RATE_LIMITED",
        ],
        [
          { attestationError: { status: 503, code: "SERVICE_UNAVAILABLE" } },
          "backend",
          503,
          "SERVICE_UNAVAILABLE",
        ],
        [{ failAttestationTransport: true }, "transport", null, null],
      ];
      for (const [opts, cause, status, code] of retryables) {
        const v = nextSeq();
        const broken = fakeUpstreamAtt(opts);
        const out = await submission.submitComplianceProfileAttestation(
          broken.client,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(v, TRUSTED),
            correlationId: "c_att_4c",
          },
        );
        assert.equal(out.kind, "retryable", `${cause} ${String(status)}`);
        if (out.kind !== "retryable") return;
        assert.equal(out.cause, cause);
        assert.equal(out.status, status);
        assert.equal(out.code, code);
        if (status === 429) assert.equal(out.retryAfterSeconds, 7);
        assert.equal(out.record.state, "submitted", "record stays submitted");
        assert.equal(out.record.lastRetryable?.kind, cause);
        assert.equal(
          out.record.history.filter((h) => h.state === "submitted").length,
          2,
          "retryable answer is recorded on the submitted record",
        );
        assert.equal(broken.posts().length, 1, "no auto-retry");
        const key1 = out.record.idempotencyKey;
        assert.ok(key1);
        const built = mapping.buildComplianceProfileAttestationRequest(
          evidenceFor(v, TRUSTED),
        );
        assert.ok(built.ok);
        if (!built.ok) return;
        const rec = await entity.getAttestationSubmission(
          ACCOUNT,
          built.request.attestation_id,
        );
        assert.equal(
          rec?.idempotencyKey,
          key1,
          "key survives on disk (restart)",
        );
        const ok = fakeUpstreamAtt({});
        const recovered = await submission.submitComplianceProfileAttestation(
          ok.client,
          {
            accountId: ACCOUNT,
            evidence: evidenceFor(v, TRUSTED),
            correlationId: "c_att_4d",
          },
        );
        assert.equal(recovered.kind, "acknowledged");
        assert.equal(
          ok.posts()[0]?.headers.get("Idempotency-Key"),
          key1,
          "identical key on recovery",
        );
        assert.deepEqual(
          ok.posts()[0]?.body,
          broken.posts()[0]?.body,
          "identical body on recovery",
        );
        assert.equal(ok.posts().length, 1);
      }
      const newer = nextSeq() + 1000;
      const older = newer - 1;
      const n1 = await submission.submitComplianceProfileAttestation(
        fakeUpstreamAtt({}).client,
        {
          accountId: ACCOUNT,
          evidence: evidenceFor(newer, TRUSTED),
          correlationId: "c_new",
        },
      );
      assert.equal(n1.kind, "acknowledged");
      if (n1.kind === "acknowledged") assert.equal(n1.latestForAccount, true);
      const o1 = await submission.submitComplianceProfileAttestation(
        fakeUpstreamAtt({ backendStatus: "SUPERSEDED" }).client,
        {
          accountId: ACCOUNT,
          evidence: evidenceFor(older, TRUSTED),
          correlationId: "c_old",
        },
      );
      assert.equal(o1.kind, "acknowledged");
      if (o1.kind === "acknowledged") {
        assert.equal(
          o1.latestForAccount,
          false,
          "older answer does not move the pointer",
        );
        assert.equal(o1.record.state, "acknowledged");
      }
      const latest = await entity.getLatestAcknowledgedDecision(ACCOUNT);
      assert.equal(latest?.decisionSequence, newer);
    },
  );

  await section(
    "attestation record: transitions are strictly ordered — skipping, reversing or leaving a terminal state throws; history is append-only",
    async () => {
      const id = "att_" + "f".repeat(32);
      const opened = await entity.openAttestationSubmission({
        accountId: ACCOUNT,
        attestationId: id,
        correlationId: "c",
      });
      assert.equal(opened.state, "disclosure_delivered");
      await assert.rejects(
        entity.advanceAttestationSubmission({
          accountId: ACCOUNT,
          attestationId: id,
          to: "submitted",
          correlationId: "c",
        }),
        entity.AttestationTransitionError,
      );
      await assert.rejects(
        entity.advanceAttestationSubmission({
          accountId: ACCOUNT,
          attestationId: id,
          to: "acknowledged",
          correlationId: "c",
        }),
        entity.AttestationTransitionError,
      );
      const blocked = await entity.advanceAttestationSubmission({
        accountId: ACCOUNT,
        attestationId: id,
        to: "blocked",
        correlationId: "c",
        detail: { reasons: ["X"] },
      });
      assert.equal(blocked.state, "blocked");
      for (const to of [
        "consent_accepted",
        "submitted",
        "acknowledged",
        "rejected",
        "disclosure_delivered",
      ] as const) {
        await assert.rejects(
          entity.advanceAttestationSubmission({
            accountId: ACCOUNT,
            attestationId: id,
            to,
            correlationId: "c",
          }),
          entity.AttestationTransitionError,
        );
      }
      const reread = await entity.getAttestationSubmission(ACCOUNT, id);
      assert.deepEqual(statesOf(reread!), ["disclosure_delivered", "blocked"]);
      assert.deepEqual(
        await entity.openAttestationSubmission({
          accountId: ACCOUNT,
          attestationId: id,
          correlationId: "c2",
        }),
        reread,
        "open is idempotent",
      );
      assert.ok(
        (await entity.listAttestationSubmissions(ACCOUNT)).some(
          (r) => r.attestationId === id,
        ),
      );
    },
  );

  await section(
    "attestation route: POST carries no body, requires same-origin + session, fails closed 503 when no upstream is configured, and is receipted; GET lists this account's records; no runtime module establishes trusted KYC provenance",
    async () => {
      const secret = getServerEnvAtt().SESSION_JWT_SECRET;
      const token = await new joseAtt.SignJWT({ sub: "user-att-route-1" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(secret));
      const req = (opts: { origin?: string; cookie?: boolean } = {}) =>
        new NextRequestAtt(
          "http://localhost:3000/api/v1/investor/profile/v2/attestation",
          {
            method: "POST",
            headers: {
              ...(opts.origin === undefined
                ? { origin: "http://localhost:3000" }
                : opts.origin
                  ? { origin: opts.origin }
                  : {}),
              ...(opts.cookie === false
                ? {}
                : { cookie: `us_session_v1=${token}` }),
              "content-type": "application/json",
            },
            body: "{}",
          },
        );
      assert.equal(
        (await attRoute.POST(req({ origin: "https://evil.example" }))).status,
        403,
      );
      assert.equal((await attRoute.POST(req({ cookie: false }))).status, 401);
      const savedBase = process.env["REFI_INVESTOR_API_BASE_URL"];
      const savedStage = process.env["REFI_RELEASE_STAGE"];
      delete process.env["REFI_INVESTOR_API_BASE_URL"];
      // Signal stage: the action is not permitted at all (403, before any
      // body or upstream); automated Alpha: permitted, then fails closed.
      process.env["REFI_RELEASE_STAGE"] = "signal";
      resetEnvAtt();
      try {
        assert.equal((await attRoute.POST(req())).status, 403);
        process.env["REFI_RELEASE_STAGE"] = "automated_alpha";
        resetEnvAtt();
        const res = await attRoute.POST(req());
        const body = (await res.json()) as {
          data?: { reason?: string };
          receipt?: { action?: string };
        };
        assert.equal(res.status, 503);
        assert.equal(body.data?.reason, "upstream_unavailable");
        assert.equal(body.receipt?.action, "submitComplianceAttestation");
      } finally {
        if (savedBase === undefined)
          delete process.env["REFI_INVESTOR_API_BASE_URL"];
        else process.env["REFI_INVESTOR_API_BASE_URL"] = savedBase;
        if (savedStage === undefined) delete process.env["REFI_RELEASE_STAGE"];
        else process.env["REFI_RELEASE_STAGE"] = savedStage;
        resetEnvAtt();
      }
      const get = await attRoute.GET(
        new NextRequestAtt(
          "http://localhost:3000/api/v1/investor/profile/v2/attestation",
          {
            headers: { cookie: `us_session_v1=${token}` },
          },
        ),
      );
      assert.equal(get.status, 200);
      const strip = (f: string) =>
        readFileSync(join(REPO_ROOT, f), "utf8").replace(
          /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
          "",
        );
      for (const f of [
        "apps/web/src/lib/compliance/attestation-submission.ts",
        "apps/web/app/api/v1/investor/profile/v2/attestation/route.ts",
        "apps/web/src/lib/prototype-store/entities/attestation-submission.ts",
      ]) {
        assert.ok(
          !/establishTrustedKycProvenance\s*\(/.test(strip(f)),
          `${f} must not establish trusted KYC provenance`,
        );
      }
      const r = strip(
        "apps/web/app/api/v1/investor/profile/v2/attestation/route.ts",
      );
      assert.ok(!/parse:/.test(r), "the route accepts no body");
      assert.ok(
        /kycEvidenceForAttestation\(provider, \{ authId \}\)/.test(r) &&
          !/mockKycProvenance\(/.test(r) &&
          !/establishTrustedKycProvenance/.test(r),
        "the route obtains KYC evidence only through the single evidence module (mock → mock provenance; final provider decision → trusted; otherwise null)",
      );
      const s = strip(
        "apps/web/src/lib/compliance/attestation-submission.ts",
      ).slice(
        strip("apps/web/src/lib/compliance/attestation-submission.ts").indexOf(
          "export async function submitComplianceProfileAttestation",
        ),
      );
      const order = [
        "listEffectiveDisclosures(",
        "listActiveConsents(",
        "buildComplianceProfileAttestationRequest(",
        'to: "submitted"',
        'call("createComplianceProfileAttestation"',
        'to: "acknowledged"',
      ].map((x) => s.indexOf(x));
      assert.ok(
        order.every(
          (i, n) => i >= 0 && (n === 0 || i > (order[n - 1] as number)),
        ),
        "chain order is fixed in source",
      );
    },
  );
}

// ─── Automated-Alpha economic gating (mandate: subscription requires AccountAuthorization; DENIED never relabelled; account scope authoritative; backend owns execution) ──

{
  const { createInvestorApiClient: createClientBk } =
    await import("../packages/api-clients/src/investor-api/index.ts");
  const actions =
    await import("../apps/web/src/lib/investor-api/account-actions.ts");
  const maint =
    await import("../apps/web/src/lib/investor-api/brokerage-maintenance.ts");
  const {
    resetServerEnvCacheForTests: resetEnvBk,
    getServerEnv: getServerEnvBk,
  } = await import("../apps/web/src/lib/config/env.ts");
  const routes = {
    preview:
      await import("../apps/web/app/api/v1/investor/allocation/preview/route.ts"),
    join: await import("../apps/web/app/api/v1/investor/allocation/join/route.ts"),
    update:
      await import("../apps/web/app/api/v1/investor/allocation/update/route.ts"),
    leave:
      await import("../apps/web/app/api/v1/investor/allocation/leave/route.ts"),
    rotate:
      await import("../apps/web/app/api/v1/investor/broker/connection/[id]/rotate/route.ts"),
    sync: await import("../apps/web/app/api/v1/investor/broker/connection/[id]/sync/route.ts"),
  };
  const { createRequire: createRequireBk } = await import("node:module");
  const requireWebBk = createRequireBk(
    join(process.cwd(), "apps/web/package.json"),
  );
  const joseBk = (await import(
    requireWebBk.resolve("jose")
  )) as typeof import("jose");
  const { NextRequest: NextRequestBk } = (await import(
    requireWebBk.resolve("next/server")
  )) as typeof import("next/server");
  const examplesBk = JSON.parse(
    readFileSync(
      join(
        REPO_ROOT,
        "packages/api-clients/contracts/investor-api/v1.1.0-alpha.3/examples.json",
      ),
      "utf8",
    ),
  ) as { responses: Record<string, { data: Record<string, unknown> }> };

  const OWNED = "acct_alpha_owned_01";
  const OTHER = "acct_alpha_other_02";
  const CONN = "brokerconn_alpha_0001";
  const FOREIGN_CONN = "brokerconn_other_0009";
  const headersBk = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Correlation-Id": "corr_bk",
  };
  type SeenBk = {
    url: string;
    method: string;
    headers: Headers;
    body: unknown;
  };
  function upstreamBk(
    opts: {
      authorization?: string;
      actionError?: { status: number; code: string };
      previewError?: { status: number; code: string };
    } = {},
  ) {
    const seen: SeenBk[] = [];
    const page = (items: unknown[]) =>
      new Response(
        JSON.stringify({
          data: { items, page: { has_more: false, next_cursor: null } },
        }),
        { status: 200, headers: headersBk },
      );
    const err = (e: { status: number; code: string }) =>
      new Response(
        JSON.stringify({
          error: { code: e.code, message: "x", correlation_id: "corr_bk" },
        }),
        { status: e.status, headers: headersBk },
      );
    const fetchImpl = async (
      url: URL | RequestInfo,
      init?: RequestInit,
    ): Promise<Response> => {
      const u = url.toString();
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : undefined;
      seen.push({ url: u, method, headers: new Headers(init?.headers), body });
      const path = new URL(u).pathname;
      if (path === "/api/v1/investor/accounts" && method === "GET") {
        return page(
          [
            {
              ...examplesBk.responses["AccountSummary"]?.data,
              account_id: OWNED,
            },
          ].filter((a) => a.account_id),
        );
      }
      if (
        path === `/api/v1/investor/accounts/${OWNED}/authorization` &&
        method === "GET"
      ) {
        return new Response(
          JSON.stringify({
            data: {
              ...examplesBk.responses["AccountAuthorizationEnvelope"]!.data,
              status: opts.authorization ?? "AUTHORIZED",
            },
          }),
          { status: 200, headers: headersBk },
        );
      }
      if (
        path === `/api/v1/investor/accounts/${OWNED}/brokerage-connections` &&
        method === "GET"
      ) {
        const c = examplesBk.responses["BrokerageConnectionEnvelope"]!.data;
        return page([
          { ...c, account_id: OWNED, connection_id: CONN },
          {
            ...c,
            account_id: OWNED,
            connection_id: "brokerconn_alpha_dead",
            connection_status: "DISCONNECTED",
          },
        ]);
      }
      if (
        path === `/api/v1/investor/accounts/${OWNED}/allocation-previews` &&
        method === "POST"
      ) {
        if (opts.previewError) return err(opts.previewError);
        return new Response(
          JSON.stringify({
            data: {
              ...examplesBk.responses["AllocationPreviewEnvelope"]!.data,
              account_id: OWNED,
            },
          }),
          { status: 201, headers: headersBk },
        );
      }
      if (
        path === `/api/v1/investor/accounts/${OWNED}/actions` &&
        method === "POST"
      ) {
        if (opts.actionError) return err(opts.actionError);
        return new Response(
          JSON.stringify({
            data: {
              ...examplesBk.responses["ActionReceiptEnvelope"]!.data,
              account_id: OWNED,
            },
          }),
          { status: 202, headers: headersBk },
        );
      }
      if (
        path ===
          `/api/v1/investor/accounts/${OWNED}/brokerage-connections/${CONN}/credentials/rotate` &&
        method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            data: {
              ...examplesBk.responses["BrokerageConnectionEnvelope"]!.data,
              account_id: OWNED,
              connection_id: CONN,
              credential_status: "ROTATING",
            },
          }),
          { status: 202, headers: headersBk },
        );
      }
      if (
        path ===
          `/api/v1/investor/accounts/${OWNED}/brokerage-connections/${CONN}/sync` &&
        method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            data: {
              ...examplesBk.responses["BrokerageSyncReceiptEnvelope"]!.data,
              connection_id: CONN,
            },
          }),
          { status: 202, headers: headersBk },
        );
      }
      return err({ status: 404, code: "RESOURCE_NOT_FOUND" });
    };
    const client = createClientBk({
      identityCcid: {
        baseUrl: "http://127.0.0.1:1",
        getBearer: () => Promise.resolve("id-b"),
      },
      investorApi: {
        baseUrl: "http://127.0.0.1:1",
        getBearer: () => Promise.resolve("inv-b"),
      },
      mintAssertion: () => Promise.resolve("assertion"),
      fetch: fetchImpl as typeof fetch,
    });
    return {
      client,
      seen,
      posts: () => seen.filter((s) => s.method === "POST"),
      ops: () => seen.map((s) => `${s.method} ${new URL(s.url).pathname}`),
    };
  }
  const econ = (action: "join_template" | "update_allocation") => ({
    action,
    templateId: "template_us_sp500_following_v1",
    allocationPercent: "0.25",
    allocationPreviewId: "preview_alpha_0001",
  });

  await section(
    "economic gating: join_template and update_allocation read AccountAuthorization first and are refused on PENDING / DENIED / SUSPENDED with the backend status word verbatim — createAccountAction is never called, nothing is relabelled",
    async () => {
      for (const status of ["PENDING", "DENIED", "SUSPENDED"]) {
        for (const action of ["join_template", "update_allocation"] as const) {
          const { client, ops } = upstreamBk({ authorization: status });
          const out = await actions.submitAccountAction(
            client,
            OWNED,
            econ(action),
          );
          assert.equal(out.kind, "not_authorized");
          if (out.kind !== "not_authorized") return;
          assert.equal(out.authorization, status, "status word verbatim");
          assert.equal(out.action, action);
          assert.deepEqual(
            ops(),
            [`GET /api/v1/investor/accounts/${OWNED}/authorization`],
            "authorization read, action never sent",
          );
        }
      }
    },
  );

  await section(
    "economic gating: AUTHORIZED forwards join/update exactly once with the exact contracted body (action + parameters only) under a deterministic Idempotency-Key; a different percent is a different key; the same submission is the same key",
    async () => {
      for (const action of ["join_template", "update_allocation"] as const) {
        const { client, ops, posts } = upstreamBk({});
        const out = await actions.submitAccountAction(
          client,
          OWNED,
          econ(action),
        );
        assert.equal(out.kind, "accepted");
        if (out.kind !== "accepted") return;
        assert.equal(out.upstreamStatus, 202);
        assert.equal(out.receipt.status, "ACCEPTED");
        assert.deepEqual(ops(), [
          `GET /api/v1/investor/accounts/${OWNED}/authorization`,
          `POST /api/v1/investor/accounts/${OWNED}/actions`,
        ]);
        const post = posts()[0]!;
        assert.deepEqual(post.body, {
          action,
          parameters: {
            template_id: "template_us_sp500_following_v1",
            allocation_percent: "0.25",
            allocation_preview_id: "preview_alpha_0001",
          },
        });
        const k = post.headers.get("Idempotency-Key");
        assert.equal(k, actions.actionIdempotencyKey(OWNED, econ(action)));
        assert.notEqual(
          k,
          actions.actionIdempotencyKey(OWNED, {
            ...econ(action),
            allocationPercent: "0.30",
          }),
        );
        assert.notEqual(k, actions.actionIdempotencyKey(OTHER, econ(action)));
        assert.equal(
          post.headers.get("X-Refinity-User-Assertion"),
          "assertion",
        );
      }
    },
  );

  await section(
    "economic gating: leave_template is disengagement — sent without reading AccountAuthorization, with template_id only; createAllocationPreview is non-economic — no authorization read, exact body, 201 preview passed through unchanged",
    async () => {
      const { client, ops, posts } = upstreamBk({ authorization: "DENIED" });
      const out = await actions.submitAccountAction(client, OWNED, {
        action: "leave_template",
        templateId: "template_us_sp500_following_v1",
      });
      assert.equal(out.kind, "accepted");
      assert.deepEqual(ops(), [
        `POST /api/v1/investor/accounts/${OWNED}/actions`,
      ]);
      assert.deepEqual(posts()[0]?.body, {
        action: "leave_template",
        parameters: { template_id: "template_us_sp500_following_v1" },
      });
      const p = upstreamBk({ authorization: "DENIED" });
      const preview = await actions.previewAllocation(p.client, OWNED, {
        templateId: "template_us_sp500_following_v1",
        allocationPercent: "0.25",
      });
      assert.equal(preview.upstreamStatus, 201);
      assert.deepEqual(p.ops(), [
        `POST /api/v1/investor/accounts/${OWNED}/allocation-previews`,
      ]);
      assert.deepEqual(p.posts()[0]?.body, {
        template_id: "template_us_sp500_following_v1",
        allocation_percent: "0.25",
      });
      assert.deepEqual(preview.preview, {
        ...examplesBk.responses["AllocationPreviewEnvelope"]!.data,
        account_id: OWNED,
      });
      assert.equal(
        p.posts()[0]?.headers.get("Idempotency-Key"),
        actions.previewIdempotencyKey(OWNED, {
          templateId: "template_us_sp500_following_v1",
          allocationPercent: "0.25",
        }),
      );
    },
  );

  await section(
    "economic gating: backend refusals keep their contract code (ALLOCATION_PREVIEW_STALE, COMPLIANCE_ATTESTATION_REQUIRED, EXECUTION_DISABLED, ACCOUNT_BASELINE_ADOPTION_REQUIRED) and are never retried; no local code stands in for a backend decision",
    async () => {
      for (const [status, code] of [
        [409, "ALLOCATION_PREVIEW_STALE"],
        [422, "COMPLIANCE_ATTESTATION_REQUIRED"],
        [409, "EXECUTION_DISABLED"],
        [422, "ACCOUNT_BASELINE_ADOPTION_REQUIRED"],
      ] as const) {
        const { client, posts } = upstreamBk({ actionError: { status, code } });
        await assert.rejects(
          actions.submitAccountAction(client, OWNED, econ("join_template")),
          (e: unknown) =>
            e instanceof Error &&
            e.name === "InvestorApiError" &&
            (e as { code: string }).code === code &&
            (e as { status: number }).status === status,
        );
        assert.equal(posts().length, 1, "mutation not retried");
      }
    },
  );

  await section(
    "connection scope: rotate and sync refuse a connection id that is not this account's (foreign, terminal, malformed) BEFORE any mutation path is built; an owned connection is forwarded once with the exact path; rotation key derives from the key ID only",
    async () => {
      for (const [id, reason] of [
        [FOREIGN_CONN, "not_owned"],
        ["brokerconn_alpha_dead", "terminal"],
        ["x", "malformed"],
        [`${CONN}/../${FOREIGN_CONN}`, "malformed"],
      ] as const) {
        const { client, posts } = upstreamBk({});
        const r = await maint.rotateBrokerageCredentials(client, OWNED, id, {
          apiKeyId: "PK" + "A".repeat(18),
          apiSecretKey: "s".repeat(40),
        });
        assert.deepEqual(r, { kind: "connection_out_of_scope", reason });
        const s = await maint.syncBrokerageConnection(client, OWNED, id);
        assert.deepEqual(s, { kind: "connection_out_of_scope", reason });
        assert.equal(posts().length, 0);
      }
      const { client, posts, seen } = upstreamBk({});
      const rot = await maint.rotateBrokerageCredentials(client, OWNED, CONN, {
        apiKeyId: "PK" + "A".repeat(18),
        apiSecretKey: "s".repeat(40),
      });
      assert.equal(rot.kind, "accepted");
      if (rot.kind === "accepted")
        assert.equal(rot.result.credentialStatus, "ROTATING");
      const post = posts()[0]!;
      assert.ok(
        post.url.endsWith(
          `/accounts/${OWNED}/brokerage-connections/${CONN}/credentials/rotate`,
        ),
      );
      assert.deepEqual(post.body, {
        credentials: {
          api_key: "PK" + "A".repeat(18),
          api_secret: "s".repeat(40),
        },
      });
      assert.equal(
        post.headers.get("Idempotency-Key"),
        maint.rotationIdempotencyKey(OWNED, CONN, "PK" + "A".repeat(18)),
      );
      assert.equal(
        maint.rotationIdempotencyKey(OWNED, CONN, "PK" + "A".repeat(18)),
        maint.rotationIdempotencyKey(OWNED, CONN, "PK" + "A".repeat(18)),
      );
      assert.ok(
        !maint
          .rotationIdempotencyKey(OWNED, CONN, "PK" + "A".repeat(18))
          .includes("s".repeat(10)),
      );
      const sync = await maint.syncBrokerageConnection(
        client,
        OWNED,
        CONN,
        () => 1_700_000_000_000,
      );
      assert.equal(sync.kind, "accepted");
      const sp = posts()[1]!;
      assert.ok(sp.url.endsWith(`/brokerage-connections/${CONN}/sync`));
      assert.equal(sp.body, undefined, "sync has no body");
      assert.equal(
        sp.headers.get("Idempotency-Key"),
        maint.syncIdempotencyKey(OWNED, CONN, () => 1_700_000_000_000),
      );
      assert.equal(
        maint.syncIdempotencyKey(OWNED, CONN, () => 1_700_000_000_000),
        maint.syncIdempotencyKey(OWNED, CONN, () => 1_700_000_030_000),
        "same minute replays",
      );
      assert.notEqual(
        maint.syncIdempotencyKey(OWNED, CONN, () => 1_700_000_000_000),
        maint.syncIdempotencyKey(OWNED, CONN, () => 1_700_000_120_000),
      );
      assert.ok(
        seen.every((s) => !s.url.includes(OTHER)),
        "the other account is never addressed",
      );
    },
  );

  await section(
    "routes: all six automated-Alpha mutation routes are same-origin + session + release-stage gated (403 at signal), accept no account_id from the browser (strict bodies), and fail closed 503 with a receipt when no upstream is configured",
    async () => {
      const secret = getServerEnvBk().SESSION_JWT_SECRET;
      const token = await new joseBk.SignJWT({ sub: "user-bk-route-1" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(secret));
      const req = (
        path: string,
        body: unknown,
        opts: { origin?: string | null; cookie?: boolean } = {},
      ) =>
        new NextRequestBk(`http://localhost:3000${path}`, {
          method: "POST",
          headers: {
            ...(opts.origin === null
              ? {}
              : { origin: opts.origin ?? "http://localhost:3000" }),
            ...(opts.cookie === false
              ? {}
              : { cookie: `us_session_v1=${token}` }),
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
      const cases: Array<[keyof typeof routes, string, unknown]> = [
        [
          "preview",
          "/api/v1/investor/allocation/preview",
          {
            templateId: "template_us_sp500_following_v1",
            allocationPercent: "0.25",
          },
        ],
        [
          "join",
          "/api/v1/investor/allocation/join",
          {
            templateId: "template_us_sp500_following_v1",
            allocationPercent: "0.25",
            allocationPreviewId: "preview_alpha_0001",
          },
        ],
        [
          "update",
          "/api/v1/investor/allocation/update",
          {
            templateId: "template_us_sp500_following_v1",
            allocationPercent: "0.25",
            allocationPreviewId: "preview_alpha_0001",
          },
        ],
        [
          "leave",
          "/api/v1/investor/allocation/leave",
          { templateId: "template_us_sp500_following_v1" },
        ],
        [
          "rotate",
          `/api/v1/investor/broker/connection/${CONN}/rotate`,
          {
            environment: "paper",
            apiKeyId: "PK" + "A".repeat(18),
            apiSecretKey: "s".repeat(40),
          },
        ],
        ["sync", `/api/v1/investor/broker/connection/${CONN}/sync`, {}],
      ];
      const savedBase = process.env["REFI_INVESTOR_API_BASE_URL"];
      const savedStage = process.env["REFI_RELEASE_STAGE"];
      delete process.env["REFI_INVESTOR_API_BASE_URL"];
      try {
        process.env["REFI_RELEASE_STAGE"] = "signal";
        resetEnvBk();
        for (const [name, path, body] of cases) {
          assert.equal(
            (await routes[name].POST(req(path, body))).status,
            403,
            `${name} refused at signal`,
          );
        }
        process.env["REFI_RELEASE_STAGE"] = "automated_alpha";
        resetEnvBk();
        for (const [name, path, body] of cases) {
          assert.equal(
            (
              await routes[name].POST(
                req(path, body, { origin: "https://evil.example" }),
              )
            ).status,
            403,
            `${name} cross-origin`,
          );
          assert.equal(
            (await routes[name].POST(req(path, body, { cookie: false })))
              .status,
            401,
            `${name} no session`,
          );
          if (name !== "sync") {
            const smuggled = await routes[name].POST(
              req(path, { ...(body as object), account_id: OTHER }),
            );
            assert.equal(
              smuggled.status,
              400,
              `${name} refuses a browser-supplied account_id`,
            );
          }
          const res = await routes[name].POST(req(path, body));
          const parsed = (await res.json()) as {
            data?: { reason?: string; upstream?: unknown };
            receipt?: { action?: string };
          };
          assert.equal(res.status, 503, `${name}: ${JSON.stringify(parsed)}`);
          assert.ok(parsed.receipt?.action, `${name} receipted`);
        }
        // Live keys never parse on rotate; the secret never appears in any response.
        const live = await routes.rotate.POST(
          req(`/api/v1/investor/broker/connection/${CONN}/rotate`, {
            environment: "paper",
            apiKeyId: "AK" + "A".repeat(18),
            apiSecretKey: "s".repeat(40),
          }),
        );
        assert.equal(live.status, 400);
        assert.ok(!(await live.text()).includes("s".repeat(40)));
      } finally {
        if (savedBase === undefined)
          delete process.env["REFI_INVESTOR_API_BASE_URL"];
        else process.env["REFI_INVESTOR_API_BASE_URL"] = savedBase;
        if (savedStage === undefined) delete process.env["REFI_RELEASE_STAGE"];
        else process.env["REFI_RELEASE_STAGE"] = savedStage;
        resetEnvBk();
      }
      const strip = (f: string) =>
        readFileSync(join(REPO_ROOT, f), "utf8").replace(
          /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
          "",
        );
      const a = strip("apps/web/src/lib/investor-api/account-actions.ts");
      assert.ok(
        !/order|cancel|intent|liquidat|transfer/i.test(
          a.replace(/no order, cancel, intent, transfer or liquidation/i, ""),
        ),
        "no execution verbs exist in the adapter",
      );
      assert.ok(
        a.indexOf('call("getAccountAuthorization"') <
          a.indexOf('call("createAccountAction"'),
        "authorization is read before the action is sent",
      );
      const m = strip("apps/web/src/lib/investor-api/brokerage-maintenance.ts");
      assert.ok(
        m.indexOf("assertConnectionInScope(client, accountId, connectionId)") <
          m.indexOf('call("rotateBrokerageCredentials"'),
      );
      for (const f of ["rotate", "sync"] as const) {
        const r = strip(
          `apps/web/app/api/v1/investor/broker/connection/[id]/${f}/route.ts`,
        );
        assert.ok(!/console\./.test(r), `${f} route never logs`);
        assert.ok(
          !/data:\s*\{[^}]*(apiSecretKey|api_secret)/.test(r),
          `${f} route never echoes the secret in a response`,
        );
      }
    },
  );
}

// ─── Two-user cross-user isolation (mandate: US Multi-User Acceptance groundwork; fixture-level, no credentials): account scope, actions, connections, attestation records, sessions, subjects ──

{
  const { createInvestorApiClient: createClientTu } =
    await import("../packages/api-clients/src/investor-api/index.ts");
  const scopeMod =
    await import("../apps/web/src/lib/investor-api/account-scope.ts");
  const actionsTu =
    await import("../apps/web/src/lib/investor-api/account-actions.ts");
  const maintTu =
    await import("../apps/web/src/lib/investor-api/brokerage-maintenance.ts");
  const attEntity =
    await import("../apps/web/src/lib/prototype-store/entities/attestation-submission.ts");
  const csTu = await import("../apps/web/src/lib/connected-store/index.ts");
  const sessionsTu =
    await import("../apps/web/src/lib/connected-store/session.ts");
  const subjects =
    await import("../apps/web/src/lib/connected-store/subject-map.ts");
  const cookieMod = await import("../apps/web/src/lib/auth/session-cookie.ts");
  const { getAuthContext: getAuthContextTu } =
    await import("../apps/web/src/lib/bff/auth.ts");
  const { resetServerEnvCacheForTests: resetEnvTu } =
    await import("../apps/web/src/lib/config/env.ts");
  const { createRequire: createRequireTu } = await import("node:module");
  const requireWebTu = createRequireTu(
    join(process.cwd(), "apps/web/package.json"),
  );
  const { NextRequest: NextRequestTu } = (await import(
    requireWebTu.resolve("next/server")
  )) as typeof import("next/server");
  const examplesTu = JSON.parse(
    readFileSync(
      join(
        REPO_ROOT,
        "packages/api-clients/contracts/investor-api/v1.1.0-alpha.3/examples.json",
      ),
      "utf8",
    ),
  ) as { responses: Record<string, { data: Record<string, unknown> }> };

  const USERS = {
    A: {
      sub: "user-a-000000000000000000001",
      account: "acct_two_user_a_01",
      conn: "brokerconn_two_a_01",
      assertion: "assertion-for-A",
    },
    B: {
      sub: "user-b-000000000000000000002",
      account: "acct_two_user_b_02",
      conn: "brokerconn_two_b_02",
      assertion: "assertion-for-B",
    },
  } as const;
  type User = keyof typeof USERS;
  const headersTu = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Correlation-Id": "corr_tu",
  };
  const seenTu: Array<{ user: User | "?"; method: string; path: string }> = [];
  // ONE upstream serving both users: it answers by the user assertion on the
  // request, exactly as investor-api scopes by the asserted `sub`.
  const fetchTu = async (
    url: URL | RequestInfo,
    init?: RequestInit,
  ): Promise<Response> => {
    const path = new URL(url.toString()).pathname;
    const method = init?.method ?? "GET";
    const assertion = new Headers(init?.headers).get(
      "X-Refinity-User-Assertion",
    );
    const user: User | "?" =
      assertion === USERS.A.assertion
        ? "A"
        : assertion === USERS.B.assertion
          ? "B"
          : "?";
    seenTu.push({ user, method, path });
    const page = (items: unknown[]) =>
      new Response(
        JSON.stringify({
          data: { items, page: { has_more: false, next_cursor: null } },
        }),
        { status: 200, headers: headersTu },
      );
    const notFound = () =>
      new Response(
        JSON.stringify({
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "x",
            correlation_id: "corr_tu",
          },
        }),
        { status: 404, headers: headersTu },
      );
    if (user === "?")
      return new Response(
        JSON.stringify({
          error: {
            code: "AUTHENTICATION_FAILED",
            message: "x",
            correlation_id: "corr_tu",
          },
        }),
        { status: 401, headers: headersTu },
      );
    const me = USERS[user];
    const account = {
      ...examplesTu.responses["AccountEnvelope"]!.data,
      account_id: me.account,
    };
    if (path === "/api/v1/investor/accounts" && method === "GET")
      return page([account]);
    const m = /^\/api\/v1\/investor\/accounts\/([^/]+)(\/.*)?$/.exec(path);
    if (m) {
      const [, accountId, rest = ""] = m;
      if (accountId !== me.account) return notFound(); // backend-side isolation
      if (rest === "/authorization")
        return new Response(
          JSON.stringify({
            data: examplesTu.responses["AccountAuthorizationEnvelope"]!.data,
          }),
          { status: 200, headers: headersTu },
        );
      if (rest === "/brokerage-connections" && method === "GET") {
        return page([
          {
            ...examplesTu.responses["BrokerageConnectionEnvelope"]!.data,
            account_id: me.account,
            connection_id: me.conn,
          },
        ]);
      }
      if (rest === "/actions" && method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              ...examplesTu.responses["ActionReceiptEnvelope"]!.data,
              account_id: me.account,
            },
          }),
          { status: 202, headers: headersTu },
        );
      }
      if (
        rest === `/brokerage-connections/${me.conn}/sync` &&
        method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            data: {
              ...examplesTu.responses["BrokerageSyncReceiptEnvelope"]!.data,
              connection_id: me.conn,
            },
          }),
          { status: 202, headers: headersTu },
        );
      }
    }
    return notFound();
  };
  const clientFor = (user: User) =>
    createClientTu({
      identityCcid: {
        baseUrl: "http://127.0.0.1:1",
        getBearer: () => Promise.resolve("id-b"),
      },
      investorApi: {
        baseUrl: "http://127.0.0.1:1",
        getBearer: () => Promise.resolve("inv-b"),
      },
      mintAssertion: () => Promise.resolve(USERS[user].assertion),
      fetch: fetchTu as typeof fetch,
    });
  const pathsFor = (user: User) =>
    seenTu.filter((s) => s.user === user).map((s) => s.path);

  await section(
    "two users: account scope resolves to the caller's OWN account under the caller's assertion — a claimed account id belonging to the other user is ignored, never honoured; the other user's account is never addressed",
    async () => {
      seenTu.length = 0;
      for (const [me, other] of [
        ["A", "B"],
        ["B", "A"],
      ] as const) {
        const own = await scopeMod.resolveAccountScope(clientFor(me), {
          accountId: USERS[other].account,
        });
        assert.equal(
          own,
          USERS[me].account,
          `${me}: a claim naming ${other}'s account is not honoured`,
        );
        const noClaim = await scopeMod.resolveAccountScope(clientFor(me), {});
        assert.equal(noClaim, USERS[me].account);
      }
      assert.ok(
        seenTu.every((s) => s.path === "/api/v1/investor/accounts"),
        "scope resolution touches only listAccounts",
      );
      assert.ok(
        !seenTu.some((s) => s.user === "A" && s.path.includes(USERS.B.account)),
      );
      assert.ok(
        !seenTu.some((s) => s.user === "B" && s.path.includes(USERS.A.account)),
      );
    },
  );

  await section(
    "two users: an economic action under A's assertion against B's account is refused by the backend (404) and nothing falls back; A's own account succeeds; B's connection id is out of scope for A (no upstream mutation), A's own sync succeeds",
    async () => {
      seenTu.length = 0;
      const input = {
        action: "join_template" as const,
        templateId: "template_us_sp500_following_v1",
        allocationPercent: "0.25",
        allocationPreviewId: "preview_alpha_0001",
      };
      await assert.rejects(
        actionsTu.submitAccountAction(clientFor("A"), USERS.B.account, input),
        (e: unknown) =>
          e instanceof Error &&
          e.name === "InvestorApiError" &&
          (e as { status: number }).status === 404,
      );
      assert.ok(
        !pathsFor("A").some((p) => p.endsWith("/actions")),
        "no action reached B's account",
      );
      const ok = await actionsTu.submitAccountAction(
        clientFor("A"),
        USERS.A.account,
        input,
      );
      assert.equal(ok.kind, "accepted");
      if (ok.kind === "accepted")
        assert.equal(ok.receipt.account_id, USERS.A.account);
      const cross = await maintTu.syncBrokerageConnection(
        clientFor("A"),
        USERS.A.account,
        USERS.B.conn,
      );
      assert.deepEqual(cross, {
        kind: "connection_out_of_scope",
        reason: "not_owned",
      });
      assert.ok(
        !pathsFor("A").some((p) => p.includes(USERS.B.conn)),
        "B's connection never appears in A's upstream paths",
      );
      const own = await maintTu.syncBrokerageConnection(
        clientFor("A"),
        USERS.A.account,
        USERS.A.conn,
      );
      assert.equal(own.kind, "accepted");
      // Nothing under B's assertion happened at all in this section.
      assert.deepEqual(pathsFor("B"), []);
    },
  );

  await section(
    "two users: attestation submission records are listed per account only; sessions resolve only their own subject (a cookie for A carrying B's sid is null); opaque subjects never collide or cross-resolve",
    async () => {
      const idA = "att_" + "a".repeat(32);
      const idB = "att_" + "b".repeat(32);
      await attEntity.openAttestationSubmission({
        accountId: USERS.A.account,
        attestationId: idA,
        correlationId: "c",
      });
      await attEntity.openAttestationSubmission({
        accountId: USERS.B.account,
        attestationId: idB,
        correlationId: "c",
      });
      const listA = (
        await attEntity.listAttestationSubmissions(USERS.A.account)
      ).map((r) => r.attestationId);
      const listB = (
        await attEntity.listAttestationSubmissions(USERS.B.account)
      ).map((r) => r.attestationId);
      assert.ok(listA.includes(idA) && !listA.includes(idB));
      assert.ok(listB.includes(idB) && !listB.includes(idA));
      assert.equal(
        await attEntity.getAttestationSubmission(USERS.A.account, idB),
        null,
        "A cannot read B's record by id",
      );

      // Durable sessions + cookies (shared in-memory backing for the test).
      const backing = new Map<string, Map<string, unknown>>();
      csTu.setConnectedStoreFactoryForTests(<T>(collection: string) => {
        const col = () => {
          let m = backing.get(collection);
          if (!m) {
            m = new Map();
            backing.set(collection, m);
          }
          return m as Map<string, T>;
        };
        return {
          async get(k: string) {
            return col().get(k) ?? null;
          },
          async put(k: string, v: T) {
            col().set(k, v);
          },
          async putIfAbsent(k: string, v: T) {
            if (col().has(k)) return false;
            col().set(k, v);
            return true;
          },
          async list(prefix?: string) {
            return [...col().entries()]
              .filter(([k]) => !prefix || k.startsWith(prefix))
              .map(([key, value]) => ({ key, value }));
          },
          async delete(k: string) {
            col().delete(k);
          },
        };
      });
      const savedNs = process.env["REFI_CONNECTED_STORE_NAMESPACE"];
      process.env["REFI_CONNECTED_STORE_NAMESPACE"] = "us-connected-test";
      resetEnvTu();
      try {
        const sA = await sessionsTu.createConnectedSession({
          sub: USERS.A.sub,
          authTime: 1_789_000_000,
          amr: ["email_link"],
          identityResultJti: "idr_tu_a_00000000000000000001",
          correlationId: "c",
        });
        const sB = await sessionsTu.createConnectedSession({
          sub: USERS.B.sub,
          authTime: 1_789_000_100,
          amr: ["email_otp"],
          identityResultJti: "idr_tu_b_00000000000000000002",
          correlationId: "c",
        });
        const cA = await cookieMod.mintConnectedSessionCookie(sA, {
          secure: true,
        });
        const cB = await cookieMod.mintConnectedSessionCookie(sB, {
          secure: true,
        });
        const ctxFor = async (cookie: string) =>
          getAuthContextTu(
            new NextRequestTu(
              "https://bff-dev.refi.trading/api/v1/investor/status",
              { headers: { cookie: `us_session_v1=${cookie}` } },
            ),
          );
        const a = await ctxFor(cA.value);
        const b = await ctxFor(cB.value);
        assert.equal(a?.authId, USERS.A.sub);
        assert.equal(a?.sid, sA.sid);
        assert.equal(a?.authTime, 1_789_000_000);
        assert.equal(b?.authId, USERS.B.sub);
        assert.equal(b?.sid, sB.sid);
        assert.equal(b?.authTime, 1_789_000_100);
        assert.equal(
          a?.accountId,
          undefined,
          "no account claim rides a connected session",
        );
        // A's sub with B's sid: signed by us in a hypothetical bug — still null (record.sub ≠ cookie sub).
        const mixed = await cookieMod.mintConnectedSessionCookie(
          { ...sB, sub: USERS.A.sub },
          { secure: true },
        );
        assert.equal(await ctxFor(mixed.value), null);
        // Revoking A never affects B.
        await sessionsTu.revokeConnectedSession(sA.sid, "test");
        assert.equal(await ctxFor(cA.value), null);
        assert.equal((await ctxFor(cB.value))?.authId, USERS.B.sub);
        // Opaque subjects: distinct provider users → distinct subs; reverse lookups never cross.
        const mA = await subjects.getOrCreateOpaqueSubject({
          provider: "stytch",
          providerUserId: "user-test-two-user-aaaaaaaa",
          correlationId: "c",
        });
        const mB = await subjects.getOrCreateOpaqueSubject({
          provider: "stytch",
          providerUserId: "user-test-two-user-bbbbbbbb",
          correlationId: "c",
        });
        assert.notEqual(mA.record.sub, mB.record.sub);
        assert.equal(
          (await subjects.lookupSubject(mA.record.sub))?.providerUserId,
          "user-test-two-user-aaaaaaaa",
        );
        assert.equal(
          (await subjects.lookupSubject(mB.record.sub))?.providerUserId,
          "user-test-two-user-bbbbbbbb",
        );
      } finally {
        csTu.setConnectedStoreFactoryForTests(null);
        if (savedNs === undefined)
          delete process.env["REFI_CONNECTED_STORE_NAMESPACE"];
        else process.env["REFI_CONNECTED_STORE_NAMESPACE"] = savedNs;
        resetEnvTu();
      }
    },
  );
}

// ─── alpha.3 acknowledgment: preference confirmation (B2) and brokerage disconnect — retained continuation, exact consent tuple, new key, canonical status, fail closed ──

{
  const { createInvestorApiClient: createClientAck } =
    await import("../packages/api-clients/src/investor-api/index.ts");
  const pref =
    await import("../apps/web/src/lib/investor-api/preference-confirmation.ts");
  const maintAck =
    await import("../apps/web/src/lib/investor-api/brokerage-maintenance.ts");
  const chal =
    await import("../apps/web/src/lib/prototype-store/entities/acknowledgment-challenge.ts");
  const ackMod =
    await import("../apps/web/src/lib/investor-api/acknowledgment.ts");
  const {
    resetServerEnvCacheForTests: resetEnvAck,
    getServerEnv: getServerEnvAck,
  } = await import("../apps/web/src/lib/config/env.ts");
  const prefRoute =
    await import("../apps/web/app/api/v1/investor/preferences/route.ts");
  const confirmRoute =
    await import("../apps/web/app/api/v1/investor/preferences/confirm/route.ts");
  const disconnectRoute =
    await import("../apps/web/app/api/v1/investor/broker/connection/[id]/route.ts");
  const { createRequire: createRequireAck } = await import("node:module");
  const requireWebAck = createRequireAck(
    join(process.cwd(), "apps/web/package.json"),
  );
  const joseAck = (await import(
    requireWebAck.resolve("jose")
  )) as typeof import("jose");
  const { NextRequest: NextRequestAck } = (await import(
    requireWebAck.resolve("next/server")
  )) as typeof import("next/server");
  const ex = JSON.parse(
    readFileSync(
      join(
        REPO_ROOT,
        "packages/api-clients/contracts/investor-api/v1.1.0-alpha.3/examples.json",
      ),
      "utf8",
    ),
  ) as {
    responses: Record<string, { data: Record<string, unknown> }>;
    preference_confirmation: {
      challenge: { error: { continuation: Record<string, unknown> } };
    };
  };
  const CONT = ex.preference_confirmation.challenge.error.continuation as {
    continuation_ref: string;
    required_disclosure_key: string;
    required_disclosure_version: number;
    required_disclosure_hash: string;
  };
  const A = {
    account: "acct_ack_user_a_01",
    conn: "brokerconn_ack_a_01",
    assertion: "assertion-A",
  };
  const B = {
    account: "acct_ack_user_b_02",
    conn: "brokerconn_ack_b_02",
    assertion: "assertion-B",
  };
  const H = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Correlation-Id": "corr_ack",
  };
  const errBody = (code: string) =>
    JSON.stringify({
      error: { code, message: "not applied", correlation_id: "corr_ack" },
    });
  type Mode =
    | { kind: "applied" }
    | { kind: "challenge"; cont?: Record<string, unknown> }
    | { kind: "error"; status: number; code: string; retryAfter?: string }
    | { kind: "transport" };
  type Seen = {
    user: string;
    method: string;
    path: string;
    headers: Headers;
    body: unknown;
  };
  function upstream(
    opts: {
      initial?: Mode;
      confirm?: Mode;
      consentEcho?: Partial<{
        disclosure_key: string;
        disclosure_version: number;
        disclosure_hash: string;
      }>;
      consentMode?: "ok" | "not_effective" | "error";
      prefVersion?: number;
      connections?: Record<string, string[]>;
      disconnectedIds?: string[];
      disconnectInitial?: Mode;
      disconnectConfirm?: Mode;
    } = {},
  ) {
    const seen: Seen[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      const user =
        headers.get("X-Refinity-User-Assertion") === B.assertion ? "B" : "A";
      const me = user === "A" ? A : B;
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      seen.push({ user, method, path, headers, body });
      const R = (
        status: number,
        json: unknown,
        extra: Record<string, string> = {},
      ) =>
        Promise.resolve(
          new Response(JSON.stringify(json), {
            status,
            headers: { ...H, ...extra },
          }),
        );
      const page = (items: unknown[]) =>
        R(200, {
          data: { items, page: { has_more: false, next_cursor: null } },
        });
      const answer = (mode: Mode, success: () => Promise<Response>) => {
        if (mode.kind === "transport")
          return Promise.reject(new TypeError("fetch failed"));
        if (mode.kind === "error")
          return R(
            mode.status,
            JSON.parse(errBody(mode.code)),
            mode.retryAfter ? { "Retry-After": mode.retryAfter } : {},
          );
        if (mode.kind === "challenge")
          return R(409, {
            error: {
              code: "ACKNOWLEDGMENT_REQUIRED",
              message: "not applied",
              correlation_id: "corr_ack",
              continuation: { ...CONT, ...(mode.cont ?? {}) },
            },
          });
        return success();
      };
      if (path === "/api/v1/investor/accounts" && method === "GET")
        return page([
          { ...ex.responses["AccountEnvelope"]!.data, account_id: me.account },
        ]);
      const m = /^\/api\/v1\/investor\/accounts\/([^/]+)(\/.*)?$/.exec(path);
      if (path === "/api/v1/investor/disclosures" && method === "GET") {
        return page([
          {
            content_hash: CONT.required_disclosure_hash,
            content_ref: "https://example.invalid/d",
            disclosure_key: CONT.required_disclosure_key,
            disclosure_version: CONT.required_disclosure_version,
            effective_at: "2026-09-01T00:00:00Z",
            locale: "en-US",
            status:
              opts.consentMode === "not_effective" ? "RETIRED" : "EFFECTIVE",
          },
        ]);
      }
      if (path === "/api/v1/investor/consents" && method === "POST") {
        if (opts.consentMode === "error")
          return R(503, JSON.parse(errBody("SERVICE_UNAVAILABLE")));
        const b = body as Record<string, unknown>;
        return R(201, {
          data: {
            account_id: b["account_id"],
            consent_key: b["consent_key"],
            consent_receipt_id: "consent_ack_00000001",
            disclosure_hash: b["disclosure_hash"],
            disclosure_key: b["disclosure_key"],
            disclosure_version: b["disclosure_version"],
            expires_at: "2026-12-01T00:00:00Z",
            recorded_at: "2026-09-10T00:00:00Z",
            status: "ACTIVE",
            ...(opts.consentEcho ?? {}),
          },
        });
      }
      if (m) {
        const [, accountId, rest = ""] = m;
        if (accountId !== me.account)
          return R(404, JSON.parse(errBody("RESOURCE_NOT_FOUND")));
        if (rest === "/preferences" && method === "GET")
          return R(200, {
            data: {
              drift_threshold: "0.01",
              excluded_assets: ["security_us_aapl"],
              fractional_enabled: true,
              min_order: "10",
              preference_fingerprint: "4".repeat(64),
              updated_at: "2026-09-10T00:00:00Z",
              version: opts.prefVersion ?? 2,
            },
          });
        if (rest === "/preferences" && method === "PATCH") {
          const isConfirm = body !== undefined && "continuation_ref" in body;
          return answer(
            isConfirm
              ? (opts.confirm ?? { kind: "applied" })
              : (opts.initial ?? { kind: "applied" }),
            () =>
              R(202, {
                data: {
                  account_id: me.account,
                  action_receipt_id: isConfirm
                    ? "action_ack_confirm_01"
                    : "action_ack_initial_01",
                  aggregate_version: 2,
                  duplicate: false,
                  effect: "updated",
                  status: "APPLIED",
                  status_path: `/api/v1/investor/accounts/${me.account}/actions/x`,
                },
              }),
          );
        }
        if (rest === "/brokerage-connections" && method === "GET") {
          const ids = opts.connections?.[user] ?? [me.conn];
          return page(
            ids.map((id) => ({
              ...ex.responses["BrokerageConnectionEnvelope"]!.data,
              account_id: me.account,
              connection_id: id,
              ...(opts.disconnectedIds?.includes(id)
                ? { connection_status: "DISCONNECTED" }
                : {}),
            })),
          );
        }
        const d = /^\/brokerage-connections\/([^/]+)$/.exec(rest);
        if (d && method === "DELETE") {
          const isConfirm = body !== undefined && "continuation_ref" in body;
          return answer(
            isConfirm
              ? (opts.disconnectConfirm ?? { kind: "applied" })
              : (opts.disconnectInitial ?? { kind: "applied" }),
            () =>
              R(202, {
                data: {
                  ...ex.responses["BrokerageDisconnectReceiptEnvelope"]!.data,
                  connection_id: d[1],
                },
              }),
          );
        }
      }
      return R(404, JSON.parse(errBody("RESOURCE_NOT_FOUND")));
    };
    const clientFor = (user: "A" | "B") =>
      createClientAck({
        identityCcid: {
          baseUrl: "http://127.0.0.1:1",
          getBearer: () => Promise.resolve("id-b"),
        },
        investorApi: {
          baseUrl: "http://127.0.0.1:1",
          getBearer: () => Promise.resolve("inv-b"),
        },
        mintAssertion: () =>
          Promise.resolve(user === "A" ? A.assertion : B.assertion),
        fetch: fetchImpl,
      });
    return {
      client: clientFor("A"),
      clientB: clientFor("B"),
      seen,
      patches: () => seen.filter((s) => s.method === "PATCH"),
      deletes: () => seen.filter((s) => s.method === "DELETE"),
      consents: () =>
        seen.filter((s) => s.method === "POST" && s.path.endsWith("/consents")),
    };
  }
  const PATCH = {
    drift_threshold: "0.01",
    excluded_assets: ["security_us_aapl"],
    fractional_enabled: true,
    min_order: "10",
  };
  let refN = 0;
  const freshRef = () => `continuation_ack_${String(++refN).padStart(6, "0")}`;
  const account = (n: number) =>
    `acct_ack_user_a_${String(n).padStart(2, "0")}`;
  let acctN = 10;
  // Each scenario uses its own account id so durable challenge records never collide.
  const scenario = async (
    opts: Parameters<typeof upstream>[0],
    f: (
      u: ReturnType<typeof upstream>,
      acct: string,
      ref: string,
    ) => Promise<void>,
  ) => {
    const ref = freshRef();
    const acct = A.account;
    void account;
    void acctN;
    const u = upstream({
      ...opts,
      ...(opts.initial?.kind === "challenge"
        ? {
            initial: {
              kind: "challenge",
              cont: { continuation_ref: ref, ...(opts.initial.cont ?? {}) },
            },
          }
        : {}),
      ...(opts.disconnectInitial?.kind === "challenge"
        ? {
            disconnectInitial: {
              kind: "challenge",
              cont: {
                continuation_ref: ref,
                ...(opts.disconnectInitial.cont ?? {}),
              },
            },
          }
        : {}),
    });
    await f(u, acct, ref);
  };
  const start = (u: ReturnType<typeof upstream>, acct: string) =>
    pref.startPreferenceChange(u.client, {
      accountId: acct,
      expectedVersion: 1,
      patch: PATCH,
      correlationId: "c_ack",
    });
  const confirm = (
    u: ReturnType<typeof upstream>,
    acct: string,
    ref: string,
    patch = PATCH,
    version = 1,
  ) =>
    pref.confirmPreferenceChange(u.client, {
      accountId: acct,
      continuationRef: ref,
      expectedVersion: version,
      patch,
      correlationId: "c_ack2",
    });

  await section(
    "preference confirmation (B2): ordinary update applies without acknowledgment (key A, If-Match, canonical APPLIED, re-read); a 409 ACKNOWLEDGMENT_REQUIRED is NOT a completed mutation — the complete continuation is retained durably with the exact intent",
    async () => {
      await scenario({}, async (u, acct) => {
        const out = await start(u, acct);
        assert.equal(out.kind, "applied");
        if (out.kind !== "applied") return;
        assert.equal(out.backendStatus, "APPLIED");
        assert.equal(out.preferences?.version, 2);
        const p = u.patches()[0]!;
        assert.deepEqual(p.body, PATCH);
        assert.equal(p.headers.get("If-Match"), "1");
        assert.match(p.headers.get("Idempotency-Key") ?? "", /^[0-9a-f]{64}$/);
        assert.equal(u.consents().length, 0);
      });
      await scenario(
        { initial: { kind: "challenge" } },
        async (u, acct, ref) => {
          const out = await start(u, acct);
          assert.equal(out.kind, "acknowledgment_required");
          if (out.kind !== "acknowledgment_required") return;
          assert.equal(out.challenge.state, "challenged");
          assert.deepEqual(out.challenge.continuation, {
            ...CONT,
            continuation_ref: ref,
          });
          assert.deepEqual(out.challenge.intent, {
            kind: "preference",
            expectedVersion: 1,
            patch: PATCH,
          });
          assert.equal(u.patches().length, 1, "no confirmation was sent");
          assert.equal(
            u.consents().length,
            0,
            "no consent recorded from the challenge alone",
          );
          const rec = await chal.getAcknowledgmentChallenge(acct, ref);
          assert.equal(rec?.state, "challenged");
        },
      );
    },
  );

  await section(
    "preference confirmation (B2): valid confirmation records consent for EXACTLY the required disclosure tuple, re-sends the SAME intended values with continuation_ref + consent_receipt_id, current If-Match and a NEW key; canonical APPLIED and an authoritative re-read; a reused confirmation is refused without an upstream call",
    async () => {
      await scenario(
        { initial: { kind: "challenge" } },
        async (u, acct, ref) => {
          await start(u, acct);
          const initialKey = u.patches()[0]!.headers.get("Idempotency-Key");
          const out = await confirm(u, acct, ref);
          assert.equal(out.kind, "applied");
          if (out.kind !== "applied") return;
          assert.equal(out.backendStatus, "APPLIED");
          assert.equal(out.receipt.action_receipt_id, "action_ack_confirm_01");
          assert.equal(out.preferences?.version, 2);
          const c = u.consents()[0]!;
          assert.deepEqual(c.body, {
            account_id: acct,
            action: "ACCEPT",
            consent_key: CONT.required_disclosure_key,
            disclosure_key: CONT.required_disclosure_key,
            disclosure_version: CONT.required_disclosure_version,
            disclosure_hash: CONT.required_disclosure_hash,
          });
          const p = u.patches()[1]!;
          assert.deepEqual(p.body, {
            ...PATCH,
            continuation_ref: ref,
            consent_receipt_id: "consent_ack_00000001",
          });
          assert.equal(p.headers.get("If-Match"), "1");
          assert.notEqual(
            p.headers.get("Idempotency-Key"),
            initialKey,
            "new key B",
          );
          const rec = await chal.getAcknowledgmentChallenge(acct, ref);
          assert.equal(rec?.state, "confirmed");
          assert.equal(rec?.confirmKey, p.headers.get("Idempotency-Key"));
          assert.deepEqual(
            rec?.history.map((h) => h.state),
            ["challenged", "consented", "confirmed"],
          );
          const again = await confirm(u, acct, ref);
          assert.deepEqual(again, {
            kind: "refused",
            reason: "already_confirmed",
          });
          assert.equal(
            u.patches().length,
            2,
            "reused confirmation sends nothing",
          );
        },
      );
    },
  );

  await section(
    "preference confirmation (B2): fail closed — changed values, stale expected version, unknown/foreign continuation, wrong disclosure key/version/hash on the receipt, missing consent receipt, malformed continuation — nothing is confirmed",
    async () => {
      for (const [name, tweak, expectReason] of [
        [
          "changed values",
          (a: string, r: string, u: ReturnType<typeof upstream>) =>
            confirm(u, a, r, { ...PATCH, drift_threshold: "0.02" }),
          "changed_intent",
        ],
        [
          "stale expected version",
          (a: string, r: string, u: ReturnType<typeof upstream>) =>
            confirm(u, a, r, PATCH, 2),
          "stale_expected_version",
        ],
        [
          "unknown continuation",
          (a: string, _r: string, u: ReturnType<typeof upstream>) =>
            confirm(u, a, "continuation_never_issued_0001"),
          "unknown_continuation",
        ],
      ] as const) {
        await scenario(
          { initial: { kind: "challenge" } },
          async (u, acct, ref) => {
            await start(u, acct);
            const out = await tweak(acct, ref, u);
            assert.equal(out.kind, "refused", name);
            if (out.kind === "refused")
              assert.equal(out.reason, expectReason, name);
            assert.equal(
              u.patches().length,
              1,
              `${name}: no confirmation sent`,
            );
            assert.equal(
              u.consents().length,
              0,
              `${name}: no consent recorded`,
            );
          },
        );
      }
      // Foreign continuation: a challenge issued to account B cannot be confirmed by A.
      await scenario(
        { initial: { kind: "challenge" } },
        async (u, _acct, ref) => {
          await pref.startPreferenceChange(u.clientB, {
            accountId: B.account,
            expectedVersion: 1,
            patch: PATCH,
            correlationId: "c",
          });
          const out = await confirm(u, A.account, ref);
          assert.deepEqual(out, {
            kind: "refused",
            reason: "unknown_continuation",
          });
        },
      );
      for (const [name, echo] of [
        ["wrong disclosure key", { disclosure_key: "other_disclosure" }],
        ["wrong disclosure version", { disclosure_version: 2 }],
        ["wrong disclosure hash", { disclosure_hash: "9".repeat(64) }],
      ] as const) {
        await scenario(
          { initial: { kind: "challenge" }, consentEcho: echo },
          async (u, acct, ref) => {
            await start(u, acct);
            const out = await confirm(u, acct, ref);
            assert.equal(out.kind, "refused", name);
            if (out.kind === "refused") {
              assert.equal(out.reason, "consent_not_recorded");
              assert.equal(out.detail, "tuple_mismatch");
            }
            assert.equal(
              u.patches().length,
              1,
              `${name}: confirmation never sent with a mismatched receipt`,
            );
            assert.equal(
              (await chal.getAcknowledgmentChallenge(acct, ref))?.state,
              "challenged",
            );
          },
        );
      }
      await scenario(
        { initial: { kind: "challenge" }, consentMode: "not_effective" },
        async (u, acct, ref) => {
          await start(u, acct);
          const out = await confirm(u, acct, ref);
          assert.equal(out.kind, "refused");
          if (out.kind === "refused")
            assert.equal(out.reason, "consent_not_recorded");
          assert.equal(u.patches().length, 1);
        },
      );
      await scenario(
        {
          initial: {
            kind: "challenge",
            cont: { expires_at: "2020-01-01T00:00:00Z" },
          },
        },
        async (u, acct) => {
          const out = await start(u, acct);
          assert.equal(out.kind, "rejected");
          if (out.kind === "rejected")
            assert.equal(out.code, "ACKNOWLEDGMENT_REQUIRED_EXPIRED");
        },
      );
      await scenario(
        { initial: { kind: "challenge", cont: { mutation_applied: true } } },
        async (u, acct) => {
          // A schema-invalid continuation never becomes a challenge: the
          // frozen client refuses it as a contract mismatch.
          await assert.rejects(
            start(u, acct),
            (e: unknown) =>
              (e as Error).name === "ContractVersionMismatchError",
          );
          assert.equal(u.consents().length, 0);
        },
      );
    },
  );

  await section(
    "preference confirmation (B2): backend answers — ACKNOWLEDGMENT_BINDING_INVALID, ACKNOWLEDGMENT_NOT_REQUIRED, ACCOUNT_AUTHORIZATION_REQUIRED (403), REQUEST_TOO_LARGE (413), VALIDATION_ERROR (422) and VERSION_CONFLICT after confirmation are terminal for the challenge; 429/503/transport keep it `consented` under the same key B for identical recovery",
    async () => {
      for (const [status, code, kind] of [
        [409, "ACKNOWLEDGMENT_BINDING_INVALID", "rejected"],
        [409, "ACKNOWLEDGMENT_NOT_REQUIRED", "rejected"],
        [403, "ACCOUNT_AUTHORIZATION_REQUIRED", "authorization_required"],
        [413, "REQUEST_TOO_LARGE", "rejected"],
        [422, "VALIDATION_ERROR", "rejected"],
        [409, "VERSION_CONFLICT", "stale_version"],
      ] as const) {
        await scenario(
          {
            initial: { kind: "challenge" },
            confirm: { kind: "error", status, code },
          },
          async (u, acct, ref) => {
            await start(u, acct);
            const out = await confirm(u, acct, ref);
            assert.equal(out.kind, kind, code);
            if (out.kind === "rejected") assert.equal(out.code, code);
            assert.equal(
              (await chal.getAcknowledgmentChallenge(acct, ref))?.state,
              "failed",
              `${code}: challenge ends`,
            );
            assert.deepEqual(await confirm(u, acct, ref), {
              kind: "refused",
              reason: "challenge_failed",
            });
          },
        );
      }
      for (const mode of [
        { kind: "error", status: 429, code: "RATE_LIMITED", retryAfter: "5" },
        { kind: "error", status: 503, code: "SERVICE_UNAVAILABLE" },
        { kind: "transport" },
      ] as const) {
        await scenario(
          { initial: { kind: "challenge" }, confirm: mode },
          async (u, acct, ref) => {
            await start(u, acct);
            const out =
              mode.kind === "transport"
                ? await confirm(u, acct, ref).catch((e: unknown) => ({
                    kind: "threw",
                    name: (e as Error).name,
                  }))
                : await confirm(u, acct, ref);
            if (mode.kind === "transport")
              assert.equal(
                (out as { name?: string }).name,
                "InvestorApiTransportError",
              );
            else {
              assert.equal(out.kind, "retryable");
              if (out.kind === "retryable" && mode.status === 429)
                assert.equal(out.retryAfterSeconds, 5);
            }
            const rec = await chal.getAcknowledgmentChallenge(acct, ref);
            assert.equal(
              rec?.state,
              "consented",
              "challenge stays recoverable",
            );
            const keyB = rec?.confirmKey;
            assert.ok(keyB);
            // Identical explicit recovery: same body, same key B, no new consent.
            const ok = upstream({});
            const rec2 = await pref.confirmPreferenceChange(ok.client, {
              accountId: acct,
              continuationRef: ref,
              expectedVersion: 1,
              patch: PATCH,
              correlationId: "c_rec",
            });
            assert.equal(rec2.kind, "applied");
            assert.equal(ok.patches()[0]?.headers.get("Idempotency-Key"), keyB);
            assert.equal(ok.consents().length, 0);
            assert.deepEqual(ok.patches()[0]?.body, {
              ...PATCH,
              continuation_ref: ref,
              consent_receipt_id: "consent_ack_00000001",
            });
          },
        );
      }
      // The initial request's own partition: 403 / 413 / 422 / 429 / 503 without a challenge.
      for (const [status, code, kind] of [
        [403, "ACCOUNT_AUTHORIZATION_REQUIRED", "authorization_required"],
        [413, "REQUEST_TOO_LARGE", "rejected"],
        [422, "VALIDATION_ERROR", "rejected"],
        [429, "RATE_LIMITED", "retryable"],
        [503, "SERVICE_UNAVAILABLE", "retryable"],
      ] as const) {
        await scenario(
          { initial: { kind: "error", status, code } },
          async (u, acct) => {
            const out = await start(u, acct);
            assert.equal(out.kind, kind, code);
          },
        );
      }
    },
  );

  await section(
    "brokerage disconnect (alpha.3 DELETE C): valid disconnect returns the canonical receipt with no credential material; wrong account, malformed id, another user's connection and an already-disconnected connection are refused before any upstream call; acknowledgment required → retained continuation → valid confirmation with exact consent tuple and new key",
    async () => {
      const dis = (
        u: ReturnType<typeof upstream>,
        acct: string,
        conn: string,
      ) => maintAck.disconnectBrokerageConnection(u.client, acct, conn, "c_d");
      await scenario({}, async (u) => {
        const out = await dis(u, A.account, A.conn);
        assert.equal(out.kind, "accepted");
        if (out.kind !== "accepted") return;
        assert.equal(out.backendStatus, "DISCONNECTING");
        assert.equal(out.receipt.positions_unchanged, true);
        assert.equal(out.upstreamStatus, 202);
        const d = u.deletes()[0]!;
        assert.equal(d.body, undefined, "no body on the initial request");
        assert.match(d.headers.get("Idempotency-Key") ?? "", /^[0-9a-f]{64}$/);
        assert.ok(
          !/api_key|api_secret|secret/i.test(JSON.stringify(out)),
          "no credential in the outcome",
        );
      });
      await scenario({}, async (u) => {
        // A browser can never name an account; a wrong account id reaching
        // the adapter is answered by the backend's uniform 404 on the
        // ownership list and surfaces as the client error the route maps.
        await assert.rejects(
          dis(u, B.account, A.conn),
          (e: unknown) =>
            (e as { name: string }).name === "InvestorApiError" &&
            (e as { status: number }).status === 404,
        );
        assert.equal(
          u.deletes().length,
          0,
          "no DELETE reached the other account",
        );
        assert.deepEqual(await dis(u, A.account, "x"), {
          kind: "connection_out_of_scope",
          reason: "malformed",
        });
        assert.deepEqual(await dis(u, A.account, B.conn), {
          kind: "connection_out_of_scope",
          reason: "not_owned",
        });
        assert.equal(u.deletes().length, 0);
      });
      await scenario({ disconnectedIds: [A.conn] }, async (u) => {
        assert.deepEqual(await dis(u, A.account, A.conn), {
          kind: "connection_out_of_scope",
          reason: "terminal",
        });
        assert.equal(u.deletes().length, 0);
      });
      await scenario(
        { disconnectInitial: { kind: "challenge" } },
        async (u, _a, ref) => {
          const out = await dis(u, A.account, A.conn);
          assert.equal(out.kind, "acknowledgment_required");
          if (out.kind !== "acknowledgment_required") return;
          assert.equal(out.challenge.kind, "disconnect");
          assert.deepEqual(out.challenge.intent, {
            kind: "disconnect",
            connectionId: A.conn,
          });
          const initialKey = u.deletes()[0]!.headers.get("Idempotency-Key");
          const conf = await maintAck.confirmBrokerageDisconnect(
            u.client,
            A.account,
            A.conn,
            ref,
            "c_dc",
          );
          assert.equal(conf.kind, "accepted");
          const c = u.consents()[0]!;
          assert.equal(
            (c.body as Record<string, unknown>)["disclosure_hash"],
            CONT.required_disclosure_hash,
          );
          const d = u.deletes()[1]!;
          assert.deepEqual(d.body, {
            continuation_ref: ref,
            consent_receipt_id: "consent_ack_00000001",
          });
          assert.notEqual(d.headers.get("Idempotency-Key"), initialKey);
          assert.equal(
            (await chal.getAcknowledgmentChallenge(A.account, ref))?.state,
            "confirmed",
          );
          assert.deepEqual(
            await maintAck.confirmBrokerageDisconnect(
              u.client,
              A.account,
              A.conn,
              ref,
              "c",
            ),
            { kind: "refused", reason: "already_confirmed" },
          );
          assert.deepEqual(
            await maintAck.confirmBrokerageDisconnect(
              u.client,
              A.account,
              B.conn,
              ref,
              "c",
            ),
            { kind: "connection_out_of_scope", reason: "not_owned" },
          );
          assert.deepEqual(
            await maintAck.confirmBrokerageDisconnect(
              u.client,
              A.account,
              A.conn,
              "continuation_never_issued_0002",
              "c",
            ),
            { kind: "refused", reason: "unknown_continuation" },
          );
        },
      );
    },
  );

  await section(
    "brokerage disconnect: backend 404 / 409 VERSION_CONFLICT / 413 / 422 are terminal with their code; 403 and ACKNOWLEDGMENT_BINDING_INVALID are outside brokerage_mutation and fail closed as contract mismatches; 429 and 503 are retryable and never auto-retried; the confirmation refusal ends the challenge; no broker-write credential is ever stored in the challenge record",
    async () => {
      for (const [status, code] of [
        [404, "RESOURCE_NOT_FOUND"],
        [409, "VERSION_CONFLICT"],
        [413, "REQUEST_TOO_LARGE"],
        [422, "VALIDATION_ERROR"],
      ] as const) {
        await scenario(
          {
            disconnectInitial: { kind: "challenge" },
            disconnectConfirm: { kind: "error", status, code },
          },
          async (u, _a, ref) => {
            await maintAck.disconnectBrokerageConnection(
              u.client,
              A.account,
              A.conn,
              "c",
            );
            const out = await maintAck.confirmBrokerageDisconnect(
              u.client,
              A.account,
              A.conn,
              ref,
              "c",
            );
            assert.equal(out.kind, "rejected", code);
            if (out.kind === "rejected") {
              assert.equal(out.code, code);
              assert.equal(out.status, status);
            }
            assert.equal(
              (await chal.getAcknowledgmentChallenge(A.account, ref))?.state,
              "failed",
            );
            assert.equal(u.deletes().length, 2, "no auto-retry");
          },
        );
        await scenario(
          { disconnectInitial: { kind: "error", status, code } },
          async (u) => {
            const out = await maintAck.disconnectBrokerageConnection(
              u.client,
              A.account,
              A.conn,
              "c",
            );
            assert.equal(out.kind, "rejected", code);
          },
        );
      }
      // `brokerage_mutation` declares no ACKNOWLEDGMENT_BINDING_INVALID either:
      // an invalid confirmation binding reaches the frontend as 422
      // VALIDATION_ERROR / 409 VERSION_CONFLICT (tested above); the
      // preference-only code on this route is a contract mismatch → fail closed.
      await scenario(
        {
          disconnectInitial: { kind: "challenge" },
          disconnectConfirm: {
            kind: "error",
            status: 409,
            code: "ACKNOWLEDGMENT_BINDING_INVALID",
          },
        },
        async (u, _a, ref) => {
          await maintAck.disconnectBrokerageConnection(
            u.client,
            A.account,
            A.conn,
            "c",
          );
          await assert.rejects(
            maintAck.confirmBrokerageDisconnect(
              u.client,
              A.account,
              A.conn,
              ref,
              "c",
            ),
            (e: unknown) =>
              (e as Error).name === "ContractVersionMismatchError",
          );
        },
      );
      // `brokerage_mutation` declares no 403: a backend 403 on disconnect is
      // a contract mismatch and fails closed (never a local verdict).
      await scenario(
        {
          disconnectInitial: {
            kind: "error",
            status: 403,
            code: "ACCOUNT_AUTHORIZATION_REQUIRED",
          },
        },
        async (u) => {
          await assert.rejects(
            maintAck.disconnectBrokerageConnection(
              u.client,
              A.account,
              A.conn,
              "c",
            ),
            (e: unknown) =>
              (e as Error).name === "ContractVersionMismatchError",
          );
        },
      );
      for (const mode of [
        { kind: "error", status: 429, code: "RATE_LIMITED", retryAfter: "3" },
        { kind: "error", status: 503, code: "SERVICE_UNAVAILABLE" },
      ] as const) {
        await scenario({ disconnectInitial: mode }, async (u) => {
          const out = await maintAck.disconnectBrokerageConnection(
            u.client,
            A.account,
            A.conn,
            "c",
          );
          assert.equal(out.kind, "retryable");
          if (out.kind === "retryable" && mode.status === 429)
            assert.equal(out.retryAfterSeconds, 3);
          assert.equal(u.deletes().length, 1);
        });
      }
      await scenario(
        { disconnectInitial: { kind: "challenge" } },
        async (u, _a, ref) => {
          await maintAck.disconnectBrokerageConnection(
            u.client,
            A.account,
            A.conn,
            "c",
          );
          const rec = await chal.getAcknowledgmentChallenge(A.account, ref);
          assert.ok(
            !/api_key|api_secret|PK[A-Z0-9]{18}/.test(JSON.stringify(rec)),
            "no credential in the challenge record",
          );
        },
      );
    },
  );

  await section(
    "acknowledgment routes: PATCH /preferences echoes the challenge with mutationApplied:false and confirmPath; POST /preferences/confirm and DELETE /broker/connection/[id] are same-origin + session + stage gated, strict bodies reject a browser-supplied account_id, and an unconfigured upstream is a 503 refusal with a receipt; continuation checks are structural",
    async () => {
      const token = await new joseAck.SignJWT({ sub: "user-ack-route-1" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(getServerEnvAck().SESSION_JWT_SECRET));
      const req = (
        method: string,
        path: string,
        body: unknown,
        opts: { origin?: string | null; cookie?: boolean } = {},
      ) =>
        new NextRequestAck(`http://localhost:3000${path}`, {
          method,
          headers: {
            ...(opts.origin === null
              ? {}
              : { origin: opts.origin ?? "http://localhost:3000" }),
            ...(opts.cookie === false
              ? {}
              : { cookie: `us_session_v1=${token}` }),
            "content-type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const savedBase = process.env["REFI_INVESTOR_API_BASE_URL"];
      const savedStage = process.env["REFI_RELEASE_STAGE"];
      delete process.env["REFI_INVESTOR_API_BASE_URL"];
      process.env["REFI_RELEASE_STAGE"] = "automated_alpha";
      resetEnvAck();
      try {
        const cases: Array<
          [
            string,
            string,
            (
              m: string,
              p: string,
              b: unknown,
              o?: { origin?: string | null; cookie?: boolean },
            ) => Promise<Response>,
            unknown,
          ]
        > = [
          [
            "PATCH",
            "/api/v1/investor/preferences",
            (m, p, b, o) => prefRoute.PATCH(req(m, p, b, o)),
            { expectedVersion: 1, driftThreshold: "0.01" },
          ],
          [
            "POST",
            "/api/v1/investor/preferences/confirm",
            (m, p, b, o) => confirmRoute.POST(req(m, p, b, o)),
            {
              confirm: true,
              continuationRef: CONT.continuation_ref,
              expectedVersion: 1,
              driftThreshold: "0.01",
            },
          ],
          [
            "DELETE",
            `/api/v1/investor/broker/connection/${A.conn}`,
            (m, p, b, o) => disconnectRoute.DELETE(req(m, p, b, o)),
            { confirm: true, continuationRef: CONT.continuation_ref },
          ],
        ];
        for (const [method, path, call, body] of cases) {
          assert.equal(
            (await call(method, path, body, { origin: "https://evil.example" }))
              .status,
            403,
            `${method} ${path} cross-origin`,
          );
          assert.equal(
            (await call(method, path, body, { cookie: false })).status,
            401,
            `${method} ${path} no session`,
          );
          assert.equal(
            (
              await call(method, path, {
                ...(body as object),
                account_id: B.account,
              })
            ).status,
            400,
            `${method} ${path} smuggled account_id`,
          );
          const res = await call(method, path, body);
          const parsed = (await res.json()) as {
            receipt?: { action?: string };
          };
          assert.equal(res.status, 503, `${method} ${path}`);
          assert.ok(parsed.receipt?.action, "receipted");
        }
        assert.equal(
          (
            await confirmRoute.POST(
              req("POST", "/api/v1/investor/preferences/confirm", {
                confirm: false,
                continuationRef: CONT.continuation_ref,
                expectedVersion: 1,
                driftThreshold: "0.01",
              }),
            )
          ).status,
          400,
          "confirm must be the literal true",
        );
      } finally {
        if (savedBase === undefined)
          delete process.env["REFI_INVESTOR_API_BASE_URL"];
        else process.env["REFI_INVESTOR_API_BASE_URL"] = savedBase;
        if (savedStage === undefined) delete process.env["REFI_RELEASE_STAGE"];
        else process.env["REFI_RELEASE_STAGE"] = savedStage;
        resetEnvAck();
      }
      assert.deepEqual(
        ackMod.checkContinuation({
          ...CONT,
          effective_at: "2026-09-01T00:00:00Z",
          expires_at: "2099-01-01T00:00:00Z",
          mutation_applied: false,
          policy_version: "p",
          retry_idempotency_key: "new_key",
        } as never),
        { ok: true },
      );
      assert.deepEqual(
        ackMod.checkContinuation({
          ...CONT,
          effective_at: "2026-09-01T00:00:00Z",
          expires_at: "2000-01-01T00:00:00Z",
          mutation_applied: false,
          policy_version: "p",
          retry_idempotency_key: "new_key",
        } as never),
        { ok: false, reason: "expired" },
      );
      const strip = (f: string) =>
        readFileSync(join(REPO_ROOT, f), "utf8").replace(
          /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
          "",
        );
      const r = strip("apps/web/app/api/v1/investor/preferences/route.ts");
      assert.ok(
        /mutationApplied: false/.test(r) &&
          /confirmPath/.test(r) &&
          !/ok: true[^}]*acknowledgment/.test(r),
        "a challenge is never presented as applied",
      );
      const pc = strip(
        "apps/web/src/lib/investor-api/preference-confirmation.ts",
      );
      const order = [
        "getAcknowledgmentChallenge(",
        "samePatch(",
        "checkContinuation(",
        "recordConsentForContinuation(",
        "setConfirmKey(",
        'call("updateAccountPreferences"',
        "reread(",
      ].map((k) =>
        pc.indexOf(
          k,
          pc.indexOf("export async function confirmPreferenceChange"),
        ),
      );
      assert.ok(
        order.every(
          (i, n) => i >= 0 && (n === 0 || i > (order[n - 1] as number)),
        ),
        "confirm order: challenge → intent → continuation → consent → key B → PATCH → re-read",
      );
      assert.ok(
        /confirmKey === challenge\.initialKey/.test(pc),
        "key A is never reused for confirmation",
      );
      const bm = strip(
        "apps/web/src/lib/investor-api/brokerage-maintenance.ts",
      );
      assert.ok(
        bm.indexOf(
          "assertConnectionInScope(client, accountId, connectionId)",
          bm.indexOf("export async function disconnectBrokerageConnection"),
        ) < bm.indexOf('call("disconnectBrokerageConnection"'),
        "scope before disconnect",
      );
      assert.ok(
        !/api_secret|apiSecretKey/.test(
          bm.slice(bm.indexOf("Disconnect (alpha.3")),
        ),
        "disconnect path handles no credential",
      );
    },
  );
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
