/**
 * /us/onboarding/profile — RETIRED legacy v1 advisory questionnaire.
 *
 * The public U.S. application has ONE canonical investor questionnaire:
 * Investor Profile v2 at /us/onboarding/investor-profile
 * (docs/releases/2026-09-signal/investor-profile-spec.md). The v1 form that
 * lived here collected seven free-form fields including a user-entered risk
 * tolerance and wrote the legacy browser-direct profile endpoint. v2 derives
 * risk capacity, willingness, permitted band and product fit server-side and
 * has no user-entered risk tolerance.
 *
 * This route is kept ONLY as a compatibility redirect so stale internal links
 * and bookmarks do not break. It renders no form, asks no question, reads and
 * writes nothing. `scripts/contract-assertions.ts` pins that it can never
 * become an independent questionnaire again.
 */
import { permanentRedirect } from "next/navigation";

export const dynamic = "force-static";

export default function RetiredOnboardingProfilePage(): never {
  permanentRedirect("/us/onboarding/investor-profile");
}
