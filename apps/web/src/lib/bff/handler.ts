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
import { bffOk, BffErrors, type BffSource, type GapId } from "./envelope";
import { enforceCsrfOrigin } from "./csrf";
import type {
  InvestorActionName,
  RecordAccessAction,
} from "../sec203a/actions";
import { appendActionReceipt } from "../prototype-store/entities/receipt";
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
  apply: (ctx: BffContext & { input: T }) =>
    | Promise<{
        data: unknown;
        references?: string[];
        outcome?: "ok" | "rejected" | "blocked";
        reasonCode?: string;
        status?: number;
      }>
    | {
        data: unknown;
        references?: string[];
        outcome?: "ok" | "rejected" | "blocked";
        reasonCode?: string;
        status?: number;
      };
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
      // CSRF check runs BEFORE auth. Rationale: rejecting cross-origin
      // credentialed requests is a browser-level concern; it should not
      // be conditional on whether the caller's cookie happens to verify.
      // Rejecting before auth also avoids exposing an auth oracle to
      // cross-origin probes.
      const csrfReject = enforceCsrfOrigin(req, correlationId);
      if (csrfReject) return csrfReject;
      const auth = await getAuthContext(req);
      if (!auth) return BffErrors.unauthorized(correlationId);

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
