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
  useKycStatus,
  useAdvisoryProfile,
} from "@refi/api-clients";
import { useAuth } from "../../../_providers/auth/AuthProvider";
import { appCopy } from "../../_content/app-copy";

const { account } = appCopy;

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default function AccountPage() {
  const auth = useAuth();
  const { data: kyc } = useKycStatus();
  const { data: connection } = useBrokerConnection();
  const { data: brokerAccount } = useBrokerAccount();
  const { data: profile } = useAdvisoryProfile();
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

  const kycStatus = kyc?.status ?? "not_started";
  const kycBadgeVariant =
    kycStatus === "approved"
      ? ("approved" as const)
      : kycStatus === "denied"
        ? ("rejected" as const)
        : kycStatus === "under_review" || kycStatus === "pending"
          ? ("warning" as const)
          : ("neutral" as const);

  const kycLabel: Record<typeof kycStatus, string> = {
    not_started: "Not started",
    pending: "Pending",
    incomplete: "Incomplete",
    under_review: "Under review",
    approved: "Approved",
    denied: "Denied",
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

      {/* Identity Verification */}
      <Card>
        <CardHeader>
          <CardTitle>Identity Verification</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-charcoal-300">KYC status</p>
              {kyc?.provider && (
                <p className="text-xs text-charcoal-600 mt-0.5">
                  Provider: {kyc.provider}
                </p>
              )}
            </div>
            <Badge variant={kycBadgeVariant}>{kycLabel[kycStatus]}</Badge>
          </div>
          {kycStatus !== "approved" && (
            <div className="pt-1">
              <Link href="/us/onboarding/kyc">
                <Button size="sm">
                  {kycStatus === "not_started"
                    ? "Start verification"
                    : "Resume verification"}
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
                    Disconnecting will stop managed execution. You can reconnect
                    at any time.
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

      {/* Investment Profile */}
      <Card>
        <CardHeader>
          <CardTitle>{account.profile}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 flex flex-col gap-3">
          {profile ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  { label: "Goal", value: profile.goal },
                  { label: "Time horizon", value: profile.timeHorizon },
                  { label: "Risk tolerance", value: profile.riskTolerance },
                  { label: "Experience", value: profile.investmentExperience },
                  { label: "Income", value: profile.incomeBand },
                  { label: "Net worth", value: profile.liquidNetWorth },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs text-charcoal-500">{label}</dt>
                    <dd className="text-sm text-charcoal-200">{value}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/us/onboarding/profile">
                <Button size="sm" variant="secondary">
                  Update profile
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-charcoal-500">
                Profile available after onboarding.
              </p>
              <Link href="/us/onboarding/profile">
                <Button size="sm">Complete profile</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

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
