/**
 * The canonical broker-connection mutation has NO AccountAuthorization
 * precondition (Daniel 2026-09-09, correcting the 2026-09-05 rebaseline): an
 * admitted account with no brokerage connection legitimately reports DENIED
 * with BROKER_CONNECTION_MISSING, so gating the FIRST connection on AUTHORIZED
 * was circular. Exercised with a recording fake client so every authorization
 * status is proven irrelevant to connecting — and so the credential is
 * forwarded exactly once and never echoed.
 */
import { describe, expect, test } from "vitest";
import { connectBrokerage } from "../../../../apps/web/src/lib/investor-api/brokerage-connection";

type Call = { op: string; opts: unknown };

function fakeClient(authorization: string, reasonCodes: string[] = []) {
  const calls: Call[] = [];
  const client = {
    call: (op: string, opts?: unknown) => {
      calls.push({ op, opts });
      if (op === "getAccountAuthorization") {
        return Promise.resolve({
          status: 200,
          correlationId: "corr_test",
          headers: new Headers(),
          data: {
            data: {
              state_version: 1,
              status: authorization,
              reason_codes: reasonCodes,
              expires_at: null,
              policy_version: "closed-us-alpha-1",
              last_evaluated_at: "2026-09-05T00:00:00Z",
            },
          },
        });
      }
      if (op === "createBrokerageConnection") {
        return Promise.resolve({
          status: 202,
          correlationId: "corr_test",
          headers: new Headers(),
          data: {
            data: {
              connection_id: "brokerconn_test_0001",
              account_id: "acct_test_0000001",
              broker: "alpaca",
              account_environment: "paper",
              connection_status: "PENDING_VALIDATION",
              credential_status: "PENDING",
              state_version: 1,
              created_at: "2026-09-05T00:00:00Z",
              updated_at: "2026-09-05T00:00:00Z",
              validated_at: null,
              last_synced_at: null,
              stale_at: null,
              sync_run_id: null,
              broker_account_id: null,
              action_receipt_id: "action_test_0000001",
              status_path: "/x",
            },
          },
        });
      }
      throw new Error(`unexpected op ${op}`);
    },
  };
  return { client: client as never, calls };
}

const INPUT = {
  apiKeyId: "PKTESTFIXTURE0000001",
  apiSecretKey: "testFixtureSecret".padEnd(40, "0"),
};

describe("connectBrokerage: no AccountAuthorization precondition before the first connection", () => {
  test("DENIED / BROKER_CONNECTION_MISSING (the legitimate pre-connection state) → the connection is created; authorization is not consulted", async () => {
    const { client, calls } = fakeClient("DENIED", [
      "BROKER_CONNECTION_MISSING",
    ]);
    const out = await connectBrokerage(
      client,
      "acct_test_0000001",
      INPUT,
      "k".repeat(16),
    );
    expect(out.kind).toBe("accepted");
    expect(calls.map((c) => c.op)).toEqual(["createBrokerageConnection"]);
    expect(JSON.stringify(out)).not.toMatch(
      /PKTESTFIXTURE|testFixtureSecret|api_key|api_secret/,
    );
  });

  test.each(["AUTHORIZED", "PENDING", "DENIED", "SUSPENDED", "SOMETHING_NEW"])(
    "%s → createBrokerageConnection is called exactly once and getAccountAuthorization never; no credential leaves",
    async (status) => {
      const { client, calls } = fakeClient(status);
      const out = await connectBrokerage(
        client,
        "acct_test_0000001",
        INPUT,
        "k".repeat(16),
      );
      expect(out.kind).toBe("accepted");
      expect(
        calls.filter((c) => c.op === "createBrokerageConnection"),
      ).toHaveLength(1);
      expect(calls.some((c) => c.op === "getAccountAuthorization")).toBe(false);
      expect(JSON.stringify(out)).not.toMatch(
        /PKTESTFIXTURE|testFixtureSecret/,
      );
    },
  );

  test("the credential is forwarded verbatim, once, with the idempotency key, and the response is the status projection", async () => {
    const { client, calls } = fakeClient("DENIED", [
      "BROKER_CONNECTION_MISSING",
    ]);
    const out = await connectBrokerage(
      client,
      "acct_test_0000001",
      INPUT,
      "idem-key-0001",
    );
    const create = calls.find((c) => c.op === "createBrokerageConnection");
    if (!create) throw new Error("createBrokerageConnection was not called");
    const opts = create.opts as {
      body: {
        credentials: { api_key: string; api_secret: string };
        account_environment: string;
      };
      idempotencyKey: string;
    };
    expect(opts.body.account_environment).toBe("paper");
    expect(opts.body.credentials).toEqual({
      api_key: INPUT.apiKeyId,
      api_secret: INPUT.apiSecretKey,
    });
    expect(opts.idempotencyKey).toBe("idem-key-0001");
    expect(out.kind).toBe("accepted");
    // The lint project cannot resolve the web app's types across the package
    // boundary, so assert on the serialised projection.
    const serialised = JSON.stringify(out);
    expect(serialised).toMatch(/"connectionId":"brokerconn_test_0001"/);
    expect(serialised).toMatch(/"connectionStatus":"PENDING_VALIDATION"/);
  });
});
