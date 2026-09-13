"use client";

import { useRouter } from "next/navigation";
import { BrokerageConnectionPanel } from "../../../_components/product/BrokerageConnectionPanel";

export default function BrokeragePage() {
  const router = useRouter();
  return (
    <BrokerageConnectionPanel
      onContinue={() => {
        router.push("/us/product/subscription");
      }}
      onSkip={() => {
        router.push("/us/product/subscription");
      }}
    />
  );
}
