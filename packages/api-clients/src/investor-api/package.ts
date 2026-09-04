/**
 * Pins for the vendored Investor API contract package.
 *
 * The package under `contracts/investor-api/v1.1.0-alpha.2/` is Daniel's
 * frontend integration handoff, vendored byte-for-byte (see
 * `contracts/investor-api/PACKAGE.md`). This module is the only place that
 * names the version and reads `bundle.json`/`contract.json`; everything else
 * imports from here so a version bump is one directory + one constant.
 *
 * Server-only. Nothing here may reach a browser bundle.
 */
import bundle from "../../contracts/investor-api/v1.1.0-alpha.2/bundle.json";
import contract from "../../contracts/investor-api/v1.1.0-alpha.2/contract.json";

export const CONTRACT_VERSION = "v1.1.0-alpha.2" as const;

/** Relative to the package root (`packages/api-clients`). */
export const CONTRACT_PACKAGE_DIR =
  "contracts/investor-api/v1.1.0-alpha.2" as const;

export const PACKAGE_CONTENT_SHA256 = bundle.package_content_sha256;
export const SOURCE_CONTRACT_SHA256 = bundle.source.sha256;

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type RuntimeOwner = "identity-ccid" | "investor-api";

/** One row of `contract.json.routes` — the authoritative route inventory. */
export interface ContractRoute {
  readonly operation_id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly request_schema: string | null;
  readonly response_schema: string;
  readonly success_status: number;
  readonly runtime_owner: RuntimeOwner;
  readonly error_profile: string;
}

export const CONTRACT_ROUTES: readonly ContractRoute[] =
  contract.routes as unknown as readonly ContractRoute[];

export const CONTRACT_BUNDLE = bundle;
export const CONTRACT_DOCUMENT = contract;

if (bundle.contract_version !== CONTRACT_VERSION) {
  throw new Error(
    `Vendored bundle.json declares ${bundle.contract_version}, expected ${CONTRACT_VERSION}`,
  );
}
if (contract.routes.length !== contract.route_policy.product_route_count) {
  throw new Error(
    `contract.json lists ${String(contract.routes.length)} routes but declares product_route_count=${String(contract.route_policy.product_route_count)}`,
  );
}
