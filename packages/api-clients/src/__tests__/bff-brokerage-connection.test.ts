/**
 * The canonical broker-connection mutation enforces AccountAuthorization
 * BEFORE forwarding any credential (D-LAUNCH-06 rebaseline). Exercised with a
 * recording fake client so every authorization status is proven, not just the
 * AUTHORIZED demo fixture.
 */
import { describe, expect, test } from "vitest";
import {
  connectBrokerage,
  type ConnectBrokerageOutcome,
} from "../../../../apps/web/src/lib/investor-api/brokerage-connection";

type Call = { op: string; opts: unknown };

function fakeClient(authorization: string) {
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
              reason_codes: [],
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

describe("connectBrokerage: AccountAuthorization is read and enforced before createBrokerageConnection", () => {
  test("AUTHORIZED → authorization is read first, then the connection mutation proceeds once", async () => {
    const { client, calls } = fakeClient("AUTHORIZED");
    const out = await connectBrokerage(
      client,
      "acct_test_0000001",
      INPUT,
      "k".repeat(16),
    );
    expect(out.kind).toBe("accepted");
    expect(calls.map((c) => c.op)).toEqual([
      "getAccountAuthorization",
      "createBrokerageConnection",
    ]);
    // The projection returned to the browser carries no credential field.
    expect(JSON.stringify(out)).not.toMatch(
      /PKTESTFIXTURE|testFixtureSecret|api_key|api_secret/,
    );
  });

  test.each(["PENDING", "DENIED", "SUSPENDED"])(
    "%s → blocked before create: createBrokerageConnection is never called, no credential leaves, the backend word is echoed",
    async (status) => {
      const { client, calls } = fakeClient(status);
      const out: ConnectBrokerageOutcome = await connectBrokerage(
        client,
        "acct_test_0000001",
        INPUT,
        "k".repeat(16),
      );
      expect(out).toEqual({ kind: "not_authorized", authorization: status });
      expect(calls.map((c) => c.op)).toEqual(["getAccountAuthorization"]);
      expect(JSON.stringify(out)).not.toMatch(
        /PKTESTFIXTURE|testFixtureSecret/,
      );
    },
  );

  test("an unknown/unmodelled status is treated as not authorized (fail closed)", async () => {
    const { client, calls } = fakeClient("SOMETHING_NEW");
    const out = await connectBrokerage(
      client,
      "acct_test_0000001",
      INPUT,
      "k".repeat(16),
    );
    expect(out.kind).toBe("not_authorized");
    expect(calls.map((c) => c.op)).toEqual(["getAccountAuthorization"]);
  });
});
