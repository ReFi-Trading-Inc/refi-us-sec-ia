# Integration Guide

##

### Step 1: How it works

Send user PII to the Evaluation API to run KYC, Fraud, and Watchlist screening.

This workflow:

- Returns an immediate decision for most users.
- Escalates to Document Verification (DocV) when additional information needed.
- Completes DocV asynchronously and delivers the final decision via webhook.

### **What you’ll build**

- **Signup form (PII)** — Collect identity data in your UI.
- **Server endpoint** — Submit PII to the Evaluation API and route based on the returned decision.
- **DocV step-up** — Launch DocV when the decision is `REVIEW`.
- **Webhook endpoint** — Listen for the DocV `evaluation_completed` event, persist the final decision, and route users accordingly.

### **Decision outcomes**

After creating a verification session, the Evaluation API returns one of the following decisions:

- `ACCEPT` — Create the account.
- `REJECT` — Stop onboarding.

### **Document Verification (DocV)**

If the evaluation returns a `REVIEW` status, use DocV to collect:

- Government ID
- Selfie (biometric match)

DocV completes asynchronously. The final decision is delivered via the `evaluation_completed` webhook.

---

### **Before you start**

You’ll need:

- **Sandbox base URL:** `https://riskos.sandbox.socure.com`
- **API key:** Server-side secret for Evaluation API requests.
- **SDK key:** Frontend key for Digital Intelligence and DocV SDKs.
- **Workflow name:** Included in the `"workflow"` field of your request.

### Step 2: Collect a Digital Intelligence session token

Each Evaluation request must include a `di_session_token`. Generate the token on the frontend immediately before submitting signup data to your backend.

> See the [Digital Intelligence Web SDK guide](https://help.socure.com/riskos/docs/digital-intelligence-web-sdk) for full SDK initialization and configuration.

### **Install**

```bash
npm install --save @socure-inc/device-risk-sdk
```

### **Generate token and submit to your backend**

Call `getSessionToken()` just before sending signup data to your server.

```tsx
import { SigmaDeviceManager } from "@socure-inc/device-risk-sdk";

const handleSignup = async (formData: any) => {
  const di_session_token = await SigmaDeviceManager.getSessionToken();

  await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...formData,
      di_session_token,
    }),
  });
};
```

### Step 3: Run the KYC evaluation

When the user submits PII, your server calls the Evaluation API with the PII and generated `di_session_token`.

### **API request**

```
POST /api/evaluation
```

**Required `individual` fields**

| Field                              | Value                  |
| ---------------------------------- | ---------------------- |
| `data.individual.di_session_token` | `{{DI_SESSION_TOKEN}}` |
| `data.individual.given_name`       | `Jane`                 |
| `data.individual.family_name`      | `Doe`                  |
| `data.individual.address.country`  | `US`                   |

**In addition to the required fields above, provide at least one of:**

- `date_of_birth`
- `phone_number`
- Additional address details

> **Tip**: Include as many identity fields as possible for optimal evaluation quality. See the [RiskOS™ documentation](https://help.socure.com/riskos/docs/kyc-watchlist-screening-direct-api-start-an-evaluation) for the complete request schema.

```
POST https://riskos.sandbox.socure.com/api/evaluation
Authorization:Bearer {{API_KEY}}
Content-Type:application/json
Accept:application/json
```

```tsx
const response = await fetch(
  "https://riskos.sandbox.socure.com/api/evaluation",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SOCURE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow: process.env.SOCURE_WORKFLOW_NAME,
      data: {
        individual: {
          given_name: body.givenName,
          family_name: body.familyName,
          date_of_birth: body.dateOfBirth,
          email: body.email,
          phone_number: body.phoneNumber,
          national_id: body.nationalId,
          di_session_token: body.di_session_token,
          address: {
            line_1: body.addressLine1,
            line_2: body.addressLine2,
            locality: body.locality,
            major_admin_division: body.majorAdminDivision,
            postal_code: body.postalCode,
            country: body.country,
          },
        },
      },
    }),
  },
);

const result = await response.json();
```

### **Example response**

RiskOS™ evaluates the request immediately and returns a decision.

```json
{
  "decision": "ACCEPT",
  "status": "CLOSED",
  "eval_id": "b1c0e610-822d-4793-a970-8bfc0a9b883f"
}
```

| Decision | Next step                                                             |
| -------- | --------------------------------------------------------------------- |
| `ACCEPT` | Identity verified. Continue onboarding.                               |
| `REJECT` | Identity failed verification. Route according to your business rules. |
| `REVIEW` | Launch DocV using the SDK.                                            |

> **Tip**: For more information about how outcomes are determined, review the `tags` field in the API response.

### Step 4: Complete Document Verification (DocV)

If the Evaluation response returns:

- `decision === "REVIEW"`
- `eval_status === "evaluation_paused"`
- A `docvTransactionToken` in `data_enrichments`

RiskOS™ has triggered Document Verification (DocV).

DocV is asynchronous. The workflow resumes after capture completes, and the final decision is delivered via webhook (`evaluation_completed`). Ensure your webhook endpoint is registered before going live.

### **Retrieve the transaction token**

The DocV transaction token is returned in:

`data_enrichments[n].response.data.docvTransactionToken`

```tsx
const json = await response.json();

const docvTransactionToken = json?.data_enrichments?.find(
  (e: any) => e?.response?.data?.docvTransactionToken,
)?.response?.data?.docvTransactionToken;
```

Persist `eval_id` to correlate webhook events with the original evaluation.

### **Launch the Web SDK**

Load the [DocV Web SDK](https://help.socure.com/riskos/docs/web-sdk):

`https://websdk.socure.com/bundle.js`

The SDK requires a container element (typically a `div`) in your HTML where the Capture App will be rendered. Ensure the ID of this element matches the selector passed to the `launch` function.

```html
<div id="websdk"></div>
```

Then launch:

```tsx
(window as any).SocureDocVSDK.launch(
  process.env.NEXT_PUBLIC_SOCURE_SDK_KEY,
  docvTransactionToken,
  "#websdk",
  {
    qrCodeNeeded: true,
    closeCaptureWindowOnComplete: true,
  },
);
```

The SDK renders the Capture App and guides the user through:

- Government-issued ID capture
- Selfie verification
- Liveness checks

### **Native mobile (optional)**

For native (iOS and Android) apps, open the DocV URL returned in:

- `data_enrichments[n].response.data.url`

This launches the Socure Capture App in the device browser.

If you included `data.individual.docv.config.redirect.url` in your Evaluation request, the user will be redirected back to your app after capture completes.

If no redirect URL is configured, display a loading state and wait for the `evaluation_completed` webhook to determine the final decision.

> See the [Integration Guide](https://help.socure.com/riskos/docs/hosted-flows-integration-guide) for advanced SDK configuration and mobile patterns.

### Step 5: Receive the final decision (Webhook)

After DocV completes, RiskOS™ resumes the paused evaluation asynchronously and sends the final decision via an `evaluation_completed` webhook event.

> Ensure your [webhook endpoint is registered](https://help.socure.com/riskos/docs/webhooks) before going live.

### **Listen for `evaluation_completed`**

The final outcome is available in `data.decision`.

```json
{
  "event_type": "evaluation_completed",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "eval_id": "11111111-2222-3333-4444-555555555555",
    "eval_status": "evaluation_completed",
    "decision": "ACCEPT"
  }
}
```

### **Minimal webhook handler (server-side)**

Persist `id`, `eval_id`, and `decision` so your frontend can route the user appropriately.

```tsx
export async function POST(request: Request) {
  const event = await request.json();

  if (event.event_type !== "evaluation_completed") {
    return new Response("Ignored", { status: 200 });
  }

  const { id, eval_id, decision } = event.data;

  // persist decision keyed by `id`

  return new Response("OK", { status: 200 });
}
```

### **Routing users after webhook**

Because DocV is asynchronous:

- Wait for your backend to persist the webhook decision.
- Route based on the stored `decision`.

| Decision | Action                               |
| -------- | ------------------------------------ |
| `ACCEPT` | Continue onboarding                  |
| `REJECT` | Stop onboarding or route to fallback |

A common approach is polling your backend until the stored decision changes.

### Step 6: Before going live

Confirm your integration:

- Use the Sandbox base URL (`https://riskos.sandbox.socure.com`) for testing.
- Include `di_session_token` in every Evaluation request.
- Handle `ACCEPT`, `REJECT`, and `REVIEW` from the Evaluation response.
- On `REVIEW`, extract `docvTransactionToken` and launch the DocV SDK.
- Register a webhook endpoint and process `evaluation_completed`.
- Persist `id` and `eval_id` for API ↔ webhook correlation.
- Route users based on the final webhook decision.

---

_Vendored verbatim from the founder-provided Socure Integration Guide (2026-09-10) as the product specification for the ReFi KYC integration. Not edited. Socure account verification pending; no credentials, no traffic._
