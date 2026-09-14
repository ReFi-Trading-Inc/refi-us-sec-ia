/**
 * Founder decision F-F1 (2026-09-13): Closed Alpha is PAPER ONLY. LIVE stays
 * disabled and unrepresentable as an OPERABLE connection at the Alpha
 * frontend boundary, even though the alpha.4 contract can represent
 * `account_environment: live`.
 *
 * These tests prove a LIVE brokerage connection reported by the backend can
 * never become operable through the frontend: it is projected as HELD
 * (evidence preserved, environment word verbatim, never relabelled paper),
 * it never wins selection over a paper connection, it never satisfies the
 * activation step, and rotate/sync refuse it before any upstream mutation.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT_PACKAGE_DIR } from "../investor-api/package";
import {
  getBrokerageConnection,
  projectBrokerageConnection,
  type ContractBrokerageConnection,
} from "../../../../apps/web/src/lib/investor-api/brokerage-connection";
import {
  assertAlphaOperableConnection,
  assertOwnedConnection,
  rotateBrokerageCredentials,
  syncBrokerageConnection,
} from "../../../../apps/web/src/lib/investor-api/brokerage-maintenance";
import type { InvestorApiReadClient } from "../../../../apps/web/src/lib/investor-api/demo-client";

const examples = JSON.parse(
  readFileSync(
    join(__dirname, "../..", CONTRACT_PACKAGE_DIR, "examples.json"),
    "utf8",
  ),
) as {
  responses: {
    BrokerageConnectionEnvelope: { data: ContractBrokerageConnection };
  };
};
const base = examples.responses.BrokerageConnectionEnvelope.data;
const ACCOUNT = "acct_alpha_owned_01";

function conn(
  overrides: Partial<ContractBrokerageConnection>,
): ContractBrokerageConnection {
  return { ...base, account_id: ACCOUNT, ...overrides };
}

function fakeClient(items: ContractBrokerageConnection[]) {
  const calls: string[] = [];
  const client = {
    call: (op: string) => {
      calls.push(op);
      if (op === "listBrokerageConnections") {
        return Promise.resolve({
          status: 200,
          data: {
            data: { items, page: { has_more: false, next_cursor: null } },
          },
        });
      }
      throw new Error(`unexpected upstream operation ${op}`);
    },
  } as unknown as InvestorApiReadClient;
  return { client, calls };
}

const LIVE = conn({
  connection_id: "brokerconn_live_0001",
  account_environment: "live",
  connection_status: "CONNECTED",
});
const PAPER = conn({
  connection_id: "brokerconn_paper_0001",
  account_environment: "paper",
  connection_status: "CONNECTED",
});

describe("F-F1: a LIVE brokerage connection is held, never operable", () => {
  it("contract permits live, the projection preserves the word but marks it held", () => {
    // The contract itself represents live; that is not product permission.
    expect(base.account_environment).toBe("paper");
    const view = projectBrokerageConnection(LIVE);
    expect(view.environment).toBe("live"); // evidence preserved, not relabelled
    expect(view.alphaOperable).toBe(false);
    expect(view.heldReason).toBe("live_environment_unsupported");
    const paper = projectBrokerageConnection(PAPER);
    expect(paper.alphaOperable).toBe(true);
    expect(paper.heldReason).toBeNull();
  });

  it("a terminal paper connection is not operable either", () => {
    const view = projectBrokerageConnection(
      conn({ account_environment: "paper", connection_status: "DISCONNECTED" }),
    );
    expect(view.alphaOperable).toBe(false);
    expect(view.heldReason).toBeNull();
  });

  it("selection prefers the paper connection over a live one, regardless of order", async () => {
    for (const items of [
      [LIVE, PAPER],
      [PAPER, LIVE],
    ]) {
      const { client } = fakeClient(items);
      const view = await getBrokerageConnection(client, ACCOUNT);
      expect(view?.connectionId).toBe("brokerconn_paper_0001");
      expect(view?.alphaOperable).toBe(true);
    }
  });

  it("with only a live connection, the held record is surfaced — not hidden, not deleted, not relabelled", async () => {
    const { client } = fakeClient([LIVE]);
    const view = await getBrokerageConnection(client, ACCOUNT);
    expect(view).not.toBeNull();
    expect(view?.connectionId).toBe("brokerconn_live_0001");
    expect(view?.environment).toBe("live");
    expect(view?.alphaOperable).toBe(false);
    expect(view?.heldReason).toBe("live_environment_unsupported");
  });

  it("rotate and sync refuse a live connection before any mutation is built", async () => {
    const { client, calls } = fakeClient([LIVE, PAPER]);
    expect(
      await assertAlphaOperableConnection(
        client,
        ACCOUNT,
        "brokerconn_live_0001",
      ),
    ).toEqual({ kind: "unsupported_environment" });
    expect(
      await assertAlphaOperableConnection(
        client,
        ACCOUNT,
        "brokerconn_paper_0001",
      ),
    ).toEqual({ kind: "owned" });
    const rotate = await rotateBrokerageCredentials(
      client,
      ACCOUNT,
      "brokerconn_live_0001",
      { apiKeyId: "PK000000000000000000", apiSecretKey: "a".repeat(40) },
    );
    expect(rotate).toEqual({
      kind: "connection_out_of_scope",
      reason: "unsupported_environment",
    });
    const sync = await syncBrokerageConnection(
      client,
      ACCOUNT,
      "brokerconn_live_0001",
    );
    expect(sync).toEqual({
      kind: "connection_out_of_scope",
      reason: "unsupported_environment",
    });
    // Only reads happened; no rotate/sync operation reached the fake upstream.
    expect(calls.every((op) => op === "listBrokerageConnections")).toBe(true);
  });
});

describe("F-F1: unsupported must not mean impossible to disengage", () => {
  it("the OWNERSHIP scope admits an owned live connection; only the OPERATIONAL scope refuses it", async () => {
    const { client } = fakeClient([LIVE, PAPER]);
    // Disengagement scope: environment is deliberately not considered.
    expect(
      await assertOwnedConnection(client, ACCOUNT, "brokerconn_live_0001"),
    ).toEqual({ kind: "owned" });
    // Operational scope: the same connection is not operable.
    expect(
      await assertAlphaOperableConnection(
        client,
        ACCOUNT,
        "brokerconn_live_0001",
      ),
    ).toEqual({ kind: "unsupported_environment" });
  });

  it("ownership refusals are identical for live and paper connections", async () => {
    const { client } = fakeClient([LIVE, PAPER]);
    expect(await assertOwnedConnection(client, ACCOUNT, "x")).toEqual({
      kind: "malformed",
    });
    expect(
      await assertOwnedConnection(client, ACCOUNT, "brokerconn_other_0009"),
    ).toEqual({ kind: "not_owned" });
    const terminal = fakeClient([
      conn({
        connection_id: "brokerconn_live_dead",
        account_environment: "live",
        connection_status: "REVOKED",
      }),
    ]);
    expect(
      await assertOwnedConnection(
        terminal.client,
        ACCOUNT,
        "brokerconn_live_dead",
      ),
    ).toEqual({ kind: "terminal" });
  });
});
