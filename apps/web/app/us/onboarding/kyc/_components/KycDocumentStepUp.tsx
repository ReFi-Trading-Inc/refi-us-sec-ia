"use client";
/**
 * Document step-up (provider-hosted capture inside ReFi's page). Reads the
 * capture token issued for THIS user from the same-origin BFF, launches the
 * provider's capture SDK with the PUBLIC SDK key, and on capture completion
 * tells the BFF "captured" — after which the journey is under review until
 * the provider's asynchronous final decision arrives server-side. Nothing
 * here decides anything.
 */
import { useState } from "react";
import { Button, StatusBanner } from "@ui/components";
import {
  launchDocumentCapture,
  type DocvErrorKind,
  type DocvProgressStage,
} from "../../../../_lib/kyc/docv-sdk";
import {
  useCompleteKycStepUp,
  useKycStepUp,
  useReconcileKyc,
} from "../../../../_hooks/useKycVerification";
import { kycCopy } from "../../../_content/app-copy";

const CONTAINER_ID = "websdk";

export function KycDocumentStepUp() {
  const copy = kycCopy.stepUp;
  const stepUp = useKycStepUp(true);
  const complete = useCompleteKycStepUp();
  const reconcile = useReconcileKyc();
  const [phase, setPhase] = useState<
    "idle" | "launching" | "open" | "captured" | "error" | "unavailable"
  >("idle");
  const [stage, setStage] = useState<DocvProgressStage | null>(null);
  const [errorKind, setErrorKind] = useState<
    DocvErrorKind | "duplicate_launch" | null
  >(null);

  const launch = async () => {
    const token = stepUp.data?.token;
    if (!token) return;
    setPhase("launching");
    const result = await launchDocumentCapture({
      sdkKey: process.env["NEXT_PUBLIC_SOCURE_SDK_KEY"],
      transactionToken: token,
      containerSelector: `#${CONTAINER_ID}`,
      onProgress: (s) => {
        setStage(s);
      },
      // Capture/upload finished: "submitted — processing". Never verification.
      // Tell the BFF "captured", then ask it to reconcile with the provider.
      onCaptured: () => {
        setPhase("captured");
        setStage(null);
        complete.mutate(undefined, {
          onSettled: () => {
            reconcile.mutate();
          },
        });
      },
      // Classified error, never a rejection. Terminal-capable outcomes may let
      // the provider finalize on its side, so reconcile after them.
      onError: (e) => {
        setPhase("error");
        setStage(null);
        setErrorKind(e.kind);
        if (e.terminalCapable) reconcile.mutate();
      },
    });
    if (!result.ok) {
      if (result.reason === "sdk_key_unconfigured") {
        setPhase("unavailable");
      } else {
        setPhase("error");
        setErrorKind(
          result.reason === "duplicate_launch"
            ? "duplicate_launch"
            : "launch_config",
        );
      }
      return;
    }
    setPhase("open");
  };

  return (
    <div className="flex flex-col gap-3" data-testid="kyc-step-up">
      <h2 className="text-base font-semibold text-charcoal-50">
        {copy.heading}
      </h2>
      <p className="text-sm text-charcoal-400">{copy.intro}</p>
      {phase === "unavailable" && (
        <StatusBanner variant="warning">{copy.unavailable}</StatusBanner>
      )}
      {phase === "error" && (
        <StatusBanner variant="warning">
          {errorKind ? copy.errors[errorKind] : copy.error}
        </StatusBanner>
      )}
      {phase === "captured" && (
        <StatusBanner variant="info">{copy.submitted}</StatusBanner>
      )}
      {phase === "open" && stage && (
        <p
          className="text-xs text-charcoal-500"
          data-testid="kyc-step-up-progress"
        >
          {copy.progress[stage]}
        </p>
      )}
      {(phase === "idle" || phase === "error") && (
        <div>
          <Button
            data-testid="kyc-step-up-launch"
            disabled={!stepUp.data?.required || stepUp.isPending}
            onClick={() => {
              void launch();
            }}
          >
            {copy.launch}
          </Button>
        </div>
      )}
      {phase === "launching" && (
        <p className="text-xs text-charcoal-500">{copy.launching}</p>
      )}
      <div id={CONTAINER_ID} data-testid="kyc-step-up-container" />
    </div>
  );
}
