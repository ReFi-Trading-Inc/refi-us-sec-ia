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

// ── Deployment source invariant (founder, 2026-09-13) ─────────────────────────
// Connected Dev automated deployment may originate ONLY from the reviewed
// Daniel-handoff integration branch — never main, a PR head,
// integration/refinity-dev or an arbitrary branch. Certification authority and
// deployment source must be the same branch.
const DEPLOY_BRANCH = "daniel-handoff/integration";
const cicd = readFileSync("infra/terraform/connected-dev/cicd.tf", "utf8");
const triggerBranches = [
  ...cicd.matchAll(/push\s*\{\s*branch\s*=\s*"([^"]+)"/g),
].map((m) => m[1]);
assert.deepEqual(
  triggerBranches,
  [`^${DEPLOY_BRANCH}$`],
  "exactly one push trigger, anchored to the reviewed handoff branch",
);
assert.doesNotMatch(cicd, /pull_request\s*\{/, "no PR trigger");
assert.doesNotMatch(cicd, /branch\s*=\s*"\^?main\$?"/, "main never deploys");
assert.doesNotMatch(
  cicd,
  /branch\s*=\s*"[^"]*refinity-dev/,
  "integration/refinity-dev is not a deployment source",
);
const releaseController = readFileSync(
  "infra/cloudrun/connected-release.py",
  "utf8",
);
assert.match(
  releaseController,
  new RegExp(`DEPLOY_BRANCH = "${DEPLOY_BRANCH}"`),
  "release controller re-validates the same branch",
);
assert.match(
  releaseController,
  /if branch != DEPLOY_BRANCH:\s*\n\s*raise ValueError/,
);
assert.doesNotMatch(releaseController, /"integration\/refinity-dev"/);
const operator = readFileSync("infra/cloudrun/connected-dev.sh", "utf8");
assert.match(
  operator,
  new RegExp(`!= ${DEPLOY_BRANCH} \\]\\]`),
  "operator script refuses any other checkout",
);
const cloudbuild = readFileSync(
  "infra/cloudrun/cloudbuild.connected-cicd.yaml",
  "utf8",
);
assert.match(
  cloudbuild,
  /CB_BRANCH=\$\{BRANCH_NAME\}/,
  "branch is passed to the controller",
);
console.log(
  `Connected deployment source: only ${DEPLOY_BRANCH} may deploy (trigger, controller, operator) PASS`,
);
