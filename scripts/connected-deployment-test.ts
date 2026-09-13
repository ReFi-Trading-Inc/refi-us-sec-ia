import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAdapterMode } from "../apps/web/src/lib/investor-product/resolve-adapter";
import { firestoreSettings } from "../apps/web/src/lib/durable-store/store";

assert.equal(firestoreSettings({}).databaseId, undefined);
assert.equal(
  firestoreSettings({ FIRESTORE_DATABASE_ID: "(default)" }).databaseId,
  "(default)",
);
const settings = firestoreSettings({
  GCP_PROJECT_ID: "refinity-dev",
  FIRESTORE_DATABASE_ID: "refi-frontend-integration",
  REFI_INVESTOR_API_CREDENTIAL_MODE: "native-cloud-run",
});
assert.equal(settings.projectId, "refinity-dev");
assert.equal(settings.databaseId, "refi-frontend-integration");
assert.equal(settings.credentials, undefined);
for (const invalid of ["", "a", "projects/a/databases/b", "UpperCase"]) {
  assert.throws(() => firestoreSettings({ FIRESTORE_DATABASE_ID: invalid }));
}
for (const key of [
  "GCP_SERVICE_ACCOUNT_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "FIRESTORE_EMULATOR_HOST",
]) {
  assert.throws(() =>
    firestoreSettings({
      REFI_INVESTOR_API_CREDENTIAL_MODE: "native-cloud-run",
      [key]: "not-allowed",
    }),
  );
}
console.log(
  "Connected deployment settings: named database, legacy default and native-only credentials PASS",
);

assert.equal(
  resolveAdapterMode({
    refiEnv: "staging",
    dataAdapter: "live",
    configured: undefined,
  }),
  "transport",
);
assert.throws(() =>
  resolveAdapterMode({
    refiEnv: "staging",
    dataAdapter: "live",
    configured: "fixture",
  }),
);
const productLayout = readFileSync(
  "apps/web/app/us/product/layout.tsx",
  "utf8",
);
assert.match(productLayout, /dataAdapter: serverEnv\.REFI_DATA_ADAPTER/);
assert.match(productLayout, /configuredMode=\{configuredMode\}/);
console.log(
  "Connected product surfaces: server-owned live data forbids fixture fallback PASS",
);
