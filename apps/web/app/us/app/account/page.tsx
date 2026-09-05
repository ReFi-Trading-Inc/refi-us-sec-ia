"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatusBanner,
} from "@ui/components";
import {
  useBrokerAccount,
  useBrokerConnection,
  useBrokerDisconnect,
} from "@refi/api-clients";
import { useInvestorProfileV2 } from "../../../_hooks/useInvestorProfileV2";
import {
  RISK_BAND_LABELS,
  type ProductFitStatus,
  type ProfileConfidence,
} from "@lib/sec203a/investor-profile";
import {
  useKycVerification,
  type KycLifecycleState,
} from "../../../_hooks/useKycVerification";
import { useAuth } from "../../../_providers/auth/AuthProvider";
import { PreferencesCard } from "../_components/PreferencesCard";
import { appCopy } from "../../_content/app-copy";

const { account } = appCopy;

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Assessment vocabulary → investor-facing labels. Descriptive only: none of
// these is a portfolio recommendation, and none exposes a raw answer.
const PRODUCT_FIT_LABELS: Record<ProductFitStatus, string> = {
  fit: "Fit",
  fit_with_constraint: "Fit with constraints",
  needs_clarification: "Needs clarification",
  not_fit: "Not a fit",
};

const PROFILE_CONFIDENCE_LABELS: Record<ProfileConfidence, string> = {
  complete: "Complete",
  limited: "Limited",
  unresolved: "Unresolved",
};

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default function AccountPage() {
  const auth = useAuth();
  // Frontend-owned identity-verification lifecycle (provider-neutral). This
  // is NOT backend KYC policy/authorization; it claims nothing about either.
  const { data: kycVerification } = useKycVerification();
  const { data: connection } = useBrokerConnection();
  const { data: brokerAccount } = useBrokerAccount();
  // Canonical Investor Profile v2 via the same-origin BFF: assessment-derived
  // state only (no user-entered risk tolerance, no raw questionnaire answers).
  const { data: profileV2 } = useInvestorProfileV2();
  const assessment = profileV2?.assessment?.assessment ?? null;
  const disconnect = useBrokerDisconnect();

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  async function handleDisconnect() {
    setDisconnectError(null);
    try {
      await disconnect.mutateAsync();
      setConfirmDisconnect(false);
    } catch {
      setDisconnectError("Disconnect failed. Please try again.");
    }
  }

  const kycState: KycLifecycleState =
    kycVerification?.session?.state ?? "not_started";
  const kycAvailable = kycVerification?.available === true;
  const kycBadgeVariant =
    kycState === "passed"
      ? ("approved" as const)
      : kycState === "failed"
        ? ("rejected" as const)
        : kycState === "under_review" ||
            kycState === "in_progress" ||
            kycState === "additional_info_required"
          ? ("warning" as const)
          : ("neutral" as const);

  const kycLabel: Record<KycLifecycleState, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    additional_info_required: "Additional information required",
    under_review: "Review in progress",
    passed: "Completed",
    failed: "Unsuccessful",
  };

  const isConnected = connection?.status === "connected";

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-charcoal-50">
        {account.heading}
      </h1>

      {/* Wallet */}
      <Card>
        <CardHeader>
          <CardTitle>{account.wallet}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 flex flex-col gap-3">
          {auth.wallet_id ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-mono text-charcoal-200">
                  {truncateAddress(auth.wallet_id)}
                </p>
                <Badge variant="active">Connected</Badge>
              </div>
              <p className="text-xs text-charcoal-500">
                Ethereum mainnet · SIWE session
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void auth.signOut()}
                >
                  {account.disconnect}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-charcoal-500">No wallet connected.</p>
          )}
        </CardContent>
      </Card>

      {/* Identity verification — frontend-owned provider lifecycle only */}
      <Card data-testid="identity-verification-card">
        <CardHeader>
          <CardTitle>Identity verification</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-charcoal-300">Verification status</p>
            <Badge variant={kycAvailable ? kycBadgeVariant : "neutral"}>
              {kycAvailable ? kycLabel[kycState] : "Not available yet"}
            </Badge>
          </div>
          {kycAvailable && kycState !== "passed" && (
            <div className="pt-1">
              <Link href="/us/onboarding/kyc">
                <Button size="sm">
                  {kycState === "not_started"
                    ? "Start verification"
                    : "Continue verification"}
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Broker Connection */}
      <Card>
        <CardHeader>
          <CardTitle>{account.broker}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 flex flex-col gap-3">
          {isConnected ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-charcoal-200">
                    {connection.broker_name}
                  </p>
                  {brokerAccount && (
                    <p className="text-xs text-charcoal-500 mt-0.5">
                      Equity: {formatCurrency(brokerAccount.equity)} · Buying
                      power: {formatCurrency(brokerAccount.buying_power)}
                    </p>
                  )}
                </div>
                <Badge variant="active">Connected</Badge>
              </div>

              {disconnectError && (
                <StatusBanner variant="error">{disconnectError}</StatusBanner>
              )}

              {confirmDisconnect ? (
                <div className="flex flex-col gap-2 p-3 rounded-md border border-status-rejected/40 bg-status-rejected/10">
                  <p className="text-xs text-charcoal-300">
                    Disconnecting stops ReFi from reading this account, so your
                    recommendations will pause. You can reconnect at any time.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={disconnect.isPending}
                      onClick={() => void handleDisconnect()}
                    >
                      {disconnect.isPending
                        ? "Disconnecting…"
                        : "Confirm disconnect"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setConfirmDisconnect(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setConfirmDisconnect(true);
                  }}
                >
                  Disconnect broker
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-charcoal-500">No broker connected.</p>
              <Link href="/us/onboarding/broker">
                <Button size="sm">Connect broker</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      {/* Investment Profile — canonical Investor Profile v2 assessment */}
      <Card data-testid="investment-profile-card">
        <CardHeader>
          <CardTitle>{account.profile}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 flex flex-col gap-3">
          {profileV2 ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  {
                    label: "Permitted risk band",
                    value:
                      assessment?.permittedRiskBand != null
                        ? RISK_BAND_LABELS[assessment.permittedRiskBand]
                        : "Not determined",
                  },
                  {
                    label: "Product fit",
                    value: assessment
                      ? PRODUCT_FIT_LABELS[assessment.productFitStatus]
                      : "Assessment pending policy update",
                  },
                  {
                    label: "Profile confidence",
                    value: assessment
                      ? PROFILE_CONFIDENCE_LABELS[assessment.profileConfidence]
                      : "—",
                  },
                  {
                    label: "Assessed",
                    value: assessment
                      ? assessment.assessedAt.slice(0, 10)
                      : "—",
                  },
                  {
                    label: "Profile version",
                    value: String(profileV2.answers.profileVersion),
                  },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs text-charcoal-500">{label}</dt>
                    <dd className="text-sm text-charcoal-200">{value}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/us/onboarding/investor-profile">
                <Button size="sm" variant="secondary">
                  Update profile
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-charcoal-500">
                Complete the investor profile questionnaire to see your
                assessment.
              </p>
              <Link href="/us/onboarding/investor-profile">
                <Button size="sm">Complete profile</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <PreferencesCard />

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>{account.security}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 flex flex-col gap-3">
          <p className="text-xs text-charcoal-400">
            ReFi uses Sign-In With Ethereum (SIWE). There is no password. Your
            session is tied to your wallet signature and expires automatically.
          </p>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void auth.signOut()}
          >
            Sign out all devices
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
