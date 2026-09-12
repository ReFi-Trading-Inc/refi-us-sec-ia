import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  withdrawDevelopmentKyc,
  type DevelopmentWithdrawal,
} from "../../../../apps/web/src/lib/integration-dev/kyc-pass";
import examples from "../../contracts/investor-api/v1.1.0-alpha.4/examples.json";
import { problemsAgainst } from "../investor-api/validation";
import {
  developmentKycEvidence,
  developmentKycScope,
  isDevelopmentKycEvidence,
  type DevelopmentKycRecord,
} from "../../../../apps/web/src/lib/integration-dev/kyc-pass";
import { isTrustedKycEvidence } from "../../../../apps/web/src/lib/kyc/provenance";
import {
  deriveTradingEligibility,
  kycEvidenceBlock,
} from "../../../../apps/web/src/lib/compliance/attestation-mapping";
import type { KVStore } from "../../../../apps/web/src/lib/store/types";

afterEach(() => vi.unstubAllEnvs());
const config = {
  REFI_INTEGRATION_KYC_MODE: "test_pass",
  GCP_PROJECT_ID: "refinity-dev",
  K_SERVICE: "refi-frontend-integration",
  REFI_ENV: "staging",
  REFI_INVESTOR_API_CREDENTIAL_MODE: "native-cloud-run",
  REFI_KYC_PROVIDER: "unconfigured",
  REFI_INTEGRATION_KYC_SUBJECTS: "user_test_0001",
  REFI_INTEGRATION_KYC_ACCOUNTS: "account_test_0001",
};
function setup() {
  for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
  const rows = new Map<string, DevelopmentKycRecord>();
  const store: KVStore<DevelopmentKycRecord> = {
    update: async (key, decide) => {
      const current = rows.get(key) ?? null;
      const next = decide(current);
      if (next === null) return { value: current, written: false };
      rows.set(key, next);
      return { value: next, written: true };
    },
    get: async (key) => rows.get(key) ?? null,
    put: async (key, value) => {
      rows.set(key, value);
    },
    putIfAbsent: async (key, value) => {
      if (rows.has(key)) return false;
      rows.set(key, value);
      return true;
    },
    delete: async (key) => {
      rows.delete(key);
    },
    list: async (prefix = "") =>
      [...rows]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
  };
  const client = {
    call: vi.fn(async () => ({ data: { data: { decision_sequence: 8 } } })),
  } as never;
  const args = {
    subject: "user_test_0001",
    accountId: "account_test_0001",
    profileVersion: 2,
  };
  const deps = {
    store,
    runtimeEmail: async () =>
      "refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com",
  };
  return { client, args, deps, rows };
}
describe("explicit development KYC boundary", () => {
  it("withdraws with retained evidence and identical retry; never withdraws real provider evidence", async () => {
    const { args, deps } = setup();
    vi.stubEnv("REFI_INTEGRATION_KYC_MODE", "withdraw");
    const rows = new Map<string, DevelopmentWithdrawal>();
    const store: KVStore<DevelopmentWithdrawal> = {
      update: async (key, decide) => {
        const current = rows.get(key) ?? null;
        const next = decide(current);
        if (next === null) return { value: current, written: false };
        rows.set(key, next);
        return { value: next, written: true };
      },
      get: async (key) => rows.get(key) ?? null,
      put: async (key, value) => {
        rows.set(key, value);
      },
      putIfAbsent: async (key, value) => {
        if (rows.has(key)) return false;
        rows.set(key, value);
        return true;
      },
      list: async () => [...rows].map(([key, value]) => ({ key, value })),
      delete: async (key) => {
        rows.delete(key);
      },
    };
    const fixture = structuredClone(
      examples.responses.ComplianceProfileAttestationEnvelope,
    );
    const current = {
      ...fixture,
      data: {
        ...fixture.data,
        kyc: { ...fixture.data.kyc, provider: "refinity-dev-kyc-fixture-v1" },
      },
    };
    const call = vi.fn(async (operation: string) => ({
      status: 201,
      data: current,
    }));
    const client = { call } as never;
    const dependencies = { store, runtimeEmail: deps.runtimeEmail };
    await withdrawDevelopmentKyc(
      client,
      args.subject,
      args.accountId,
      dependencies,
    );
    const first = call.mock.calls.find(
      ([op]) => op === "createComplianceProfileAttestation",
    );
    await withdrawDevelopmentKyc(
      client,
      args.subject,
      args.accountId,
      dependencies,
    );
    expect(
      call.mock.calls.filter(
        ([op]) => op === "createComplianceProfileAttestation",
      )[1],
    ).toEqual(first);
    const saved = [...rows.values()][0]!;
    expect(saved.request.kyc.status).toBe("withdrawn");
    expect(saved.request.trading_eligibility).toBe("pending");
    expect(saved.request.evidence_sha256).toBe(
      createHash("sha256").update(saved.evidenceCanonical).digest("hex"),
    );
    expect(
      problemsAgainst("ComplianceProfileAttestationRequest", saved.request),
    ).toEqual([]);
    current.data.kyc.provider = "socure";
    await expect(
      withdrawDevelopmentKyc(
        client,
        args.subject,
        args.accountId,
        dependencies,
      ),
    ).rejects.toThrow("real provider");
    expect(
      call.mock.calls.filter(
        ([op]) => op === "createComplianceProfileAttestation",
      ),
    ).toHaveLength(2);
  });
  it("defaults off, without touching backend/metadata/store", async () => {
    vi.stubEnv("REFI_INTEGRATION_KYC_MODE", "off");
    expect(
      await developmentKycEvidence({} as never, {
        subject: "any",
        accountId: "any",
        profileVersion: 1,
      }),
    ).toBeNull();
  });
  it.each([
    ["GCP_PROJECT_ID", "refinity-prod"],
    ["K_SERVICE", "other-service"],
    ["REFI_ENV", "prod"],
    ["REFI_KYC_PROVIDER", "socure"],
    ["REFI_INTEGRATION_KYC_SUBJECTS", "other-user"],
    ["REFI_INTEGRATION_KYC_ACCOUNTS", "other-account"],
    ["REFI_INTEGRATION_KYC_GENERATION", "0"],
  ])("rejects wrong scope %s", (key, value) => {
    expect(() =>
      developmentKycScope("user_test_0001", "account_test_0001", {
        ...config,
        [key!]: value,
      }),
    ).toThrow();
  });
  it("is stable across retries/restarts, monotonic after existing backend decisions, and cannot claim production trust", async () => {
    const { client, args, deps } = setup();
    const [a, b] = await Promise.all([
      developmentKycEvidence(client, args, deps),
      developmentKycEvidence(client, args, deps),
    ]);
    expect(a).toEqual(b);
    expect(a?.decisionSequence).toBeGreaterThan(8);
    expect(a?.normalized).toMatchObject({
      status: "passed",
      provider: "refinity-dev-kyc-fixture-v1",
    });
    expect(isDevelopmentKycEvidence(a)).toBe(true);
    expect(isTrustedKycEvidence(a)).toBe(false);
    expect(isDevelopmentKycEvidence(JSON.parse(JSON.stringify(a)))).toBe(false);
    expect(kycEvidenceBlock(a)).toBeNull();
    expect(await developmentKycEvidence(client, args, deps)).toEqual(a);
    vi.stubEnv("REFI_INTEGRATION_KYC_MODE", "off");
    expect(kycEvidenceBlock(a)).toBe("KYC_PROVENANCE_UNTRUSTED");
  });
  it("refuses wrong runtime identity and expired fixtures; never auto-renews eligibility", async () => {
    const { client, args, deps } = setup();
    await expect(
      developmentKycEvidence(client, args, {
        ...deps,
        runtimeEmail: async () => "wrong@example.com",
      }),
    ).rejects.toThrow("Wrong native");
    const first = await developmentKycEvidence(client, args, deps);
    await expect(
      developmentKycEvidence(client, args, {
        ...deps,
        now: () => Date.parse(first!.expiresAt) + 1,
      }),
    ).rejects.toThrow("expired");
  });
  it("only automated Alpha reflects an eligible profile and passed KYC; pending/adverse outcomes stay closed", () => {
    expect(deriveTradingEligibility("eligible", true, "passed")).toBe(
      "eligible",
    );
    expect(deriveTradingEligibility("eligible", false, "passed")).toBe(
      "pending",
    );
    expect(deriveTradingEligibility("eligible", true, "failed")).toBe(
      "ineligible",
    );
    expect(deriveTradingEligibility("ineligible", true, "passed")).toBe(
      "ineligible",
    );
    expect(deriveTradingEligibility("pending", true, "passed")).toBe("pending");
    expect(deriveTradingEligibility("eligible", true, "pending")).toBe(
      "pending",
    );
  });
});
