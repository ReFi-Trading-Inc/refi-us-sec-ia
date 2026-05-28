/**
 * BFF response envelope.
 *
 * Every route under apps/web/app/api/v1/* returns a payload wrapped in this
 * envelope so the frontend can:
 *   1. Distinguish backend system-of-record data from prototype-bff projections.
 *   2. Trace correlation ids end-to-end.
 *   3. Render a dev badge on screens that read non-backend data.
 *   4. Receipt every state-changing investor action.
 *
 * Source spec: docs/bff-prototype-state-contract.md.
 */
import { NextResponse } from "next/server";
import type { InvestorActionName } from "../sec203a/actions";

export type BffSource = "backend" | "prototype-bff" | "msw" | "hybrid";

export type GapId = `G-${string}`;

export interface BffMeta {
  source: BffSource;
  systemOfRecord: boolean;
  upstreamGap?: GapId | GapId[];
  correlationId: string;
  emittedAt: string;
}

export interface BffReceipt {
  receiptId: string;
  action: InvestorActionName;
}

export interface BffResponse<T> {
  data: T;
  meta: BffMeta;
  receipt?: BffReceipt;
}

export interface BffErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: BffMeta;
}

interface EnvelopeOptions {
  source: BffSource;
  upstreamGap?: GapId | GapId[];
  correlationId: string;
  status?: number;
  receipt?: BffReceipt;
}

function makeMeta(opts: EnvelopeOptions): BffMeta {
  const systemOfRecord = opts.source === "backend";
  const meta: BffMeta = {
    source: opts.source,
    systemOfRecord,
    correlationId: opts.correlationId,
    emittedAt: new Date().toISOString(),
  };
  if (opts.upstreamGap) meta.upstreamGap = opts.upstreamGap;
  return meta;
}

export function bffOk(data: unknown, opts: EnvelopeOptions): NextResponse {
  const body: BffResponse<unknown> = { data, meta: makeMeta(opts) };
  if (opts.receipt) body.receipt = opts.receipt;
  const res = NextResponse.json(body, { status: opts.status ?? 200 });
  res.headers.set("x-correlation-id", opts.correlationId);
  res.headers.set("x-bff-source", opts.source);
  return res;
}

export function bffError(
  code: string,
  message: string,
  opts: EnvelopeOptions & { status: number; details?: unknown },
): NextResponse {
  const body: BffErrorBody = {
    error: { code, message, details: opts.details },
    meta: makeMeta(opts),
  };
  const res = NextResponse.json(body, { status: opts.status });
  res.headers.set("x-correlation-id", opts.correlationId);
  res.headers.set("x-bff-source", opts.source);
  return res;
}

/** Standard error responses. */
export const BffErrors = {
  unauthorized: (correlationId: string) =>
    bffError("unauthorized", "Authentication required.", {
      status: 401,
      source: "prototype-bff",
      correlationId,
      upstreamGap: "G-002",
    }),
  missingCorrelationId: () =>
    bffError("missing_correlation_id", "x-correlation-id header is required.", {
      status: 400,
      source: "prototype-bff",
      correlationId: "none",
    }),
  badRequest: (correlationId: string, message: string, details?: unknown) =>
    bffError("bad_request", message, {
      status: 400,
      source: "prototype-bff",
      correlationId,
      details,
    }),
  notFound: (correlationId: string, what: string) =>
    bffError("not_found", `${what} not found.`, {
      status: 404,
      source: "prototype-bff",
      correlationId,
    }),
  precondition: (correlationId: string, message: string) =>
    bffError("precondition_failed", message, {
      status: 412,
      source: "prototype-bff",
      correlationId,
    }),
  internal: (correlationId: string, message = "Internal error.") =>
    bffError("internal", message, {
      status: 500,
      source: "prototype-bff",
      correlationId,
    }),
} as const;
