/**
 * Investor Profile v2 → ComplianceProfileAttestationRequest mapping — the
 * evidence ledger in docs/releases/2026-09-signal/c1b2-browser-direct-
 * reclassification.md, mechanically enforced. Table-driven; every built
 * request is validated against Daniel's closed schema (v1.1.0-alpha.2).
 *
 * Code under test (imported from apps/web — same cross-package pattern as
 * investor-profile-invariants.test.ts):
 *   - apps/web/src/lib/compliance/attestation-mapping.ts
 * Nothing here submits anything: the module has no I/O.
 */
import { afterAll, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { problemsAgainst } from "../investor-api/validation";
import type { InvestorProfileAnswers } from "../../../../apps/web/src/lib/sec203a/investor-profile";
import {
  ASSESSMENT_POLICY_VERSION,
  assessInvestorProfile,
} from "../../../../apps/web/src/lib/sec203a/investor-profile-engine";
import { stableSerialize } from "../../../../apps/web/src/lib/sec203a/canonical-json";
import {
  ATTESTATION_BLOCK_REASONS,
  ATTESTATION_MAPPING_VERSION,
  ATTESTATION_SCHEMA_VERSION,
  buildComplianceProfileAttestationRequest,
  deriveAttestationId,
  deriveInvestorProfileStatus,
  deriveRiskBandLabel,
  deriveTradingEligibility,
  isProductionKycEvidence,
  RISK_BAND_NOT_PERSONALIZED,
  type AttestationEvidenceInput,
} from "../../../../apps/web/src/lib/compliance/attestation-mapping";
import type { AttestationKyc } from "../../../../apps/web/src/lib/kyc/provider";

const STORE_DIR = mkdtempSync(join(tmpdir(), "refi-attestation-mapping-"));
process.env["REFI_PROTOTYPE_STORE_DIR"] = STORE_DIR;
afterAll(() => {
  rmSync(STORE_DIR, { recursive: true, force: true });
});
const { answersSnapshotHash } =
  await import("../../../../apps/web/src/lib/prototype-store/entities/investor-profile-v2");

const AT = "2026-09-04T12:00:00.000Z";
const assess = (a: InvestorProfileAnswers) =>
  assessInvestorProfile(a, { assessedAt: AT });

function baseline(): InvestorProfileAnswers {
  return {
    questionnaireVersion: 2,
    accountType: "individual",
    goal: "long_term_wealth",
    horizon: "gt_10y",
    withdrawalPattern: "gradual",
    incomeBand: "100_200k",
    incomeStability: "very_predictable",
    netWorthBand: "500k_1m",
    liquidNetWorthBand: "250_500k",
    accountShareOfLiquidAssets: "10_25pct",
    emergencyReserveBand: "gt_6mo",
    debtSignal: "none",
    liquidityLikelihood: "very_unlikely",
    knowledgeLevel: "experienced",
    experienceYears: "5_10y",
    productExperience: ["stocks", "funds"],
    drawdownBehavior: "stay",
    lossThreshold: "pct_20",
    growthProtectionPreference: 4,
    riskTradeoffChoice: "plan_b",
    restrictions: ["none"],
    expectedFinancialChange: "no",
    productIntent: ["disciplined_long_term"],
    reconciledFlags: [],
  };
}

/** What a REAL provider adapter would normalize to (none exists yet). */
const PRODUCTION_KYC: AttestationKyc = {
  status: "passed",
  provider: "example-real-kyc-adapter",
  level: "frontend-lifecycle",
  evidence_ref: "kyc-session:ref_0001",
};
/** Exactly what apps/web/src/lib/kyc emits today (PR #73). */
const MOCK_KYC: AttestationKyc = {
  status: "passed",
  provider: "mock-kyc-adapter",
  level: "frontend-lifecycle",
  evidence_ref: "kyc-session:mock_0001",
};

function inputFor(
  answers: InvestorProfileAnswers,
  overrides: Partial<AttestationEvidenceInput> = {},
): AttestationEvidenceInput {
  return {
    accountId: "acct_test_0001",
    answersVersion: {
      profileVersion: 1,
      answers,
      answerSnapshotHash: answersSnapshotHash(answers),
    },
    assessment: assess(answers),
    kyc: PRODUCTION_KYC,
    recomputeAnswerSnapshotHash: answersSnapshotHash,
    ...overrides,
  };
}

const NOT_FIT: InvestorProfileAnswers = {
  ...baseline(),
  goal: "near_term_reserve",
  horizon: "1_3y",
};
const NEEDS_CLARIFICATION: InvestorProfileAnswers = {
  ...baseline(),
  goal: undefined,
};

describe("ledger: investor_profile.status ← productFitStatus / permittedRiskBand (spec §4.4, §1 rule 1)", () => {
  test.each([
    ["fit with a permitted band", baseline(), "fit", "eligible"],
    ["not_fit", NOT_FIT, "not_fit", "ineligible"],
    [
      "needs_clarification (essentials missing)",
      NEEDS_CLARIFICATION,
      "needs_clarification",
      "pending",
    ],
  ] as const)("%s → %s", (_label, answers, fit, expected) => {
    const a = assess(answers);
    expect(a.productFitStatus).toBe(fit);
    expect(deriveInvestorProfileStatus(a)).toBe(expected);
  });

  test("eligible ⇔ a personalized band exists; ineligible ⇔ not_fit (synthesized table)", () => {
    const base = assess(baseline());
    const table = [
      { productFitStatus: "fit", permittedRiskBand: 3, want: "eligible" },
      {
        productFitStatus: "fit_with_constraint",
        permittedRiskBand: 2,
        want: "eligible",
      },
      {
        productFitStatus: "needs_clarification",
        permittedRiskBand: null,
        want: "pending",
      },
      { productFitStatus: "fit", permittedRiskBand: null, want: "pending" },
      {
        productFitStatus: "not_fit",
        permittedRiskBand: null,
        want: "ineligible",
      },
    ] as const;
    for (const row of table) {
      expect(
        deriveInvestorProfileStatus({
          ...base,
          productFitStatus: row.productFitStatus,
          permittedRiskBand: row.permittedRiskBand,
        }),
        JSON.stringify(row),
      ).toBe(row.want);
    }
  });
});

describe("ledger: investor_profile.risk_band is the frontend-defined versioned band", () => {
  test.each([
    [1, "profile-policy-v1:band-1:preservation"],
    [2, "profile-policy-v1:band-2:conservative"],
    [3, "profile-policy-v1:band-3:balanced"],
    [4, "profile-policy-v1:band-4:growth"],
    [5, "profile-policy-v1:band-5:high_growth"],
  ] as const)("band %i → %s", (band, label) => {
    const a = { ...assess(baseline()), permittedRiskBand: band };
    expect(deriveRiskBandLabel(a)).toBe(label);
    expect(label.startsWith(`${ASSESSMENT_POLICY_VERSION}:`)).toBe(true);
  });
  test("no personalized band → non-empty sentinel (contract minLength 1)", () => {
    expect(deriveRiskBandLabel(assess(NOT_FIT))).toBe(
      RISK_BAND_NOT_PERSONALIZED,
    );
    expect(RISK_BAND_NOT_PERSONALIZED.length).toBeGreaterThan(0);
  });
  test("the retired v1 vocabulary Daniel's legacy projection recognises is never emitted", () => {
    for (const band of [1, 2, 3, 4, 5] as const) {
      const label = deriveRiskBandLabel({
        ...assess(baseline()),
        permittedRiskBand: band,
      }).toUpperCase();
      expect([
        "CONSERVATIVE",
        "MODERATE",
        "GROWTH",
        "AGGRESSIVE",
      ]).not.toContain(label);
    }
  });
});

describe("ledger: trading_eligibility can never be `eligible` (D-LAUNCH-06 open, spec §10/§21)", () => {
  test.each([
    ["eligible", "pending"],
    ["pending", "pending"],
    ["ineligible", "ineligible"],
  ] as const)("profile %s → trading %s", (profile, trading) => {
    expect(deriveTradingEligibility(profile)).toBe(trading);
    expect(deriveTradingEligibility(profile)).not.toBe("eligible");
  });
});

describe("ledger: KYC evidence gate (D — provider-blocked)", () => {
  test.each([
    ["null (no provider configured)", null, false],
    ["mock adapter (PR #73 today)", MOCK_KYC, false],
    ["mock spelled differently", { ...MOCK_KYC, provider: "Mock KYC" }, false],
    ["mock as a path segment", { ...MOCK_KYC, provider: "kyc/mock/v1" }, false],
    ["no provider label", { status: "passed" }, false],
    ["blank provider label", { status: "passed", provider: "  " }, false],
    ["a non-mock adapter label", PRODUCTION_KYC, true],
    [
      "a word merely containing mock",
      { ...PRODUCTION_KYC, provider: "hammockid-kyc-adapter" },
      true,
    ],
  ] as const)("%s → production evidence: %s", (_l, kyc, want) => {
    expect(isProductionKycEvidence(kyc)).toBe(want);
  });

  test("the builder fails closed on today's mock evidence and on missing evidence", () => {
    const mock = buildComplianceProfileAttestationRequest(
      inputFor(baseline(), { kyc: MOCK_KYC }),
    );
    expect(mock.ok).toBe(false);
    if (!mock.ok) expect(mock.blocked).toEqual(["KYC_EVIDENCE_NOT_PRODUCTION"]);
    const none = buildComplianceProfileAttestationRequest(
      inputFor(baseline(), { kyc: null }),
    );
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.blocked).toEqual(["KYC_EVIDENCE_MISSING"]);
  });
});

describe("builder: fully resolved fields produce a contract-valid request", () => {
  test.each([
    ["fit", baseline(), "eligible", "pending"],
    ["not_fit", NOT_FIT, "ineligible", "ineligible"],
    ["needs_clarification", NEEDS_CLARIFICATION, "pending", "pending"],
  ] as const)(
    "%s → investor_profile.status %s, trading_eligibility %s, schema-valid",
    (_l, answers, profileStatus, trading) => {
      const r = buildComplianceProfileAttestationRequest(inputFor(answers));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(
        problemsAgainst("ComplianceProfileAttestationRequest", r.request),
      ).toEqual([]);
      expect(r.request.schema_version).toBe(ATTESTATION_SCHEMA_VERSION);
      expect(r.request.decision_version).toBe(ASSESSMENT_POLICY_VERSION);
      expect(r.request.decision_sequence).toBe(1);
      expect(r.request.investor_profile.profile_version).toBe("1");
      expect(r.request.investor_profile.questionnaire_version).toBe("2");
      expect(r.request.investor_profile.status).toBe(profileStatus);
      expect(r.request.trading_eligibility).toBe(trading);
      expect(r.request.effective_at).toBe(AT);
      expect(r.request.expires_at).toBeNull();
      expect(r.request.kyc).toEqual(PRODUCTION_KYC);
      expect(r.request.attestation_id).toMatch(
        /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/,
      );
      expect(r.request.evidence_sha256).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  test("evidence_sha256 is SHA-256 of the canonical evidence document, which carries the mapping version and the answers snapshot hash", () => {
    const r = buildComplianceProfileAttestationRequest(inputFor(baseline()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.evidence.mapping_version).toBe(ATTESTATION_MAPPING_VERSION);
    expect(r.evidence.answer_snapshot_hash).toBe(
      answersSnapshotHash(baseline()),
    );
    expect(stableSerialize(r.evidence)).toBe(r.evidenceCanonical);
    expect(
      createHash("sha256").update(r.evidenceCanonical, "utf8").digest("hex"),
    ).toBe(r.request.evidence_sha256);
  });

  test("deterministic: identical input → identical request; any evidence change → different digest", () => {
    const a = buildComplianceProfileAttestationRequest(inputFor(baseline()));
    const b = buildComplianceProfileAttestationRequest(inputFor(baseline()));
    expect(a).toEqual(b);
    const other = buildComplianceProfileAttestationRequest(
      inputFor({ ...baseline(), lossThreshold: "pct_10" }),
    );
    expect(a.ok && other.ok).toBe(true);
    if (!a.ok || !other.ok) return;
    expect(other.request.evidence_sha256).not.toBe(a.request.evidence_sha256);
    // Same decision coordinates → same opaque id (backend idempotent replay).
    expect(other.request.attestation_id).toBe(a.request.attestation_id);
    expect(
      deriveAttestationId("acct_test_0001", ASSESSMENT_POLICY_VERSION, 2),
    ).not.toBe(a.request.attestation_id);
  });

  test("decision_sequence is the immutable profileVersion (checklist: profile_version ↔ decision_sequence)", () => {
    for (const v of [1, 7, 4242]) {
      const r = buildComplianceProfileAttestationRequest(
        inputFor(baseline(), {
          answersVersion: {
            profileVersion: v,
            answers: baseline(),
            answerSnapshotHash: answersSnapshotHash(baseline()),
          },
        }),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.request.decision_sequence).toBe(v);
      expect(r.request.investor_profile.profile_version).toBe(String(v));
    }
  });
});

describe("builder: fail-closed integrity checks", () => {
  const cases: Array<
    [
      string,
      (
        | Partial<AttestationEvidenceInput>
        | ((i: AttestationEvidenceInput) => AttestationEvidenceInput)
      ),
      string,
    ]
  > = [
    ["blank account id", { accountId: " " }, "ACCOUNT_ID_MISSING"],
    [
      "assessment produced under another policy version",
      (i) => ({
        ...i,
        assessment: {
          ...i.assessment,
          assessmentPolicyVersion: "profile-policy-v0",
        },
      }),
      "ASSESSMENT_POLICY_VERSION_MISMATCH",
    ],
    [
      "answers do not hash to the recorded snapshot",
      (i) => ({
        ...i,
        answersVersion: {
          ...i.answersVersion,
          answerSnapshotHash: "0000000000000000",
        },
      }),
      "ANSWER_SNAPSHOT_HASH_MISMATCH",
    ],
    [
      "unsupported questionnaire version",
      (i) => {
        const answers = {
          ...i.answersVersion.answers,
          questionnaireVersion: 3,
        } as unknown as InvestorProfileAnswers;
        return {
          ...i,
          answersVersion: {
            ...i.answersVersion,
            answers,
            answerSnapshotHash: answersSnapshotHash(answers),
          },
        };
      },
      "QUESTIONNAIRE_VERSION_UNSUPPORTED",
    ],
    [
      "profile version 0",
      (i) => ({
        ...i,
        answersVersion: { ...i.answersVersion, profileVersion: 0 },
      }),
      "PROFILE_VERSION_INVALID",
    ],
    [
      "effective_at without a zone",
      (i) => ({
        ...i,
        assessment: { ...i.assessment, assessedAt: "2026-09-04T12:00:00" },
      }),
      "EFFECTIVE_AT_INVALID",
    ],
  ];
  test.each(cases)("%s → blocked %s", (_l, mutate, reason) => {
    const base = inputFor(baseline());
    const input =
      typeof mutate === "function" ? mutate(base) : { ...base, ...mutate };
    const r = buildComplianceProfileAttestationRequest(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blocked).toContain(reason);
    expect(ATTESTATION_BLOCK_REASONS).toContain(reason);
  });
});
