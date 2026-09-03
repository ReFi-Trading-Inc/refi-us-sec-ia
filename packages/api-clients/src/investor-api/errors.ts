/** Errors raised by the Investor API client. None carries a token or credential. */

/** A wire object did not match the vendored contract — treat as a version mismatch. */
export class ContractVersionMismatchError extends Error {
  readonly schema: string;
  readonly direction: "request" | "response";
  readonly problems: readonly string[];
  constructor(
    schema: string,
    direction: "request" | "response",
    problems: readonly string[],
  ) {
    super(
      `${direction} does not match contract schema ${schema}: ${problems.join("; ")}`,
    );
    this.name = "ContractVersionMismatchError";
    this.schema = schema;
    this.direction = direction;
    this.problems = problems;
  }
}

/** The backend answered with its `{error:{code,message,correlation_id}}` envelope. */
export class InvestorApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | null;
  readonly retryAfterSeconds: number | null;
  constructor(input: {
    status: number;
    code: string;
    message: string;
    correlationId: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(`${String(input.status)} ${input.code}: ${input.message}`);
    this.name = "InvestorApiError";
    this.status = input.status;
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

/** Transport failed and the read-retry budget is exhausted (or the call was a mutation). */
export class InvestorApiTransportError extends Error {
  readonly attempts: number;
  constructor(message: string, attempts: number, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "InvestorApiTransportError";
    this.attempts = attempts;
  }
}

export class IdempotencyKeyRequiredError extends Error {
  constructor(operationId: string) {
    super(
      `${operationId} is an Investor API mutation and requires an Idempotency-Key`,
    );
    this.name = "IdempotencyKeyRequiredError";
  }
}

export class IfMatchRequiredError extends Error {
  constructor(operationId: string) {
    super(`${operationId} is a PATCH and requires If-Match`);
    this.name = "IfMatchRequiredError";
  }
}

export class RemoteBaseUrlNotAllowedError extends Error {
  constructor(hostname: string) {
    super(
      `Refusing non-loopback Investor API base URL host "${hostname}". ` +
        "The connected Dev services are not operational and no connection " +
        "addendum has promoted them; pass allowRemote only from a reviewed " +
        "BFF configuration path.",
    );
    this.name = "RemoteBaseUrlNotAllowedError";
  }
}
