// On-demand Cloud Run Job; built-in Node APIs avoid Next.js tracing assumptions.
// Same runtime identity as the BFF. No tokens or user/broker data in logs.
const assert = require("node:assert/strict");
const {
  createHash,
  createPublicKey,
  verify,
  randomUUID,
} = require("node:crypto");
const project = "refinity-dev";
const database = "refi-frontend-integration";
const email = "refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com";
const metadata =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/";

async function main() {
  const mode = process.argv[2] || "write";
  assert.ok(["write", "read"].includes(mode));
  const response = await fetch(metadata + "token", {
    headers: { "Metadata-Flavor": "Google" },
  });
  assert.equal(response.status, 200);
  const { access_token: token } = await response.json();
  async function api(url, method = "GET", body) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  const dbName = "projects/" + project + "/databases/" + database;
  const base = "https://firestore.googleapis.com/v1/" + dbName + "/documents";
  const collection = "refinity-dev-frontend--deployment-probe";
  const persisted = dbName + "/documents/" + collection + "/hosting-20260911";
  const commit = (writes) => api(base + ":commit", "POST", { writes });
  if (mode === "write") {
    const probe = dbName + "/documents/" + collection + "/" + randomUUID();
    const write = {
      update: {
        name: probe,
        fields: { probe: { stringValue: "atomic-create" } },
      },
      currentDocument: { exists: false },
    };
    const results = await Promise.all([commit([write]), commit([write])]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 1);
    const result = await commit([
      {
        update: {
          name: persisted,
          fields: {
            probe: { stringValue: "frontend-hosting-v1" },
            at: { timestampValue: new Date().toISOString() },
          },
        },
      },
      { delete: probe }, // Only the unique document created by this probe.
    ]);
    assert.equal(result.status, 200);
  }
  const saved = await api("https://firestore.googleapis.com/v1/" + persisted);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.fields.probe.stringValue, "frontend-hosting-v1");
  const denied = await api(
    "https://datastore.googleapis.com/v1/projects/" + project + ":lookup",
    "POST",
    {
      databaseId: "",
      keys: [
        {
          partitionId: { projectId: project },
          path: [
            {
              kind: "refi_frontend_deployment_probe",
              name: "hosting-20260911",
            },
          ],
        },
      ],
    },
  );
  assert.equal(
    denied.status,
    403,
    "runtime must not access the existing default database",
  );
  const publicKeys = [];
  for (const key of ["investor-assertion", "identity-bridge"]) {
    const name =
      "projects/" +
      project +
      "/locations/us-west1/keyRings/refi-frontend/cryptoKeys/" +
      key +
      "/cryptoKeyVersions/1";
    const pub = await api(
      "https://cloudkms.googleapis.com/v1/" + name + "/publicKey",
    );
    assert.equal(pub.status, 200);
    const input = Buffer.from("frontend-runtime-probe:" + key);
    const signed = await api(
      "https://cloudkms.googleapis.com/v1/" + name + ":asymmetricSign",
      "POST",
      {
        digest: { sha256: createHash("sha256").update(input).digest("base64") },
      },
    );
    assert.equal(signed.status, 200);
    assert.ok(
      verify(
        "sha256",
        input,
        createPublicKey(pub.data.pem),
        Buffer.from(signed.data.signature, "base64"),
      ),
    );
    publicKeys.push(pub.data.pem);
  }
  assert.notEqual(publicKeys[0], publicKeys[1]);
  const identities = [];
  for (const audience of [
    "https://identity-ccid.dev.refi.internal",
    "https://investor-api.dev.refi.internal",
  ]) {
    const endpoint = new URL(metadata + "identity");
    endpoint.searchParams.set("audience", audience);
    endpoint.searchParams.set("format", "full");
    const response = await fetch(endpoint, {
      headers: { "Metadata-Flavor": "Google" },
    });
    assert.equal(response.status, 200);
    const jwt = await response.text();
    const claims = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString(),
    );
    assert.equal(claims.aud, audience);
    assert.equal(claims.email, email);
    assert.equal(claims.email_verified, true);
    assert.ok(claims.exp > Date.now() / 1000);
    identities.push({ audience, email: claims.email, subject: claims.sub });
  }
  assert.equal(identities[0].subject, identities[1].subject);
  console.log(
    JSON.stringify({
      status: "PASS",
      mode,
      database,
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
      ...(error.name === "AssertionError" ? { message: error.message } : {}),
    }),
  );
  process.exitCode = 1;
});
