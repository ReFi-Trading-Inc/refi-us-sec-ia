/** Explicit owner-approved Dev fixture, NEVER production/Socure provenance.
 * Real login, account ownership, questionnaire evidence, consents, membership
 * and all backend authority/execution gates remain required.
 */
import { createHash } from "node:crypto";
import { InvestorApiError } from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "../investor-api/demo-client";
import type { AttestationKyc } from "../kyc/provider";
import { connectedKvStore } from "../connected-store";
import type { KVStore } from "../store/types";
import { stableSerialize } from "../sec203a/canonical-json";
import type { ComplianceProfileAttestationRequest } from "../compliance/attestation-mapping";

export interface DevelopmentWithdrawal {
  request: ComplianceProfileAttestationRequest;
  evidenceCanonical: string;
}

export const DEVELOPMENT_KYC_PROVIDER = "refinity-dev-kyc-fixture-v1";
const BRAND = Symbol("refi.development-kyc-only");
export interface DevelopmentKycRecord {
  subject: string;
  accountId: string;
  profileVersion: number;
  generation: number;
  decisionSequence: number;
  issuedAt: string;
  expiresAt: string;
  normalized: AttestationKyc;
}
export interface DevelopmentKycEvidence extends DevelopmentKycRecord {
  source: "development_fixture";
  readonly [BRAND]: true;
}
export function developmentKycScope(
  subject: string,
  accountId: string,
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const mode = env["REFI_INTEGRATION_KYC_MODE"] ?? "off";
  if (mode === "off") return null;
  const subjects = (env["REFI_INTEGRATION_KYC_SUBJECTS"] ?? "").split(",");
  const accounts = (env["REFI_INTEGRATION_KYC_ACCOUNTS"] ?? "").split(",");
  const generation = Number(env["REFI_INTEGRATION_KYC_GENERATION"] ?? "1");
  if (
    !["test_pass", "withdraw"].includes(mode) ||
    env["GCP_PROJECT_ID"] !== "refinity-dev" ||
    env["K_SERVICE"] !== "refi-frontend-integration" ||
    env["REFI_ENV"] !== "staging" ||
    env["REFI_INVESTOR_API_CREDENTIAL_MODE"] !== "native-cloud-run" ||
    env["REFI_KYC_PROVIDER"] !== "unconfigured" ||
    !subject ||
    !accountId ||
    !subjects.includes(subject) ||
    !accounts.includes(accountId) ||
    !Number.isSafeInteger(generation) ||
    generation < 1
  ) {
    throw new Error(
      "Development KYC is not authorized for this runtime/subject/account",
    );
  }
  return generation;
}
export function isDevelopmentKycEvidence(
  value: unknown,
): value is DevelopmentKycEvidence {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [BRAND]?: unknown })[BRAND] === true
  );
}
async function runtimeEmail(): Promise<string> {
  const result = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
    {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    },
  );
  if (!result.ok) throw new Error("Native runtime identity unavailable");
  return (await result.text()).trim();
}

/** Stable across retries/restarts; generation changes are explicit, never timed renewal. */
export async function developmentKycEvidence(
  client: InvestorApiReadClient,
  args: { subject: string; accountId: string; profileVersion: number },
  dependencies: {
    store?: KVStore<DevelopmentKycRecord>;
    runtimeEmail?: () => Promise<string>;
    now?: () => number;
  } = {},
): Promise<DevelopmentKycEvidence | null> {
  const generation = developmentKycScope(args.subject, args.accountId);
  if (generation === null) return null;
  if (process.env["REFI_INTEGRATION_KYC_MODE"] !== "test_pass")
    throw new Error("Fixture withdrawal is required before disabling");
  if (
    (await (dependencies.runtimeEmail ?? runtimeEmail)()) !==
    "refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com"
  )
    throw new Error("Wrong native runtime identity");
  if (!Number.isSafeInteger(args.profileVersion) || args.profileVersion < 1)
    throw new Error("A real assessed profile version is required");
  const store =
    dependencies.store ??
    connectedKvStore<DevelopmentKycRecord>("attestation-decision");
  const now = (dependencies.now ?? Date.now)();
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        args.subject,
        args.accountId,
        args.profileVersion,
        generation,
      ]),
    )
    .digest("hex");
  let record = await store.get(key);
  if (!record) {
    let sequence = args.profileVersion;
    try {
      const current = await client.call(
        "getCurrentComplianceProfileAttestation",
        { path: { account_id: args.accountId } },
      );
      sequence = Math.max(sequence, current.data.data.decision_sequence + 1);
    } catch (err) {
      if (!(
        err instanceof InvestorApiError &&
        err.status === 404 &&
        err.code === "RESOURCE_NOT_FOUND"
      ))
        throw err;
    }
    let candidate: DevelopmentKycRecord;
    const limit = sequence + 32;
    for (;;) {
      candidate = {
        ...args,
        generation,
        decisionSequence: sequence,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 4 * 3600_000).toISOString(),
        normalized: {
          status: "passed",
          provider: DEVELOPMENT_KYC_PROVIDER,
          level: "development-only-simulated-pass",
          evidence_ref: `dev-kyc:${key}`,
        },
      };
      if (
        await store.putIfAbsent(
          `sequence_${args.accountId}_${String(sequence)}`,
          candidate,
        )
      )
        break;
      if (++sequence > Math.min(limit, 2147483647))
        throw new Error(
          "Attestation sequence contention; retry the same operation",
        );
    }
    await store.putIfAbsent(key, candidate);
    record = await store.get(key);
  }
  if (
    !record ||
    record.subject !== args.subject ||
    record.accountId !== args.accountId ||
    record.profileVersion !== args.profileVersion ||
    record.generation !== generation ||
    !Number.isFinite(Date.parse(record.expiresAt)) ||
    Date.parse(record.expiresAt) <= now ||
    record.normalized.provider !== DEVELOPMENT_KYC_PROVIDER
  ) {
    throw new Error(
      "Development KYC fixture is missing, expired or mismatched; explicit renewal required",
    );
  }
  return Object.freeze({
    ...record,
    normalized: Object.freeze({ ...record.normalized }),
    source: "development_fixture" as const,
    [BRAND]: true as const,
  });
}

/** Run through the existing authenticated attestation route with mode=withdraw,
 * verify acknowledgment, then turn mode off. A flag alone cannot revoke evidence
 * already stored by the backend. No real provider decision is overwritten.
 */
export async function withdrawDevelopmentKyc(
  client: InvestorApiReadClient,
  subject: string,
  accountId: string,
  dependencies: {
    store?: KVStore<DevelopmentWithdrawal>;
    runtimeEmail?: () => Promise<string>;
    now?: () => number;
  } = {},
) {
  if (
    process.env["REFI_INTEGRATION_KYC_MODE"] !== "withdraw" ||
    developmentKycScope(subject, accountId) === null
  )
    throw new Error("Fixture withdrawal is not enabled");
  if (
    (await (dependencies.runtimeEmail ?? runtimeEmail)()) !==
    "refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com"
  )
    throw new Error("Wrong native runtime identity");
  const current = await client.call("getCurrentComplianceProfileAttestation", {
    path: { account_id: accountId },
  });
  const attestation = current.data.data;
  if (attestation.kyc.provider !== DEVELOPMENT_KYC_PROVIDER)
    throw new Error("Refusing to withdraw a real provider decision");
  if (attestation.kyc.status === "withdrawn") return current;
  const key = createHash("sha256")
    .update(`withdraw:${accountId}:${attestation.attestation_id}`)
    .digest("hex");
  const store =
    dependencies.store ??
    connectedKvStore<DevelopmentWithdrawal>("development-kyc");
  const now = (dependencies.now ?? Date.now)();
  const body: ComplianceProfileAttestationRequest = {
    attestation_id: `att_${key.slice(0, 32)}`,
    schema_version: "1.0",
    decision_sequence: attestation.decision_sequence + 1,
    decision_version: attestation.decision_version,
    kyc: {
      ...attestation.kyc,
      status: "withdrawn",
      evidence_ref: `dev-kyc-withdraw:${key}`,
    },
    investor_profile: attestation.investor_profile,
    trading_eligibility: "pending",
    effective_at: new Date(now).toISOString(),
    expires_at: new Date(now + 4 * 3600_000).toISOString(),
    evidence_sha256: key,
  };
  const { evidence_sha256: _unused, ...evidenceBody } = body;
  const evidenceCanonical = stableSerialize({
    account_id: accountId,
    supersedes: attestation.attestation_id,
    reason: "development_fixture_retired",
    request: evidenceBody,
  });
  body.evidence_sha256 = createHash("sha256")
    .update(evidenceCanonical)
    .digest("hex");
  await store.putIfAbsent(`withdraw_${key}`, {
    request: body,
    evidenceCanonical,
  });
  const saved = await store.get(`withdraw_${key}`);
  if (!saved) throw new Error("Withdrawal request unavailable");
  return client.call("createComplianceProfileAttestation", {
    path: { account_id: accountId },
    body: saved.request,
    idempotencyKey: key,
  });
}
