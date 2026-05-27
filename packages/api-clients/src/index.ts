// Public surface for the @refi/api-clients package.
export * from "./compat";
export {
  apiFetch,
  ApiError,
  getCorrelationId,
  setCorrelationId,
} from "./client";
export type { ApiRequestInit } from "./client";

export { useSession } from "./hooks/session";
export {
  buildSiweMessage,
  siweErrorCode,
  useSiweNonce,
  useSiweVerify,
  useSessionRefresh,
  useSignOut,
} from "./hooks/auth";
export type { SiweMessageInput } from "./hooks/auth";
export {
  useKycStatus,
  useKycStart,
  useKycSimulateWebhook,
  useComplianceInvalidateCache,
  isKycTerminal,
} from "./hooks/kyc";
export {
  useBrokerSupported,
  useBrokerConnection,
  useBrokerAccount,
  useBrokerPositions,
  useBrokerOrders,
  useBrokerDisconnect,
} from "./hooks/broker";
export {
  useOrders,
  useOrderPreview,
  useSubmitOrder,
  useCancelOrder,
} from "./hooks/orders";
export { useRecommendations, useRecommendation } from "./hooks/recommendations";
export {
  useSubscriptionMode,
  useInvestorRecommendations,
} from "./hooks/subscription-mode";
export {
  useExecutionPolicy,
  useExecutionPolicyDraft,
  useSaveExecutionPolicyDraft,
  useManagedExecutionState,
  usePauseManaged,
  useResumeManaged,
  useActivateExecutionPolicy,
  useDisclosureRegistry,
  useDisclosureReacknowledgement,
  useReacknowledgeDisclosure,
  useProfileReactivation,
  useReconfirmProfile,
  useInvestorStatus,
} from "./hooks/execution-policy";
export type {
  ExecutionPolicySummary,
  ExecutionPolicyDraftDto,
  SaveExecutionPolicyDraftInput,
  ManagedExecutionStateDto,
  ManagedExecutionStatus,
  StaleBrokerDataDuration,
  StaleProfileDuration,
  ActivateExecutionPolicyInput,
  ActivateExecutionPolicyResult,
  DisclosureRegistryDto,
  DisclosureReacknowledgementView,
  StaleDisclosureDto,
  ReacknowledgeDisclosureInput,
  ReacknowledgeDisclosureResult,
  ProfileReactivationView,
  ProfileReactivationBlockerReason,
  ReconfirmProfileInput,
  ReconfirmProfileResult,
  InvestorStatusDto,
} from "./hooks/execution-policy";
export { useActivity } from "./hooks/activity";
export {
  useAdvisoryProfile,
  useSaveAdvisoryProfile,
  useStrategy,
  useBrokerConnectStart,
  useBrokerConnectApiKey,
  useActivationStatus,
  useActivateAccount,
} from "./hooks/onboarding";
