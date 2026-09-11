/**
 * v1.1.0-alpha.3 adoption (Daniel, issued 2026-09-09; vendored 2026-09-10).
 *
 * MIGRATION.md: same 41 operations/paths/fields/JWT semantics; error profiles
 * broadened (413, 422, cursor codes, `preference_mutation` with the
 * acknowledgment codes and the explicit 403 ACCOUNT_AUTHORIZATION_REQUIRED);
 * the client must RETAIN the validated `error.continuation`. alpha.2 stays
 * vendored as issued history and nothing imports it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authPolicyFor,
  createInvestorApiClient,
  InvestorApiError,
  routeFor,
} from "../investor-api";
import {
  CONTRACT_DOCUMENT,
  CONTRACT_PACKAGE_DIR,
  CONTRACT_VERSION,
  OPTIONAL_REQUEST_BODY_OPERATIONS,
} from "../investor-api/package";

const ROOT = join(__dirname, "..", "..");
const PKG = join(ROOT, CONTRACT_PACKAGE_DIR);
const examples = JSON.parse(
  readFileSync(join(PKG, "examples.json"), "utf8"),
) as {
  errors: Record<string, { error: Record<string, unknown> }>;
  preference_confirmation: Record<string, unknown>;
};

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
  "X-Correlation-Id": "corr_a3",
};

function clientAnswering(status: number, body: unknown) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, method: init?.method ?? "GET" });
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: HEADERS }),
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
    fetch: fetchImpl,
  });
  return { client, calls };
}

describe("alpha.3 package selection", () => {
  it("selects v1.1.0-alpha.3 and keeps the 41 operations, auth policies and paths of alpha.2", () => {
    expect(CONTRACT_VERSION).toBe("v1.1.0-alpha.3");
    const old = JSON.parse(
      readFileSync(
        join(ROOT, "contracts/investor-api/v1.1.0-alpha.2/contract.json"),
        "utf8",
      ),
    ) as typeof CONTRACT_DOCUMENT;
    const key = (r: {
      operation_id: string;
      method: string;
      path: string;
      success_status: number;
      runtime_owner: string;
    }) =>
      `${r.operation_id} ${r.method} ${r.path} ${String(r.success_status)} ${r.runtime_owner}`;
    expect(CONTRACT_DOCUMENT.routes.map(key).sort()).toEqual(
      old.routes.map(key).sort(),
    );
    expect(authPolicyFor("exchangeIdentity")).toBe("google");
    expect(routeFor("updateAccountPreferences").error_profile).toBe(
      "preference_mutation",
    );
  });

  it("nothing under src/ imports the archived alpha.2 package", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const full = join(dir, n);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    for (const f of walk(join(ROOT, "src")).filter((f) => /\.ts$/.test(f))) {
      const code = readFileSync(f, "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      expect(code, relative(ROOT, f)).not.toMatch(
        /from\s+["'][^"']*v1\.1\.0-alpha\.2\//,
      );
    }
  });

  it("the archived alpha.2 copy is still byte-identical to its own bundle.json (issued history, untouched)", () => {
    const dir = join(ROOT, "contracts/investor-api/v1.1.0-alpha.2");
    const bundle = JSON.parse(
      readFileSync(join(dir, "bundle.json"), "utf8"),
    ) as {
      artifacts: Array<{ path: string; sha256: string }>;
      package_content_sha256: string;
    };
    expect(bundle.package_content_sha256).toBe(
      "c1b53c906653ca8860bf66cfc0df8fa862ff34d6cbf77298ac83cb55f006cb09",
    );
    for (const a of bundle.artifacts) {
      expect(
        createHash("sha256")
          .update(readFileSync(join(dir, a.path)))
          .digest("hex"),
        a.path,
      ).toBe(a.sha256);
    }
  });
});

describe("alpha.3 error profiles through the strict client", () => {
  it("409 ACKNOWLEDGMENT_REQUIRED on updateAccountPreferences RETAINS the validated continuation exactly", async () => {
    const envelope = examples.errors["acknowledgment_required"];
    if (!envelope)
      throw new Error("examples.errors.acknowledgment_required missing");
    const { client } = clientAnswering(409, envelope);
    const err = await client
      .call("updateAccountPreferences", {
        path: { account_id: "acct_alpha_owned_01" },
        idempotencyKey: "preference_initial_01",
        ifMatch: "1",
        body: { drift_threshold: "0.01" },
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(InvestorApiError);
    const e = err as InvestorApiError;
    expect(e.status).toBe(409);
    expect(e.code).toBe("ACKNOWLEDGMENT_REQUIRED");
    expect(e.continuation).toEqual(envelope.error["continuation"]);
    expect(e.continuation?.mutation_applied).toBe(false);
    expect(e.continuation?.retry_idempotency_key).toBe("new_key");
  });

  it("an error without continuation yields null (never inferred)", async () => {
    const { client } = clientAnswering(409, {
      error: { code: "VERSION_CONFLICT", message: "x", correlation_id: "c" },
    });
    const err = (await client
      .call("updateAccountPreferences", {
        path: { account_id: "acct_alpha_owned_01" },
        idempotencyKey: "preference_initial_02",
        ifMatch: "1",
        body: { drift_threshold: "0.01" },
      })
      .catch((e: unknown) => e)) as InvestorApiError;
    expect(err.continuation).toBeNull();
  });

  it("a malformed continuation is a contract mismatch, not a partial object", async () => {
    const { client } = clientAnswering(409, {
      error: {
        code: "ACKNOWLEDGMENT_REQUIRED",
        message: "x",
        correlation_id: "c",
        continuation: { continuation_ref: "continuation_alpha_0001" },
      },
    });
    await expect(
      client.call("updateAccountPreferences", {
        path: { account_id: "acct_alpha_owned_01" },
        idempotencyKey: "preference_initial_03",
        ifMatch: "1",
        body: { drift_threshold: "0.01" },
      }),
    ).rejects.toMatchObject({ name: "ContractVersionMismatchError" });
  });

  it.each([
    ["updateAccountPreferences", 403, "ACCOUNT_AUTHORIZATION_REQUIRED"],
    ["createAccountAction", 403, "ACCOUNT_AUTHORIZATION_REQUIRED"],
    ["createAccountAction", 413, "REQUEST_TOO_LARGE"],
    ["listAccountRecords", 422, "CURSOR_EXPIRED"],
    ["listAccounts", 413, "REQUEST_TOO_LARGE"],
  ] as const)(
    "%s accepts the alpha.3 profile addition %i %s as a typed InvestorApiError",
    async (op, status, code) => {
      const { client } = clientAnswering(status, {
        error: { code, message: "x", correlation_id: "c" },
      });
      const opts =
        op === "updateAccountPreferences"
          ? {
              path: { account_id: "acct_alpha_owned_01" },
              idempotencyKey: "k_00000001",
              ifMatch: "1",
              body: { drift_threshold: "0.01" },
            }
          : op === "createAccountAction"
            ? {
                path: { account_id: "acct_alpha_owned_01" },
                idempotencyKey: "k_00000002",
                body: {
                  action: "leave_template" as const,
                  parameters: { template_id: "template_us_sp500_following_v1" },
                },
              }
            : op === "listAccountRecords"
              ? {
                  path: { account_id: "acct_alpha_owned_01" },
                  query: { cursor: "expired" },
                }
              : {};
      const err = (await client
        .call(op, opts as never)
        .catch((e: unknown) => e)) as InvestorApiError;
      expect(err).toBeInstanceOf(InvestorApiError);
      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
    },
  );

  it("the preference confirmation example sequence is representable: challenge → consent → confirmed body under a NEW key", () => {
    const seq = examples.preference_confirmation as {
      initial: { key: string; body: Record<string, unknown> };
      confirmed: { key: string; body: Record<string, unknown> };
      challenge: { error: { continuation: { continuation_ref: string } } };
      consent_request: { disclosure_key: string };
    };
    expect(seq.confirmed.key).not.toBe(seq.initial.key);
    expect(seq.confirmed.body["continuation_ref"]).toBe(
      seq.challenge.error.continuation.continuation_ref,
    );
    expect(typeof seq.confirmed.body["consent_receipt_id"]).toBe("string");
    // Same desired fields on the retry.
    for (const k of Object.keys(seq.initial.body)) {
      expect(seq.confirmed.body[k]).toEqual(seq.initial.body[k]);
    }
  });
});

describe("contract selection (founder mandate 2026-09-10)", () => {
  const ROOT2 = join(__dirname, "..", "..");
  it("CURRENT.json (vendored from Daniel's handoff root) resolves to alpha.3 and its digest matches the selected bundle", () => {
    const current = JSON.parse(
      readFileSync(join(ROOT2, "contracts/investor-api/CURRENT.json"), "utf8"),
    ) as {
      contract_version: string;
      package_path: string;
      package_content_sha256: string;
      archive_status: string;
    };
    expect(current.contract_version).toBe("v1.1.0-alpha.3");
    expect(current.package_path).toBe("v1.1.0-alpha.3");
    expect(current.archive_status).toBe("superseded_reference_only");
    expect(current.package_content_sha256).toBe(
      "5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608",
    );
    expect(current.package_content_sha256).toBe(
      (
        JSON.parse(readFileSync(join(PKG, "bundle.json"), "utf8")) as {
          package_content_sha256: string;
        }
      ).package_content_sha256,
    );
    expect(CONTRACT_PACKAGE_DIR.endsWith(current.package_path)).toBe(true);
  });

  it("alpha.3 is byte-exact against its own bundle", () => {
    const bundle = JSON.parse(
      readFileSync(join(PKG, "bundle.json"), "utf8"),
    ) as { artifacts: Array<{ path: string; sha256: string }> };
    for (const a of bundle.artifacts) {
      expect(
        createHash("sha256")
          .update(readFileSync(join(PKG, a.path)))
          .digest("hex"),
        a.path,
      ).toBe(a.sha256);
    }
  });

  it("no runtime fallback to alpha.2 exists: the version string appears in no runtime source and every contract import resolves to the selected package", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const full = join(dir, n);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    for (const f of walk(join(ROOT2, "src")).filter(
      (f) => /\.ts$/.test(f) && !f.includes("__tests__"),
    )) {
      const code = readFileSync(f, "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      expect(code, relative(ROOT2, f)).not.toMatch(/alpha\.2/);
      for (const m of code.matchAll(
        /from\s+["']([^"']*contracts\/investor-api\/[^"']+)["']/g,
      )) {
        expect(m[1], relative(ROOT2, f)).toContain("/v1.1.0-alpha.3/");
      }
    }
  });
});

describe("optional request bodies", () => {
  it("OPTIONAL_REQUEST_BODY_OPERATIONS equals the openapi operations whose requestBody is not required", () => {
    const openapi = JSON.parse(
      readFileSync(join(PKG, "openapi.json"), "utf8"),
    ) as {
      paths: Record<
        string,
        Record<
          string,
          { operationId?: string; requestBody?: { required?: boolean } }
        >
      >;
    };
    const optional = new Set<string>();
    for (const ops of Object.values(openapi.paths)) {
      for (const op of Object.values(ops)) {
        if (
          op.requestBody &&
          op.requestBody.required !== true &&
          op.operationId
        )
          optional.add(op.operationId);
      }
    }
    expect([...OPTIONAL_REQUEST_BODY_OPERATIONS].sort()).toEqual(
      [...optional].sort(),
    );
  });
});
