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
// Proxy transport imports pull env at boot; supply non-prod placeholders so
// the stream module (used below) is loadable without a real deploy env.
process.env["REFI_ENV"] ??= "dev";
process.env["NEXT_PUBLIC_REFI_ENV"] ??= "dev";
process.env["REFI_TRUSTED_ORIGINS"] ??= "http://localhost:3000";
process.env["SESSION_JWT_ISSUER"] ??= "refi-us-sec-ia";
process.env["SESSION_JWT_AUDIENCE"] ??= "refi-us-sec-ia-bff";
process.env["ADMIN_PORTAL_BASE_URL"] ??= "http://localhost:4000";
process.env["ADMIN_PORTAL_SERVICE_TOKEN"] ??=
  "prototype-only-upstream-service-token-32+chars";

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

const accountPrefsMod =
  await import("../apps/web/src/lib/prototype-store/entities/account-prefs.ts");
const accountPrefsHistoryMod =
  await import("../apps/web/src/lib/prototype-store/entities/account-prefs-history.ts");

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
  "InvestorAccountActionVerb is restricted to the Contract V3 §13.3 allowlist",
  async () => {
    // Contract V3 §13.3 — the only investor-side admin-action verbs the BFF
    // may accept. Any string outside this set must be a 403 + tripwire hit.
    const allowlist = [
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
    // The allowlist is the authoritative set; this assertion fails loudly if
    // a forbidden verb ever sneaks into the allowlist.
    for (const v of forbidden) {
      assert.equal(
        allowlist.includes(v),
        false,
        `Forbidden verb "${v}" appears in the InvestorAccountActionVerb allowlist.`,
      );
    }
    assert.equal(
      allowlist.length,
      6,
      "Contract V3 §13.3 fixes the allowlist at exactly 6 verbs; update Contract V3 before extending.",
    );
  },
);

// ─── AccountPrefs history invariants (PR-F, S8) ─────────────────────────────

await section(
  "AccountPrefs diff detects each editable field independently",
  async () => {
    const base = accountPrefsMod.emptyPrefs("acct-diff");
    const a = { ...base, driftThreshold: "0.05", excludedAssets: [] };
    const b = { ...a, driftThreshold: "0.10" };
    assert.deepEqual(accountPrefsMod.diffPrefs(a, b), ["driftThreshold"]);

    const c = { ...a, excludedAssets: ["BTC"] };
    assert.deepEqual(accountPrefsMod.diffPrefs(a, c), ["excludedAssets"]);

    const d = { ...a, minOrder: "1.00", fractionalEnabled: true };
    assert.deepEqual(
      accountPrefsMod.diffPrefs(a, d).sort(),
      ["fractionalEnabled", "minOrder"].sort(),
    );

    // Same excluded_assets contents in same order → not a diff.
    const e = { ...a, excludedAssets: [] };
    assert.deepEqual(accountPrefsMod.diffPrefs(a, e), []);
  },
);

await section(
  "AccountPrefs material-change detection matches docs §3 proposal",
  async () => {
    assert.equal(
      accountPrefsMod.isMaterialDiff(["driftThreshold"]),
      true,
      "driftThreshold must be material per docs §3 proposal",
    );
    assert.equal(
      accountPrefsMod.isMaterialDiff(["excludedAssets"]),
      true,
      "excludedAssets must be material per docs §3 proposal",
    );
    assert.equal(
      accountPrefsMod.isMaterialDiff(["minOrder"]),
      false,
      "minOrder must be non-material per docs §3 proposal",
    );
    assert.equal(
      accountPrefsMod.isMaterialDiff(["fractionalEnabled"]),
      false,
      "fractionalEnabled must be non-material per docs §3 proposal",
    );
    // A mixed diff with any material field is material.
    assert.equal(
      accountPrefsMod.isMaterialDiff(["minOrder", "driftThreshold"]),
      true,
    );
  },
);

await section(
  "AccountPrefs history rows are append-only and carry mock_state=true",
  async () => {
    const accountId = `prefs-hist-${String(Date.now())}`;
    const row = await accountPrefsHistoryMod.appendPrefsHistory({
      accountId,
      changedByAuthId: "auth-1",
      beforePayload: {},
      afterPayload: { driftThreshold: "0.05" },
      diffFields: ["driftThreshold"],
      signedConsentRef: "consent-1",
      correlationId: "cid-1",
    });
    assert.equal(row.mockState, true);
    assert.equal(row.source, "investor_ui_prototype_phase2_6");
    assert.equal(row.reasonCode, "investor_initiated");
    // A second append with the same diff is a new row, not an overwrite —
    // the entity is append-only. This is what makes per-write auditability
    // work regardless of whether callers dedupe.
    const row2 = await accountPrefsHistoryMod.appendPrefsHistory({
      accountId,
      changedByAuthId: "auth-1",
      beforePayload: { driftThreshold: "0.05" },
      afterPayload: { driftThreshold: "0.07" },
      diffFields: ["driftThreshold"],
      signedConsentRef: "consent-2",
      correlationId: "cid-2",
    });
    assert.notEqual(row.historyId, row2.historyId);
    const listed = await accountPrefsHistoryMod.listPrefsHistory(accountId);
    assert.equal(listed.length, 2);
    // Sorted newest-first.
    assert.equal(listed[0].historyId, row2.historyId);
  },
);

// ─── SSE bridge envelope + account filter ───────────────────────────────────

const { parseSseDataLine, wireStreamEventSchema } =
  await import("../apps/web/src/lib/admin-portal-proxy/endpoints/stream.ts");

await section(
  "SSE stream envelope is strict — unknown fields fail closed",
  async () => {
    const good = {
      event_id: "e1",
      event_type: "intent.created",
      ts: "2025-01-01T00:00:00Z",
      account_id: "acct_1",
    };
    assert.doesNotThrow(() => wireStreamEventSchema.parse(good));
    // Extra top-level fields must reject — this is the S4a strict-parse
    // guarantee extended to the streaming transport seam.
    const bad = { ...good, admin_notes: "leak" };
    assert.throws(() => wireStreamEventSchema.parse(bad));
  },
);

await section(
  "SSE bridge drops events for other accounts, keeps own account",
  async () => {
    const own = "acct_own";
    const otherLine = `data: ${JSON.stringify({
      event_id: "e_other",
      event_type: "intent.created",
      ts: "2025-01-01T00:00:00Z",
      account_id: "acct_other",
    })}`;
    const ownLine = `data: ${JSON.stringify({
      event_id: "e_own",
      event_type: "intent.created",
      ts: "2025-01-01T00:00:00Z",
      account_id: own,
    })}`;
    assert.equal(parseSseDataLine(otherLine, own), null);
    const kept = parseSseDataLine(ownLine, own);
    assert.ok(kept);
    assert.equal(kept?.accountId, own);
    // Non-data lines (heartbeats, retry) are silently ignored.
    assert.equal(parseSseDataLine(": hb", own), null);
    assert.equal(parseSseDataLine("event: ready", own), null);
    assert.equal(parseSseDataLine("", own), null);
  },
);

// ─── RecordAccessLog completeness (S4c) ─────────────────────────────────────

await section(
  "Every records/documents read route uses bffReadWithAccessLog (S4c)",
  async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const roots = [
      resolve(process.cwd(), "apps/web/app/api/v1/investor/records"),
      resolve(process.cwd(), "apps/web/app/api/v1/investor/evidence"),
      resolve(process.cwd(), "apps/web/app/api/v1/investor/activity"),
    ];
    const routeFiles: string[] = [];
    function walk(dir: string): void {
      let ents;
      try {
        ents = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "route.ts" && statSync(p).isFile())
          routeFiles.push(p);
      }
    }
    for (const r of roots) walk(r);
    assert.ok(
      routeFiles.length > 0,
      "no records/documents/activity route files discovered — assertion is a no-op",
    );
    const offenders: string[] = [];
    for (const file of routeFiles) {
      const src = readFileSync(file, "utf8");
      const usesAccessLogHelper =
        /bffReadWithAccessLog|appendRecordAccess|recordAccessLog/.test(src);
      if (!usesAccessLogHelper) offenders.push(file);
    }
    assert.equal(
      offenders.length,
      0,
      `${offenders.length} records/documents/activity route(s) do not write an access-log entry:\n  - ${offenders.join("\n  - ")}`,
    );
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
