/**
 * @refi/api-clients/investor-api — SERVER-ONLY entry point.
 *
 * Typed client, derived routes, and contract validation for Daniel's
 * v1.1.0-alpha.2 Investor API package. Never import this from browser code;
 * the BFF is the browser's boundary.
 */
export {
  CONTRACT_VERSION,
  CONTRACT_PACKAGE_DIR,
  PACKAGE_CONTENT_SHA256,
  SOURCE_CONTRACT_SHA256,
  CONTRACT_ROUTES,
  type ContractRoute,
  type HttpMethod,
  type RuntimeOwner,
} from "./package";
export {
  INVESTOR_API_PREFIX,
  INVESTOR_API_ROUTES,
  ROUTES_BY_OPERATION,
  expandPath,
  routeFor,
  withAccountId,
  type InvestorApiRoute,
  type OperationId,
} from "./routes";
export {
  AUTH_POLICY_EXCEPTIONS,
  DEFAULT_AUTH_POLICY,
  authPolicyFor,
  type AuthPolicy,
} from "./auth-policy";
export {
  assertMatches,
  hasSchema,
  problemsAgainst,
  type SchemaName,
} from "./validation";
export {
  ContractVersionMismatchError,
  IdempotencyKeyRequiredError,
  IfMatchRequiredError,
  InvestorApiError,
  InvestorApiTransportError,
  RemoteBaseUrlNotAllowedError,
} from "./errors";
export {
  DEFAULT_MAX_BUFFERED_CHARS,
  SseProtocolError,
  parseSseFrames,
  type SseFrame,
  type SseParseOptions,
} from "./sse";
export {
  DeadlineExceededError,
  InvestorApiClient,
  createInvestorApiClient,
  CONTRACT_OPERATION_IDS,
  MAX_READ_RETRIES,
  READ_BUDGET_MS,
  STREAM_CONNECT_TIMEOUT_MS,
  type AccountEvent,
  type CallOptions,
  type InvestorApiClientOptions,
  type InvestorApiEventStream,
  type InvestorApiResult,
  type OperationRequestBody,
  type OperationResponse,
  type ValidatedAccountEvent,
} from "./client";
