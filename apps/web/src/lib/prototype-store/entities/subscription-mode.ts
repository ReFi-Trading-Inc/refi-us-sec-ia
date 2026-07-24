/**
 * Subscription mode — Signal vs Managed.
 *
 * Independent of lifecycle and execution policy: a `signal` account never
 * has an execution policy or managed execution state; a `managed` account
 * has both.
 */
import { makePrototypeMeta, type PrototypeMeta } from "../store";
import { resolveKvStore } from "../../store";

export type SubscriptionMode = "signal" | "managed";

export interface SubscriptionModeState {
  accountId: string;
  mode: SubscriptionMode;
  selectedAt: string;
  meta: PrototypeMeta;
}

// Routed through the S3 factory. Mode selection is a state-machine
// input that many downstream contract assertions depend on — durable
// backing is what keeps the projection consistent across redeploys.
const states = resolveKvStore<SubscriptionModeState>(
  "subscription-mode",
  "subscription-modes",
);

export async function getSubscriptionMode(
  accountId: string,
): Promise<SubscriptionModeState | null> {
  return states.get(accountId);
}

export async function setSubscriptionMode(args: {
  accountId: string;
  mode: SubscriptionMode;
  correlationId: string;
}): Promise<SubscriptionModeState> {
  const stored: SubscriptionModeState = {
    accountId: args.accountId,
    mode: args.mode,
    selectedAt: new Date().toISOString(),
    meta: makePrototypeMeta(args.correlationId),
  };
  await states.put(args.accountId, stored);
  return stored;
}
