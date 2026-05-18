"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, StatusBanner } from "@ui/components";
import type { SelectOption } from "@ui/components";
import { useAdvisoryProfile, useSaveAdvisoryProfile } from "@refi/api-clients";
import { onboardingCopy } from "../../_content/onboarding";

const { profile } = onboardingCopy;

type FieldKey =
  | "goal"
  | "timeHorizon"
  | "incomeBand"
  | "liquidNetWorth"
  | "riskTolerance"
  | "investmentExperience"
  | "accountPurpose";

const fieldDefs: { key: FieldKey; label: string; options: SelectOption[] }[] = (
  [
    ["goal", profile.fields.goal],
    ["timeHorizon", profile.fields.timeHorizon],
    ["incomeBand", profile.fields.incomeBand],
    ["liquidNetWorth", profile.fields.liquidNetWorth],
    ["riskTolerance", profile.fields.riskTolerance],
    ["investmentExperience", profile.fields.investmentExperience],
    ["accountPurpose", profile.fields.accountPurpose],
  ] as const
).map(([key, field]) => ({
  key,
  label: field.label,
  options: [...field.options].map((o) => ({ value: o, label: o })),
}));

const EMPTY: Record<FieldKey, string> = {
  goal: "",
  timeHorizon: "",
  incomeBand: "",
  liquidNetWorth: "",
  riskTolerance: "",
  investmentExperience: "",
  accountPurpose: "",
};

export default function OnboardingProfilePage() {
  const router = useRouter();
  const { data: existing } = useAdvisoryProfile();
  const save = useSaveAdvisoryProfile();
  const [fields, setFields] = useState<Record<FieldKey, string>>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from the server-side record so a returning user resumes mid-wizard.
  useEffect(() => {
    if (!existing) return;
    setFields({
      goal: existing.goal,
      timeHorizon: existing.timeHorizon,
      incomeBand: existing.incomeBand,
      liquidNetWorth: existing.liquidNetWorth,
      riskTolerance: existing.riskTolerance,
      investmentExperience: existing.investmentExperience,
      accountPurpose: existing.accountPurpose,
    });
  }, [existing]);

  const valid = Object.values(fields).every((v) => v !== "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    save.mutate(fields, {
      onSuccess: () => router.push("/us/onboarding/broker"),
      onError: (err) => setError(err.message),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {profile.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{profile.subheading}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {fieldDefs.map(({ key, label, options }) => (
          <Select
            key={key}
            label={label}
            placeholder="Select…"
            options={options}
            value={fields[key]}
            onChange={(e) =>
              setFields((prev) => ({ ...prev, [key]: e.target.value }))
            }
            required
          />
        ))}

        <StatusBanner variant="info" className="mt-2">
          {profile.disclaimer}
        </StatusBanner>

        {error && <StatusBanner variant="error">{error}</StatusBanner>}

        <Button
          type="submit"
          disabled={!valid || save.isPending}
          className="mt-2"
        >
          {profile.cta}
        </Button>
      </form>
    </div>
  );
}
