// MSW handlers — composing index. Per-domain handlers live in
// `handlers.<domain>.ts` files alongside; shared helpers in `_shared.ts`.
// Per-request persona is resolved from the `refi_persona_v1` cookie
// (see fixtures/personas/index.ts). Per-request scenario from
// `refi_scenario_v1` or `?scenario=` (see scenarios.ts).
//
// Backend ownership + cutover plan: `refi-build-docs/spec-current/06-backend-contract-map.md`.
// Daniel-spec coverage + drift notes: `07-daniel-blueprint-alignment.md`.
// Contract tests: `__tests__/handlers.contract.test.ts`.

import { accountHandlers } from "./handlers.account";
import { activityHandlers } from "./handlers.activity";
import { authHandlers } from "./handlers.auth";
import { bffHandlers } from "./handlers.bff";
import { brokerHandlers } from "./handlers.brokers";
import { ccidHandlers } from "./handlers.ccid";
import { documentsHandlers } from "./handlers.documents";
import { eligibilityHandlers } from "./handlers.eligibility";
import { exceptionsHandlers } from "./handlers.exceptions";
import { ordersHandlers } from "./handlers.orders";
import { recommendationsHandlers } from "./handlers.recommendations";
import { supportHandlers } from "./handlers.support";

export const handlers = [
  ...authHandlers,
  ...ccidHandlers,
  ...brokerHandlers,
  ...ordersHandlers,
  ...recommendationsHandlers,
  ...activityHandlers,
  ...documentsHandlers,
  ...supportHandlers,
  ...eligibilityHandlers,
  ...accountHandlers,
  ...exceptionsHandlers,
  ...bffHandlers,
];

// Re-export the per-domain bundles so contract tests and future composition
// (e.g. selective dev fixtures) can target a single domain.
export { accountHandlers } from "./handlers.account";
export { activityHandlers } from "./handlers.activity";
export { authHandlers } from "./handlers.auth";
export { brokerHandlers } from "./handlers.brokers";
export { ccidHandlers } from "./handlers.ccid";
export { documentsHandlers } from "./handlers.documents";
export { eligibilityHandlers } from "./handlers.eligibility";
export { ordersHandlers } from "./handlers.orders";
export {
  recommendationsHandlers,
  __resetRecOverrides,
} from "./handlers.recommendations";
export { supportHandlers } from "./handlers.support";
