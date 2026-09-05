"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, StatusBanner } from "@ui/components";

interface PersonaOption {
  key: string;
  label: string;
  entryPath: string;
}

export function DemoPersonaPicker({ personas }: { personas: PersonaOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      router.push(body.data.entryPath as never);
    } catch {
      setError("The demo sign-in is not available on this deployment.");
      setBusy(null);
    }
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
    </div>
  );
}
