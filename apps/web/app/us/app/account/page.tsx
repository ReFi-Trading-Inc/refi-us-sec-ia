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
import { SimulatedDataBadge } from "../_components/SimulatedDataBadge";

const { account } = appCopy;
const K = account.kycCard;
const B = account.brokerCard;
const P = account.profileCard;
const S = account.securityCard;

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
      setDisconnectError(B.disconnectErrorFallback);
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
                <Badge variant="approved">
                  {account.walletStatusConnected}
                </Badge>
              </div>
              <p className="text-xs text-charcoal-500">
                {account.walletNetwork}
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
            <p className="text-sm text-charcoal-500">{account.walletNone}</p>
          )}
        </CardContent>
      </Card>

      {/* Identity Verification */}
      <Card>
        <CardHeader>
          <CardTitle>{K.title}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-charcoal-300">{K.statusLabel}</p>
              {kyc?.provider && (
                <p className="text-xs text-charcoal-600 mt-0.5">
                  {K.providerLabel}: {kyc.provider}
                </p>
              )}
            </div>
            <Badge variant={kycBadgeVariant}>{K.statusLabels[kycStatus]}</Badge>
          </div>
          {kycStatus !== "approved" && (
            <div className="pt-1">
              <Link href="/us/onboarding/kyc">
                <Button size="sm">
                  {kycStatus === "not_started" ? K.startCta : K.resumeCta}
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
          {isConnected && connection ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-charcoal-200">
                    {connection.broker_name}
                  </p>
                  {brokerAccount && (
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-charcoal-500">
                        {B.equityLabel}:{" "}
                        {formatCurrency(Number(brokerAccount.equity))} ·{" "}
                        {B.buyingPowerLabel}:{" "}
                        {formatCurrency(Number(brokerAccount.buying_power))}
                      </p>
                      <SimulatedDataBadge variant="inline" source="mock" />
                    </div>
                  )}
                </div>
                <Badge variant="approved">{B.connectedLabel}</Badge>
              </div>

              {disconnectError && (
                <StatusBanner variant="error">{disconnectError}</StatusBanner>
              )}

              {confirmDisconnect ? (
                <div className="flex flex-col gap-2 p-3 rounded-md border border-rose-800 bg-rose-950/30">
                  <p className="text-xs text-charcoal-300">{B.confirmBody}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={disconnect.isPending}
                      onClick={() => void handleDisconnect()}
                    >
                      {disconnect.isPending ? B.disconnectingCta : B.confirmCta}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      {B.cancelCta}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmDisconnect(true)}
                >
                  {B.disconnectCta}
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-charcoal-500">{B.noneConnected}</p>
              <Link href="/us/onboarding/broker">
                <Button size="sm">{B.connectCta}</Button>
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
                  { label: P.fields.goal, value: profile.goal },
                  { label: P.fields.timeHorizon, value: profile.timeHorizon },
                  {
                    label: P.fields.riskTolerance,
                    value: profile.riskTolerance,
                  },
                  {
                    label: P.fields.experience,
                    value: profile.investmentExperience,
                  },
                  { label: P.fields.income, value: profile.incomeBand },
                  { label: P.fields.netWorth, value: profile.liquidNetWorth },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs text-charcoal-500">{label}</dt>
                    <dd className="text-sm text-charcoal-200">{value}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/us/onboarding/profile">
                <Button size="sm" variant="secondary">
                  {P.updateCta}
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-charcoal-500">{P.none}</p>
              <Link href="/us/onboarding/profile">
                <Button size="sm">{P.completeCta}</Button>
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
          <p className="text-xs text-charcoal-400">{S.body}</p>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void auth.signOut()}
          >
            {S.signOutAllCta}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
