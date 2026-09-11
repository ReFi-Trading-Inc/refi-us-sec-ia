"use client";
/**
 * ReFi-owned identity form (Build Your Own UI). Collects the identity data the
 * configured provider needs, obtains a device-intelligence session token from
 * the provider's browser SDK immediately before submit, and posts ONCE to the
 * same-origin BFF with a per-submission idempotency key. No provider host is
 * ever contacted from here; no server key exists in the browser.
 *
 * Values live only in component state; nothing is persisted client-side.
 */
import { useMemo, useState } from "react";
import { Button, StatusBanner } from "@ui/components";
import { getDiSessionToken } from "../../../../_lib/kyc/di-session";
import {
  useSubmitKycEvaluation,
  type KycIdentityFormInput,
} from "../../../../_hooks/useKycVerification";
import { kycCopy } from "../../../_content/app-copy";

const STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

export function KycIdentityForm() {
  const copy = kycCopy.form;
  const submit = useSubmitKycEvaluation();
  // One idempotency key per mounted form: a double click or retry reuses it.
  const submissionKey = useMemo(() => crypto.randomUUID(), []);
  const [fields, setFields] = useState({
    givenName: "",
    familyName: "",
    dateOfBirth: "",
    email: "",
    phoneNumber: "",
    nationalId: "",
    line1: "",
    line2: "",
    locality: "",
    region: "",
    postalCode: "",
    consent: false,
  });
  const [diProblem, setDiProblem] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const set =
    (k: keyof typeof fields) => (e: { target: { value: string } }) => {
      setFields((f) => ({ ...f, [k]: e.target.value }));
    };

  const onSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setDiProblem(null);
    setInvalid(false);
    if (
      !fields.givenName ||
      !fields.familyName ||
      !fields.dateOfBirth ||
      !fields.line1 ||
      !fields.locality ||
      !fields.region ||
      !fields.postalCode ||
      !fields.consent
    ) {
      setInvalid(true);
      return;
    }
    const di = await getDiSessionToken();
    if (!di.ok) {
      setDiProblem(copy.diUnavailable);
      return;
    }
    const input: KycIdentityFormInput = {
      submissionKey,
      diSessionToken: di.token,
      givenName: fields.givenName.trim(),
      familyName: fields.familyName.trim(),
      dateOfBirth: fields.dateOfBirth,
      ...(fields.email ? { email: fields.email.trim() } : {}),
      ...(fields.phoneNumber ? { phoneNumber: fields.phoneNumber.trim() } : {}),
      ...(fields.nationalId ? { nationalId: fields.nationalId.trim() } : {}),
      address: {
        line1: fields.line1.trim(),
        ...(fields.line2 ? { line2: fields.line2.trim() } : {}),
        locality: fields.locality.trim(),
        region: fields.region,
        postalCode: fields.postalCode.trim(),
        country: "US",
      },
      consentToVerification: true,
    };
    submit.mutate(input);
  };

  const result = submit.data;

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="flex flex-col gap-3"
      data-testid="kyc-identity-form"
      autoComplete="off"
    >
      <h2 className="text-base font-semibold text-charcoal-50">
        {copy.heading}
      </h2>
      <p className="text-sm text-charcoal-400">{copy.intro}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {copy.givenName}
          <input
            className="input"
            value={fields.givenName}
            onChange={set("givenName")}
            required
          />
        </label>
        <label className="text-sm">
          {copy.familyName}
          <input
            className="input"
            value={fields.familyName}
            onChange={set("familyName")}
            required
          />
        </label>
        <label className="text-sm">
          {copy.dateOfBirth}
          <input
            className="input"
            type="date"
            value={fields.dateOfBirth}
            onChange={set("dateOfBirth")}
            required
          />
        </label>
        <label className="text-sm">
          {copy.phoneNumber}
          <input
            className="input"
            type="tel"
            inputMode="tel"
            value={fields.phoneNumber}
            onChange={set("phoneNumber")}
          />
        </label>
        <label className="text-sm">
          {copy.email}
          <input
            className="input"
            type="email"
            value={fields.email}
            onChange={set("email")}
          />
        </label>
        <label className="text-sm">
          {copy.nationalId}
          <input
            className="input"
            inputMode="numeric"
            autoComplete="off"
            value={fields.nationalId}
            onChange={set("nationalId")}
            placeholder="•••-••-••••"
          />
          <span className="block text-xs text-charcoal-500">
            {copy.nationalIdHint}
          </span>
        </label>
        <label className="text-sm sm:col-span-2">
          {copy.line1}
          <input
            className="input"
            value={fields.line1}
            onChange={set("line1")}
            required
          />
        </label>
        <label className="text-sm sm:col-span-2">
          {copy.line2}
          <input
            className="input"
            value={fields.line2}
            onChange={set("line2")}
          />
        </label>
        <label className="text-sm">
          {copy.locality}
          <input
            className="input"
            value={fields.locality}
            onChange={set("locality")}
            required
          />
        </label>
        <label className="text-sm">
          {copy.region}
          <select
            className="input"
            value={fields.region}
            onChange={set("region")}
            required
          >
            <option value="">—</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {copy.postalCode}
          <input
            className="input"
            inputMode="numeric"
            value={fields.postalCode}
            onChange={set("postalCode")}
            required
          />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-charcoal-300">
        <input
          type="checkbox"
          checked={fields.consent}
          onChange={(e) => {
            setFields((f) => ({ ...f, consent: e.target.checked }));
          }}
          required
        />
        <span>{copy.consent}</span>
      </label>
      {invalid && <StatusBanner variant="error">{copy.invalid}</StatusBanner>}
      {diProblem && <StatusBanner variant="warning">{diProblem}</StatusBanner>}
      {result?.result === "provider_error" && (
        <StatusBanner variant="warning">{copy.providerError}</StatusBanner>
      )}
      {result?.stepUpRequired && (
        <StatusBanner variant="info">{copy.stepUp}</StatusBanner>
      )}
      {submit.isError && (
        <StatusBanner variant="error">{kycCopy.startError}</StatusBanner>
      )}
      <div>
        <Button
          type="submit"
          data-testid="kyc-identity-submit"
          disabled={submit.isPending}
        >
          {submit.isPending ? copy.submitting : copy.submit}
        </Button>
      </div>
    </form>
  );
}
