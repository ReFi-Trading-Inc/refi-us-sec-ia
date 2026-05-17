"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  Checkbox,
  StatusBanner,
} from "@ui/components";
import type { SelectOption } from "@ui/components";
import { eligibilityCopy } from "../_content/eligibility";
import { usBrand } from "../_content/brand";

const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

const stateOptions: SelectOption[] = US_STATES.map((s) => ({
  value: s,
  label: s,
}));
const purposeOptions: SelectOption[] =
  eligibilityCopy.fields.accountPurpose.options.map((o) => ({
    value: o,
    label: o,
  }));

const WAITLIST_STATES = new Set(["Alaska", "Hawaii", "New York"]);

type Decision = "eligible" | "waitlist" | "unsupported" | null;

export default function EligibilityPage() {
  const [state, setState] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [usPersonConfirmed, setUsPersonConfirmed] = useState(false);
  const [accountPurpose, setAccountPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<Decision>(null);
  const [error, setError] = useState<string | null>(null);

  const valid =
    state !== "" && ageConfirmed && usPersonConfirmed && accountPurpose !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      // Phase 1: client-side rule. Server-side route handler in MIG-P1-08.
      await new Promise((r) => setTimeout(r, 600));
      setDecision(WAITLIST_STATES.has(state) ? "waitlist" : "eligible");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4">
        <Link href="/us" className="text-sm font-semibold text-charcoal-200">
          {usBrand.productSurface}
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-8 py-16">
        <h1 className="text-2xl font-semibold text-charcoal-50 mb-2">
          {eligibilityCopy.heading}
        </h1>
        <p className="text-sm text-charcoal-400 mb-8">
          {eligibilityCopy.subheading}
        </p>

        {decision === null ? (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6"
            noValidate
          >
            <Select
              label={eligibilityCopy.fields.state.label}
              placeholder={eligibilityCopy.fields.state.placeholder}
              options={stateOptions}
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
            />

            <Select
              label={eligibilityCopy.fields.accountPurpose.label}
              placeholder="Select…"
              options={purposeOptions}
              value={accountPurpose}
              onChange={(e) => setAccountPurpose(e.target.value)}
              required
            />

            <Checkbox
              label={eligibilityCopy.fields.ageConfirmation.label}
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
            />

            <Checkbox
              label={eligibilityCopy.fields.usPersonConfirmation.label}
              checked={usPersonConfirmed}
              onChange={(e) => setUsPersonConfirmed(e.target.checked)}
            />

            {error && <StatusBanner variant="error">{error}</StatusBanner>}

            <p className="text-xs text-charcoal-500">
              {eligibilityCopy.disclaimer}
            </p>

            <Button
              type="submit"
              disabled={!valid || submitting}
              loading={submitting}
            >
              Check eligibility
            </Button>
          </form>
        ) : (
          <EligibilityResult decision={decision} state={state} />
        )}
      </main>
    </div>
  );
}

function EligibilityResult({
  decision,
  state,
}: {
  decision: NonNullable<Decision>;
  state: string;
}) {
  const copy = eligibilityCopy.results[decision];

  const variantMap = {
    eligible: "active",
    waitlist: "warning",
    unsupported: "neutral",
  } as const;

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col gap-4">
        <Badge
          variant={variantMap[decision]}
          aria-label={`Eligibility result: ${copy.badge}`}
        >
          {copy.badge}
        </Badge>
        <h2 className="text-lg font-semibold text-charcoal-50">
          {copy.heading}
        </h2>
        <p className="text-sm text-charcoal-400">{copy.body}</p>
        <p className="text-xs text-charcoal-600">State: {state}</p>
        {"cta" in copy && copy.cta && (
          <Link
            href={decision === "eligible" ? "/us/auth/connect" : "/us"}
            className="inline-flex items-center justify-center rounded-md bg-mint-400 px-4 py-2 text-sm font-medium text-charcoal-950 hover:bg-mint-300 transition-colors"
          >
            {copy.cta}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
