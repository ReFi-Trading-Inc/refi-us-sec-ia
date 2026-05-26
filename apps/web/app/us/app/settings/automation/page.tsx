"use client";

/**
 * Automation Center (Phase 2 Surface 2).
 *
 * Investor-facing Execution Policy Builder. **Draft-only** — saving a draft
 * does not activate Managed mode, does not call /activate, does not submit
 * orders, and does not create an approval for any single trade. Surface 3
 * activation is the only path that turns this draft into a signed policy
 * version. See memory/handoff_phase2_surface2.md.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Select,
  StatusBanner,
} from "@ui/components";
import {
  useExecutionPolicy,
  useExecutionPolicyDraft,
  useSaveExecutionPolicyDraft,
  useManagedExecutionState,
  useSubscriptionMode,
  type ExecutionPolicyDraftDto,
  type SaveExecutionPolicyDraftInput,
  type StaleBrokerDataDuration,
  type StaleProfileDuration,
} from "@refi/api-clients";

const STALE_BROKER_OPTIONS: {
  value: StaleBrokerDataDuration;
  label: string;
}[] = [
  { value: "PT5M", label: "5 minutes" },
  { value: "PT15M", label: "15 minutes" },
  { value: "PT30M", label: "30 minutes" },
  { value: "PT1H", label: "1 hour" },
  { value: "PT4H", label: "4 hours" },
];

const STALE_PROFILE_OPTIONS: { value: StaleProfileDuration; label: string }[] =
  [
    { value: "P30D", label: "30 days" },
    { value: "P60D", label: "60 days" },
    { value: "P90D", label: "90 days" },
    { value: "P180D", label: "180 days" },
    { value: "P365D", label: "365 days" },
  ];

// Same range/shape as the BFF schema in
// apps/web/app/api/v1/investor/execution-policy/draft/route.ts. Kept here so
// invalid input is rejected client-side before round-tripping.
const decimalRe = /^-?(\d+)(\.\d+)?$/;
const draftSchema = z.object({
  strategyId: z.string().min(1, "Required").max(64),
  accountScope: z.string().min(1, "Required").max(64),
  assetUniverse: z.array(z.string().min(1)).min(1, "At least one asset class"),
  restrictedSectors: z.array(z.string().min(1)),
  maxSingleOrderUsd: z
    .string()
    .refine((s) => decimalRe.test(s), "Use decimal format, e.g. 1000.00")
    .refine((s) => {
      const n = Number(s);
      return Number.isFinite(n) && n >= 25 && n <= 25000;
    }, "Must be between 25.00 and 25000.00 USD"),
  maxPositionSizeBps: z.number().int().min(100).max(2500),
  minimumCashReserveBps: z.number().int().min(0).max(5000),
  dailyOrderLimit: z.number().int().min(1).max(25),
  dailyLossPauseBps: z.number().int().min(100).max(1000),
  drawdownPauseBps: z.number().int().min(300).max(3000),
  maxOpenOrders: z.number().int().min(1).max(20),
  staleBrokerDataPauseAfter: z.enum(["PT5M", "PT15M", "PT30M", "PT1H", "PT4H"]),
  staleProfilePauseAfter: z.enum(["P30D", "P60D", "P90D", "P180D", "P365D"]),
  pauseOnDisclosureSuperseded: z.boolean(),
  pauseOnProfileSuperseded: z.boolean(),
});

type DraftForm = z.infer<typeof draftSchema>;
type FieldErrors = Partial<Record<keyof DraftForm, string>>;

function toForm(draft: ExecutionPolicyDraftDto): DraftForm {
  return {
    strategyId: draft.strategyId,
    accountScope: draft.accountScope,
    assetUniverse: draft.assetUniverse,
    restrictedSectors: draft.restrictedSectors,
    maxSingleOrderUsd: draft.maxSingleOrderUsd,
    maxPositionSizeBps: draft.maxPositionSizeBps,
    minimumCashReserveBps: draft.minimumCashReserveBps,
    dailyOrderLimit: draft.dailyOrderLimit,
    dailyLossPauseBps: draft.dailyLossPauseBps,
    drawdownPauseBps: draft.drawdownPauseBps,
    maxOpenOrders: draft.maxOpenOrders,
    staleBrokerDataPauseAfter: draft.staleBrokerDataPauseAfter,
    staleProfilePauseAfter: draft.staleProfilePauseAfter,
    pauseOnDisclosureSuperseded: draft.pauseOnDisclosureSuperseded,
    pauseOnProfileSuperseded: draft.pauseOnProfileSuperseded,
  };
}

function csvToArray(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export default function AutomationCenterPage() {
  const modeQ = useSubscriptionMode();
  const policyQ = useExecutionPolicy();
  const draftQ = useExecutionPolicyDraft();
  const mesQ = useManagedExecutionState();
  const saveMut = useSaveExecutionPolicyDraft();

  const [form, setForm] = useState<DraftForm | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">(
    "idle",
  );

  // Hydrate the form once the draft loads. We do not re-hydrate on subsequent
  // refetches — that would clobber unsaved edits.
  useEffect(() => {
    if (form === null && draftQ.data) {
      setForm(toForm(draftQ.data));
    }
  }, [draftQ.data, form]);

  const mode = modeQ.data?.mode ?? "unset";
  const mes = mesQ.data ?? null;
  const isManagedActive = mode === "managed" && mes?.status === "active";

  const update = useCallback(
    <K extends keyof DraftForm>(field: K, value: DraftForm[K]) => {
      setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      setSaveState("idle");
    },
    [],
  );

  const onSave = useCallback(async () => {
    if (!form) return;
    const parsed = draftSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in nextErrors)) {
          nextErrors[key as keyof DraftForm] = issue.message;
        }
      }
      setErrors(nextErrors);
      setSaveState("error");
      return;
    }
    try {
      const input: SaveExecutionPolicyDraftInput = parsed.data;
      await saveMut.mutateAsync(input);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [form, saveMut]);

  const onDiscard = useCallback(() => {
    if (draftQ.data) {
      setForm(toForm(draftQ.data));
      setErrors({});
      setSaveState("idle");
    }
  }, [draftQ.data]);

  const allowedDoBullets = useMemo(
    () => [
      "Generate software-based recommendations for your account.",
      "Submit broker orders only under an active, investor-activated execution policy.",
      "Pause automation when prerequisites go stale (broker, disclosures, profile).",
      "Open an exception when a recommendation falls outside the active policy.",
      "Record every state change as an investor action receipt with a correlation id.",
    ],
    [],
  );

  const forbiddenBullets = useMemo(
    () => [
      "Place trades that are not produced by the software pipeline.",
      "Execute outside your active execution policy version.",
      "Ask you to approve individual trades — Managed runs from policy, not per-trade.",
      "Continue automation after a disclosure version supersedes the active policy.",
      "Continue automation after the brokerage connection is removed.",
      "Mutate the active execution policy when you save a draft.",
      "Activate Managed mode on your behalf without your explicit activation.",
    ],
    [],
  );

  return (
    <div
      className="flex flex-col gap-6 max-w-4xl"
      data-testid="automation-center-page"
      data-mode={mode}
    >
      <header>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          Automation Center
        </h1>
        <p className="text-sm text-charcoal-400">
          See what ReFi is allowed to do automatically, what is paused, and what
          needs your review.
        </p>
      </header>

      {/* 1. Mode + status header */}
      <Card data-testid="automation-status-header">
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge data-testid="automation-mode-badge" data-mode={mode}>
              {mode === "managed"
                ? "ReFi Managed"
                : mode === "signal"
                  ? "ReFi Signal"
                  : "Mode not set"}
            </Badge>
            {mes && (
              <Badge
                data-testid="automation-mes-badge"
                data-status={mes.status}
                variant="neutral"
              >
                Execution: {mes.status}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-charcoal-400">
            <div>
              Active policy version:{" "}
              <span
                className="text-charcoal-200"
                data-testid="automation-active-policy-version"
              >
                {policyQ.data?.policyVersion ?? "—"}
              </span>
            </div>
            <div>
              Last status change:{" "}
              <span className="text-charcoal-200">
                {mes?.lastChangedAt
                  ? new Date(mes.lastChangedAt).toLocaleString()
                  : "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Active policy card */}
      <Card data-testid="automation-active-policy">
        <CardHeader>
          <CardTitle>Active policy</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          {policyQ.data ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-charcoal-500">Version</dt>
                <dd className="text-charcoal-100">
                  v{policyQ.data.policyVersion}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-charcoal-500">Effective from</dt>
                <dd className="text-charcoal-100">
                  {new Date(policyQ.data.signedAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-charcoal-500">Strategy</dt>
                <dd className="text-charcoal-100">{policyQ.data.strategyId}</dd>
              </div>
              <div>
                <dt className="text-xs text-charcoal-500">Account scope</dt>
                <dd className="text-charcoal-100">
                  {policyQ.data.accountScope}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-charcoal-500">Asset universe</dt>
                <dd className="text-charcoal-100">
                  {policyQ.data.assetUniverse.join(", ") || "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-charcoal-400">
              No active execution policy yet. A draft becomes effective only
              after you activate it.
            </p>
          )}
        </CardContent>
      </Card>

      {isManagedActive && (
        <StatusBanner
          variant="info"
          title="Active policy stays in effect"
          data-testid="automation-draft-active-banner"
        >
          Your current Execution Policy remains active. These changes are saved
          as a draft and will not affect automated execution until you review
          and activate the new version.
        </StatusBanner>
      )}

      {/* 3. Draft policy builder */}
      <Card data-testid="automation-draft-builder">
        <CardHeader>
          <CardTitle>Draft policy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-5">
          {form === null ? (
            <p className="text-sm text-charcoal-400">Loading draft…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Strategy"
                  data-testid="draft-strategyId"
                  value={form.strategyId}
                  error={errors.strategyId}
                  onChange={(e) => update("strategyId", e.target.value)}
                />
                <Input
                  label="Account scope"
                  data-testid="draft-accountScope"
                  value={form.accountScope}
                  error={errors.accountScope}
                  onChange={(e) => update("accountScope", e.target.value)}
                />
                <Input
                  label="Asset universe (comma-separated)"
                  data-testid="draft-assetUniverse"
                  value={form.assetUniverse.join(", ")}
                  error={errors.assetUniverse}
                  onChange={(e) =>
                    update("assetUniverse", csvToArray(e.target.value))
                  }
                />
                <Input
                  label="Restricted sectors (comma-separated)"
                  data-testid="draft-restrictedSectors"
                  value={form.restrictedSectors.join(", ")}
                  error={errors.restrictedSectors}
                  onChange={(e) =>
                    update("restrictedSectors", csvToArray(e.target.value))
                  }
                />
                <Input
                  label="Max single order (USD)"
                  data-testid="draft-maxSingleOrderUsd"
                  inputMode="decimal"
                  value={form.maxSingleOrderUsd}
                  error={errors.maxSingleOrderUsd}
                  hint="25.00 to 25000.00"
                  onChange={(e) => update("maxSingleOrderUsd", e.target.value)}
                />
                <Input
                  label="Max position size (basis points)"
                  data-testid="draft-maxPositionSizeBps"
                  type="number"
                  value={form.maxPositionSizeBps}
                  error={errors.maxPositionSizeBps}
                  hint="100 to 2500"
                  onChange={(e) =>
                    update(
                      "maxPositionSizeBps",
                      Number.parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
                <Input
                  label="Minimum cash reserve (basis points)"
                  data-testid="draft-minimumCashReserveBps"
                  type="number"
                  value={form.minimumCashReserveBps}
                  error={errors.minimumCashReserveBps}
                  hint="0 to 5000"
                  onChange={(e) =>
                    update(
                      "minimumCashReserveBps",
                      Number.parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
                <Input
                  label="Daily order limit"
                  data-testid="draft-dailyOrderLimit"
                  type="number"
                  value={form.dailyOrderLimit}
                  error={errors.dailyOrderLimit}
                  hint="1 to 25"
                  onChange={(e) =>
                    update(
                      "dailyOrderLimit",
                      Number.parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
                <Input
                  label="Daily loss pause (basis points)"
                  data-testid="draft-dailyLossPauseBps"
                  type="number"
                  value={form.dailyLossPauseBps}
                  error={errors.dailyLossPauseBps}
                  hint="100 to 1000"
                  onChange={(e) =>
                    update(
                      "dailyLossPauseBps",
                      Number.parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
                <Input
                  label="Drawdown pause (basis points)"
                  data-testid="draft-drawdownPauseBps"
                  type="number"
                  value={form.drawdownPauseBps}
                  error={errors.drawdownPauseBps}
                  hint="300 to 3000"
                  onChange={(e) =>
                    update(
                      "drawdownPauseBps",
                      Number.parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
                <Input
                  label="Max open orders"
                  data-testid="draft-maxOpenOrders"
                  type="number"
                  value={form.maxOpenOrders}
                  error={errors.maxOpenOrders}
                  hint="1 to 20"
                  onChange={(e) =>
                    update(
                      "maxOpenOrders",
                      Number.parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
                <Select
                  label="Pause after stale broker data"
                  data-testid="draft-staleBrokerDataPauseAfter"
                  value={form.staleBrokerDataPauseAfter}
                  options={STALE_BROKER_OPTIONS}
                  onChange={(e) =>
                    update(
                      "staleBrokerDataPauseAfter",
                      e.target.value as StaleBrokerDataDuration,
                    )
                  }
                />
                <Select
                  label="Pause after stale profile"
                  data-testid="draft-staleProfilePauseAfter"
                  value={form.staleProfilePauseAfter}
                  options={STALE_PROFILE_OPTIONS}
                  onChange={(e) =>
                    update(
                      "staleProfilePauseAfter",
                      e.target.value as StaleProfileDuration,
                    )
                  }
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <Checkbox
                  label="Pause automation when a new disclosure version supersedes the active policy"
                  data-testid="draft-pauseOnDisclosureSuperseded"
                  checked={form.pauseOnDisclosureSuperseded}
                  onChange={(e) =>
                    update("pauseOnDisclosureSuperseded", e.target.checked)
                  }
                />
                <Checkbox
                  label="Pause automation when the advisory profile is superseded"
                  data-testid="draft-pauseOnProfileSuperseded"
                  checked={form.pauseOnProfileSuperseded}
                  onChange={(e) =>
                    update("pauseOnProfileSuperseded", e.target.checked)
                  }
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4. What ReFi may do */}
      <Card data-testid="automation-allowed-actions">
        <CardHeader>
          <CardTitle>What ReFi may do</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <ul className="list-disc pl-5 text-sm text-charcoal-200 flex flex-col gap-1.5">
            {allowedDoBullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 5. What ReFi will not do */}
      <Card data-testid="automation-forbidden-actions">
        <CardHeader>
          <CardTitle>What ReFi will not do</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <ul className="list-disc pl-5 text-sm text-charcoal-200 flex flex-col gap-1.5">
            {forbiddenBullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 6. Save controls (no Activate / Accept / Approve) */}
      <Card data-testid="automation-save-controls">
        <CardContent className="flex flex-col gap-3 pt-5 pb-5">
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="automation-save-draft"
              onClick={onSave}
              loading={saveMut.isPending}
              disabled={form === null}
            >
              Save draft
            </Button>
            <Button
              data-testid="automation-discard-changes"
              variant="secondary"
              onClick={onDiscard}
              disabled={form === null}
            >
              Discard local changes
            </Button>
          </div>
          {saveState === "saved" && (
            <p
              className="text-xs text-status-active"
              data-testid="automation-save-success"
            >
              Draft saved. The active execution policy is unchanged.
            </p>
          )}
          {saveState === "error" && Object.keys(errors).length > 0 && (
            <p
              className="text-xs text-status-rejected"
              data-testid="automation-save-error"
            >
              Fix the highlighted fields and try again.
            </p>
          )}
          {saveState === "error" && Object.keys(errors).length === 0 && (
            <p
              className="text-xs text-status-rejected"
              data-testid="automation-save-error"
            >
              Could not save draft. Please retry.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 7. Evidence strip */}
      <Card data-testid="automation-evidence-strip">
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-charcoal-500">Active policy record</dt>
              <dd className="text-charcoal-200">
                {policyQ.data?.policyId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-charcoal-500">Draft record</dt>
              <dd className="text-charcoal-200">
                {draftQ.data
                  ? `execution-policy-draft:${draftQ.data.accountId}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-charcoal-500">Managed execution status</dt>
              <dd className="text-charcoal-200">{mes?.status ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-charcoal-500">Policy version pinned</dt>
              <dd className="text-charcoal-200">
                {mes?.executionPolicyVersion ?? "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
