// Public surface for the @refi/api-clients package.
export * from "./compat";
export {
  apiFetch,
  ApiError,
  getCorrelationId,
  setCorrelationId,
} from "./client";
export type { ApiRequestInit } from "./client";

export {
  buildSiweMessage,
  siweErrorCode,
  useSiweNonce,
  useSiweVerify,
} from "./hooks/auth";
export type { SiweMessageInput } from "./hooks/auth";
// The order hook family is fully retired: useSubmitOrder/useCancelOrder
// removed 2026-07-30 (live paths waiting to be wired), useOrderPreview
// 2026-08-22 (browser-direct execution-era preview, unmounted consumer),
// useOrders 2026-08-23 with the BFF /orders routes (execution-domain read
// model, zero consumers — C2a). Broker observation and onboarding hooks
// (/v1/brokers/*, /v1/strategies/current, /v1/account/activation|activate)
// retired 2026-09-05 with C1b-2 rows 10–16, 24–26: the browser reads the
// same-origin BFF (/api/v1/investor/broker/connection, /onboarding).
export {
  useInvestorStatus,
  useDisclosureRegistry,
  type InvestorStatusDto,
  type ProfileReactivationView,
  type ProfileReactivationBlockerReason,
  type ReconfirmProfileInput,
  type ReconfirmProfileResult,
  type DisclosureRegistryDto,
  type StaleDisclosureDto,
  type DisclosureReacknowledgementView,
  type ReacknowledgeDisclosureInput,
  type ReacknowledgeDisclosureResult,
  type ManagedExecutionStatus,
  type ManagedExecutionStateDto,
} from "./hooks/remediation";
export {
  useInvestorExceptions,
  useResolveException,
  mapResolutionToBackend,
  describeBackendResolution,
  isDismissResolution,
} from "./hooks/exceptions";
export type {
  InvestorExceptionItem,
  InvestorExceptionsView,
  ResolveExceptionInput,
  ResolveExceptionResult,
  UiResolution,
  BackendResolution,
  ExceptionKind,
  ExceptionStatus,
} from "./hooks/exceptions";
