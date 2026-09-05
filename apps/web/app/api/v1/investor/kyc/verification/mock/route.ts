/**
 * POST /api/v1/investor/kyc/verification/mock — TEST CONTROL, not a product route.
 *
 * Moves the caller's MOCK verification session along one allowed transition
 * (`{ "to": <lifecycle state> }`) or resets it (`{ "reset": true }`). It exists
 * so local development and E2E can drive the deterministic mock provider.
 *
 * It is enabled ONLY when both `REFI_KYC_PROVIDER=mock` and
 * `REFI_KYC_MOCK_CONTROLS=1` are set on the server. In every other
 * configuration — and therefore in any production tier, which must never set
 * the flag — it answers 404 as if it did not exist. A user can never
 * self-approve identity verification through the product.
 */
import { z } from "zod";
import { bffMutate } from "@lib/bff/handler";
import { getMockKycControls, isKycLifecycleState } from "@lib/kyc";

const body = z.union([
  z.object({ to: z.string().refine(isKycLifecycleState) }),
  z.object({ reset: z.literal(true) }),
]);
type Body = z.infer<typeof body>;

export const POST = bffMutate<Body>({
  action: "advanceMockKycVerification",
  source: "prototype-bff",
  parse: (raw) => body.parse(raw),
  apply: async (ctx) => {
    const controls = getMockKycControls();
    if (controls === null) {
      return {
        data: { ok: false, reason: "not_found" },
        outcome: "rejected" as const,
        reasonCode: "mock_controls_disabled",
        status: 404,
      };
    }
    const subject = { authId: ctx.auth.authId };
    if ("reset" in ctx.input) {
      await controls.reset(subject);
      return { data: { ok: true, reset: true }, status: 200 };
    }
    const result = await controls.advance(
      subject,
      ctx.input.to,
      ctx.correlationId,
    );
    if (!result.ok) {
      return {
        data: { ok: false, reason: result.reason, from: result.from },
        outcome: "rejected" as const,
        reasonCode: result.reason,
        status: 409,
      };
    }
    return {
      data: { ok: true, adapter: "mock", session: result.session },
      references: [`kyc-session:${result.session.referenceId}`],
      status: 200,
    };
  },
});
