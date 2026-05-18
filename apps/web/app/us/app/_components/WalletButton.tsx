"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletButton() {
  return (
    <ConnectButton
      showBalance={false}
      chainStatus="none"
      accountStatus="address"
      label="Connect wallet"
    />
  );
}
