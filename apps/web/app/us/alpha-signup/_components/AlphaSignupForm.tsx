"use client";

import { useState, type SyntheticEvent } from "react";
import posthog from "posthog-js";

interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  referrer?: string;
}

/**
 * Read UTM params from the current URL. Persisted to sessionStorage so a
 * page refresh mid-flow does not lose attribution. Referrer captured once.
 * Lazy initializer avoids setState-in-effect complaints — this state is
 * derived synchronously from browser globals on mount.
 */
function readUtm(): Utm {
  if (typeof window === "undefined") return {};
  const cached = sessionStorage.getItem("refi_utm_v1");
  if (cached) {
    try {
      return JSON.parse(cached) as Utm;
    } catch {
      /* fall through and re-read */
    }
  }
  const p = new URLSearchParams(window.location.search);
  const captured: Utm = {};
  const source = p.get("utm_source");
  if (source) captured.source = source;
  const medium = p.get("utm_medium");
  if (medium) captured.medium = medium;
  const campaign = p.get("utm_campaign");
  if (campaign) captured.campaign = campaign;
  const content = p.get("utm_content");
  if (content) captured.content = content;
  const term = p.get("utm_term");
  if (term) captured.term = term;
  if (document.referrer) captured.referrer = document.referrer;
  sessionStorage.setItem("refi_utm_v1", JSON.stringify(captured));
  return captured;
}

function useUtm(): Utm {
  const [utm] = useState<Utm>(readUtm);
  return utm;
}

type Step = "email" | "qualify" | "done";

interface ApiResponse {
  data?: { email?: string; step?: string; score?: number };
  error?: { code: string; message: string };
}

function captureEvent(name: string, props?: Record<string, unknown>): void {
  const ph = posthog as unknown as {
    capture?: (n: string, p?: Record<string, unknown>) => void;
  };
  if (typeof ph.capture === "function") ph.capture(name, props);
}

function identify(id: string): void {
  const ph = posthog as unknown as { identify?: (id: string) => void };
  if (typeof ph.identify === "function") ph.identify(id);
}

export function AlphaSignupForm(): React.ReactElement {
  const utm = useUtm();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);

  const [primaryBroker, setPrimaryBroker] = useState("");
  const [isUsPerson, setIsUsPerson] = useState<boolean | null>(null);
  const [portfolioBand, setPortfolioBand] = useState("");
  const [automationExperience, setAutomationExperience] = useState("");
  const [feedbackCommitment, setFeedbackCommitment] = useState<boolean>(false);

  async function runStep1(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      captureEvent("alpha_signup.step1.submitted");
      const res = await fetch("/api/v1/investor/alpha-application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          ...(Object.keys(utm).length ? { utm } : {}),
        }),
      });
      const body = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(body.error?.message ?? `error ${String(res.status)}`);
        captureEvent("alpha_signup.step1.failed", { status: res.status });
        return;
      }
      identify(email);
      captureEvent("alpha_signup.step1.captured");
      setStep("qualify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function runStep2(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      captureEvent("alpha_signup.step2.submitted");
      const res = await fetch("/api/v1/investor/alpha-application", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          primaryBroker: primaryBroker || undefined,
          isUsPerson: isUsPerson ?? undefined,
          portfolioBand: portfolioBand || undefined,
          automationExperience: automationExperience || undefined,
          feedbackCommitment,
        }),
      });
      const body = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(body.error?.message ?? `error ${String(res.status)}`);
        captureEvent("alpha_signup.step2.failed", { status: res.status });
        return;
      }
      setScore(body.data?.score ?? null);
      captureEvent("alpha_signup.step2.qualified", {
        score: body.data?.score,
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmitStep1(e: SyntheticEvent): void {
    e.preventDefault();
    void runStep1();
  }
  function onSubmitStep2(e: SyntheticEvent): void {
    e.preventDefault();
    void runStep2();
  }

  if (step === "done") {
    return (
      <div className="rounded-md bg-charcoal-900 border border-charcoal-800 p-6">
        <p className="text-mint-400 font-mono text-xs uppercase tracking-widest mb-2">
          Waitlisted
        </p>
        <h2 className="text-xl font-semibold text-charcoal-50 mb-3">
          You&rsquo;re on the list.
        </h2>
        <p className="text-charcoal-300 text-sm mb-4">
          We&rsquo;ll email you when your cohort opens. Play the game to move up
          — arena completion and Machine Builder unlocks are the top signals in
          the scoring rubric.
        </p>
        {score !== null && (
          <p className="text-xs text-charcoal-500 font-mono">
            provisional score: {score}
          </p>
        )}
      </div>
    );
  }

  if (step === "qualify") {
    return (
      <form onSubmit={onSubmitStep2} className="space-y-4">
        <p className="text-sm text-charcoal-300 mb-2">
          Step 2 of 2. Optional but recommended — this is how the waitlist gets
          scored.
        </p>
        <div>
          <label className="block text-xs uppercase tracking-wider text-charcoal-400 mb-1">
            Primary broker
          </label>
          <input
            type="text"
            value={primaryBroker}
            onChange={(e) => {
              setPrimaryBroker(e.target.value);
            }}
            placeholder="Alpaca, Schwab, Fidelity, none, other"
            className="w-full rounded-md bg-charcoal-900 border border-charcoal-800 px-3 py-2 text-charcoal-100"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-charcoal-400 mb-1">
            US person?
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="usPerson"
                onChange={() => {
                  setIsUsPerson(true);
                }}
                checked={isUsPerson === true}
              />{" "}
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="usPerson"
                onChange={() => {
                  setIsUsPerson(false);
                }}
                checked={isUsPerson === false}
              />{" "}
              No
            </label>
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-charcoal-400 mb-1">
            Portfolio band
          </label>
          <select
            value={portfolioBand}
            onChange={(e) => {
              setPortfolioBand(e.target.value);
            }}
            className="w-full rounded-md bg-charcoal-900 border border-charcoal-800 px-3 py-2 text-charcoal-100"
          >
            <option value="">Prefer not to say</option>
            <option value="lt_10k">Under $10k</option>
            <option value="10k_100k">$10k – $100k</option>
            <option value="100k_500k">$100k – $500k</option>
            <option value="500k_plus">$500k+</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-charcoal-400 mb-1">
            Automation experience
          </label>
          <select
            value={automationExperience}
            onChange={(e) => {
              setAutomationExperience(e.target.value);
            }}
            className="w-full rounded-md bg-charcoal-900 border border-charcoal-800 px-3 py-2 text-charcoal-100"
          >
            <option value="">Select</option>
            <option value="none">None</option>
            <option value="hobbyist">Hobbyist</option>
            <option value="professional">Professional</option>
          </select>
        </div>
        <label className="flex items-start gap-2 text-sm text-charcoal-300">
          <input
            type="checkbox"
            checked={feedbackCommitment}
            onChange={(e) => {
              setFeedbackCommitment(e.target.checked);
            }}
            className="mt-0.5"
          />
          I&rsquo;m willing to give structured feedback during the alpha.
        </label>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-mint-400 px-5 py-2 text-charcoal-950 font-medium hover:bg-mint-300 disabled:opacity-60 transition-colors"
        >
          {submitting ? "Submitting…" : "Submit qualification"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitStep1} className="space-y-4">
      <p className="text-sm text-charcoal-300 mb-2">
        Step 1 of 2 — we&rsquo;ll email if you get in.
      </p>
      <div>
        <label
          htmlFor="alpha-email"
          className="block text-xs uppercase tracking-wider text-charcoal-400 mb-1"
        >
          Email
        </label>
        <input
          id="alpha-email"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          className="w-full rounded-md bg-charcoal-900 border border-charcoal-800 px-3 py-2 text-charcoal-100"
          placeholder="you@example.com"
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !email}
        className="rounded-md bg-mint-400 px-5 py-2 text-charcoal-950 font-medium hover:bg-mint-300 disabled:opacity-60 transition-colors"
      >
        {submitting ? "Sending…" : "Join waitlist"}
      </button>
    </form>
  );
}
