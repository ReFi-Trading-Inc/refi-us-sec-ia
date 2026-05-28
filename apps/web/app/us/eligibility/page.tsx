"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  RadioGroup,
  Select,
  StatusBanner,
} from "@ui/components";
import type { SelectOption } from "@ui/components";
import { eligibilityCopy } from "../_content/eligibility";
import { usBrand } from "../_content/brand";
import { US_STATES } from "../_content/us-states";

const stateOptions: SelectOption[] = US_STATES.map((s) => ({
  value: s.code,
  label: s.name,
}));

const eligibilitySchema = z
  .object({
    state: z.string().length(2, "Please select your state"),
    isUsPerson: z.enum(["yes", "no"], {
      message: "Please select an option",
    }),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth"),
  })
  .refine(
    (data) => {
      const [y, m, d] = data.dob.split("-").map((n) => Number(n));
      if (!y || !m || !d) return false;
      const birth = new Date(Date.UTC(y, m - 1, d));
      const now = new Date();
      let age = now.getUTCFullYear() - birth.getUTCFullYear();
      const beforeBirthday =
        now.getUTCMonth() < birth.getUTCMonth() ||
        (now.getUTCMonth() === birth.getUTCMonth() &&
          now.getUTCDate() < birth.getUTCDate());
      if (beforeBirthday) age -= 1;
      return age >= 18;
    },
    { message: "You must be at least 18 years old", path: ["dob"] },
  );

type FormValues = z.infer<typeof eligibilitySchema>;

type Decision = {
  result: "eligible" | "waitlist" | "ineligible";
  state: string;
  ruleId: string;
};

export default function EligibilityPage() {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(eligibilitySchema),
    defaultValues: { state: "", isUsPerson: undefined, dob: "" },
  });

  const stateValue = watch("state");
  const usPersonValue = watch("isUsPerson");

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitError(null);
    try {
      const response = await fetch("/api/us/eligibility", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: values.state,
          isUsPerson: values.isUsPerson === "yes",
          dob: values.dob,
        }),
      });
      if (!response.ok) {
        throw new Error(`Request failed (${String(response.status)})`);
      }
      const body = (await response.json()) as Decision;
      setDecision(body);
      if (body.result === "eligible") {
        // Pre-warm the next route; the user clicks the CTA to navigate.
        router.prefetch("/us/auth/connect");
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
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
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="flex flex-col gap-6"
            noValidate
          >
            <Select
              label={eligibilityCopy.fields.state.label}
              placeholder={eligibilityCopy.fields.state.placeholder}
              options={stateOptions}
              value={stateValue}
              onChange={(e) => {
                setValue("state", e.target.value);
              }}
              error={errors.state?.message}
              required
            />

            <RadioGroup
              name="isUsPerson"
              label={eligibilityCopy.fields.usPerson.label}
              options={[
                { value: "yes", label: eligibilityCopy.fields.yes },
                { value: "no", label: eligibilityCopy.fields.no },
              ]}
              value={usPersonValue}
              onChange={(v) => {
                setValue("isUsPerson", v as FormValues["isUsPerson"]);
              }}
              error={errors.isUsPerson?.message}
            />

            <Input
              label={eligibilityCopy.fields.dob.label}
              type="date"
              error={errors.dob?.message}
              {...register("dob")}
            />

            {submitError && (
              <StatusBanner variant="error">{submitError}</StatusBanner>
            )}

            <p className="text-xs text-charcoal-500">
              {eligibilityCopy.disclaimer}
            </p>

            <Button
              type="submit"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              {eligibilityCopy.submit}
            </Button>
          </form>
        ) : (
          <EligibilityResult decision={decision} />
        )}
      </main>
    </div>
  );
}

function EligibilityResult({ decision }: { decision: Decision }) {
  const [email, setEmail] = useState("");
  const [notified, setNotified] = useState(false);
  const copy = eligibilityCopy.results[decision.result];

  const variantMap = {
    eligible: "active",
    waitlist: "warning",
    ineligible: "neutral",
  } as const;

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col gap-4">
        <Badge
          variant={variantMap[decision.result]}
          aria-label={`Eligibility result: ${copy.badge}`}
        >
          {copy.badge}
        </Badge>
        <h2 className="text-lg font-semibold text-charcoal-50">
          {copy.heading}
        </h2>
        <p className="text-sm text-charcoal-400">{copy.body}</p>
        <p className="text-xs text-charcoal-600">State: {decision.state}</p>

        {decision.result === "eligible" && (
          <Link
            href="/us/auth/connect"
            className="inline-flex items-center justify-center rounded-md bg-mint-400 px-4 py-2 text-sm font-medium text-charcoal-950 hover:bg-mint-300 transition-colors"
          >
            {eligibilityCopy.results.eligible.cta}
          </Link>
        )}

        {decision.result === "waitlist" && !notified && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setNotified(true);
            }}
            className="flex flex-col gap-3"
          >
            <Input
              type="email"
              label={eligibilityCopy.emailCapture.label}
              placeholder={eligibilityCopy.emailCapture.placeholder}
              hint={eligibilityCopy.emailCapture.helper}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            <Button type="submit" disabled={email.length === 0}>
              {eligibilityCopy.emailCapture.submit}
            </Button>
          </form>
        )}

        {decision.result === "waitlist" && notified && (
          <StatusBanner variant="success">
            Thanks — we&apos;ll be in touch.
          </StatusBanner>
        )}
      </CardContent>
    </Card>
  );
}
