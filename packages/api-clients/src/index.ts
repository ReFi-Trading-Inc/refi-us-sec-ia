// Public surface for the @refi/api-clients package.
//
// `./generated/api` is the canonical public surface (Phase 2.5 cutover
// direction). The legacy `./compat` types are kept for internal Phase 2
// hook consumption (subscription-mode, execution-policy, exceptions) but
// NOT re-exported — the public surface is `./generated/api` only, to avoid
// `export *` ambiguity on the many overlapping type names.
export * from "./generated/api";

// Phase 2 Surface-1 projection types that are not yet in the OpenAPI-generated
// surface. Re-exported explicitly so the `export *` above does not collide.
export type {
  SubscriptionMode,
  SubscriptionModeState,
  RecommendationProjection,
  RecommendationProjectionStatus,
  InvestorRecommendationsResponse,
} from "./compat";

export {
  apiFetch,
  ApiError,
  getCorrelationId,
  setCorrelationId,
} from "./client";
export type { ApiRequestInit } from "./client";

export { useSession, useTier } from "./hooks/session";
export {
  buildSiweMessage,
  siweErrorCode,
  useSiweNonce,
  useSiweVerify,
  useSessionRefresh,
  useSignOut,
} from "./hooks/auth";
export type { SiweMessageInput, SiweNonceParams } from "./hooks/auth";
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
export {
  useRecommendations,
  useRecommendation,
  useRecommendationDetail,
  usePatchRecommendation,
} from "./hooks/recommendations";
export {
  useSubscriptionMode,
  useInvestorRecommendations,
} from "./hooks/subscription-mode";

// Phase 2 Surfaces 2–6: Execution Policy + Managed lifecycle.
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

// Phase 2 Surface 7: Exception Review.
// The full implementation supersedes the Phase 2.5 `useExceptions` stub —
// `useInvestorExceptions` is the canonical hook. `useExceptions` is kept as
// a deprecated alias so the Phase 2.5 dashboard and recommendation-detail
// pages keep compiling; new code should use `useInvestorExceptions`.
export {
  useInvestorExceptions,
  useResolveException,
  mapResolutionToBackend,
  describeBackendResolution,
  isDismissResolution,
  // Phase 2.5 stub kept for the dashboard + recommendation-detail consumers
  // that still read `Exception[]` directly. New code should prefer
  // `useInvestorExceptions`.
  useExceptions,
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

// Phase 2.5 BFF wrappers (dashboard / risk snapshot / order lineage).
export { useDashboard, useOrderLineage, useRiskSnapshot } from "./hooks/bff";

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

// Persona registry — used by the dev-only PersonaSwitcher (MIG-P2.5-10).
// In production builds the switcher does not render and consumers do not
// reach this surface, but keeping it on the package root keeps the import
// path consistent for tests and future tooling.
export {
  PERSONAS,
  PERSONA_COOKIE,
  PERSONA_LIST,
  davidKim,
  getActivePersona,
  mayaThompson,
  sarahPatel,
  type PersonaId,
  type PersonaPackage,
} from "./mocks/fixtures/personas";

// Compliance verdict matrix + scenario resolver (MIG-P2.5-03).
// Dev-only — selects MSW handler branches deterministically for Playwright
// snapshots and the dev-only ScenarioSwitcher UI.
export {
  COMPLIANCE_SCENARIO_IDS,
  VERDICT_FIXTURES,
  type ScenarioId,
  type ScenarioVerdict,
} from "./mocks/fixtures/compliance/verdicts";
export {
  SCENARIO_COOKIE,
  SCENARIO_QUERY_PARAM,
  getActiveScenario,
  getActiveScenarioId,
} from "./mocks/scenarios";
