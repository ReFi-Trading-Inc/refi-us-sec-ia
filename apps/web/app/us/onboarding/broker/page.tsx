"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  RadioGroup,
  StatusBanner,
} from "@ui/components";
import {
  ApiError,
  useBrokerConnectApiKey,
  useBrokerConnection,
  useBrokerSupported,
} from "@refi/api-clients";
import { onboardingCopy } from "../../_content/onboarding";
import { useAnalytics, AnalyticsEvent } from "../../../_lib/analytics";

const { broker, brokerApiKey } = onboardingCopy;

// Alpaca API Key IDs are 20-char uppercase alphanumerics:
//   - Paper keys start with PK
//   - Live keys start with AK
const PAPER_KEY_PATTERN = /^PK[A-Z0-9]{18}$/;
const LIVE_KEY_PATTERN = /^AK[A-Z0-9]{18}$/;
const ANY_KEY_PATTERN = /^(PK|AK)[A-Z0-9]{18}$/;
// Alpaca secret keys are 40-char mixed-case alphanumerics.
const SECRET_PATTERN = /^[A-Za-z0-9]{40}$/;

const apiKeySchema = z
  .object({
    environment: z.enum(["paper", "live"]),
    api_key_id: z
      .string()
      .trim()
      .regex(ANY_KEY_PATTERN, brokerApiKey.errors.apiKeyIdFormat),
    api_secret_key: z
      .string()
      .trim()
      .regex(SECRET_PATTERN, brokerApiKey.errors.apiSecretFormat),
  })
  .superRefine((data, ctx) => {
    if (
      data.environment === "paper" &&
      !PAPER_KEY_PATTERN.test(data.api_key_id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["api_key_id"],
        message: brokerApiKey.errors.apiKeyIdEnvMismatchPaper,
      });
    }
    if (
      data.environment === "live" &&
      !LIVE_KEY_PATTERN.test(data.api_key_id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["api_key_id"],
        message: brokerApiKey.errors.apiKeyIdEnvMismatchLive,
      });
    }
  });

type ApiKeyFormValues = z.infer<typeof apiKeySchema>;

export default function OnboardingBrokerPage() {
  const router = useRouter();
  const { data: supported, isLoading } = useBrokerSupported();
  const { data: connection } = useBrokerConnection();
  const connectKey = useBrokerConnectApiKey();

  const { track } = useAnalytics();
  const [activeBrokerId, setActiveBrokerId] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const usBrokers = (supported ?? []).filter(
    (b) => !b.regions || b.regions.includes("US"),
  );

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyFormValues>({
    resolver: standardSchemaResolver(apiKeySchema),
    defaultValues: {
      environment: "paper",
      api_key_id: "",
      api_secret_key: "",
    },
  });

  // useWatch is the memo-safe variant; plain watch() triggers
  // react-hooks/incompatible-library because the returned function cannot
  // be memoized by React Compiler.
  const environment = useWatch({ control, name: "environment" });

  // Defensive: if the form is ever unmounted while values are in memory,
  // make sure we clear them. RHF clears its own internal state on unmount,
  // but we add belt-and-suspenders here for the secret field in particular.
  useEffect(() => {
    return () => {
      reset({ environment: "paper", api_key_id: "", api_secret_key: "" });
    };
  }, [reset]);

  function startConnect(brokerId: string) {
    setSubmitError(null);
    setConnected(false);
    setActiveBrokerId(brokerId);
  }

  function cancelConnect() {
    setActiveBrokerId(null);
    setShowSecret(false);
    setSubmitError(null);
    // Explicitly wipe key material from form state.
    reset({ environment: "paper", api_key_id: "", api_secret_key: "" });
  }

  function mapErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) {
        return brokerApiKey.errors.invalidCredentials;
      }
      if (err.status === 422) {
        return brokerApiKey.errors.insufficientPermissions;
      }
    }
    if (err instanceof Error && err.message.toLowerCase().includes("network")) {
      return brokerApiKey.errors.networkError;
    }
    return brokerApiKey.errors.generic;
  }

  function onSubmitForm(event: React.SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void handleSubmit(onSubmit)(event);
  }

  async function onSubmit(values: ApiKeyFormValues): Promise<void> {
    if (!activeBrokerId) return;
    setSubmitError(null);
    // SECURITY: `values` contains the user's Alpaca API credentials. They are
    // submitted exactly once to ReFi's backend (`/v1/brokers/connect/keys`),
    // which in turn talks to Alpaca on the user's behalf. The values are
    // never logged, never persisted to localStorage/sessionStorage/cookies,
    // and never sent to any third party from the browser. After the mutation
    // settles we immediately reset the form, wiping the secret from RHF's
    // internal state.
    try {
      await connectKey.mutateAsync({
        broker_id: activeBrokerId,
        api_key_id: values.api_key_id.trim(),
        api_secret_key: values.api_secret_key.trim(),
        environment: values.environment,
      });
      reset({ environment: "paper", api_key_id: "", api_secret_key: "" });
      setShowSecret(false);
      setConnected(true);
      setActiveBrokerId(null);
      track(AnalyticsEvent.ONBOARDING_BROKER_CONNECTED, {
        broker_id: activeBrokerId,
        environment: values.environment,
      });
    } catch (err) {
      // Clear the secret on error too — the user will retype if they retry.
      reset({
        environment: values.environment,
        api_key_id: values.api_key_id,
        api_secret_key: "",
      });
      setShowSecret(false);
      setSubmitError(mapErrorMessage(err));
    }
  }

  const isAlreadyConnected = connection?.status === "connected" || connected;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {broker.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{broker.subheading}</p>
      </div>

      {isAlreadyConnected && (
        <StatusBanner variant="success" title={brokerApiKey.successTitle}>
          {brokerApiKey.successBody}
        </StatusBanner>
      )}

      <div className="flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-charcoal-500">Loading brokers…</p>
        ) : (
          usBrokers.map((b) => {
            const isAvailable = b.supported;
            const isActive = activeBrokerId === b.id;
            const isThisConnected =
              connection?.broker_id === b.id &&
              connection.status === "connected";

            return (
              <Card key={b.id}>
                <CardContent className="pt-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-charcoal-700 flex items-center justify-center text-xs font-mono text-charcoal-400">
                        {b.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-charcoal-100">
                          {b.name}
                        </p>
                        {!isAvailable && (
                          <Badge
                            variant="neutral"
                            aria-label={`${b.name}: coming soon`}
                          >
                            Coming soon
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isAvailable ? "primary" : "secondary"}
                      disabled={
                        !isAvailable || isActive || connectKey.isPending
                      }
                      onClick={() => {
                        startConnect(b.id);
                      }}
                    >
                      {isThisConnected
                        ? "Connected"
                        : isAvailable
                          ? broker.connectLabel
                          : broker.comingSoonLabel}
                    </Button>
                  </div>

                  {isActive && b.id === "alpaca" && (
                    <form
                      onSubmit={onSubmitForm}
                      className="flex flex-col gap-4 border-t border-charcoal-700 pt-4"
                      autoComplete="off"
                      noValidate
                    >
                      <div>
                        <h2 className="text-base font-semibold text-charcoal-50 mb-1">
                          {brokerApiKey.heading}
                        </h2>
                        <p className="text-xs text-charcoal-400">
                          {brokerApiKey.subheading}
                        </p>
                      </div>

                      <RadioGroup
                        name="environment"
                        label={brokerApiKey.environment.label}
                        value={environment}
                        onChange={(v) => {
                          setValue("environment", v as "paper" | "live", {
                            shouldValidate: true,
                          });
                        }}
                        options={[
                          {
                            value: brokerApiKey.environment.paper.value,
                            label: brokerApiKey.environment.paper.label,
                            hint: brokerApiKey.environment.paper.hint,
                          },
                          {
                            value: brokerApiKey.environment.live.value,
                            label: brokerApiKey.environment.live.label,
                            hint: brokerApiKey.environment.live.hint,
                          },
                        ]}
                      />

                      {environment === "live" && (
                        <StatusBanner variant="warning" title="Live trading">
                          {brokerApiKey.liveWarning}
                        </StatusBanner>
                      )}

                      <Input
                        label={brokerApiKey.fields.apiKeyId.label}
                        placeholder={
                          environment === "live"
                            ? brokerApiKey.fields.apiKeyId.placeholderLive
                            : brokerApiKey.fields.apiKeyId.placeholderPaper
                        }
                        hint={brokerApiKey.fields.apiKeyId.hint}
                        error={errors.api_key_id?.message}
                        autoComplete="off"
                        spellCheck={false}
                        autoCapitalize="characters"
                        {...register("api_key_id")}
                      />

                      <div>
                        <Input
                          label={brokerApiKey.fields.apiSecret.label}
                          type={showSecret ? "text" : "password"}
                          placeholder={
                            brokerApiKey.fields.apiSecret.placeholder
                          }
                          hint={brokerApiKey.fields.apiSecret.hint}
                          error={errors.api_secret_key?.message}
                          autoComplete="off"
                          spellCheck={false}
                          {...register("api_secret_key")}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setShowSecret((s) => !s);
                          }}
                          className="mt-1 text-xs text-mint-400 hover:text-mint-300"
                        >
                          {showSecret
                            ? brokerApiKey.fields.apiSecret.hideLabel
                            : brokerApiKey.fields.apiSecret.showLabel}
                        </button>
                      </div>

                      <details className="rounded-md border border-charcoal-700 bg-charcoal-900 p-3">
                        <summary className="cursor-pointer text-xs font-medium text-charcoal-200">
                          {brokerApiKey.instructions.heading}
                        </summary>
                        <ol className="mt-3 ml-4 list-decimal flex flex-col gap-2 text-xs text-charcoal-400">
                          {brokerApiKey.instructions.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                        <div className="mt-3 flex flex-col gap-1 text-xs">
                          <a
                            href={brokerApiKey.instructions.paperUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-mint-400 hover:text-mint-300"
                          >
                            Open Alpaca paper dashboard ↗
                          </a>
                          <a
                            href={brokerApiKey.instructions.liveUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-mint-400 hover:text-mint-300"
                          >
                            Open Alpaca live dashboard ↗
                          </a>
                        </div>
                      </details>

                      <p className="text-xs text-charcoal-500">
                        {brokerApiKey.security}
                      </p>

                      {submitError && (
                        <StatusBanner variant="error" title="Connection failed">
                          {submitError}
                        </StatusBanner>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          type="submit"
                          disabled={isSubmitting || connectKey.isPending}
                        >
                          {isSubmitting || connectKey.isPending
                            ? brokerApiKey.submittingLabel
                            : brokerApiKey.submitLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={cancelConnect}
                          disabled={isSubmitting || connectKey.isPending}
                        >
                          {brokerApiKey.cancelLabel}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="rounded-lg border border-charcoal-700 bg-charcoal-900 p-4">
        <p className="text-xs font-medium text-charcoal-300 mb-2">
          {broker.permissionsHeading}
        </p>
        <ul className="flex flex-col gap-1">
          {broker.permissions.map((p) => (
            <li
              key={p}
              className="text-xs text-charcoal-400 flex items-start gap-2"
            >
              <span className="text-mint-400 mt-0.5">✓</span>
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-charcoal-600">
          {broker.permissionsDisclaimer}
        </p>
      </div>

      {isAlreadyConnected && (
        <Button
          onClick={() => {
            router.push("/us/onboarding/strategy");
          }}
        >
          {brokerApiKey.continueLabel}
        </Button>
      )}
    </div>
  );
}
