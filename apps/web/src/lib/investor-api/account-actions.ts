/**
 * Automated-Alpha account actions through the FROZEN v1.1.0-alpha.2 client:
 * allocation preview and the three contracted `createAccountAction` verbs
 * (join_template / update_allocation / leave_template). Nothing else exists:
 * no order, cancel, intent, transfer or liquidation is representable here,
 * and the backend owns every resulting execution decision (founder mandate:
 * backend owns execution YES; per-trade investor approval NO).
 *
 * Economic gating (mandate: "economic subscription/execution still requires
 * AccountAuthorization where contracted: YES"):
 *   - join_template and update_allocation are ECONOMIC subscription changes.
 *     `getAccountAuthorization(account_id)` is read and must be exactly
 *     AUTHORIZED before the request body is built or forwarded. PENDING,
 *     DENIED and SUSPENDED fail closed here, and the backend's status word
 *     is returned verbatim — a DENIED account is never relabelled.
 *   - leave_template is DISENGAGEMENT: it reduces exposure and is never
 *     blocked by a non-AUTHORIZED status here (the backend still decides).
 *   - createAllocationPreview is non-economic (it changes nothing) and is
 *     gated on account scope only.
 *
 * Account scope: `accountId` is always the AUTHORITATIVE scope the route
 * resolved through `resolveAccountScope` (ownership re-authorized against
 * `listAccounts` under the user assertion). No browser value names an
 * account, and every path parameter below is that resolved id.
 *
 * Every mutation carries a key derived from its account and caller-retained
 * logical operation ID. Identical recovery reuses that ID; a deliberate new
 * action uses a new ID. The backend rejects changed bodies under the same key.
 * Mutations are never automatically retried here.
 */
import type { OperationResponse } from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";
import { operationKey } from "./operation-identity";

export type AllocationPreview =
  OperationResponse<"createAllocationPreview">["data"];
export type ActionReceipt = OperationResponse<"createAccountAction">["data"];
export type AccountAuthorizationStatus =
  OperationResponse<"getAccountAuthorization">["data"]["status"];

/** Contract pattern for allocation_percent: (0, 1], decimal string. */
export const ALLOCATION_PERCENT_PATTERN =
  /^(?:0\.(?:0*[1-9][0-9]*)|1(?:\.0+)?)$/;
export const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export const ECONOMIC_ACTIONS = ["join_template", "update_allocation"] as const;
export const DISENGAGEMENT_ACTIONS = ["leave_template"] as const;
export type AccountActionVerb =
  (typeof ECONOMIC_ACTIONS)[number] | (typeof DISENGAGEMENT_ACTIONS)[number];

export function isEconomicAction(
  action: AccountActionVerb,
): action is (typeof ECONOMIC_ACTIONS)[number] {
  return (ECONOMIC_ACTIONS as readonly string[]).includes(action);
}

// ─── Allocation preview (non-economic) ──────────────────────────────────────

export interface AllocationPreviewInput {
  operationId: string;
  templateId: string;
  allocationPercent: string;
}

export function previewIdempotencyKey(
  accountId: string,
  input: AllocationPreviewInput,
): string {
  return operationKey("preview", accountId, input.operationId);
}

export async function previewAllocation(
  client: InvestorApiReadClient,
  accountId: string,
  input: AllocationPreviewInput,
): Promise<{ preview: AllocationPreview; upstreamStatus: number }> {
  const res = await client.call("createAllocationPreview", {
    path: { account_id: accountId },
    idempotencyKey: previewIdempotencyKey(accountId, input),
    body: {
      template_id: input.templateId,
      allocation_percent: input.allocationPercent,
    },
  });
  return { preview: res.data.data, upstreamStatus: res.status };
}

// ─── Account actions (join / update economic; leave disengagement) ──────────

export interface AccountActionInput {
  operationId: string;
  action: AccountActionVerb;
  templateId: string;
  /** Required by the economic verbs; absent on leave_template. */
  allocationPercent?: string;
  /** Binds an economic verb to a fresh preview (ALLOCATION_PREVIEW_STALE otherwise). */
  allocationPreviewId?: string;
}

export type AccountActionOutcome =
  | { kind: "accepted"; receipt: ActionReceipt; upstreamStatus: number }
  | {
      /** Economic verb without AUTHORIZED: nothing was forwarded upstream. */
      kind: "not_authorized";
      authorization: AccountAuthorizationStatus;
      action: AccountActionVerb;
    };

export function actionIdempotencyKey(
  accountId: string,
  input: AccountActionInput,
): string {
  return operationKey("account-action", accountId, input.operationId);
}

export async function submitAccountAction(
  client: InvestorApiReadClient,
  accountId: string,
  input: AccountActionInput,
): Promise<AccountActionOutcome> {
  if (isEconomicAction(input.action)) {
    const authz = await client.call("getAccountAuthorization", {
      path: { account_id: accountId },
    });
    const status = authz.data.data.status;
    if (status !== "AUTHORIZED") {
      return {
        kind: "not_authorized",
        authorization: status,
        action: input.action,
      };
    }
  }
  const res = await client.call("createAccountAction", {
    path: { account_id: accountId },
    idempotencyKey: actionIdempotencyKey(accountId, input),
    body: {
      action: input.action,
      parameters: {
        template_id: input.templateId,
        ...(input.allocationPercent !== undefined
          ? { allocation_percent: input.allocationPercent }
          : {}),
        ...(input.allocationPreviewId !== undefined
          ? { allocation_preview_id: input.allocationPreviewId }
          : {}),
      },
    },
  });
  return {
    kind: "accepted",
    receipt: res.data.data,
    upstreamStatus: res.status,
  };
}
