/**
 * /us/app/account-controls — PR-F Surface 4.
 *
 * Investor-editable AccountPrefs with S8 optimistic concurrency + the
 * material-change consent gate. Dark behind FLAG_ACCOUNT_CONTROLS_CENTER
 * (server-side); the page still renders as read-only when the flag is
 * off (the GET route returns 404 in that case; the client shows the
 * preview banner).
 *
 * The form is intentionally boring: four inputs, one submit. The
 * boundary work is in the route (`/api/v1/investor/account-prefs`), not
 * here — the UI's job is to reflect state, surface the 409 outcomes,
 * and get out of the way.
 */
import type { Metadata } from "next";
import { AccountControlsClient } from "./_components/AccountControlsClient";

export const metadata: Metadata = {
  title: "Account controls",
  description:
    "Manage your account preferences and review the change history for your ReFi account.",
};

export default function AccountControlsPage(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-charcoal-50 tracking-tight">
        Account controls
      </h1>
      <p className="mt-2 text-sm text-charcoal-400">
        Four investor-editable knobs on the trading account. Changes to material
        fields require a fresh consent acknowledgement.
      </p>
      <div className="mt-8">
        <AccountControlsClient />
      </div>
    </main>
  );
}
