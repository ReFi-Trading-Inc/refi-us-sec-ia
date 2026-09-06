"use client";

import { useState } from "react";
import { Button, Card, CardContent, StatusBanner } from "@ui/components";

interface PersonaOption {
  key: string;
  label: string;
  entryPath: string;
}

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
    <div className="flex flex-col gap-3" data-testid="demo-persona-picker">
      {error && <StatusBanner variant="error">{error}</StatusBanner>}
      {personas.map((p) => (
        <Card key={p.key} data-testid={`demo-persona-${p.key}`}>
          <CardContent className="pt-5 flex items-center justify-between gap-4">
            <p className="text-sm text-charcoal-200">{p.label}</p>
            <Button
              size="sm"
              variant={p.key === "applicant" ? "primary" : "secondary"}
              disabled={busy !== null}
              onClick={() => {
                void choose(p);
              }}
              data-testid={`demo-signin-${p.key}`}
            >
              Start as {p.key}
            </Button>
          </CardContent>
        </Card>
      ))}
      <Card data-testid="demo-advance-card">
        <CardContent className="pt-5 flex items-center justify-between gap-4">
          <p className="text-sm text-charcoal-200">
            Presenter controls: advance the market so the next scheduled order
            (or the invited profile&apos;s broker validation and sync) happens
            now; or reset the signed-in profile&apos;s walkthrough for the next
            audience.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="tertiary"
              data-testid="demo-advance"
              onClick={() => {
                void control({ fills: 1 });
              }}
            >
              Advance
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              data-testid="demo-reset"
              onClick={() => {
                void control({ reset: true });
              }}
            >
              Reset walkthrough
            </Button>
          </div>
        </CardContent>
      </Card>
      {advanced && (
        <p
          className="text-xs font-mono text-charcoal-400"
          data-testid="demo-advance-result"
        >
          {advanced}
        </p>
      )}
    </div>
  );
}
