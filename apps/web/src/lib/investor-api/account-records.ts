/**
 * Investor activity READS through the frozen v1.1.0-alpha.2 client (C1b-2
 * row 20): `listAccountRecords` / `getAccountRecord`, projected into a stable
 * investor-visible read model.
 *
 * All 16 `AccountRecord` variants are rendered READ-ONLY. The five
 * execution-chain variants (`account_intent`, `risk_decision`,
 * `execution_plan`, `order`, `fill`) were withheld while D-LAUNCH-06 was open;
 * with the decision CLOSED — YES (2026-09-04) an execution-capable Alpha must
 * show the investor what was done on their behalf, so they are now rendered as
 * audit records with their authoritative status and reason codes. The
 * classification map stays exhaustive over the union (a new variant breaks the
 * build) and now drives a CATEGORY label, never a filter. No record carries a
 * control: there is nothing to accept, approve, cancel, or execute here.
 *
 * No narrative is fabricated: the view carries the authoritative record type,
 * status, reason codes and references, and the page formats them neutrally.
 */
import type { OperationResponse } from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";
import { collectPages, CONTRACT_MAX_PAGE_SIZE } from "./pagination";

export type ContractAccountRecord =
  OperationResponse<"getAccountRecord">["data"];
export type AccountRecordType = ContractAccountRecord["record_type"];

export type RecordCategory = "account" | "execution_chain";

/** Exhaustive over the generated union — adding a variant breaks the build. */
export const ACCOUNT_RECORD_CATEGORY: Readonly<
  Record<AccountRecordType, RecordCategory>
> = {
  compliance_profile_attestation: "account",
  consent_receipt: "account",
  brokerage_connection: "account",
  brokerage_sync: "account",
  allocation: "account",
  preference: "account",
  action_receipt: "account",
  recommendation: "account",
  reconciliation: "account",
  valuation: "account",
  trading_control: "account",
  // Execution chain — rendered read-only since D-LAUNCH-06 CLOSED — YES.
  account_intent: "execution_chain",
  risk_decision: "execution_chain",
  execution_plan: "execution_chain",
  order: "execution_chain",
  fill: "execution_chain",
};

export const ACCOUNT_RECORD_TYPES = Object.keys(
  ACCOUNT_RECORD_CATEGORY,
) as AccountRecordType[];

export const EXECUTION_CHAIN_RECORD_TYPES = ACCOUNT_RECORD_TYPES.filter(
  (t) => ACCOUNT_RECORD_CATEGORY[t] === "execution_chain",
);

export interface ActivityRecordView {
  recordId: string;
  recordType: AccountRecordType;
  category: RecordCategory;
  createdAt: string;
  correlationId: string;
  sourceVersion: string;
  entityId: string;
  status: string;
  reasonCodes: string[];
  effectiveAt: string;
  completedAt: string | null;
  relatedRecordId: string | null;
  /** Decimal strings preserved; null when the record carries none. */
  notional: string | null;
  quantity: string | null;
  currency: string | null;
}

/** Fail closed: a record whose type is not in the exhaustive map is never rendered. */
export function isKnownRecordType(record: ContractAccountRecord): boolean {
  return (
    (ACCOUNT_RECORD_CATEGORY as Record<string, RecordCategory | undefined>)[
      record.record_type
    ] !== undefined
  );
}

export function projectActivityRecord(
  r: ContractAccountRecord,
): ActivityRecordView {
  return {
    recordId: r.record_id,
    recordType: r.record_type,
    category: ACCOUNT_RECORD_CATEGORY[r.record_type],
    createdAt: r.created_at,
    correlationId: r.correlation_id,
    sourceVersion: r.source_version,
    entityId: r.details.entity_id,
    status: r.details.status,
    reasonCodes: [...r.details.reason_codes],
    effectiveAt: r.details.effective_at,
    completedAt: r.details.completed_at ?? null,
    relatedRecordId: r.details.related_record_id ?? null,
    notional: r.details.notional ?? null,
    quantity: r.details.quantity ?? null,
    currency: r.details.currency ?? null,
  };
}

/** Validate-all, render-all (read-only): the investor projection of a record list. */
export function projectSignalActivity(records: ContractAccountRecord[]): {
  items: ActivityRecordView[];
  excludedCount: number;
} {
  const items: ActivityRecordView[] = [];
  let excludedCount = 0;
  for (const r of records) {
    if (isKnownRecordType(r)) items.push(projectActivityRecord(r));
    else excludedCount++; // unknown variant: impossible after client validation; never rendered
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items, excludedCount };
}

/** Bounded: at most this many contract pages of 100. */
export const ACTIVITY_MAX_PAGES = 2;

export async function listSignalActivity(
  client: InvestorApiReadClient,
  accountId: string,
): Promise<{
  items: ActivityRecordView[];
  excludedCount: number;
  truncated: boolean;
}> {
  const collected = await collectPages(
    async (cursor) => {
      const res = await client.call("listAccountRecords", {
        path: { account_id: accountId },
        query: { page_size: CONTRACT_MAX_PAGE_SIZE, cursor },
      });
      return { items: res.data.data.items, page: res.data.data.page };
    },
    { maxPages: ACTIVITY_MAX_PAGES },
  );
  const projected = projectSignalActivity(collected.items);
  return { ...projected, truncated: collected.truncated };
}

export async function getSignalActivityRecord(
  client: InvestorApiReadClient,
  accountId: string,
  recordId: string,
): Promise<ActivityRecordView | null> {
  const res = await client.call("getAccountRecord", {
    path: { account_id: accountId, record_id: recordId },
  });
  const record = res.data.data;
  return isKnownRecordType(record) ? projectActivityRecord(record) : null;
}
