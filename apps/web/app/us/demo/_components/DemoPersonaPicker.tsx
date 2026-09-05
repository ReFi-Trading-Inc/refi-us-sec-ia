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

  async function advance() {
    setAdvanced(null);
    const res = await fetch("/api/demo/advance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ fills: 1 }),
    });
    const body = (await res.json()) as {
      data?: { filled: number; events: number };
    };
    setAdvanced(
      res.ok && body.data
        ? `Advanced: ${String(body.data.filled)} fill(s), ${String(body.data.events)} event(s) emitted.`
        : "Sign in as the admitted profile first.",
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
            Presenter control: advance the market so the next scheduled order
            fills now and the event stream shows it.
          </p>
          <Button
            size="sm"
            variant="tertiary"
            data-testid="demo-advance"
            onClick={() => {
              void advance();
            }}
          >
            Advance market
          </Button>
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
