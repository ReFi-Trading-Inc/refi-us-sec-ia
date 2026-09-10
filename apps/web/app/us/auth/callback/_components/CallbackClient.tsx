"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, StatusBanner } from "@ui/components";

type Phase = "completing" | "done" | "refused" | "unavailable" | "missing";

/**
 * Posts the provider's magic-link token to the same-origin completion route
 * exactly once. The token is read from the URL and never stored; the
 * pending login is identified by the HttpOnly login cookie, not by anything
 * on this page.
 */
export function CallbackClient(): React.ReactElement {
  const params = useSearchParams();
  const token = params.get("token");
  const [phase, setPhase] = useState<Phase>(token ? "completing" : "missing");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/v1/auth/login/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const body = (await res.json()) as {
          data?: { ok: boolean; continuePath: string };
          code?: string;
        };
        if (res.ok && body.data?.ok) {
          setPhase("done");
          // Drop the token from the address bar before continuing.
          window.history.replaceState(null, "", "/us/auth/callback");
          // Full navigation on purpose: the session cookies just set must
          // apply to the first render of the destination.
          window.location.assign(body.data.continuePath);
          return;
        }
        setPhase(res.status === 401 ? "refused" : "unavailable");
      } catch {
        setPhase("unavailable");
      }
    })();
  }, [token]);

  if (phase === "completing" || phase === "done") {
    return (
      <Card>
        <CardContent className="pt-5 flex flex-col gap-2">
          <p className="text-xs font-mono uppercase tracking-widest text-mint-400">
            Signing you in
          </p>
          <p className="text-sm text-charcoal-300">
            Checking your sign-in link…
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="pt-5 flex flex-col gap-3">
        <StatusBanner variant={phase === "refused" ? "warning" : "error"}>
          {phase === "missing"
            ? "This page needs a sign-in link from your email."
            : phase === "refused"
              ? "This sign-in link is no longer valid. Links are single-use and expire after 15 minutes."
              : "Sign-in cannot be completed right now. Please try again shortly."}
        </StatusBanner>
        <a
          href="/us/auth/connect"
          className="text-sm text-mint-400 hover:underline"
        >
          Request a new sign-in link
        </a>
      </CardContent>
    </Card>
  );
}
