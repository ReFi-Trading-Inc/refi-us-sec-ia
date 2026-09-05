"use client";

/**
 * /us/onboarding/broker — connect Alpaca (paper) with an API key pair.
 *
 * Same-origin BFF only: `POST /api/v1/investor/broker/connection` forwards the
 * key pair ONCE to the contract's `createBrokerageConnection`; the browser
 * keeps nothing (the form is wiped the moment the request settles). Then the
 * page follows the backend's own lifecycle — PENDING_VALIDATION → CONNECTED →
 * first sync — and shows what the sync found: the investor's existing holdings
 * as the backend observed them. Nothing here places an order or enables
 * management; the legacy browser-direct `/v1/brokers/*` hooks are gone.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  StatusBanner,
} from "@ui/components";
import { onboardingCopy } from "../../_content/onboarding";
import { useAnalytics, AnalyticsEvent } from "../../../_lib/analytics";
import {
  ConnectBrokerError,
  useBrokerConnection,
  useConnectBroker,
} from "../../../_hooks/useBrokerConnection";
import { useInvestorPortfolio } from "../../../_hooks/useInvestorPortfolio";

const { broker, brokerApiKey, brokerProgress } = onboardingCopy;

// Alpaca API Key IDs are 20-char uppercase alphanumerics:
//   - Paper keys start with PK
//   - Live keys start with AK
const PAPER_KEY_PATTERN = /^PK[A-Z0-9]{18}$/;
const LIVE_KEY_PATTERN = /^AK[A-Z0-9]{18}$/;
// The field regex admits both prefixes so a live key PARSES far enough to
// reach the refinement below and be refused by name.
const ANY_KEY_PATTERN = /^(PK|AK)[A-Z0-9]{18}$/;
// Alpaca secret keys are 40-char mixed-case alphanumerics.
const SECRET_PATTERN = /^[A-Za-z0-9]{40}$/;

const apiKeySchema = z
  .object({
    // Paper only, by construction: a live credential cannot be expressed here.
    environment: z.literal("paper"),
    api_key_id: z
      .string()
      .trim()
      .regex(ANY_KEY_PATTERN, brokerApiKey.errors.apiKeyIdFormat),
    api_secret_key: z
      .string()
      .trim()
      .regex(SECRET_PATTERN, brokerApiKey.errors.apiSecretFormat),
  })
  .superRefine((v, ctx) => {
    if (LIVE_KEY_PATTERN.test(v.api_key_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["api_key_id"],
        message: brokerApiKey.errors.liveKeyNotAccepted,
      });
    } else if (!PAPER_KEY_PATTERN.test(v.api_key_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["api_key_id"],
        message: brokerApiKey.errors.apiKeyIdEnvMismatchPaper,
      });
    }
  });

type ApiKeyFormValues = z.infer<typeof apiKeySchema>;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function OnboardingBrokerPage() {
  const { track } = useAnalytics();
  const read = useBrokerConnection({ poll: true });
  const connect = useConnectBroker();
  const connection = read.data?.connection ?? null;
  const synced =
    connection?.connectionStatus === "CONNECTED" && !!connection.lastSyncedAt;
  const portfolio = useInvestorPortfolio({ enabled: synced });

  const [formOpen, setFormOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApiKeyFormValues>({
    resolver: standardSchemaResolver(apiKeySchema),
    defaultValues: { environment: "paper", api_key_id: "", api_secret_key: "" },
  });

  // Belt-and-suspenders: wipe key material if the form ever unmounts mid-entry.
  useEffect(() => {
    return () => {
      reset({ environment: "paper", api_key_id: "", api_secret_key: "" });
    };
  }, [reset]);

  function mapErrorMessage(err: unknown): string {
    if (err instanceof ConnectBrokerError) {
      if (err.status === 409) return brokerProgress.alreadyConnected;
      if (err.status === 422 || err.status === 400)
        return brokerApiKey.errors.invalidCredentials;
      if (err.status === 503 || err.status === 502)
        return brokerApiKey.errors.networkError;
    }
    return brokerApiKey.errors.generic;
  }

  function onSubmitForm(event: React.SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void handleSubmit(onSubmit)(event);
  }

  async function onSubmit(values: ApiKeyFormValues): Promise<void> {
    setSubmitError(null);
    // SECURITY: `values` holds the investor's Alpaca paper credentials. They
    // are sent exactly once to the same-origin BFF, which forwards them once to
    // the Investor API. Never logged, never persisted, never sent anywhere
    // else from the browser. The form is wiped as soon as the request settles.
    try {
      await connect.mutateAsync({
        environment: "paper",
        apiKeyId: values.api_key_id.trim(),
        apiSecretKey: values.api_secret_key.trim(),
      });
      reset({ environment: "paper", api_key_id: "", api_secret_key: "" });
      setShowSecret(false);
      setFormOpen(false);
      track(AnalyticsEvent.ONBOARDING_BROKER_CONNECTED, {
        broker_id: "alpaca",
        environment: "paper",
      });
    } catch (err) {
      reset({
        environment: "paper",
        api_key_id: values.api_key_id,
        api_secret_key: "",
      });
      setShowSecret(false);
      setSubmitError(mapErrorMessage(err));
    }
  }

  const stage = useMemo<
    "none" | "validating" | "connected" | "syncing" | "synced" | "problem"
  >(() => {
    if (!connection) return "none";
    if (connection.connectionStatus === "PENDING_VALIDATION")
      return "validating";
    if (connection.connectionStatus === "CONNECTED")
      return connection.lastSyncedAt ? "synced" : "syncing";
    return "problem";
  }, [connection]);

  const holdings = portfolio.data?.portfolio?.positions ?? [];
  const equity = portfolio.data?.portfolio?.valuation.equity ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {broker.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{broker.subheading}</p>
      </div>

      {stage !== "none" && (
        <Card data-testid="broker-connection-status" data-stage={stage}>
          <CardContent className="pt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-charcoal-100">
                  Alpaca · paper
                </p>
                <p className="text-xs text-charcoal-500">
                  {stage === "validating" && brokerProgress.validating}
                  {stage === "syncing" && brokerProgress.syncing}
                  {stage === "synced" && brokerProgress.synced}
                  {stage === "problem" && brokerProgress.problem}
                </p>
              </div>
              <Badge
                variant={
                  stage === "synced" || stage === "connected"
                    ? "active"
                    : stage === "problem"
                      ? "rejected"
                      : "warning"
                }
              >
                {connection?.connectionStatus.replace(/_/g, " ").toLowerCase()}
              </Badge>
            </div>
            {(stage === "validating" || stage === "syncing") && (
              <div
                className="h-1 w-full overflow-hidden rounded bg-charcoal-800"
                aria-hidden="true"
              >
                <div className="h-full w-1/3 animate-pulse bg-mint-400" />
              </div>
            )}
            {stage === "synced" && (
              <StatusBanner variant="success" title={brokerApiKey.successTitle}>
                {brokerApiKey.successBody}
              </StatusBanner>
            )}
          </CardContent>
        </Card>
      )}

      {stage === "synced" && (
        <Card data-testid="broker-holdings-preview">
          <CardContent className="pt-4 flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-charcoal-100">
                {brokerProgress.holdingsHeading}
              </p>
              <p className="text-xs text-charcoal-500">
                <span data-testid="broker-holdings-count">
                  {holdings.length}
                </span>{" "}
                positions
                {equity ? ` · ${money.format(Number(equity))} total` : ""}
              </p>
            </div>
            <p className="text-xs text-charcoal-500">
              {brokerProgress.holdingsNote}
            </p>
            <ul className="divide-y divide-charcoal-800 text-sm">
              {holdings.slice(0, 6).map((p) => (
                <li
                  key={p.securityId}
                  className="flex items-center justify-between py-1.5"
                  data-testid="broker-holding"
                >
                  <span className="font-mono text-charcoal-200">
                    {p.symbol}
                  </span>
                  <span className="text-charcoal-400">
                    {Number(p.heldQty).toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    sh · {money.format(Number(p.marketValue))}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/us/onboarding/strategy"
              className="inline-flex items-center justify-center rounded-md bg-mint-400 px-4 py-2 text-sm font-medium text-charcoal-950 hover:bg-mint-300 transition-colors"
              data-testid="broker-continue"
            >
              {brokerApiKey.continueLabel}
            </Link>
          </CardContent>
        </Card>
      )}

      {stage === "none" && (
        <div className="flex flex-col gap-3">
          {broker.brokers.map((b) => {
            const isAvailable = b.status === "available";
            const isActive = formOpen && b.id === "alpaca";
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
                      disabled={!isAvailable || isActive || connect.isPending}
                      onClick={() => {
                        setSubmitError(null);
                        setFormOpen(true);
                      }}
                    >
                      {isAvailable
                        ? broker.connectLabel
                        : broker.comingSoonLabel}
                    </Button>
                  </div>

                  {isActive && (
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

                      <StatusBanner variant="info" title="Paper trading only">
                        {brokerApiKey.paperOnlyNotice}
                      </StatusBanner>

                      <Input
                        label={brokerApiKey.fields.apiKeyId.label}
                        placeholder={
                          brokerApiKey.fields.apiKeyId.placeholderPaper
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
                        <summary className="cursor-pointer text-xs font-medium text-charcoal-300">
                          {brokerApiKey.instructions.heading}
                        </summary>
                        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-charcoal-400">
                          {brokerApiKey.instructions.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </details>

                      <p className="text-xs text-charcoal-500">
                        {brokerApiKey.security}
                      </p>

                      {submitError && (
                        <StatusBanner variant="error">
                          {submitError}
                        </StatusBanner>
                      )}

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={connect.isPending}
                        >
                          {connect.isPending
                            ? brokerApiKey.submittingLabel
                            : brokerApiKey.submitLabel}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={connect.isPending}
                          onClick={() => {
                            setFormOpen(false);
                            setShowSecret(false);
                            setSubmitError(null);
                            reset({
                              environment: "paper",
                              api_key_id: "",
                              api_secret_key: "",
                            });
                          }}
                        >
                          {brokerApiKey.cancelLabel}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500 mb-2">
                {broker.permissionsHeading}
              </p>
              <ul className="text-sm text-charcoal-300 space-y-1">
                {broker.permissions.map((perm) => (
                  <li key={perm}>· {perm}</li>
                ))}
              </ul>
              <p className="text-xs text-charcoal-500 mt-3">
                {broker.permissionsDisclaimer}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
