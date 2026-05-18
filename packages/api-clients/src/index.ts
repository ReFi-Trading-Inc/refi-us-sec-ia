// Public surface for the @refi/api-clients package.
export * from "./generated/api";
export {
  apiFetch,
  ApiError,
  getCorrelationId,
  setCorrelationId,
} from "./client";
export type { ApiRequestInit } from "./client";

export { useSession } from "./hooks/session";
export { useKycStatus } from "./hooks/kyc";
export {
  useBrokerSupported,
  useBrokerConnection,
  useBrokerAccount,
  useBrokerPositions,
  useBrokerOrders,
} from "./hooks/broker";
export {
  useOrders,
  useOrderPreview,
  useSubmitOrder,
  useCancelOrder,
} from "./hooks/orders";
export { useRecommendations, useRecommendation } from "./hooks/recommendations";
export { useActivity } from "./hooks/activity";
