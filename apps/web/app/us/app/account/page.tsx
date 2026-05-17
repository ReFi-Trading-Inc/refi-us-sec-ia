import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components";
import { appCopy } from "../../_content/app-copy";

export const metadata: Metadata = { title: "Account" };

const { account } = appCopy;

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-charcoal-50">
        {account.heading}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{account.wallet}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <p className="text-sm text-charcoal-400 font-mono">
            — not connected —
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{account.profile}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <p className="text-sm text-charcoal-500">
            Profile available after onboarding.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{account.broker}</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <p className="text-sm text-charcoal-500">No broker connected.</p>
        </CardContent>
      </Card>
    </div>
  );
}
