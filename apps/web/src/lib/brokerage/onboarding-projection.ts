/**
 * Brokerage onboarding projection — investor-facing state over Alpaca-owned
 * brokerage onboarding (founder decision 2026-09-10, Option 1: Alpaca owns
 * brokerage KYC/CIP; ReFi integrates no separate KYC vendor).
 *
 * The frontend is never authoritative for the brokerage decision. Every state
 * this module EMITS is derived from a contract-backed `BrokerageConnection`
 * (v1.1.0-alpha.3 `connection_status` / `credential_status`) or from its
 * absence. States that alpha.3 cannot back (Alpaca application/review/approval/
 * rejection/restriction) are declared so the product vocabulary is complete,
 * but the mapper never produces them: they wait for Daniel's binding
 * (decision-kyc-model.md §3/§5, daniel-dependency-packet.md Q-A1..A8).
 *
 * Wording rule: describe the brokerage state; never claim "KYC verified",
 * "SEC verified", "fully verified" or that ReFi approved an identity.
 */
import type { ContractBrokerageConnection } from "../investor-api/brokerage-connection";

export const CONTRACT_BACKED_BROKERAGE_ONBOARDING_STATES = [
  "not_started",
  "connection_pending",
  "account_active",
  "stale",
  "action_required",
  "disconnected",
] as const;

/** Declared for the product vocabulary; NOT emitted until a backend binding exists. */
export const UNBOUND_BROKERAGE_ONBOARDING_STATES = [
  "application_started",
  "information_required",
  "under_review",
  "approved",
  "rejected",
  "restricted",
] as const;

export const BROKERAGE_ONBOARDING_STATES = [
  ...CONTRACT_BACKED_BROKERAGE_ONBOARDING_STATES,
  ...UNBOUND_BROKERAGE_ONBOARDING_STATES,
] as const;

export type BrokerageOnboardingState =
  (typeof BROKERAGE_ONBOARDING_STATES)[number];
export type ContractBackedBrokerageOnboardingState =
  (typeof CONTRACT_BACKED_BROKERAGE_ONBOARDING_STATES)[number];

/** Investor-facing wording (mandate §14): brokerage state, never an identity claim. */
export const BROKERAGE_ONBOARDING_LABELS: Record<
  BrokerageOnboardingState,
  string
> = {
  not_started: "Brokerage verification not started",
  application_started: "Brokerage application started",
  information_required: "Additional information required",
  under_review: "Brokerage account under review",
  approved: "Brokerage account approved",
  rejected: "Brokerage application not approved",
  action_required: "Action required on your brokerage connection",
  connection_pending: "Brokerage verification in progress",
  account_active: "Brokerage account connected",
  stale: "Brokerage data needs a refresh",
  disconnected: "Brokerage account disconnected",
  restricted: "Brokerage account restricted",
};

export type BrokerageOnboardingInput = Pick<
  ContractBrokerageConnection,
  "connection_status" | "credential_status"
> | null;

export interface BrokerageOnboardingProjection {
  state: ContractBackedBrokerageOnboardingState;
  label: string;
  /** What the state was derived from. Never "alpaca" directly: Alpaca is reached only through Daniel's backend. */
  source: "none" | "brokerage_connection";
  /** True only for `account_active`: the link works. It is NOT an Alpaca approval claim and NOT ReFi AccountAuthorization. */
  connectionUsable: boolean;
}

export function projectBrokerageOnboarding(
  connection: BrokerageOnboardingInput,
): BrokerageOnboardingProjection {
  if (connection === null) return finish("not_started", "none");
  const { connection_status: c, credential_status: k } = connection;
  switch (c) {
    case "DISCONNECTING":
    case "DISCONNECTED":
      return finish("disconnected", "brokerage_connection");
    case "REVOKED":
    case "ERROR":
      return finish("action_required", "brokerage_connection");
    case "STALE":
      return k === "INVALID" || k === "REVOKED"
        ? finish("action_required", "brokerage_connection")
        : finish("stale", "brokerage_connection");
    case "PENDING_VALIDATION":
      return k === "INVALID" || k === "REVOKED"
        ? finish("action_required", "brokerage_connection")
        : finish("connection_pending", "brokerage_connection");
    case "CONNECTED":
      switch (k) {
        case "VALID":
          return finish("account_active", "brokerage_connection");
        case "INVALID":
        case "REVOKED":
          return finish("action_required", "brokerage_connection");
        case "PENDING":
        case "ROTATING":
          return finish("connection_pending", "brokerage_connection");
        default:
          return unreachable(k);
      }
    default:
      return unreachable(c);
  }
}

function finish(
  state: ContractBackedBrokerageOnboardingState,
  source: BrokerageOnboardingProjection["source"],
): BrokerageOnboardingProjection {
  return {
    state,
    label: BROKERAGE_ONBOARDING_LABELS[state],
    source,
    connectionUsable: state === "account_active",
  };
}

function unreachable(value: never): never {
  throw new Error(
    `brokerage onboarding projection: unknown contract status ${String(value)} (contract drift — fail closed)`,
  );
}
