"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, StatusBanner } from "@ui/components";
import type { SelectOption } from "@ui/components";
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

export default function OnboardingProfilePage() {
  const router = useRouter();
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    goal: "",
    timeHorizon: "",
    incomeBand: "",
    liquidNetWorth: "",
    riskTolerance: "",
    investmentExperience: "",
    accountPurpose: "",
  });

  const valid = Object.values(fields).every((v) => v !== "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    // Profile saved to backend in MIG-P1-08
    void router.push("/us/onboarding/broker");
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

        <Button type="submit" disabled={!valid} className="mt-2">
          {profile.cta}
        </Button>
      </form>
    </div>
  );
}
