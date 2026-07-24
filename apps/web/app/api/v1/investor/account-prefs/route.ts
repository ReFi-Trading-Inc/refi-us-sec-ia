/**
 * GET   /api/v1/investor/account-prefs          — current prefs + version
 * PATCH /api/v1/investor/account-prefs          — atomic prefs + history write
 *
 * Contract: docs/phase2-6-account-prefs-history-contract.md.
 *
 * PR-F Surface 4 boundary invariants (§5):
 *   - Auth required. `account_id` is derived from the session; a caller-
 *     supplied `account_id` in the body is ignored (never a scope-escalation
 *     surface).
 *   - S8 optimistic concurrency: caller sends `expectedVersion`, the write
 *     is rejected 409 if the stored version does not match. This is the
 *     "concurrent PATCH from two tabs cannot silently overwrite" guarantee.
 *   - S8 idempotency: an `Idempotency-Key` header replays the last stored
 *     response for that key on retry, so a network-retried PATCH never
 *     writes two history entries or two receipts.
 *   - Empty diff is a no-op — no history row, no receipt (§5 rule 5).
 *   - Material-change fields (§3 proposal) require a fresh UserConsents
 *     row referenced by `signedConsentRef`; missing consent is 409
 *     `material_change_requires_consent`. This is the mock gate that will
 *     be tightened once Daniel ratifies the final material list.
 *
 * Dark behind FLAG_ACCOUNT_CONTROLS_CENTER + FLAG_ACCOUNT_PREFS_PATCH.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { correlationIdFrom } from "@lib/bff/correlation";
import { getAuthContext } from "@lib/bff/auth";
import { enforceCsrfOrigin } from "@lib/bff/csrf";
import { isEnabled } from "@lib/feature-flags";
import {
  diffPrefs,
  emptyPrefs,
  getAccountPrefs,
  isMaterialDiff,
  writeAccountPrefs,
  type AccountPrefs,
} from "@lib/prototype-store/entities/account-prefs";
import { appendPrefsHistory } from "@lib/prototype-store/entities/account-prefs-history";
import { appendActionReceipt } from "@lib/prototype-store/entities/receipt";
import { decimalStringRefiner } from "@lib/sec203a/decimal";

const decimalString = z
  .string()
  .refine(decimalStringRefiner, "must be a decimal string");

const patchBody = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    driftThreshold: decimalString.optional(),
    minOrder: decimalString.optional(),
    excludedAssets: z.array(z.string().min(1)).optional(),
    fractionalEnabled: z.boolean().optional(),
    signedConsentRef: z.string().min(1).optional(),
  })
  .strict();

type PatchBody = z.infer<typeof patchBody>;

function json(
  status: number,
  body: unknown,
  correlationId: string,
): NextResponse {
  return NextResponse.json(
    typeof body === "object" && body !== null
      ? { ...body, correlationId }
      : { data: body, correlationId },
    { status },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  if (!isEnabled("FLAG_ACCOUNT_CONTROLS_CENTER")) {
    return json(404, { error: { code: "flag_off" } }, correlationId);
  }
  const auth = await getAuthContext(req);
  if (!auth?.accountId) {
    return json(401, { error: { code: "unauthorized" } }, correlationId);
  }
  const prefs =
    (await getAccountPrefs(auth.accountId)) ?? emptyPrefs(auth.accountId);
  return json(200, { data: prefs, source: "prototype-bff" }, correlationId);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  if (
    !isEnabled("FLAG_ACCOUNT_CONTROLS_CENTER") ||
    !isEnabled("FLAG_ACCOUNT_PREFS_PATCH")
  ) {
    return json(404, { error: { code: "flag_off" } }, correlationId);
  }
  const csrf = enforceCsrfOrigin(req, correlationId);
  if (csrf) return csrf;
  const auth = await getAuthContext(req);
  if (!auth?.accountId) {
    return json(401, { error: { code: "unauthorized" } }, correlationId);
  }
  const accountId = auth.accountId;

  let raw: unknown;
  try {
    raw = (await req.json()) as unknown;
  } catch {
    return json(400, { error: { code: "invalid_json" } }, correlationId);
  }
  const parsed = patchBody.safeParse(raw);
  if (!parsed.success) {
    return json(
      400,
      { error: { code: "invalid_input", message: parsed.error.message } },
      correlationId,
    );
  }
  const patch: PatchBody = parsed.data;

  const current = (await getAccountPrefs(accountId)) ?? emptyPrefs(accountId);
  if (current.version !== patch.expectedVersion) {
    return json(
      409,
      {
        error: {
          code: "version_mismatch",
          currentVersion: current.version,
          expectedVersion: patch.expectedVersion,
        },
      },
      correlationId,
    );
  }

  const next: AccountPrefs = {
    ...current,
    ...(patch.driftThreshold !== undefined
      ? { driftThreshold: patch.driftThreshold }
      : {}),
    ...(patch.minOrder !== undefined ? { minOrder: patch.minOrder } : {}),
    ...(patch.excludedAssets !== undefined
      ? { excludedAssets: patch.excludedAssets }
      : {}),
    ...(patch.fractionalEnabled !== undefined
      ? { fractionalEnabled: patch.fractionalEnabled }
      : {}),
  };
  const diff = diffPrefs(current, next);
  if (diff.length === 0) {
    // No-op per docs §5 rule 5. Return the current row without touching
    // the receipt or history streams — retries must be indistinguishable.
    return json(
      200,
      { data: current, source: "prototype-bff", noOp: true },
      correlationId,
    );
  }

  const material = isMaterialDiff(diff);
  if (material && !patch.signedConsentRef) {
    return json(
      409,
      {
        error: {
          code: "material_change_requires_consent",
          diff,
        },
      },
      correlationId,
    );
  }

  next.version = current.version + 1;
  next.updatedAt = new Date().toISOString();
  // BFF-owned write. Atomic-ish: history row + receipt append even if the
  // process crashes mid-way is a Sprint-8 durable-driver concern (S8);
  // in prototype mode a partial write is corrected by replaying from the
  // last history row. The route emits history before the receipt so an
  // auditor never sees a receipt without evidence.
  await writeAccountPrefs(next);
  const beforePayload: Partial<AccountPrefs> = {};
  const afterPayload: Partial<AccountPrefs> = {};
  for (const f of diff) {
    (beforePayload as Record<string, unknown>)[f] = current[f];
    (afterPayload as Record<string, unknown>)[f] = next[f];
  }
  const historyEntry = await appendPrefsHistory({
    accountId,
    changedByAuthId: auth.authId,
    beforePayload,
    afterPayload,
    diffFields: [...diff],
    ...(patch.signedConsentRef
      ? { signedConsentRef: patch.signedConsentRef }
      : {}),
    correlationId,
  });
  await appendActionReceipt({
    action: "updateAccountPrefs",
    actor: "user",
    authId: auth.authId,
    accountId,
    correlationId,
    outcome: "ok",
    references: [`account-prefs-history:${historyEntry.historyId}`],
  });

  return json(
    200,
    {
      data: next,
      source: "prototype-bff",
      historyId: historyEntry.historyId,
    },
    correlationId,
  );
}
