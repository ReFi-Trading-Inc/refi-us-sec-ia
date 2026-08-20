# Runbook — BFF assertion signing key

**Owner:** Zeshan
**Created:** 2026-08-17
**Applies to:** the ES256 key the BFF uses to sign `X-Refinity-User-Assertion`
JWTs for `investor-api`.
**Contract:** [`../phase2-7-daniel-contract-mechanics-resolution.md`](../phase2-7-daniel-contract-mechanics-resolution.md) §2 (D-017).

---

## 1. What this key is

Daniel's 2026-08-17 direction made the BFF a signing authority. Every
BFF→investor-api call carries an ES256 JWT we mint; investor-api pins our
issuer and audience, fetches our JWKS, and selects the verification key by
`kid`.

This is the **second** of two assertions and must not be confused with the
first:

| Hop                 | Signer        | Verifier     | Key we hold                  |
| ------------------- | ------------- | ------------ | ---------------------------- |
| identity-ccid → BFF | identity-ccid | BFF          | none (we fetch _their_ JWKS) |
| BFF → investor-api  | **BFF**       | investor-api | **this private key**         |

It is also **not** the Google OIDC service credential (Workload Identity
Federation), which authenticates the _service_. Both travel on the same
request: the OIDC token says which service is calling, this assertion says
which user it is calling for.

## 2. Configuration

| Variable                                | Required                   | Notes                                                                                                          |
| --------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `BFF_ASSERTION_ISSUER`                  | before first outbound call | Stable, environment-specific **URN**: `urn:refinity:bff:{dev\|staging\|prod}`. **Never a Vercel preview URL.** |
| `INVESTOR_API_AUDIENCE`                 | before first outbound call | `urn:refinity:investor-api:dev` in dev.                                                                        |
| `BFF_ASSERTION_PRIVATE_KEY_JWK`         | **every deployed tier**    | Private ES256 JWK as a JSON string, **must include `kid`**.                                                    |
| `BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK` | during rotation only       | Public half of the retiring key.                                                                               |
| `BFF_ASSERTION_ALLOW_EPHEMERAL_KEY`     | local/CI only              | `1` opts into the per-process key. Never set on a deployed tier.                                               |

None of these are required to **boot** — they are enforced at mint time, so a
tier that does not yet call investor-api deploys without them. They must all be
in place before the outbound client is wired.

### Why the issuer is a URN

A hostname issuer welds the BFF's identity to wherever it happens to be
deployed: move the app, and Daniel has to re-pin. A URN decouples them. The
cost is that a URN has no derivable `jwks_uri`, so the **JWKS URL must be
stated explicitly in the connection sheet** — which it has to be anyway, since
he pins it. What we owe him is therefore two strings: the issuer URN and a JWKS
URL on a hostname we control.

### Why a deployed dev tier still needs a real key

The per-process ephemeral key exists so a laptop or CI run works without a
secret. It is wrong for **any** deployed tier, dev included: Cloud Run runs
multiple instances with ephemeral filesystems, so instance A signs under a
`kid` that never appears in the JWKS instance B serves. Verification then fails
depending on which instance answered — intermittent, load-balancer-dependent,
and painful to diagnose. `REFI_ENV=dev` cannot tell a laptop from the deployed
dev tier, which is why the fallback is a separate explicit opt-in rather than
an inference.

Implementation: `apps/web/src/lib/investor-api/user-assertion.ts`.
Published at: `{BFF_ASSERTION_ISSUER}/.well-known/jwks.json`
(`apps/web/app/.well-known/jwks.json/route.ts`).

**With `REFI_ENV=dev` and `BFF_ASSERTION_ALLOW_EPHEMERAL_KEY=1`**, the signer
generates a per-process ephemeral key so local development and CI work without a
secret. No private key is ever committed. Every other configuration throws at
mint time rather than signing with something investor-api cannot verify.

## 3. Generating a key

```sh
node -e '
const { generateKeyPair, exportJWK } = require("jose");
generateKeyPair("ES256", { extractable: true }).then(async ({ publicKey, privateKey }) => {
  const kid = `bff-${new Date().toISOString().slice(0,10)}-1`;
  const priv = { ...(await exportJWK(privateKey)), kid, alg: "ES256", use: "sig" };
  const pub  = { ...(await exportJWK(publicKey)),  kid, alg: "ES256", use: "sig" };
  console.log("PRIVATE (secret store only):\n" + JSON.stringify(priv));
  console.log("\nPUBLIC (safe to share):\n" + JSON.stringify(pub));
});'
```

Store the private JWK in the platform secret store only. It must never enter
git, a log line, an error message, or a client bundle. The published JWKS is
derived by stripping `d` from the configured private key, so the public half is
never configured separately and cannot drift.

## 4. Rotation

investor-api caches our JWKS, so a rotation needs an **overlap window** or
in-flight assertions signed with the retiring `kid` will fail verification.

**The overlap is a minimum of ten minutes** (Daniel 2026-08-19). His cache TTL
is five minutes, and he asked for a ten-minute floor — double the TTL, which is
the right shape: a fetch that lands just before rotation is served a key set
valid for another five minutes, so five would leave no margin at all.

He also refreshes on an unknown `kid`: an assertion carrying a `kid` he has
never seen triggers one immediate JWKS refetch and one retry before rejection,
coalesced and rate-limited across callers. That makes a _short_ overlap
survivable — but it is a safety net, not the plan. Do not treat it as
permission to skip step 2, because the refresh only helps assertions signed
with the NEW key; one signed with a key we have already unpublished fails
closed with nothing to refetch.

1. Generate a new keypair with a new `kid`.
2. Set `BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK` to the **public** half of the
   _current_ key.
3. Set `BFF_ASSERTION_PRIVATE_KEY_JWK` to the **new** private key.
4. Deploy. The JWKS now publishes both `kid`s; new assertions use the new one.
5. **Wait at least ten minutes.** Their cache TTL is 5 minutes; the required
   overlap is ≥ 10. Our own `max-age=300` matches their TTL and bounds how
   stale any intermediary can be, but it is not the binding number.
6. Remove `BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK` and redeploy.

A private JWK placed in the previous-key slot is rejected outright rather than
published — asserted in `scripts/contract-assertions.ts`.

## 5. Compromise response

1. Generate a new key and deploy it as the sole published key (**no overlap** —
   the point is to stop honouring the compromised `kid`).
2. Tell Daniel immediately. Investor-api handles emergency revocation by
   **explicit cache invalidation**, not by waiting out the TTL (Daniel
   2026-08-19) — so this call is what actually stops the compromised `kid`
   being honoured, and the five-minute TTL is not the bound on exposure.
3. The blast radius is bounded by design: assertions are ≤ 2 minutes,
   account ownership is re-authorized server-side on every request, and account
   ids never ride in the assertion — so a stolen key does not by itself grant
   access to a specific account. It would, however, allow impersonation of any
   `user_id` for the overlap window. Treat as high severity.

## 6. Verification behaviour we can rely on

Settled by Daniel 2026-08-19. Recorded here because each one changes what this
runbook is allowed to assume:

| Behaviour                       | Value                                               |
| ------------------------------- | --------------------------------------------------- |
| JWKS cache TTL                  | 5 minutes                                           |
| Unknown `kid`                   | one immediate refresh + one retry, then fail closed |
| Refresh storms                  | coalesced and rate-limited on his side              |
| Rotation overlap required of us | **≥ 10 minutes**                                    |
| Emergency revocation            | explicit invalidation, not TTL expiry               |
| JWKS URL resolution             | **only** the explicitly configured URL              |

That last row is a constraint on us, not a convenience: he will not derive the
JWKS URL from `iss`, and will not follow a key URL supplied by an assertion. So
the URN issuer costs nothing — but it also means a JWKS URL change is a
coordinated config change on his side, never something a redeploy can do
silently.

## 7. Open dependencies

1. **The dev hostname `bff-dev.refi.trading` needs provisioning.** The name is
   agreed (Daniel 2026-08-19) and the JWKS URL is therefore
   `https://bff-dev.refi.trading/.well-known/jwks.json` — but the host does not
   exist yet. Keep the JWKS URL **configurable** until it is live and shipped in
   the Dev connection package. This is a deliverable we owe him.
2. **Staging and prod issuers are reserved, not enabled.** `urn:refinity:bff:staging`
   and `urn:refinity:bff:prod` are accepted as names; only dev is turned on now.
