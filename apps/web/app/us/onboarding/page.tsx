import { redirect } from "next/navigation";

// Post-connect entry point. The session cookie is set by /us/auth/connect; this
// page is the redirect target middleware allows once authenticated. KYC is the
// first step a freshly authenticated user must complete (MIG-P2-02).
export default function OnboardingIndexPage() {
  redirect("/us/onboarding/kyc");
}
