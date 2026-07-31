import { redirect } from "next/navigation";

/**
 * `/auth` currently forwards to the wallet-linking page, which is also the
 * interim local session mint (see apps/web/app/_hooks/useSiweAuth.ts).
 *
 * This is NOT the intended login design. Under Daniel's 2026-07-28 direction
 * the primary path is email-first verification through identity-ccid, and this
 * redirect retargets to that entry point once `GAP-IDENTITY-018` lands. The
 * email-first route cannot be built yet: it needs the JWKS URL, issuer, and
 * audience from the §8 dev connection package, and none of those may be
 * invented.
 */
export default function AuthPage() {
  redirect("/us/auth/connect");
}
