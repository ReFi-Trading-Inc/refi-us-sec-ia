/**
 * ES256 assertion signer abstraction (Daniel 2026-09-09, step 3).
 *
 * The per-request BFF→investor-api user assertion is signed by ONE of:
 *
 *   - `kms`  — Google Cloud KMS asymmetric-sign on a non-exportable P-256
 *              key version. The private key never leaves KMS; the public EC
 *              JWK is derived from `getPublicKey`; the same key serves every
 *              replica and survives restarts. KMS returns a DER signature;
 *              it is converted to JOSE `r || s` and the result is verified
 *              locally against the public key before the token is used, so
 *              an encoding mistake can never reach investor-api.
 *   - `jwk`  — a persistent private ES256 JWK from the secret store
 *              (`BFF_ASSERTION_PRIVATE_KEY_JWK`), signed in-process with
 *              Node's `crypto.sign` in `ieee-p1363` (JOSE) form.
 *   - `ephemeral` — a per-process key for a single-process local machine or
 *              CI run only (`REFI_ENV=dev` + `BFF_ASSERTION_ALLOW_EPHEMERAL_KEY=1`).
 *
 * A signer exposes exactly what the JWS needs — the `kid`, the public JWK for
 * the JWKS, and `sign(signingInput)` — and never the private material.
 * `user-assertion.ts` assembles the compact JWS around it; the claim profile,
 * TTL and pattern rules stay there and are unchanged by the signer choice.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import type { JWK } from "jose";
import { derToJose, isJoseForm } from "./ecdsa-signature";

export const ASSERTION_SIGNER_KINDS = ["jwk", "kms", "ephemeral"] as const;
export type AssertionSignerKind = (typeof ASSERTION_SIGNER_KINDS)[number];

export interface AssertionSigner {
  readonly kind: AssertionSignerKind;
  /** Stable key id published in the JWKS and carried in every JWS header. */
  readonly kid: string;
  /** Public EC P-256 JWK: `kty, crv, x, y, kid, alg=ES256, use=sig`; never `d`. */
  publicJwk(): Promise<JWK>;
  /** ES256 signature over `signingInput` in JOSE form (64 bytes, `r || s`). */
  sign(signingInput: Uint8Array): Promise<Uint8Array>;
}

export class AssertionSignerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionSignerError";
  }
}

function publicJwkFromKeyObject(
  key: ReturnType<typeof createPublicKey>,
  kid: string,
): JWK {
  const exported = key.export({ format: "jwk" }) as JWK;
  if (exported.kty !== "EC" || exported.crv !== "P-256") {
    throw new AssertionSignerError(
      "assertion signing key must be EC P-256 (ES256)",
    );
  }
  const { d: _never, ...pub } = exported;
  return { ...pub, kid, alg: "ES256", use: "sig" };
}

/** Verify a JOSE-form ES256 signature locally; used after every KMS sign. */
export function verifyJoseSignature(
  publicJwk: JWK,
  signingInput: Uint8Array,
  joseSig: Uint8Array,
): boolean {
  const key = createPublicKey({ key: publicJwk as never, format: "jwk" });
  return verify(
    "sha256",
    signingInput,
    { key, dsaEncoding: "ieee-p1363" },
    joseSig,
  );
}

// ─── jwk / ephemeral: in-process private key ────────────────────────────────

export function createJwkAssertionSigner(
  privateJwk: JWK,
  kind: "jwk" | "ephemeral" = "jwk",
): AssertionSigner {
  if (privateJwk.kty !== "EC" || privateJwk.crv !== "P-256") {
    throw new AssertionSignerError(
      "BFF_ASSERTION_PRIVATE_KEY_JWK must be an EC P-256 key (ES256).",
    );
  }
  if (typeof privateJwk.d !== "string") {
    throw new AssertionSignerError(
      "BFF_ASSERTION_PRIVATE_KEY_JWK has no private component `d`.",
    );
  }
  if (typeof privateJwk.kid !== "string" || privateJwk.kid.length === 0) {
    throw new AssertionSignerError(
      "BFF_ASSERTION_PRIVATE_KEY_JWK must carry a `kid` — investor-api " +
        "supports kid-based rotation and cannot select a key without one.",
    );
  }
  const kid = privateJwk.kid;
  const privateKey = createPrivateKey({
    key: privateJwk as never,
    format: "jwk",
  });
  const publicKey = createPublicKey(privateKey);
  const pub = publicJwkFromKeyObject(publicKey, kid);
  return {
    kind,
    kid,
    publicJwk: () => Promise.resolve({ ...pub }),
    sign: (signingInput) =>
      Promise.resolve(
        new Uint8Array(
          sign("sha256", signingInput, {
            key: privateKey,
            dsaEncoding: "ieee-p1363",
          }),
        ),
      ),
  };
}

// ─── kms: Google Cloud KMS asymmetric sign ──────────────────────────────────

/**
 * The slice of the KMS client this signer uses. Narrow on purpose so tests
 * can substitute a fake that signs with a local key and returns DER, exactly
 * like the service does.
 */
export interface KmsSignClient {
  getPublicKey(request: { name: string }): Promise<[{ pem?: string | null }]>;
  asymmetricSign(request: {
    name: string;
    digest: { sha256: Uint8Array };
    digestCrc32c?: { value: number | string };
  }): Promise<[{ signature?: Uint8Array | string | null }]>;
}

export interface KmsSignerOptions {
  /** projects/…/locations/…/keyRings/…/cryptoKeys/…/cryptoKeyVersions/N */
  keyVersionName: string;
  /** Stable, human-chosen key id published in the JWKS (e.g. `bff-2026-09-kms-1`). */
  kid: string;
  client: KmsSignClient;
}

/**
 * KMS signer. The public key is fetched once per process (it is immutable for
 * a key version) and every signature is converted DER → JOSE and verified
 * locally against it before being returned.
 */
export function createKmsAssertionSigner(
  options: KmsSignerOptions,
): AssertionSigner {
  const { keyVersionName, kid, client } = options;
  if (
    !/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+\/cryptoKeyVersions\/\d+$/.test(
      keyVersionName,
    )
  ) {
    throw new AssertionSignerError(
      "BFF_ASSERTION_KMS_KEY_VERSION must be a full cryptoKeyVersion resource name",
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(kid)) {
    throw new AssertionSignerError(
      "BFF_ASSERTION_KID must be a short stable identifier",
    );
  }
  let publicJwkCache: JWK | null = null;
  async function publicJwk(): Promise<JWK> {
    if (publicJwkCache) return { ...publicJwkCache };
    const [res] = await client.getPublicKey({ name: keyVersionName });
    if (!res.pem)
      throw new AssertionSignerError("KMS returned no public key PEM");
    const key = createPublicKey(res.pem);
    publicJwkCache = publicJwkFromKeyObject(key, kid);
    return { ...publicJwkCache };
  }
  return {
    kind: "kms",
    kid,
    publicJwk,
    async sign(signingInput) {
      const digest = createHash("sha256").update(signingInput).digest();
      const [res] = await client.asymmetricSign({
        name: keyVersionName,
        digest: { sha256: new Uint8Array(digest) },
      });
      const raw = res.signature;
      if (!raw) throw new AssertionSignerError("KMS returned no signature");
      const bytes =
        typeof raw === "string"
          ? new Uint8Array(Buffer.from(raw, "base64"))
          : new Uint8Array(raw);
      // KMS returns DER; a JOSE-form signature is accepted as-is so a future
      // service change cannot double-convert.
      const jose = isJoseForm(bytes) ? bytes : derToJose(bytes);
      const pub = await publicJwk();
      if (!verifyJoseSignature(pub, signingInput, jose)) {
        throw new AssertionSignerError(
          "KMS signature failed local verification after DER→JOSE conversion",
        );
      }
      return jose;
    },
  };
}
