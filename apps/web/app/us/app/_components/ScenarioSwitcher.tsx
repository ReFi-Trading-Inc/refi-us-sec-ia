"use client";

// Dev/staging-only scenario switcher. Sets the `refi_scenario_v1` cookie
// that MSW handlers read via getActiveScenario(). When unset, handlers fall
// back to default Maya happy-path behavior. URL `?scenario=` query takes
// precedence over the cookie — useful for one-shot deterministic snapshots
// in Playwright. Hidden when REFI_ENV=prod.

import { useEffect, useState } from "react";
import {
  SCENARIO_COOKIE,
  VERDICT_FIXTURES,
  type ScenarioId,
  type ScenarioVerdict,
} from "@refi/api-clients";

const ALL_SCENARIOS: ScenarioVerdict[] = Object.values(VERDICT_FIXTURES);

function readScenarioCookie(): ScenarioId | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SCENARIO_COOKIE}=([^;]+)`),
  );
  const value = match ? decodeURIComponent(match[1] ?? "") : null;
  if (value && value in VERDICT_FIXTURES) return value as ScenarioId;
  return null;
}

function writeScenarioCookie(id: ScenarioId | null): void {
  if (typeof document === "undefined") return;
  if (id === null) {
    document.cookie = `${SCENARIO_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
  } else {
    document.cookie = `${SCENARIO_COOKIE}=${id}; path=/; SameSite=Lax`;
  }
}

function groupTitle(id: ScenarioId): string {
  if (id.startsWith("BROKER_")) return "Broker";
  if (id.startsWith("ORDER_")) return "Order";
  if (id.startsWith("SUPPORT_")) return "Support";
  return "Compliance";
}

export function ScenarioSwitcher() {
  const envIsProd =
    process.env["NEXT_PUBLIC_REFI_ENV"] === "prod" ||
    process.env["NEXT_PUBLIC_REFI_ENV"] === "production";
  const [active, setActive] = useState<ScenarioId | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setActive(readScenarioCookie());
  }, []);

  if (envIsProd) return null;

  const activeFixture = active ? VERDICT_FIXTURES[active] : null;
  const grouped = ALL_SCENARIOS.reduce<Record<string, ScenarioVerdict[]>>(
    (acc, s) => {
      const k = groupTitle(s.id);
      (acc[k] ??= []).push(s);
      return acc;
    },
    {},
  );

  const onSelect = (id: ScenarioId | null) => {
    writeScenarioCookie(id);
    setActive(id);
    setOpen(false);
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-charcoal-700 bg-charcoal-900 px-3 py-1 text-xs font-medium text-charcoal-200 hover:border-mint-400 transition-colors"
      >
        <span aria-hidden className="text-mint-400">
          ⌥
        </span>
        <span className="text-charcoal-500 font-mono">scenario:</span>
        <span>{activeFixture ? activeFixture.id : "default"}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-96 max-h-[60vh] overflow-y-auto rounded-md border border-charcoal-700 bg-charcoal-900 shadow-dropdown z-50 p-1"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => onSelect(null)}
            aria-current={active === null ? "true" : undefined}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              active === null
                ? "bg-charcoal-800 text-charcoal-50"
                : "text-charcoal-300 hover:bg-charcoal-800 hover:text-charcoal-100"
            }`}
          >
            <div className="font-medium">Default (no scenario)</div>
            <div className="text-xs text-charcoal-500 mt-0.5">
              Persona happy-path. Compliance preview uses qty&gt;1000 heuristic.
            </div>
          </button>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-3 py-1 mt-1 text-[10px] uppercase tracking-wider text-charcoal-500 font-mono border-t border-charcoal-800">
                {group}
              </div>
              {items.map((s) => {
                const isActive = s.id === active;
                return (
                  <button
                    key={s.id}
                    role="menuitem"
                    type="button"
                    onClick={() => onSelect(s.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      isActive
                        ? "bg-charcoal-800 text-charcoal-50"
                        : "text-charcoal-300 hover:bg-charcoal-800 hover:text-charcoal-100"
                    }`}
                  >
                    <div className="font-medium">{s.label}</div>
                    <div className="text-xs text-charcoal-500 mt-0.5">
                      {s.description}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="px-3 py-2 text-[10px] text-charcoal-600 border-t border-charcoal-800 mt-1 font-mono">
            Dev only · cookie: {SCENARIO_COOKIE} · ?scenario= overrides
          </div>
        </div>
      ) : null}
    </div>
  );
}
