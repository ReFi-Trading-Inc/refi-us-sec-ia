/**
 * Route inventory derived from the vendored contract — never hand-written.
 *
 * `contract.json.routes` is the source; the generated `operations` interface
 * (from `openapi.json`) supplies the type-level operation ids. A test asserts
 * the two agree, so a contract version bump that adds or removes an operation
 * cannot go unnoticed.
 */
import type { operations } from "../generated/investor-api.gen";
import { CONTRACT_ROUTES, type ContractRoute } from "./package";

export type OperationId = keyof operations;

function buildIndex(): Readonly<Partial<Record<OperationId, ContractRoute>>> {
  const index: Partial<Record<OperationId, ContractRoute>> = {};
  for (const route of CONTRACT_ROUTES) {
    index[route.operation_id as OperationId] = route;
  }
  return index;
}

export const ROUTES_BY_OPERATION = buildIndex();

export function routeFor(operationId: OperationId): ContractRoute {
  const route = ROUTES_BY_OPERATION[operationId];
  if (route === undefined) {
    throw new Error(
      `Operation "${operationId}" is not in the vendored contract inventory`,
    );
  }
  return route;
}

/** Every Investor API route sits under this prefix; identity routes do not. */
export const INVESTOR_API_PREFIX = "/api/v1/investor" as const;

/**
 * Named routes the BFF has referenced since Daniel's 2026-08-17 reply. Values
 * are now DERIVED from the contract; the names are kept so call sites do not
 * churn. Two former "GET | POST" routes (eligibility, advisory profiles) are
 * read-only in the package — their writers were removed in favour of
 * `createComplianceProfileAttestation`.
 */
export const INVESTOR_API_ROUTES = {
  ONBOARDING_STATUS: routeFor("getOnboardingStatus").path,
  ELIGIBILITY: routeFor("getEligibility").path,
  KYC: routeFor("getKycStatus").path,
  ADVISORY_PROFILES: routeFor("listAdvisoryProfiles").path,
  ADVISORY_PROFILE_CURRENT: routeFor("getCurrentAdvisoryProfile").path,
  DISCLOSURES: routeFor("listEffectiveDisclosures").path,
  CONSENTS: routeFor("listConsents").path,
  ACCOUNT_AUTHORIZATION: routeFor("getAccountAuthorization").path,
  ACCOUNT_ACTIONS: routeFor("createAccountAction").path,
  ACCOUNT_PREFERENCES: routeFor("getAccountPreferences").path,
  ACCOUNT_PREFERENCES_HISTORY: routeFor("listAccountPreferenceHistory").path,
  ACCOUNT_EVENTS: routeFor("streamAccountEvents").path,
} as const;

export type InvestorApiRoute =
  (typeof INVESTOR_API_ROUTES)[keyof typeof INVESTOR_API_ROUTES];

const PATH_PARAM = /\{([^}]+)\}/g;

/** Fill `{name}` segments; every declared parameter must be supplied. */
export function expandPath(
  template: string,
  params: Readonly<Record<string, string>> = {},
): string {
  return template.replace(PATH_PARAM, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === "") {
      throw new Error(`Missing path parameter "${name}" for ${template}`);
    }
    return encodeURIComponent(value);
  });
}

export function withAccountId(template: string, accountId: string): string {
  return expandPath(template, { account_id: accountId });
}
