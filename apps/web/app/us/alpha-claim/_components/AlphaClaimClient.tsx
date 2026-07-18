"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

// Client half of the handoff receiving page. Reads the token from the URL,
// POSTs it to the alpha-claim API exactly once, and continues into formal
// onboarding. The claim API is idempotent, so a refresh re-POST is safe;
// the ran-once guard just avoids a duplicate on React strict-mode remount.

type Phase = "claiming" | "success" | "invalid" | "error";

interface ClaimResponse {
  data?: {
    alphaPlayerId: string;
    applicationRef: string;
    intendedDestination: string;
    score: number | null;
    firstConsumption: boolean;
  };
  error?: { code: string; message: string };
}

// Every destination converges on eligibility, the single entry into formal
// onboarding (Path A/B converge here). Destination is preserved for
// analytics; routing stays on the safe funnel entry.
const DESTINATIONS = new Set([
  "ELIGIBILITY",
  "PAPER",
  "SIGNAL_INFO",
  "MANAGED_INFO",
]);
const CONTINUE_ROUTE = "/us/eligibility";
const WAITLIST_ROUTE = "/us/alpha-signup";

function capture(name: string, props?: Record<string, unknown>): void {
  const ph = posthog as unknown as {
    capture?: (n: string, p?: Record<string, unknown>) => void;
  };
  if (typeof ph.capture === "function") ph.capture(name, props);
}

export function AlphaClaimClient(): React.ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  // Missing token is known at first render, so derive it in the initializer
  // rather than calling setState synchronously inside the effect.
  const [phase, setPhase] = useState<Phase>(token ? "claiming" : "invalid");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) return; // phase already initialised to "invalid"

    void (async () => {
      try {
        const res = await fetch("/api/v1/investor/alpha-claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await res.json()) as ClaimResponse;
        if (!res.ok || !body.data) {
          setPhase(res.status === 401 ? "invalid" : "error");
          capture("onboarding.handoff.claim_failed", {
            status: res.status,
            code: body.error?.code,
          });
          return;
        }
        const dest = DESTINATIONS.has(body.data.intendedDestination)
          ? body.data.intendedDestination
          : "ELIGIBILITY";
        capture("onboarding.handoff.claimed_client", {
          intendedDestination: dest,
          firstConsumption: body.data.firstConsumption,
        });
        setPhase("success");
        window.setTimeout(() => {
          router.push(CONTINUE_ROUTE);
        }, 1400);
      } catch {
        setPhase("error");
      }
    })();
  }, [token, router]);

  if (phase === "claiming") {
    return (
      <div className="rounded-md bg-charcoal-900 border border-charcoal-800 p-6">
        <p className="text-mint-400 font-mono text-xs uppercase tracking-widest mb-2">
          Claiming
        </p>
        <p className="text-charcoal-200 text-sm">
          Bringing your alpha progress into ReFi&hellip;
        </p>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="rounded-md bg-charcoal-900 border border-charcoal-800 p-6">
        <p className="text-mint-400 font-mono text-xs uppercase tracking-widest mb-2">
          Progress claimed
        </p>
        <h2 className="text-xl font-semibold text-charcoal-50 mb-3">
          You&rsquo;re in. Continuing to onboarding&hellip;
        </h2>
        <p className="text-charcoal-300 text-sm">
          If you are not redirected,{" "}
          <a className="text-mint-400 hover:underline" href={CONTINUE_ROUTE}>
            continue to eligibility
          </a>
          .
        </p>
      </div>
    );
  }

  // invalid | error
  return (
    <div className="rounded-md bg-charcoal-900 border border-charcoal-800 p-6">
      <p className="text-red-400 font-mono text-xs uppercase tracking-widest mb-2">
        {phase === "invalid" ? "Link expired" : "Something went wrong"}
      </p>
      <h2 className="text-xl font-semibold text-charcoal-50 mb-3">
        {phase === "invalid"
          ? "This handoff link is invalid or has expired."
          : "We couldn't claim your progress right now."}
      </h2>
      <p className="text-charcoal-300 text-sm">
        Handoff links are single-use and short-lived. You can{" "}
        <a className="text-mint-400 hover:underline" href={WAITLIST_ROUTE}>
          join the waitlist directly
        </a>{" "}
        or return to the game and try again.
      </p>
    </div>
  );
}
