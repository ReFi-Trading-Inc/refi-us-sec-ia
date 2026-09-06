"use client";

import { useState } from "react";
import { Button, Card, CardContent, StatusBanner } from "@ui/components";

interface PersonaOption {
  key: string;
  label: string;
  entryPath: string;
}

/** Persona labels are "Title — description"; split once for the card layout. */
function splitLabel(label: string): { title: string; description: string } {
  const i = label.indexOf(" — ");
  return i === -1
    ? { title: label, description: "" }
    : { title: label.slice(0, i), description: label.slice(i + 3) };
}

const STEP_HINT: Record<string, string> = {
  applicant: "Eligibility → identity → application",
  invited: "Identity → risk profile → Alpaca paper keys → holdings → advice",
  admitted: "Live portfolio, advice, records and event stream",
};

export function DemoPersonaPicker({ personas }: { personas: PersonaOption[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<string | null>(null);

  async function choose(p: PersonaOption) {
    setBusy(p.key);
    setError(null);
    try {
      const res = await fetch("/api/demo/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ persona: p.key }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { data: { entryPath: string } };
      // Full navigation on purpose: the new cookies must be applied to the
      // first render of the destination, and typed routes need no cast.
      window.location.assign(body.data.entryPath);
    } catch {
      setError("The demo sign-in is not available on this deployment.");
      setBusy(null);
    }
  }

  async function control(body: { fills: number } | { reset: true }) {
    setAdvanced(null);
    const res = await fetch("/api/demo/advance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const out = (await res.json()) as {
      data?: { filled: number; events: number; persona?: string };
    };
    if (!res.ok || !out.data) {
      setAdvanced("Sign in as a walkthrough profile first.");
      return;
    }
    setAdvanced(
      "reset" in body
        ? `Reset: the ${out.data.persona ?? ""} walkthrough starts over.`
        : `Advanced: ${String(out.data.filled)} fill(s), ${String(out.data.events)} event(s) emitted.`,
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="demo-persona-picker">
      {error && <StatusBanner variant="error">{error}</StatusBanner>}
      {personas.map((p) => {
        const { title, description } = splitLabel(p.label);
        const featured = p.key === "invited";
        return (
          <Card
            key={p.key}
            data-testid={`demo-persona-${p.key}`}
            className={featured ? "border-mint-400/40" : undefined}
          >
            <CardContent className="pt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex flex-col gap-1">
                <p className="text-base font-semibold text-charcoal-50">
                  {title}
                </p>
                {description && (
                  <p className="text-sm text-charcoal-400">{description}</p>
                )}
                {STEP_HINT[p.key] && (
                  <p className="text-xs font-mono uppercase tracking-wider text-charcoal-500">
                    {STEP_HINT[p.key]}
                  </p>
                )}
              </div>
              <Button
                size="md"
                variant={featured ? "primary" : "secondary"}
                disabled={busy !== null}
                loading={busy === p.key}
                onClick={() => {
                  void choose(p);
                }}
                data-testid={`demo-signin-${p.key}`}
                className="w-full sm:w-auto sm:min-w-44"
              >
                Start walkthrough
              </Button>
            </CardContent>
          </Card>
        );
      })}
      <Card data-testid="demo-advance-card">
        <CardContent className="pt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-charcoal-200">
              Presenter controls
            </p>
            <p className="text-sm text-charcoal-400">
              Advance moves the demo clock: the next scheduled order fills, or
              the invited profile&apos;s broker validation and sync complete
              now. Reset rebuilds the signed-in profile&apos;s walkthrough for
              the next audience.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="md"
              variant="secondary"
              data-testid="demo-advance"
              className="w-full sm:w-auto"
              onClick={() => {
                void control({ fills: 1 });
              }}
            >
              Advance clock
            </Button>
            <Button
              size="md"
              variant="secondary"
              data-testid="demo-reset"
              className="w-full sm:w-auto"
              onClick={() => {
                void control({ reset: true });
              }}
            >
              Reset walkthrough
            </Button>
          </div>
          {advanced && (
            <p
              className="text-xs font-mono text-charcoal-400"
              data-testid="demo-advance-result"
            >
              {advanced}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
