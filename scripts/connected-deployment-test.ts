import assert from "node:assert/strict";
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
