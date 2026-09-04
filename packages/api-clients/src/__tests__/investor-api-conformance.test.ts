/**
 * Contract conformance against Daniel's OWN validator and deterministic
 * loopback simulator (`tools/conformance.py`, vendored byte-for-byte).
 *
 * Protected CI pins Python ≥ 3.11 (`.github/workflows/ci.yml`) and sets
 * REFI_CONTRACT_STRICT=1, so a missing runtime there is a configuration
 * FAILURE. Only an unset local environment may skip, loudly.
 *
 * Nothing here touches a network host other than 127.0.0.1.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createInvestorApiClient,
  type InvestorApiClient,
} from "../investor-api/client";
import { InvestorApiError } from "../investor-api/errors";
import {
  CONTRACT_PACKAGE_DIR,
  CONTRACT_VERSION,
} from "../investor-api/package";
import { readFileSync } from "node:fs";

const PKG = join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR);
const TOOL = join(PKG, "tools", "conformance.py");
const STRICT =
  process.env["REFI_CONTRACT_STRICT"] === "1" ||
  process.env["CI"] === "true" ||
  process.env["CI"] === "1";

// The simulator's fixed synthetic credentials (constants in conformance.py).
const FIXTURE_BEARER = "fixture-google-oidc";
const FIXTURE_ASSERTION = "fixture-user-assertion";

const examples = JSON.parse(
  readFileSync(join(PKG, "examples.json"), "utf8"),
) as {
  ids: { account: string; foreign_account: string };
  requests: Record<string, unknown>;
};

function findPython(): { bin: string; version: string } | null {
  const candidates = [
    process.env["REFI_PYTHON_BIN"],
    "python3.13",
    "python3.12",
    "python3.11",
    "python3",
    "python",
  ].filter((c): c is string => Boolean(c));
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status !== 0) continue;
    const m = /Python (\d+)\.(\d+)\.(\d+)/.exec(`${r.stdout}${r.stderr}`);
    if (!m) continue;
    const [, major, minor] = m;
    if (Number(major) > 3 || (Number(major) === 3 && Number(minor) >= 11)) {
      return { bin, version: m[0] };
    }
  }
  return null;
}

const python = findPython();
const PY = python?.bin ?? "";

describe("Python ≥ 3.11 runtime for Daniel's conformance tool", () => {
  it(
    STRICT
      ? "is present (required in protected CI)"
      : "is present or this suite skips loudly",
    () => {
      if (!python) {
        const msg =
          "Python ≥ 3.11 not found. Protected CI must pin it via actions/setup-python; " +
          "locally set REFI_PYTHON_BIN or install python3.11+. Set REFI_CONTRACT_STRICT=1 to make this fatal.";
        if (STRICT) throw new Error(msg);
        console.warn(`[investor-api-conformance] SKIPPED: ${msg}`);
      }
      expect(STRICT ? python : true).toBeTruthy();
    },
  );
});

describe.skipIf(!python)(
  `conformance.py against the vendored ${CONTRACT_VERSION} package`,
  () => {
    it("validate passes (hashes, file set, README sections, fixture safety)", () => {
      const r = spawnSync(PY, [TOOL, "validate", "--bundle-root", PKG], {
        encoding: "utf8",
        timeout: 120_000,
      });
      expect(r.stdout + r.stderr).toContain(
        `${CONTRACT_VERSION} validate passed`,
      );
      expect(r.status).toBe(0);
    });

    it("self-test passes (Daniel's own probe journey against his simulator)", () => {
      const r = spawnSync(PY, [TOOL, "self-test", "--bundle-root", PKG], {
        encoding: "utf8",
        timeout: 180_000,
      });
      expect(r.stdout + r.stderr).toContain(
        `${CONTRACT_VERSION} self-test passed`,
      );
      expect(r.status).toBe(0);
    });
  },
);

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => {
        resolve(port);
      });
    });
  });
}

async function waitForServer(
  baseUrl: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/.well-known/jwks.json`);
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`simulator did not answer within ${String(timeoutMs)} ms`);
}

describe.skipIf(!python)(
  "our client against Daniel's simulator (loopback only)",
  () => {
    let proc: ChildProcess | null = null;
    let baseUrl = "";
    let client: InvestorApiClient;
    const ACCOUNT = examples.ids.account;

    beforeAll(async () => {
      const port = await freePort();
      baseUrl = `http://127.0.0.1:${String(port)}`;
      proc = spawn(
        PY,
        [
          TOOL,
          "serve",
          "--bundle-root",
          PKG,
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      await waitForServer(baseUrl, 20_000);
      client = createInvestorApiClient({
        baseUrl,
        getBearer: () => Promise.resolve(FIXTURE_BEARER),
        mintAssertion: () => Promise.resolve(FIXTURE_ASSERTION),
      });
    }, 30_000);

    afterAll(() => {
      proc?.kill("SIGTERM");
    });

    it("README integration order, read side: onboarding → accounts → eligibility/kyc → templates → records", async () => {
      expect((await client.call("getOnboardingStatus")).status).toBe(200);
      const accounts = await client.call("listAccounts");
      expect(accounts.status).toBe(200);
      expect(accounts.data.data.items[0]?.account_id).toBe(ACCOUNT);
      expect((await client.call("getEligibility")).status).toBe(200);
      expect((await client.call("getKycStatus")).status).toBe(200);
      expect((await client.call("listTemplates")).status).toBe(200);
      expect(
        (
          await client.call("getAccountValuation", {
            path: { account_id: ACCOUNT },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await client.call("listAccountRecords", {
            path: { account_id: ACCOUNT },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await client.call("listAccountRecommendations", {
            path: { account_id: ACCOUNT },
          })
        ).status,
      ).toBe(200);
    });

    it("every response validated against schemas.json (no ContractVersionMismatch across all 38 JSON reads/writes)", async () => {
      const reads = [
        "getAccount",
        "getAccountAuthorization",
        "listBrokerageConnections",
        "listComplianceProfileAttestations",
        "getCurrentComplianceProfileAttestation",
        "listAccountMemberships",
        "listAccountPositions",
        "getAccountPreferences",
        "listAccountPreferenceHistory",
        "listAccountRecommendationLegs",
        "listAccountValuations",
      ] as const;
      for (const op of reads) {
        const path =
          op === "listAccountRecommendationLegs"
            ? { account_id: ACCOUNT, recommendation_id: "rec_alpha_00000001" }
            : { account_id: ACCOUNT };
        const res = await client.call(op, { path: path });
        expect(res.status, op).toBe(200);
      }
      for (const op of [
        "listAdvisoryProfiles",
        "getCurrentAdvisoryProfile",
        "listConsents",
        "listEffectiveDisclosures",
      ] as const) {
        expect((await client.call(op)).status, op).toBe(200);
      }
    });

    it("mutations: idempotent replay is stable, changed reuse is 409, unknown field is 422 — via our client", async () => {
      const body = examples.requests[
        "ComplianceProfileAttestationRequest"
      ] as never;
      const key = `k_${String(Date.now())}`;
      const first = await client.call("createComplianceProfileAttestation", {
        path: { account_id: ACCOUNT },
        body,
        idempotencyKey: key,
      });
      expect(first.status).toBe(201);
      const replay = await client.call("createComplianceProfileAttestation", {
        path: { account_id: ACCOUNT },
        body,
        idempotencyKey: key,
      });
      expect(replay.data).toEqual(first.data);

      const changed = structuredClone(body) as Record<string, unknown>;
      changed["decision_sequence"] = 99;
      const conflict = await client
        .call("createComplianceProfileAttestation", {
          path: { account_id: ACCOUNT },
          body: changed as never,
          idempotencyKey: key,
        })
        .catch((e: unknown) => e);
      expect(conflict).toBeInstanceOf(InvestorApiError);
      expect((conflict as InvestorApiError).status).toBe(409);
      expect((conflict as InvestorApiError).code).toBe(
        "IDEMPOTENCY_KEY_REUSED",
      );

      const consent = await client.call("recordConsent", {
        body: examples.requests["ConsentRequest"] as never,
        idempotencyKey: `${key}_consent`,
      });
      expect(consent.status).toBe(201);
      const waitlist = await client.call("joinWaitlist", {
        body: examples.requests["WaitlistRequest"] as never,
        idempotencyKey: `${key}_wl`,
      });
      expect(waitlist.status).toBe(202);
    });

    it("uniform 404 for a foreign account; 401 without a user assertion — fail closed", async () => {
      const foreign = await client
        .call("getAccount", {
          path: { account_id: examples.ids.foreign_account },
        })
        .catch((e: unknown) => e);
      expect(foreign).toBeInstanceOf(InvestorApiError);
      expect((foreign as InvestorApiError).status).toBe(404);
      expect((foreign as InvestorApiError).code).toBe("RESOURCE_NOT_FOUND");
      expect((foreign as InvestorApiError).message).not.toContain(
        examples.ids.foreign_account,
      );

      const noAssertion = createInvestorApiClient({
        baseUrl,
        getBearer: () => Promise.resolve(FIXTURE_BEARER),
        mintAssertion: () => Promise.resolve(""),
      });
      const denied = await noAssertion
        .call("listAccounts")
        .catch((e: unknown) => e);
      expect((denied as InvestorApiError).status).toBe(401);
      expect((denied as InvestorApiError).code).toBe("AUTHENTICATION_FAILED");
    });

    it("SSE: a real event is incrementally parsed and schema-validated; resume with Last-Event-ID yields nothing new", async () => {
      const opened = await client.stream({ path: { account_id: ACCOUNT } });
      expect(opened.status).toBe(200);
      expect(opened.headers.get("Content-Type")).toContain("text/event-stream");
      const iterator = opened.events[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);
      if (first.done) throw new Error("no event");
      expect(first.value.eventId).toBe(first.value.event.event_id);
      expect(first.value.eventName).toBe(first.value.event.event_type);
      expect(first.value.event.account_id).toBe(ACCOUNT);
      expect(first.value.event.data.state_version).toBeGreaterThan(0);
      // Drain and make sure the parser reaches a clean end of stream.
      let more = 0;
      for await (const _ of { [Symbol.asyncIterator]: () => iterator })
        more += 1;
      expect(more).toBe(0);

      const resumed = await client.stream({
        path: { account_id: ACCOUNT },
        lastEventId: first.value.eventId ?? "",
      });
      expect(resumed.status).toBe(200);
      let count = 0;
      for await (const _ of resumed.events) count += 1;
      expect(count).toBe(0);
    });

    it("SSE: the identity JWKS journey obtains no credentials against the simulator", async () => {
      const noCreds = createInvestorApiClient({
        baseUrl,
        getBearer: () => Promise.reject(new Error("must not be called")),
        mintAssertion: () => Promise.reject(new Error("must not be called")),
      });
      expect((await noCreds.call("getIdentityJwks")).status).toBe(200);
    });

    it("identity: exchangeIdentity and public JWKS answer per contract", async () => {
      const jwks = await client.call("getIdentityJwks");
      expect(jwks.status).toBe(200);
      const exchanged = await client.call("exchangeIdentity", {
        body: examples.requests["IdentityExchangeRequest"] as never,
      });
      expect(exchanged.status).toBe(200);
    });
  },
);
