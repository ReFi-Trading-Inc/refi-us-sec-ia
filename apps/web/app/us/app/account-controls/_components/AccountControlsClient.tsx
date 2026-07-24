"use client";

/**
 * AccountControlsClient — PR-F Surface 4 form + history viewer.
 *
 * The component holds its own draft state and diff-detects on submit
 * so the "no-op skips history + receipt" invariant (docs §5 rule 5)
 * is visible to the user: an unchanged submit shows "no changes" and
 * doesn't bump the version.
 *
 * Material-change gate: on 409 material_change_requires_consent the
 * user sees a consent-attestation checkbox; on confirm we re-submit
 * with signedConsentRef set to a stub ("investor_ui_attest") since
 * the canonical UserConsents entity is a Sprint 4+ separate landing.
 * The stub is enough to prove the gate path end-to-end today.
 */
import { useCallback, useEffect, useState } from "react";

interface Prefs {
  accountId: string;
  driftThreshold?: string;
  minOrder?: string;
  excludedAssets: string[];
  fractionalEnabled: boolean;
  updatedAt: string;
  version: number;
}

interface HistoryEntry {
  historyId: string;
  changedAt: string;
  diffFields: string[];
  mockState: boolean;
}

type Notice =
  | { kind: "idle" }
  | { kind: "saved"; historyId?: string }
  | { kind: "no_op" }
  | { kind: "material_gate"; diff: string[] }
  | { kind: "version_conflict"; current: number; sent: number }
  | { kind: "error"; message: string };

export function AccountControlsClient(): React.JSX.Element {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [draft, setDraft] = useState<{
    driftThreshold: string;
    minOrder: string;
    excludedAssets: string;
    fractionalEnabled: boolean;
  }>({
    driftThreshold: "",
    minOrder: "",
    excludedAssets: "",
    fractionalEnabled: false,
  });
  const [attested, setAttested] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [prefsRes, historyRes] = await Promise.all([
        fetch("/api/v1/investor/account-prefs"),
        fetch("/api/v1/investor/account-prefs/history"),
      ]);
      if (prefsRes.status === 404) {
        setUnavailable(true);
        return;
      }
      if (!prefsRes.ok) {
        setNotice({
          kind: "error",
          message: `prefs ${String(prefsRes.status)}`,
        });
        return;
      }
      const body = (await prefsRes.json()) as { data: Prefs };
      setPrefs(body.data);
      setDraft({
        driftThreshold: body.data.driftThreshold ?? "",
        minOrder: body.data.minOrder ?? "",
        excludedAssets: body.data.excludedAssets.join(", "),
        fractionalEnabled: body.data.fractionalEnabled,
      });
      if (historyRes.ok) {
        const hbody = (await historyRes.json()) as {
          data: { entries: HistoryEntry[] };
        };
        setHistory(hbody.data.entries);
      }
    } catch (err) {
      setNotice({
        kind: "error",
        message: err instanceof Error ? err.message : "load failed",
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh awaits fetch before any setState
    void refresh();
  }, [refresh]);

  const submit = async (withConsent: boolean): Promise<void> => {
    if (!prefs) return;
    setBusy(true);
    setNotice({ kind: "idle" });
    try {
      const excludedAssets = draft.excludedAssets
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const body: Record<string, unknown> = {
        expectedVersion: prefs.version,
        excludedAssets,
        fractionalEnabled: draft.fractionalEnabled,
      };
      if (draft.driftThreshold.length > 0)
        body["driftThreshold"] = draft.driftThreshold;
      if (draft.minOrder.length > 0) body["minOrder"] = draft.minOrder;
      if (withConsent) body["signedConsentRef"] = "investor_ui_attest";
      const res = await fetch("/api/v1/investor/account-prefs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        data?: Prefs & { noOp?: boolean };
        historyId?: string;
        noOp?: boolean;
        error?: {
          code?: string;
          diff?: string[];
          currentVersion?: number;
          expectedVersion?: number;
          message?: string;
        };
      };
      if (res.status === 409) {
        if (json.error?.code === "version_mismatch") {
          setNotice({
            kind: "version_conflict",
            current: json.error.currentVersion ?? -1,
            sent: json.error.expectedVersion ?? prefs.version,
          });
          await refresh();
        } else if (json.error?.code === "material_change_requires_consent") {
          setNotice({
            kind: "material_gate",
            diff: json.error.diff ?? [],
          });
        } else {
          setNotice({
            kind: "error",
            message: json.error?.message ?? `409`,
          });
        }
        return;
      }
      if (!res.ok) {
        setNotice({
          kind: "error",
          message: json.error?.message ?? String(res.status),
        });
        return;
      }
      if (json.noOp === true || json.data?.noOp === true) {
        setNotice({ kind: "no_op" });
        return;
      }
      const nextPrefs: Notice = {
        kind: "saved",
        ...(json.historyId ? { historyId: json.historyId } : {}),
      };
      setNotice(nextPrefs);
      setAttested(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (unavailable) {
    return (
      <div className="rounded-lg border border-charcoal-800 bg-charcoal-900/50 p-6 text-sm text-charcoal-400">
        Account controls are available in preview. Ask your ReFi contact to
        enable the surface for this account.
      </div>
    );
  }
  if (!prefs) {
    return (
      <div
        className="text-sm text-charcoal-500"
        data-testid="account-controls-loading"
      >
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="account-controls-page">
      <section className="rounded-lg border border-charcoal-800 bg-charcoal-900/40 p-6">
        <h2 className="text-lg font-semibold text-charcoal-100">Preferences</h2>
        <p className="mt-1 text-xs text-charcoal-500">
          Current version:{" "}
          <span data-testid="prefs-version" className="tabular-nums">
            {prefs.version}
          </span>
          {" · "}last updated{" "}
          {prefs.version > 0
            ? new Date(prefs.updatedAt).toLocaleString()
            : "never"}
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field
            label="Drift threshold"
            hint="Material change · consent required"
            testid="input-drift-threshold"
            value={draft.driftThreshold}
            onChange={(v) => {
              setDraft((d) => ({ ...d, driftThreshold: v }));
            }}
            placeholder="0.05"
          />
          <Field
            label="Minimum order"
            hint="Non-material"
            testid="input-min-order"
            value={draft.minOrder}
            onChange={(v) => {
              setDraft((d) => ({ ...d, minOrder: v }));
            }}
            placeholder="1.00"
          />
          <div className="sm:col-span-2">
            <Field
              label="Excluded assets"
              hint="Comma-separated symbols · material change"
              testid="input-excluded-assets"
              value={draft.excludedAssets}
              onChange={(v) => {
                setDraft((d) => ({ ...d, excludedAssets: v }));
              }}
              placeholder="BTC, XRP"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-charcoal-200">
            <input
              type="checkbox"
              data-testid="input-fractional-enabled"
              className="h-4 w-4 accent-mint-400"
              checked={draft.fractionalEnabled}
              onChange={(e) => {
                setDraft((d) => ({
                  ...d,
                  fractionalEnabled: e.target.checked,
                }));
              }}
            />
            Fractional shares enabled
          </label>
        </div>

        <NoticeBlock
          notice={notice}
          attested={attested}
          setAttested={setAttested}
          onConfirmMaterial={() => void submit(true)}
        />

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            data-testid="save-prefs"
            className="rounded-md bg-mint-400 px-4 py-1.5 text-sm font-medium text-charcoal-950 hover:bg-mint-300 disabled:opacity-50 transition-colors"
            disabled={busy || (notice.kind === "material_gate" && !attested)}
            onClick={() =>
              void submit(notice.kind === "material_gate" && attested)
            }
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="text-xs text-charcoal-500 hover:text-charcoal-300 transition-colors"
            onClick={() => void refresh()}
            disabled={busy}
          >
            Discard
          </button>
        </div>
      </section>

      <section
        className="rounded-lg border border-charcoal-800 bg-charcoal-900/40 p-6"
        data-testid="history-panel"
      >
        <h2 className="text-lg font-semibold text-charcoal-100">
          Change history
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-charcoal-500">No changes yet.</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {history.map((entry) => (
              <li
                key={entry.historyId}
                className="rounded border border-charcoal-800 bg-charcoal-950/50 px-3 py-2"
              >
                <div className="text-charcoal-300 font-mono text-xs">
                  {new Date(entry.changedAt).toLocaleString()}
                </div>
                <div className="mt-1 text-charcoal-200">
                  Changed: {entry.diffFields.join(", ")}
                </div>
                {entry.mockState ? (
                  <div className="mt-1 text-xs text-charcoal-500">
                    prototype state · not a Daniel book-and-record
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint: string;
  testid: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}

function Field(props: FieldProps): React.JSX.Element {
  return (
    <label className="block">
      <span className="block text-sm text-charcoal-200">{props.label}</span>
      <span className="block text-xs text-charcoal-500">{props.hint}</span>
      <input
        type="text"
        inputMode="decimal"
        data-testid={props.testid}
        className="mt-2 w-full rounded border border-charcoal-700 bg-charcoal-950 px-3 py-1.5 text-sm text-charcoal-100 focus:border-mint-400 focus:outline-none"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
      />
    </label>
  );
}

interface NoticeBlockProps {
  notice: Notice;
  attested: boolean;
  setAttested: (v: boolean) => void;
  onConfirmMaterial: () => void;
}

function NoticeBlock(props: NoticeBlockProps): React.JSX.Element | null {
  const { notice } = props;
  if (notice.kind === "idle") return null;
  if (notice.kind === "saved") {
    return (
      <div
        role="status"
        data-testid="notice-saved"
        className="mt-4 rounded border border-mint-400/40 bg-mint-400/10 px-3 py-2 text-xs text-mint-200"
      >
        Saved.{" "}
        {notice.historyId ? (
          <span className="font-mono">history: {notice.historyId}</span>
        ) : null}
      </div>
    );
  }
  if (notice.kind === "no_op") {
    return (
      <div
        role="status"
        data-testid="notice-noop"
        className="mt-4 rounded border border-charcoal-700 bg-charcoal-800/30 px-3 py-2 text-xs text-charcoal-300"
      >
        No changes to save.
      </div>
    );
  }
  if (notice.kind === "version_conflict") {
    return (
      <div
        role="alert"
        data-testid="notice-conflict"
        className="mt-4 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"
      >
        Preferences were changed elsewhere (current version {notice.current}).
        Latest values reloaded — please review and submit again.
      </div>
    );
  }
  if (notice.kind === "material_gate") {
    return (
      <div
        role="alertdialog"
        data-testid="notice-material-gate"
        className="mt-4 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-3 text-xs text-amber-100"
      >
        <p className="font-medium">Material change — consent required</p>
        <p className="mt-1 text-amber-200/80">
          Changing {notice.diff.join(", ")} affects when intents fire or the
          asset universe you authorize. Attest to record consent for this
          change.
        </p>
        <label className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="attest-material"
            checked={props.attested}
            onChange={(e) => {
              props.setAttested(e.target.checked);
            }}
            className="h-4 w-4 accent-amber-400"
          />
          <span>I understand and consent to this change.</span>
        </label>
        <button
          type="button"
          data-testid="confirm-material"
          disabled={!props.attested}
          onClick={props.onConfirmMaterial}
          className="mt-3 rounded bg-amber-400 px-3 py-1 text-xs font-medium text-charcoal-950 disabled:opacity-50"
        >
          Confirm and save
        </button>
      </div>
    );
  }
  return (
    <div
      role="alert"
      data-testid="notice-error"
      className="mt-4 rounded border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-200"
    >
      {notice.message}
    </div>
  );
}
