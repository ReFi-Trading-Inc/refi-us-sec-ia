"use client";

// Dev/staging-only persona switcher. Sets the `refi_persona_v1` cookie that
// MSW handlers read via getActivePersona(). Hidden when REFI_ENV=prod so it
// never reaches end users. Cookie path `/` so it applies everywhere in dev;
// session-only (no Max-Age) so it resets on browser close.

import { useEffect, useState } from "react";
import {
  PERSONA_COOKIE,
  PERSONA_LIST,
  type PersonaId,
} from "@refi/api-clients";

function readPersonaCookie(): PersonaId {
  if (typeof document === "undefined") return "maya";
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${PERSONA_COOKIE}=([^;]+)`),
  );
  const value = match ? decodeURIComponent(match[1] ?? "") : null;
  if (value === "maya" || value === "david" || value === "sarah") return value;
  return "maya";
}

function writePersonaCookie(id: PersonaId): void {
  if (typeof document === "undefined") return;
  // Dev-only cookie; path=/ so the MSW handler sees it on any request.
  document.cookie = `${PERSONA_COOKIE}=${id}; path=/; SameSite=Lax`;
}

export function PersonaSwitcher() {
  const envIsProd =
    process.env["NEXT_PUBLIC_REFI_ENV"] === "prod" ||
    process.env["NEXT_PUBLIC_REFI_ENV"] === "production";
  const [active, setActive] = useState<PersonaId>("maya");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setActive(readPersonaCookie());
  }, []);

  if (envIsProd) return null;

  const activePersona =
    PERSONA_LIST.find((p) => p.id === active) ?? PERSONA_LIST[0]!;

  const onSelect = (id: PersonaId) => {
    writePersonaCookie(id);
    setActive(id);
    setOpen(false);
    // Hard reload so MSW handlers + TanStack Query cache pick up the swap.
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
        <span className="text-charcoal-500 font-mono">persona:</span>
        <span>{activePersona.displayName}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 rounded-md border border-charcoal-700 bg-charcoal-900 shadow-dropdown z-50 p-1"
        >
          {PERSONA_LIST.map((p) => {
            const isActive = p.id === active;
            return (
              <button
                key={p.id}
                role="menuitem"
                type="button"
                onClick={() => onSelect(p.id)}
                aria-current={isActive ? "true" : undefined}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? "bg-charcoal-800 text-charcoal-50"
                    : "text-charcoal-300 hover:bg-charcoal-800 hover:text-charcoal-100"
                }`}
              >
                <div className="font-medium">{p.displayName}</div>
                <div className="text-xs text-charcoal-500 mt-0.5">
                  {p.oneLiner}
                </div>
              </button>
            );
          })}
          <div className="px-3 py-2 text-[10px] text-charcoal-600 border-t border-charcoal-800 mt-1 font-mono">
            Dev only · cookie: {PERSONA_COOKIE}
          </div>
        </div>
      ) : null}
    </div>
  );
}
