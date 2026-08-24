/**
 * InvestorActionReceipt — append-only durable record of every state-changing
 * investor action. Owned by the frontend even after backend lands; surfaces in
 * the Records Center.
 */
import { appendOnlyStore } from "../store";
import type { InvestorActionName } from "../../sec203a/actions";
import {
  receiptVerbFor,
  type InvestorActionReceiptVerb,
} from "../../sec203a/admin-verbs";

export interface InvestorActionReceipt {
  receiptId: string;
  action: InvestorActionName;
  /**
   * Daniel's backend action verb this investor action translates to, when one
   * exists. Recorded so the audit trail carries backend vocabulary even while
   * the BFF runs prototype-only. Omitted for BFF-only actions (e.g.
   * acknowledgeDisclosure).
   *
   * This is the RECEIPT vocabulary, a superset of the `/actions` emission
   * allowlist: `update_prefs` appears here because preference updates create
   * the same immutable receipts, even though they travel the dedicated
   * preferences route (Daniel 2026-08-17 §6).
   */
  adminVerb?: InvestorActionReceiptVerb;
  actor: "user" | "system";
  authId: string;
  accountId?: string;
  correlationId: string;
  inputsHash?: string;
  outcome: "ok" | "rejected" | "blocked";
  reasonCode?: string;
  references: string[];
  emittedAt: string;
  source: "prototype-bff";
}

const receipts = appendOnlyStore<InvestorActionReceipt>("action-receipts");

export async function appendActionReceipt(args: {
  action: InvestorActionName;
  actor: "user" | "system";
  authId: string;
  accountId?: string;
  correlationId: string;
  inputsHash?: string;
  outcome: "ok" | "rejected" | "blocked";
  reasonCode?: string;
  references?: string[];
}): Promise<InvestorActionReceipt> {
  const verb = receiptVerbFor(args.action);
  const receipt: InvestorActionReceipt = {
    receiptId: crypto.randomUUID(),
    action: args.action,
    ...(verb ? { adminVerb: verb } : {}),
    actor: args.actor,
    authId: args.authId,
    ...(args.accountId ? { accountId: args.accountId } : {}),
    correlationId: args.correlationId,
    ...(args.inputsHash ? { inputsHash: args.inputsHash } : {}),
    outcome: args.outcome,
    ...(args.reasonCode ? { reasonCode: args.reasonCode } : {}),
    references: args.references ?? [],
    emittedAt: new Date().toISOString(),
    source: "prototype-bff",
  };
  await receipts.append(receipt);
  return receipt;
}

export async function listActionReceipts(args: {
  authId?: string;
  accountId?: string;
  action?: InvestorActionName;
  limit?: number;
}): Promise<InvestorActionReceipt[]> {
  const all = await receipts.list((r) => {
    if (args.authId && r.authId !== args.authId) return false;
    if (args.accountId && r.accountId !== args.accountId) return false;
    if (args.action && r.action !== args.action) return false;
    return true;
  });
  const sorted = all.sort((a, b) => b.emittedAt.localeCompare(a.emittedAt));
  return args.limit ? sorted.slice(0, args.limit) : sorted;
}
