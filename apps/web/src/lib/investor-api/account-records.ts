/**
 * Investor activity READS through the frozen v1.1.0-alpha.2 client (C1b-2
 * row 20): `listAccountRecords` / `getAccountRecord`, projected into a stable
 * investor-visible read model.
 *
 * D-LAUNCH-06 filter. The generated `AccountRecord` union has 16 variants.
 * The frozen client validates ALL of them (contract fidelity), but the Signal
 * activity surface must not RENDER the five execution-chain variants —
 * `account_intent`, `risk_decision`, `execution_plan`, `order`, `fill` —
 * whose product rendering is parked behind D-LAUNCH-06. The classification is
 * an exhaustive map over the union so a new variant cannot slip through
 * silently: it must be classified here, and the type system fails otherwise.
 *
 * No narrative is fabricated: the view carries the authoritative record type,
 * status, reason codes and references, and the page formats them neutrally.
 */
import type {
  InvestorApiClient,
  OperationResponse,
} from "@refi/api-clients/investor-api";
import { collectPages, CONTRACT_MAX_PAGE_SIZE } from "./pagination";

export type ContractAccountRecord =
  OperationResponse<"getAccountRecord">["data"];
export type AccountRecordType = ContractAccountRecord["record_type"];

export type RecordVisibility = "signal_visible" | "execution_chain";

/** Exhaustive over the generated union — adding a variant breaks the build. */
export const ACCOUNT_RECORD_VISIBILITY: Readonly<
  Record<AccountRecordType, RecordVisibility>
> = {
  compliance_profile_attestation: "signal_visible",
  consent_receipt: "signal_visible",
  brokerage_connection: "signal_visible",
  brokerage_sync: "signal_visible",
  allocation: "signal_visible",
  preference: "signal_visible",
  action_receipt: "signal_visible",
  recommendation: "signal_visible",
  reconciliation: "signal_visible",
  valuation: "signal_visible",
  trading_control: "signal_visible",
  // Execution chain — parked behind D-LAUNCH-06; never rendered in Signal.
  account_intent: "execution_chain",
  risk_decision: "execution_chain",
  execution_plan: "execution_chain",
  order: "execution_chain",
  fill: "execution_chain",
};

export const EXECUTION_CHAIN_RECORD_TYPES = (
  Object.keys(ACCOUNT_RECORD_VISIBILITY) as AccountRecordType[]
).filter((t) => ACCOUNT_RECORD_VISIBILITY[t] === "execution_chain");

export const SIGNAL_VISIBLE_RECORD_TYPES = (
  Object.keys(ACCOUNT_RECORD_VISIBILITY) as AccountRecordType[]
).filter((t) => ACCOUNT_RECORD_VISIBILITY[t] === "signal_visible");

export type SignalVisibleRecordType = Exclude<
  AccountRecordType,
  "account_intent" | "risk_decision" | "execution_plan" | "order" | "fill"
>;

export interface ActivityRecordView {
  recordId: string;
  recordType: SignalVisibleRecordType;
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

/** Fail closed: anything not explicitly `signal_visible` is excluded. */
export function isSignalVisible(
  record: ContractAccountRecord,
): record is ContractAccountRecord & { record_type: SignalVisibleRecordType } {
  const visibility = (
    ACCOUNT_RECORD_VISIBILITY as Record<string, RecordVisibility | undefined>
  )[record.record_type];
  return visibility === "signal_visible";
}

export function projectActivityRecord(
  r: ContractAccountRecord & { record_type: SignalVisibleRecordType },
): ActivityRecordView {
  return {
    recordId: r.record_id,
    recordType: r.record_type,
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

/** Validate-all, render-some: the Signal projection of a record list. */
export function projectSignalActivity(records: ContractAccountRecord[]): {
  items: ActivityRecordView[];
  excludedCount: number;
} {
  const items: ActivityRecordView[] = [];
  let excludedCount = 0;
  for (const r of records) {
    if (isSignalVisible(r)) items.push(projectActivityRecord(r));
    else excludedCount++;
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items, excludedCount };
}

/** Bounded: at most this many contract pages of 100. */
export const ACTIVITY_MAX_PAGES = 2;

export async function listSignalActivity(
  client: InvestorApiClient,
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
  client: InvestorApiClient,
  accountId: string,
  recordId: string,
): Promise<ActivityRecordView | null> {
  const res = await client.call("getAccountRecord", {
    path: { account_id: accountId, record_id: recordId },
  });
  const record = res.data.data;
  // An execution-chain record is not visible in Signal: same answer as absent.
  return isSignalVisible(record) ? projectActivityRecord(record) : null;
}
