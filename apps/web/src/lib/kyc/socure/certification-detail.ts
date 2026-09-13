/**
 * Normalized Socure certification detail — RESTRICTED provider evidence.
 *
 * Socure's go-live checklist requires local retention of `eval_id`, scores and
 * reason codes for every evaluation. This is the minimal normalized form:
 * identifiers, lifecycle, top-level score / reason codes / routing tags, and
 * per-enrichment scores and reason codes. Never the request, never the raw
 * response, never identity data. Server-side only: it is stored on the
 * evaluation record under `providerDetail`, is never part of the session
 * view, the attestation evidence, browser responses, logs or analytics.
 */
import type { SocureEnrichment, SocureEvaluationResponse } from "./schemas";

export const SOCURE_CERTIFICATION_DETAIL_SCHEMA_VERSION =
  "refi.socure.certification-detail.v1" as const;

export interface SocureEnrichmentScore {
  name: string;
  version: string | null;
  value: number;
}

export interface SocureEnrichmentDetail {
  enrichmentName: string | null;
  enrichmentProvider: string | null;
  /** True when the enrichment output was null (failed) — the workflow still continued. */
  failed: boolean;
  scores: SocureEnrichmentScore[];
  reasonCodes: string[];
}

export interface SocureCertificationDetail {
  schemaVersion: typeof SOCURE_CERTIFICATION_DETAIL_SCHEMA_VERSION;
  source:
    "provider_evaluation" | "provider_webhook" | "provider_reconciliation";
  capturedAt: string;
  evalId: string;
  workflow: string | null;
  workflowId: string | null;
  workflowVersion: string | null;
  decision: string;
  status: string | null;
  subStatus: string | null;
  evaluationStatus: string | null;
  evalAt: string | null;
  decisionAt: string | null;
  score: number | null;
  reasonCodes: string[];
  decisionTags: string[];
  tags: string[];
  reviewQueues: string[];
  enrichments: SocureEnrichmentDetail[];
}

const MAX_ENRICHMENT_SCORES = 50;
const MAX_ENRICHMENT_REASON_CODES = 500;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function strs(v: unknown, max: number): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").slice(0, max)
    : [];
}

/**
 * Walks an enrichment response for numeric scores and reason-code arrays.
 * Only keys that name a score/reason code are considered; any object path is
 * ignored otherwise, so identity fields can never leak through this path.
 */
function collectEnrichment(e: SocureEnrichment): SocureEnrichmentDetail {
  const scores: SocureEnrichmentScore[] = [];
  const reasonCodes: string[] = [];
  const failed = e.response === null || e.response === undefined;
  const walk = (node: unknown, path: string[], depth: number): void => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (key === "reasoncodes" || key === "reason_codes") {
        reasonCodes.push(...strs(v, MAX_ENRICHMENT_REASON_CODES));
        continue;
      }
      if (typeof v === "number" && /score$/.test(key)) {
        if (scores.length < MAX_ENRICHMENT_SCORES) {
          const version = (node as Record<string, unknown>)["version"];
          scores.push({
            name: [...path, k].join("."),
            version: str(version),
            value: v,
          });
        }
        continue;
      }
      if (v !== null && typeof v === "object") walk(v, [...path, k], depth + 1);
    }
  };
  if (!failed) walk(e.response, [], 0);
  return {
    enrichmentName: str(e.enrichment_name),
    enrichmentProvider: str(e.enrichment_provider),
    failed,
    scores,
    reasonCodes: reasonCodes.slice(0, MAX_ENRICHMENT_REASON_CODES),
  };
}

type DetailSource = Pick<
  SocureEvaluationResponse,
  | "eval_id"
  | "decision"
  | "workflow"
  | "workflow_id"
  | "workflow_version"
  | "status"
  | "sub_status"
  | "eval_status"
  | "evaluation_status"
  | "eval_at"
  | "decision_at"
  | "score"
  | "reason_codes"
  | "decision_tags"
  | "tags"
  | "review_queues"
  | "data_enrichments"
>;

export function extractSocureCertificationDetail(
  r: DetailSource,
  source: SocureCertificationDetail["source"],
  capturedAt: string,
): SocureCertificationDetail {
  return {
    schemaVersion: SOCURE_CERTIFICATION_DETAIL_SCHEMA_VERSION,
    source,
    capturedAt,
    evalId: r.eval_id,
    workflow: str(r.workflow),
    workflowId: str(r.workflow_id),
    workflowVersion: str(r.workflow_version),
    decision: r.decision,
    status: str(r.status),
    subStatus: str(r.sub_status),
    evaluationStatus: str(r.evaluation_status) ?? str(r.eval_status),
    evalAt: str(r.eval_at),
    decisionAt: str(r.decision_at),
    score: typeof r.score === "number" ? r.score : null,
    reasonCodes: strs(r.reason_codes, 500),
    decisionTags: strs(r.decision_tags, 200),
    tags: strs(r.tags, 200),
    reviewQueues: strs(r.review_queues, 50),
    enrichments: Array.isArray(r.data_enrichments)
      ? r.data_enrichments.map(collectEnrichment)
      : [],
  };
}
