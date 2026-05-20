/**
 * Advisory-client lifecycle (G-006).
 *
 * Current state per account + append-only transition log.
 */
import {
  appendOnlyStore,
  kvStore,
  makePrototypeMeta,
  type PrototypeMeta,
} from "../store";

export type LifecycleState =
  | "prospect"
  | "onboarding"
  | "active"
  | "paused"
  | "terminated"
  | "archived";

export interface InvestorLifecycleState {
  accountId: string;
  state: LifecycleState;
  enteredAt: string;
  previousState?: LifecycleState;
  previousEnteredAt?: string;
  reason?: string;
  meta: PrototypeMeta;
}

export interface InvestorLifecycleTransition {
  accountId: string;
  from: LifecycleState | null;
  to: LifecycleState;
  at: string;
  reason?: string;
  correlationId: string;
}

const states = kvStore<InvestorLifecycleState>("lifecycle-states");
const transitions = appendOnlyStore<InvestorLifecycleTransition>(
  "lifecycle-transitions",
);

export async function getLifecycleState(
  accountId: string,
): Promise<InvestorLifecycleState | null> {
  return states.get(accountId);
}

export async function listActiveClientCount(): Promise<number> {
  const all = await states.list();
  return all.filter((e) => e.value.state === "active").length;
}

export async function transitionLifecycle(args: {
  accountId: string;
  to: LifecycleState;
  reason?: string;
  correlationId: string;
}): Promise<InvestorLifecycleState> {
  const prior = await states.get(args.accountId);
  const now = new Date().toISOString();
  const next: InvestorLifecycleState = {
    accountId: args.accountId,
    state: args.to,
    enteredAt: now,
    ...(prior
      ? { previousState: prior.state, previousEnteredAt: prior.enteredAt }
      : {}),
    ...(args.reason ? { reason: args.reason } : {}),
    meta: makePrototypeMeta(args.correlationId),
  };
  await states.put(args.accountId, next);
  await transitions.append({
    accountId: args.accountId,
    from: prior?.state ?? null,
    to: args.to,
    at: now,
    ...(args.reason ? { reason: args.reason } : {}),
    correlationId: args.correlationId,
  });
  return next;
}

export async function listLifecycleTransitions(
  accountId: string,
): Promise<InvestorLifecycleTransition[]> {
  return transitions.list((t) => t.accountId === accountId);
}
