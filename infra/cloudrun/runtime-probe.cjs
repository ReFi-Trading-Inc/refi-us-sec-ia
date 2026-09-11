// Runs only as the isolated Cloud Run Job, never as a public HTTP route.
// Uses the frontend runtime identity; logs no credentials or user information.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const {
  createHash,
  createPublicKey,
  verify,
  randomUUID,
} = require("node:crypto");
const appRequire = createRequire("/app/apps/web/package.json");
const { Firestore } = appRequire("@google-cloud/firestore");
const { KeyManagementServiceClient } = appRequire("@google-cloud/kms");

async function main() {
  const projectId = "refinity-dev";
  const databaseId = "refi-frontend-integration";
  const expectedEmail =
    "refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com";
  const mode = process.argv[2] || "write";
  assert.ok(["write", "read"].includes(mode));
  const db = new Firestore({ projectId, databaseId });
  const collection = "refinity-dev-frontend--deployment-probe";
  const persisted = db.collection(collection).doc("hosting-20260911");
  if (mode === "write") {
    const nonce = randomUUID();
    const second = new Firestore({ projectId, databaseId });
    const ref1 = db.collection(collection).doc(nonce);
    const ref2 = second.collection(collection).doc(nonce);
    const results = await Promise.allSettled([
      ref1.create({ nonce }),
      ref2.create({ nonce }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = results.find((r) => r.status === "rejected");
    assert.equal(rejected.reason.code, 6);
    await persisted.set({
      probe: "frontend-hosting-v1",
      nonce,
      at: new Date().toISOString(),
    });
    await ref1.delete(); // Only the unique probe document created above.
    await second.terminate();
  }
  assert.equal((await persisted.get()).data().probe, "frontend-hosting-v1");
  const defaultDb = new Firestore({ projectId });
  await assert.rejects(
    defaultDb.collection(collection).doc("hosting-20260911").get(),
    (error) => error.code === 7,
    "runtime must not access the project's existing default database",
  );
  await defaultDb.terminate();
  const kms = new KeyManagementServiceClient();
  const publicKeys = [];
  for (const key of ["investor-assertion", "identity-bridge"]) {
    const name = `projects/${projectId}/locations/us-west1/keyRings/refi-frontend/cryptoKeys/${key}/cryptoKeyVersions/1`;
    const [publicKey] = await kms.getPublicKey({ name });
    const input = Buffer.from(`frontend-runtime-probe:${key}`);
    const [result] = await kms.asymmetricSign({
      name,
      digest: { sha256: createHash("sha256").update(input).digest() },
    });
    assert.ok(
      verify("sha256", input, createPublicKey(publicKey.pem), result.signature),
    );
    publicKeys.push(publicKey.pem);
  }
  assert.notEqual(publicKeys[0], publicKeys[1]);
  const identities = [];
  for (const audience of [
    "https://identity-ccid.dev.refi.internal",
    "https://investor-api.dev.refi.internal",
  ]) {
    const endpoint = new URL(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
    );
    endpoint.searchParams.set("audience", audience);
    endpoint.searchParams.set("format", "full");
    const response = await fetch(endpoint, {
      headers: { "Metadata-Flavor": "Google" },
    });
    assert.equal(response.status, 200);
    const token = await response.text();
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    assert.equal(claims.aud, audience);
    assert.equal(claims.email, expectedEmail);
    assert.equal(claims.email_verified, true);
    assert.ok(claims.exp > Date.now() / 1000);
    identities.push({ audience, email: claims.email, subject: claims.sub });
  }
  assert.equal(identities[0].subject, identities[1].subject);
  await db.terminate();
  await kms.close();
  console.log(
    JSON.stringify({
      status: "PASS",
      mode,
      databaseId,
      named_database: true,
      default_database_denied: true,
      separate_kms_signers: true,
      identities,
      persistence:
        mode === "read"
          ? "prior-execution-record-read"
          : "atomic-create-and-write",
      connected_alpha_verified: false,
    }),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "FAIL",
      name: error.name,
      code: error.code || null,
    }),
  );
  process.exitCode = 1;
});
