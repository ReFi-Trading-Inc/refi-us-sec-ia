/**
 * Generate a P-256 key pair for the DEMO tier's simulated game handoff.
 *
 *   pnpm exec tsx scripts/gen-demo-handoff-keys.ts
 *
 * Set on the demo Vercel project only (never production, never the game's key):
 *   ALPHA_HANDOFF_PUBLIC_KEY_JWK   = the public JWK printed below
 *   DEMO_HANDOFF_PRIVATE_KEY_JWK   = the private JWK printed below (sensitive)
 *   FLAG_ALPHA_CLAIM_ROUTE         = on
 *
 * Nothing is written to disk and nothing is committed.
 */
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });

console.log("ALPHA_HANDOFF_PUBLIC_KEY_JWK=" + JSON.stringify(pub));
console.log("DEMO_HANDOFF_PRIVATE_KEY_JWK=" + JSON.stringify(priv));
