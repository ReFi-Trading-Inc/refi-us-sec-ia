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
export {
  useBrokerSupported,
  useBrokerConnection,
  useBrokerAccount,
  useBrokerPositions,
  useBrokerOrders,
  useBrokerDisconnect,
} from "./hooks/broker";
// The order hook family is fully retired: useSubmitOrder/useCancelOrder
// removed 2026-07-30 (live paths waiting to be wired), useOrderPreview
// 2026-08-22 (browser-direct execution-era preview, unmounted consumer),
// useOrders 2026-08-23 with the BFF /orders routes (execution-domain read
// model, zero consumers — C2a). Broker OBSERVATION (/v1/brokers/orders) is
// untouched and belongs to C1b-2.
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
export {
  useStrategy,
  useBrokerConnectStart,
  useBrokerConnectApiKey,
  useActivationStatus,
  useActivateAccount,
} from "./hooks/onboarding";
