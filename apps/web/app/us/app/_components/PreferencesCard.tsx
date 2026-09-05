"use client";

/**
 * The investor's four supported preferences (IB-06). Saving sends the
 * version the investor saw as optimistic concurrency and produces NEW advice
 * upstream; the prior recommendation is preserved. No execution control.
 */
import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatusBanner,
} from "@ui/components";
import {
  useInvestorPortfolio,
  useUpdatePreferences,
} from "../../../_hooks/useInvestorPortfolio";
import type { PreferencesView } from "@lib/investor-api/portfolio";
import { appCopy } from "../../_content/app-copy";

const { preferences: copy } = appCopy;
const DRIFT_OPTIONS = ["0.01", "0.02", "0.03", "0.05", "0.1"];

export function PreferencesCard() {
  const { data } = useInvestorPortfolio();
  const prefs = data?.portfolio?.preferences ?? null;
  if (!prefs) return null;
  // Keyed by version: a fresh form (and fresh initial state) per preference
  // version, with no state synchronisation inside effects.
  return <PreferencesForm key={prefs.version} prefs={prefs} />;
}

function PreferencesForm({ prefs }: { prefs: PreferencesView }) {
  const update = useUpdatePreferences();
  const [drift, setDrift] = useState<string>(prefs.driftThreshold);
  const [minOrder, setMinOrder] = useState<string>(prefs.minOrder);
  const [excluded, setExcluded] = useState<string>(
    prefs.excludedAssets.join(", "),
  );
  const [fractional, setFractional] = useState<boolean>(
    prefs.fractionalEnabled,
  );
  const [saved, setSaved] = useState(false);

  const excludedList = excluded
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return (
    <Card data-testid="preferences-card">
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-5 flex flex-col gap-4">
        <p className="text-xs text-charcoal-400">{copy.body}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-charcoal-400">
              {copy.driftThreshold}
            </span>
            <select
              className="h-10 rounded-md border border-charcoal-600 bg-charcoal-800 px-3 text-sm text-charcoal-50"
              value={drift}
              onChange={(e) => {
                setDrift(e.target.value);
              }}
              data-testid="pref-drift"
            >
              {DRIFT_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {(Number(d) * 100).toFixed(0)}%
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-charcoal-400">{copy.minOrder}</span>
            <input
              className="h-10 rounded-md border border-charcoal-600 bg-charcoal-800 px-3 text-sm text-charcoal-50 font-mono"
              value={minOrder}
              inputMode="decimal"
              onChange={(e) => {
                setMinOrder(e.target.value);
              }}
              data-testid="pref-min-order"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-charcoal-400">
              {copy.excludedAssets}
            </span>
            <input
              className="h-10 rounded-md border border-charcoal-600 bg-charcoal-800 px-3 text-sm text-charcoal-50 font-mono"
              value={excluded}
              onChange={(e) => {
                setExcluded(e.target.value);
              }}
              placeholder="security_us_mo, security_us_pm"
              data-testid="pref-excluded"
            />
          </label>
          <label className="flex items-center gap-2 text-charcoal-200">
            <input
              type="checkbox"
              checked={fractional}
              onChange={(e) => {
                setFractional(e.target.checked);
              }}
              data-testid="pref-fractional"
            />
            {copy.fractional}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={update.isPending}
            data-testid="pref-save"
            onClick={() => {
              setSaved(false);
              update.mutate(
                {
                  expectedVersion: prefs.version,
                  driftThreshold: drift,
                  minOrder,
                  excludedAssets: excludedList,
                  fractionalEnabled: fractional,
                },
                {
                  onSuccess: () => {
                    setSaved(true);
                  },
                },
              );
            }}
          >
            {copy.save}
          </Button>
          <span className="text-xs text-charcoal-500 font-mono">
            {copy.version} {prefs.version}
          </span>
        </div>
        {saved && (
          <StatusBanner variant="success" data-testid="pref-saved">
            {copy.saved}
          </StatusBanner>
        )}
        {update.isError && (
          <StatusBanner variant="error">
            {update.error.message === "STALE_VERSION" ? copy.stale : copy.error}
          </StatusBanner>
        )}
      </CardContent>
    </Card>
  );
}
