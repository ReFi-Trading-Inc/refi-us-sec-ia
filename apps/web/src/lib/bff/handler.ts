/**
 * BFF handler wrapper.
 *
 * Every investor route under apps/web/app/api/v1/investor/* uses one of
 * `bffRead` or `bffMutate` rather than writing its own Next route handler.
 * This guarantees:
 *   - correlation id is extracted and echoed
 *   - auth context is resolved (401 if absent on protected routes)
 *   - response is wrapped in the BffResponse envelope
 *   - state-changing routes emit an InvestorActionReceipt automatically
 *   - errors are converted to BffErrorBody, never naked Error responses
 */
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { correlationIdFrom } from "./correlation";
import { getAuthContext, type AuthContext } from "./auth";
import { isSameOrigin } from "./origin";
import { bffOk, BffErrors, type BffSource, type GapId } from "./envelope";
import type {
  InvestorActionName,
  RecordAccessAction,
} from "../sec203a/actions";
import { appendActionReceipt } from "../prototype-store/entities/receipt";
import { GATED_UNTIL_MANAGED_PAPER } from "../sec203a/admin-verbs";
import { isInvestorActionPermitted } from "../sec203a/release-policy";
import { getServerEnv } from "../config/env";
import { appendRecordAccess } from "../prototype-store/entities/record-access-log";

export interface BffContext {
  req: NextRequest;
  auth: AuthContext;
  correlationId: string;
}

export interface BffReadHandler<T> {
  source?: BffSource;
  upstreamGap?: GapId | GapId[];
  /** Set true to skip auth (e.g. public discovery endpoints). */
  allowAnonymous?: boolean;
  fetch: (
    ctx: BffContext | { req: NextRequest; correlationId: string; auth: null },
  ) => Promise<T> | T;
}

export interface BffMutateHandler<T> {
  action: InvestorActionName;
  source?: BffSource;
  upstreamGap?: GapId | GapId[];
  parse?: (body: unknown) => Promise<T> | T;
  apply: (
    ctx: BffContext & { input: T },
  ) => Promise<BffMutationResult> | BffMutationResult;
}

/** Ordinary success. Unchanged from before the refusal branch existed. */
export interface BffMutationSuccess {
  data: unknown;
  references?: string[];
  outcome?: "ok" | "rejected" | "blocked";
  reasonCode?: string;
  status?: number;
}

export type BffMutationResult = BffMutationSuccess | BffMutationRefusal;

/**
 * A controlled refusal from a mutation handler.
 *
 * Discriminated on `refuse`. A handler that does not set it stays on the
 * success path with byte-identical behaviour — which is deliberate, because
 * several existing Managed handlers return `status: 412` with
 * `outcome: "blocked"` and are serialised through `bffOk()`. That combination
 * emits an error status carrying a SUCCESS-shaped body, and e2e asserts the
 * current shape. Migrating those routes is a public response-contract change;
 * it is tracked as BFF-412-ENVELOPE and belongs with the Signal topology work,
 * not here.
 *
 * There is deliberately no `status` and no `data` on this variant. Status is
 * derived from `refuse` alone, so the branch cannot reproduce the very
 * status/body mismatch it exists to avoid:
 *
 *   forbidden           -> 403
 *   precondition_failed -> 412
 *   bad_request         -> 400
 */
export interface BffMutationRefusal {
  refuse: "forbidden" | "precondition_failed" | "bad_request";
  /** Investor-facing message. Must never echo submitted content back. */
  message: string;
  /** Defaults to "blocked". */
  outcome?: "blocked" | "rejected";
  /** Stable machine reason (e.g. an SBR rule id). Persisted in the receipt. */
  reasonCode?: string;
  references?: string[];
}

function isRefusal(result: BffMutationResult): result is BffMutationRefusal {
  return "refuse" in result;
}

export function bffRead<T>(handler: BffReadHandler<T>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const correlationId = correlationIdFrom(req);
    try {
      if (handler.allowAnonymous) {
        const data = await handler.fetch({
          req,
          correlationId,
          auth: null,
        });
        const opts: Parameters<typeof bffOk>[1] = {
          source: handler.source ?? "prototype-bff",
          correlationId,
        };
        if (handler.upstreamGap) opts.upstreamGap = handler.upstreamGap;
        return bffOk(data, opts);
      }
      const auth = await getAuthContext(req);
      if (!auth) return BffErrors.unauthorized(correlationId);
      const data = await handler.fetch({ req, auth, correlationId });
      const opts: Parameters<typeof bffOk>[1] = {
        source: handler.source ?? "prototype-bff",
        correlationId,
      };
      if (handler.upstreamGap) opts.upstreamGap = handler.upstreamGap;
      return bffOk(data, opts);
    } catch (err) {
      return BffErrors.internal(
        correlationId,
        err instanceof Error ? err.message : "Unhandled BFF error.",
      );
    }
  };
}

export function bffMutate<T>(handler: BffMutateHandler<T>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const correlationId = correlationIdFrom(req);
    try {
      // CSRF: every mutating investor route is same-origin only. Rejected
      // before auth so a forged cross-origin request never rides the session
      // cookie into a state change.
      if (!isSameOrigin(req)) {
        return BffErrors.forbidden(
          correlationId,
          "Cross-origin or origin-less request rejected.",
        );
      }

      const auth = await getAuthContext(req);
      if (!auth) return BffErrors.unauthorized(correlationId);

      // Release-stage capability policy (C1a-1). Default-deny: at the signal
      // stage an action runs only if it is explicitly Signal-allowed —
      // derived from the September boundary, not from the three-verb gated
      // mapping (see release-policy.ts for why that predicate under-covers).
      // Enforced before parse, deliberately: a body is never parsed for a
      // capability that cannot run, and the receipt records the denial as a
      // policy refusal rather than a body defect. Receipt precedes response
      // so a refusal is never invisible; if persistence throws, the catch
      // below fails the request closed.
      if (
        !isInvestorActionPermitted(
          handler.action,
          getServerEnv().REFI_RELEASE_STAGE,
        )
      ) {
        await appendActionReceipt({
          action: handler.action,
          actor: "user",
          authId: auth.authId,
          ...(auth.accountId ? { accountId: auth.accountId } : {}),
          correlationId,
          outcome: "blocked",
          reasonCode: GATED_UNTIL_MANAGED_PAPER,
        });
        return BffErrors.forbidden(
          correlationId,
          "This action is not available in Signal mode.",
        );
      }

      let input: T;
      if (handler.parse) {
        const json: unknown = await req.json().catch(() => null);
        try {
          input = await handler.parse(json);
        } catch (parseErr) {
          // Receipt the rejected attempt for traceability.
          await appendActionReceipt({
            action: handler.action,
            actor: "user",
            authId: auth.authId,
            ...(auth.accountId ? { accountId: auth.accountId } : {}),
            correlationId,
            outcome: "rejected",
            reasonCode: "bad_request",
          });
          return BffErrors.badRequest(
            correlationId,
            parseErr instanceof Error ? parseErr.message : "Invalid body.",
          );
        }
      } else {
        input = undefined as unknown as T;
      }

      const result = await handler.apply({ req, auth, correlationId, input });

      // Controlled refusal: receipt the disposition, then answer with the
      // canonical error envelope. The receipt is written BEFORE the response so
      // a refusal is never invisible; if persistence itself fails, the throw
      // reaches the catch below and the request fails closed as an internal
      // error rather than silently proceeding.
      if (isRefusal(result)) {
        await appendActionReceipt({
          action: handler.action,
          actor: "user",
          authId: auth.authId,
          ...(auth.accountId ? { accountId: auth.accountId } : {}),
          correlationId,
          outcome: result.outcome ?? "blocked",
          ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
          references: result.references ?? [],
        });
        switch (result.refuse) {
          case "forbidden":
            return BffErrors.forbidden(correlationId, result.message);
          case "precondition_failed":
            return BffErrors.precondition(correlationId, result.message);
          case "bad_request":
            return BffErrors.badRequest(correlationId, result.message);
        }
      }

      const receipt = await appendActionReceipt({
        action: handler.action,
        actor: "user",
        authId: auth.authId,
        ...(auth.accountId ? { accountId: auth.accountId } : {}),
        correlationId,
        outcome: result.outcome ?? "ok",
        ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
        references: result.references ?? [],
      });

      const opts: Parameters<typeof bffOk>[1] = {
        source: handler.source ?? "prototype-bff",
        correlationId,
        receipt: {
          receiptId: receipt.receiptId,
          action: handler.action,
        },
        status: result.status ?? 200,
      };
      if (handler.upstreamGap) opts.upstreamGap = handler.upstreamGap;
      return bffOk(result.data, opts);
    } catch (err) {
      return BffErrors.internal(
        correlationId,
        err instanceof Error ? err.message : "Unhandled BFF error.",
      );
    }
  };
}

// ─── Record-access read wrapper ──────────────────────────────────────────────

export interface BffReadWithAccessLogHandler<T> {
  action: RecordAccessAction;
  source?: BffSource;
  upstreamGap?: GapId | GapId[];
  /**
   * Build the record reference string. Called BEFORE fetch so the access log
   * captures the intended target even if fetch returns 404.
   */
  recordRef: (ctx: BffContext) => string | Promise<string>;
  fetch: (ctx: BffContext) => Promise<T | null> | T | null;
}

/**
 * Reads that also emit a RecordAccessLog entry (view / download / export).
 * Does NOT emit an InvestorActionReceipt — those two audit classes are kept
 * strictly separate by design.
 */
export function bffReadWithAccessLog<T>(
  handler: BffReadWithAccessLogHandler<T>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const correlationId = correlationIdFrom(req);
    try {
      const auth = await getAuthContext(req);
      if (!auth) return BffErrors.unauthorized(correlationId);
      const ctx: BffContext = { req, auth, correlationId };
      const recordRef = await handler.recordRef(ctx);
      const data = await handler.fetch(ctx);
      if (data === null) {
        return BffErrors.notFound(correlationId, "Record");
      }
      await appendRecordAccess({
        action: handler.action,
        authId: auth.authId,
        ...(auth.accountId ? { accountId: auth.accountId } : {}),
        correlationId,
        recordRef,
      });
      const opts: Parameters<typeof bffOk>[1] = {
        source: handler.source ?? "prototype-bff",
        correlationId,
      };
      if (handler.upstreamGap) opts.upstreamGap = handler.upstreamGap;
      return bffOk(data, opts);
    } catch (err) {
      return BffErrors.internal(
        correlationId,
        err instanceof Error ? err.message : "Unhandled BFF error.",
      );
    }
  };
}
