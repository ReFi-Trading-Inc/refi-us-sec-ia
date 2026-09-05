/**
 * Demo Investor API client — the demo tier's upstream.
 *
 * WHAT IT IS: a server-only, in-process stand-in for Daniel's Investor API
 * that answers the frozen client's `call(operationId, options)` interface with
 * curated, persona-keyed fixtures. Every response body is validated against
 * the v1.1.0-alpha.2 response schema of the operation before it is returned
 * (`assertMatches`), so demo data can never drift from the contract: a fixture
 * that stops conforming fails closed exactly like a backend that drifted.
 *
 * WHAT IT IS NOT: production evidence, a connected refinity-dev journey, real
 * KYC, a real admission decision, a live brokerage, or executed orders. It is
 * constructed ONLY by `investorApiClientFor` when REFI_ENV=demo and
 * REFI_INVESTOR_API_MODE=demo (contract-asserted); production never sees it.
 *
 * AUTHORITY MODEL (unchanged by the demo): account scope is still resolved by
 * `resolveAccountScope` against `listAccounts`; admission is still a backend
 * projection (`getOnboardingStatus`, `getAccountAuthorization`); the browser
 * asserts nothing. Personas select a WORLD, not an authority:
 *   - applicant: no accounts; onboarding WAITLISTED (pending internal review).
 *   - admitted:  one AUTHORIZED account with a connected paper Alpaca
 *                connection, a subscribed S&P 500 template, 24 positions,
 *                a 90-day valuation history, three recommendations
 *                (CURRENT / SUPERSEDED / BLOCKED) with 24 legs, and ~50
 *                account records across all 16 variants including the
 *                execution chain (intent → risk → plan → orders → fills →
 *                reconciliation), one risk decision DENIED.
 *
 * MUTATIONS: only `updateAccountPreferences` is supported. It increments the
 * preference version, supersedes the current recommendation with a new one,
 * and appends the resulting records (preference, recommendation, intent, risk,
 * plan, orders) so "change a preference and watch advice change" is real.
 * Every other mutation and the SSE stream throw `DemoUnsupportedOperationError`
 * — the demo never fabricates an order, credential, or admission write.
 *
 * STATE: deterministic base world (seeded PRNG) regenerated per process; the
 * preference-change deltas live in process memory (serverless instances may
 * cold-start; the base world is identical everywhere).
 */
import { createHash } from "node:crypto";
import {
  assertMatches,
  InvestorApiError,
  routeFor,
  type CallOptions,
  type InvestorApiResult,
  type OperationId,
  type SchemaName,
} from "@refi/api-clients/investor-api";
import type { components } from "@refi/api-clients/generated/investor-api.gen";
import { isDemoPersona, type DemoPersona } from "../demo/personas";

type S = components["schemas"];

export class DemoUnsupportedOperationError extends Error {
  constructor(readonly operationId: string) {
    super(
      `demo upstream does not implement ${operationId}: the demo never fabricates a write for this operation`,
    );
    this.name = "DemoUnsupportedOperationError";
  }
}

/** The structural subset of the frozen client the BFF libraries depend on. */
export interface InvestorApiReadClient {
  call<K extends Exclude<OperationId, "streamAccountEvents">>(
    operationId: K,
    options?: CallOptions<K>,
  ): Promise<InvestorApiResult<K>>;
}

// ─── Deterministic helpers ──────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex64 = (s: string) => createHash("sha256").update(s).digest("hex");
const dec = (n: number, places = 2) => {
  const v = n.toFixed(places);
  // Contract decimals: optional leading '-', no leading zeros beyond "0".
  return v.replace(/^(-?)0+(?=\d)/, "$1");
};
const iso = (ms: number) =>
  new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const DAY = 86_400_000;

// ─── World model ────────────────────────────────────────────────────────────

interface Security {
  symbol: string;
  name: string;
  securityId: string;
  listingId: string;
  price: number;
  weight: number;
}

const UNIVERSE: ReadonlyArray<[string, string, number, number]> = [
  ["AAPL", "Apple Inc.", 231.4, 0.071],
  ["MSFT", "Microsoft Corporation", 428.9, 0.065],
  ["NVDA", "NVIDIA Corporation", 128.7, 0.062],
  ["AMZN", "Amazon.com, Inc.", 186.5, 0.038],
  ["GOOGL", "Alphabet Inc. Class A", 172.3, 0.022],
  ["META", "Meta Platforms, Inc.", 528.6, 0.024],
  ["BRK.B", "Berkshire Hathaway Inc. Class B", 462.1, 0.017],
  ["LLY", "Eli Lilly and Company", 912.4, 0.015],
  ["AVGO", "Broadcom Inc.", 171.8, 0.015],
  ["JPM", "JPMorgan Chase & Co.", 214.2, 0.013],
  ["TSLA", "Tesla, Inc.", 249.7, 0.013],
  ["UNH", "UnitedHealth Group Incorporated", 583.1, 0.011],
  ["XOM", "Exxon Mobil Corporation", 116.6, 0.011],
  ["V", "Visa Inc. Class A", 286.9, 0.01],
  ["PG", "The Procter & Gamble Company", 171.2, 0.009],
  ["MA", "Mastercard Incorporated Class A", 486.3, 0.009],
  ["JNJ", "Johnson & Johnson", 158.4, 0.008],
  ["COST", "Costco Wholesale Corporation", 887.5, 0.008],
  ["HD", "The Home Depot, Inc.", 371.3, 0.008],
  ["ABBV", "AbbVie Inc.", 194.8, 0.007],
  ["WMT", "Walmart Inc.", 76.9, 0.007],
  ["NFLX", "Netflix, Inc.", 691.2, 0.006],
  ["KO", "The Coca-Cola Company", 71.8, 0.006],
  ["CRM", "Salesforce, Inc.", 262.4, 0.006],
];
/** Excluded by the admitted persona's preferences (tobacco); shown as exclusions. */
const EXCLUDED_SECURITY_IDS = ["security_us_mo", "security_us_pm"];

interface Prefs {
  version: number;
  driftThreshold: string;
  minOrder: string;
  excludedAssets: string[];
  fractionalEnabled: boolean;
  updatedAt: string;
}

interface RecSpec {
  id: string;
  status: S["Recommendation"]["status"];
  createdAt: number;
  turnover: number;
  executionEligible: boolean;
  freshness: S["Recommendation"]["freshness"]["freshness_status"];
  reasonCodes: string[];
  /** Seed shifts the leg deltas so consecutive recommendations differ. */
  seed: number;
  legsOverride?: S["RecommendationLeg"][];
}

interface World {
  persona: DemoPersona;
  userId: string;
  accountId: string | null;
  connectionId: string;
  templateId: string;
  portfolioId: string;
  now: number;
  securities: Security[];
  prefs: Prefs;
  prefsHistory: Prefs[];
  recs: RecSpec[];
  records: S["AccountRecord"][];
  receipts: Map<string, S["ActionReceipt"]>;
}

const worlds = new Map<DemoPersona, World>();

/** The admitted world's account id; the applicant world has none. */
function accountOf(w: World): string {
  if (!w.accountId) {
    throw new InvestorApiError({
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      message: "resource not found",
      correlationId: null,
    });
  }
  return w.accountId;
}

function idAt(records: S["AccountRecord"][], i: number): string | null {
  return records[i]?.record_id ?? null;
}

function personaFor(authId: string): DemoPersona {
  // demo-applicant-01 → applicant, demo-admitted-01 → admitted; anything else
  // is treated as an applicant with no accounts (never an authority upgrade).
  const m = /^demo-([a-z]+)-\d{2}$/.exec(authId);
  return m && isDemoPersona(m[1]) ? m[1] : "applicant";
}

function buildWorld(persona: DemoPersona): World {
  const now = Date.now();
  const securities: Security[] = UNIVERSE.map(
    ([symbol, name, price, weight]) => ({
      symbol,
      name,
      securityId: `security_us_${symbol.toLowerCase().replace(".", "")}`,
      listingId: `listing_us_${symbol.toLowerCase().replace(".", "")}_xnas`,
      price,
      weight,
    }),
  );
  const prefsV1: Prefs = {
    version: 1,
    driftThreshold: "0.03",
    minOrder: "25",
    excludedAssets: [...EXCLUDED_SECURITY_IDS],
    fractionalEnabled: true,
    updatedAt: iso(now - 41 * DAY),
  };
  const world: World = {
    persona,
    userId:
      persona === "admitted" ? "usr_demo_admitted_01" : "usr_demo_applicant_01",
    accountId: persona === "admitted" ? "acct_demo_admitted_01" : null,
    connectionId: "brokerconn_demo_0001",
    templateId: "template_us_sp500_following_v1",
    portfolioId: "portfolio_sp500_following_01",
    now,
    securities,
    prefs: prefsV1,
    prefsHistory: [prefsV1],
    recs: [],
    records: [],
    receipts: new Map(),
  };
  if (persona !== "admitted") return world;

  world.recs = [
    {
      id: "recommendation_demo_0001",
      status: "BLOCKED",
      createdAt: now - 44 * DAY,
      turnover: 12.4,
      executionEligible: false,
      freshness: "expired",
      reasonCodes: ["RECONCILIATION_HOLD", "STALE_VALUATION"],
      seed: 11,
    },
    {
      id: "recommendation_demo_0002",
      status: "SUPERSEDED",
      createdAt: now - 20 * DAY,
      turnover: 6.8,
      executionEligible: true,
      freshness: "stale",
      reasonCodes: ["SUPERSEDED_BY_PREFERENCE_CHANGE"],
      seed: 23,
    },
    {
      id: "recommendation_demo_0003",
      status: "CURRENT",
      createdAt: now - 2 * DAY,
      turnover: 4.1,
      executionEligible: true,
      freshness: "fresh",
      reasonCodes: [],
      seed: 37,
    },
  ];
  world.records = seedRecords(world);
  return world;
}

function worldFor(authId: string): World {
  const persona = personaFor(authId);
  let w = worlds.get(persona);
  if (!w) {
    w = buildWorld(persona);
    worlds.set(persona, w);
  }
  return w;
}

/** Test hook: forget mutable demo state (preference changes). */
export function resetDemoWorldsForTests(): void {
  worlds.clear();
}

// ─── Fixture builders ───────────────────────────────────────────────────────

function equityAt(w: World, t: number): number {
  // 90-day path: gentle growth + deterministic noise, anchored to today.
  const rng = mulberry32(Math.floor(t / DAY));
  const days = (w.now - t) / DAY;
  const base = 48_250;
  return base * (1 - days * 0.00045) * (1 + (rng() - 0.5) * 0.012);
}

function positions(w: World): S["AccountPosition"][] {
  const equity = equityAt(w, w.now);
  const invested = equity * 0.6; // allocation 0.60 of equity
  return w.securities.map((s) => {
    const targetNotional = invested * (s.weight / totalWeight(w));
    const qty = targetNotional / s.price;
    const avg = s.price * 0.93;
    return {
      account_id: accountOf(w),
      account_snapshot_id: "snapshot_demo_0090",
      security_id: s.securityId,
      listing_id: s.listingId,
      broker_asset_id: `alpaca-asset-${s.symbol.toLowerCase().replace(".", "")}`,
      symbol: s.symbol,
      display_name: s.name,
      held_qty: dec(qty, 4),
      attributed_qty: dec(qty, 4),
      externally_observed_qty: "0",
      pending_buy_qty: "0",
      pending_sell_qty: "0",
      available_to_sell_qty: dec(qty, 4),
      average_price: dec(avg),
      reference_price: dec(s.price),
      market_value: dec(qty * s.price),
      currency: "USD",
      source_observed_at: iso(w.now - 4 * 60_000),
      fresh_until: iso(w.now + 10 * 60_000),
      freshness_status: "FRESH",
    };
  });
}
const totalWeight = (w: World) =>
  w.securities.reduce((a, s) => a + s.weight, 0);

function valuation(w: World, t: number, idx: number): S["AccountValuation"] {
  const equity = equityAt(w, t);
  const cash = equity * 0.4;
  return {
    account_snapshot_id: `snapshot_demo_${String(idx).padStart(4, "0")}`,
    account_id: accountOf(w),
    broker_connection_id: w.connectionId,
    account_environment: "paper",
    reconciliation_run_id: `reconciliation_demo_${String(idx).padStart(4, "0")}`,
    as_of_time: iso(t),
    broker_observed_at: iso(t - 60_000),
    fresh_until: iso(t + 10 * 60_000),
    freshness_status: idx === 90 ? "FRESH" : "STALE",
    status: "READY",
    currency: "USD",
    equity: dec(equity),
    cash: dec(cash),
    buying_power: dec(cash * 2),
    pending_buy_notional: "0",
    pending_sell_notional: "0",
    open_order_count: idx === 90 ? 2 : 0,
    unknown_order_count: 0,
    position_count: w.securities.length,
    management_scope_status: "ACTIVE",
    reconciliation_hold_status: "CLEAR",
  };
}

function legsFor(w: World, rec: RecSpec): S["RecommendationLeg"][] {
  if (rec.legsOverride) return rec.legsOverride;
  const rng = mulberry32(rec.seed);
  const pos = positions(w);
  return w.securities.map((s, i) => {
    const current = Number(pos[i]?.held_qty ?? "0");
    // Drift-driven target: ±(0..6)% of current, ~a third are no-ops.
    const drift = (rng() - 0.5) * 0.12;
    const noop = rng() < 0.3;
    const target = noop ? current : current * (1 + drift);
    const delta = target - current;
    const belowMin = Math.abs(delta * s.price) < Number(w.prefs.minOrder);
    const reason = noop
      ? ["WITHIN_DRIFT_THRESHOLD"]
      : belowMin
        ? ["TARGET_DELTA", "BELOW_MIN_ORDER"]
        : ["TARGET_DELTA"];
    return {
      recommendation_id: rec.id,
      security_id: s.securityId,
      symbol: s.symbol,
      current_quantity: dec(current, 4),
      target_quantity: dec(target, 4),
      delta_quantity: dec(delta, 4),
      reference_price: dec(s.price),
      notional_delta: dec(delta * s.price),
      reason_codes: reason,
      executable: !noop && !belowMin && rec.status !== "BLOCKED",
    };
  });
}

function recommendation(w: World, rec: RecSpec): S["Recommendation"] {
  const created = rec.createdAt;
  return {
    recommendation_id: rec.id,
    account_id: accountOf(w),
    template_id: w.templateId,
    status: rec.status,
    execution_eligible: rec.executionEligible,
    leg_count: legsFor(w, rec).length,
    estimated_turnover_percent: dec(rec.turnover),
    freshness: {
      source_as_of: iso(created - 60 * 60_000),
      last_evaluated_at: iso(created),
      fresh_until: iso(created + 5 * DAY),
      expires_at: iso(created + 14 * DAY),
      freshness_status: rec.freshness,
      freshness_policy_version: "automated-portfolio-freshness-1",
      freshness_reason_codes: rec.reasonCodes,
    },
  };
}

type RecordType = S["AccountRecord"]["record_type"];
function record(
  w: World,
  n: number,
  type: RecordType,
  at: number,
  details: Partial<S["AccountRecordDetails"]> & {
    entity_id: string;
    status: string;
  },
  sourceVersion = `${type.replace(/_/g, "-")}-demo-1`,
): S["AccountRecord"] {
  return {
    record_id: `record_demo_${String(n).padStart(6, "0")}`,
    account_id: accountOf(w),
    record_type: type,
    created_at: iso(at),
    correlation_id: `corr_demo_${String(n).padStart(8, "0")}`,
    source_version: sourceVersion,
    details: {
      effective_at: iso(at),
      reason_codes: [],
      completed_at: null,
      related_record_id: null,
      notional: null,
      quantity: null,
      currency: null,
      ...details,
    },
  };
}

/** The execution chain for one recommendation: intent → risk → plan → orders → fills → reconciliation. */
function executionChain(
  w: World,
  start: number,
  at: number,
  rec: RecSpec,
  opts: { deny?: boolean; working?: boolean },
): S["AccountRecord"][] {
  const out: S["AccountRecord"][] = [];
  let n = start;
  const intentId = `intent_demo_${rec.seed.toString().padStart(4, "0")}`;
  out.push(
    record(w, n++, "recommendation", at, {
      entity_id: rec.id,
      status: rec.status,
      notional: dec(rec.turnover * 290),
      currency: "USD",
    }),
  );
  out.push(
    record(w, n++, "account_intent", at + 2 * 60_000, {
      entity_id: intentId,
      status: "CREATED",
      related_record_id: idAt(out, 0),
    }),
  );
  if (opts.deny) {
    out.push(
      record(w, n++, "risk_decision", at + 3 * 60_000, {
        entity_id: `risk_demo_${String(rec.seed)}`,
        status: "DENIED",
        reason_codes: ["RECONCILIATION_HOLD", "STALE_VALUATION"],
        related_record_id: idAt(out, 1),
      }),
    );
    return out;
  }
  out.push(
    record(w, n++, "risk_decision", at + 3 * 60_000, {
      entity_id: `risk_demo_${String(rec.seed)}`,
      status: "APPROVED",
      reason_codes: ["WITHIN_LIMITS"],
      related_record_id: idAt(out, 1),
    }),
  );
  out.push(
    record(w, n++, "execution_plan", at + 4 * 60_000, {
      entity_id: `plan_demo_${String(rec.seed)}`,
      status: "PUBLISHED",
      related_record_id: idAt(out, 2),
    }),
  );
  const legs = legsFor(w, rec)
    .filter((l) => l.executable)
    .slice(0, 6);
  legs.forEach((l, i) => {
    const orderId = `order_demo_${String(rec.seed)}_${String(i)}`;
    const filled = !opts.working || i >= 2;
    out.push(
      record(w, n++, "order", at + (5 + i) * 60_000, {
        entity_id: orderId,
        status: filled ? "FILLED" : "WORKING",
        quantity: dec(Math.abs(Number(l.delta_quantity)), 4),
        notional: dec(Math.abs(Number(l.notional_delta))),
        currency: "USD",
        completed_at: filled ? iso(at + (5 + i) * 60_000 + 45_000) : null,
        related_record_id: idAt(out, 3),
        reason_codes: [Number(l.delta_quantity) > 0 ? "BUY" : "SELL"],
      }),
    );
    if (filled) {
      out.push(
        record(w, n++, "fill", at + (5 + i) * 60_000 + 45_000, {
          entity_id: `fill_demo_${String(rec.seed)}_${String(i)}`,
          status: "SETTLED",
          quantity: dec(Math.abs(Number(l.delta_quantity)), 4),
          notional: dec(Math.abs(Number(l.notional_delta))),
          currency: "USD",
          completed_at: iso(at + (5 + i) * 60_000 + 45_000),
          related_record_id: idAt(out, out.length - 1),
        }),
      );
    }
  });
  out.push(
    record(w, n++, "reconciliation", at + 20 * 60_000, {
      entity_id: `reconciliation_demo_${String(rec.seed)}`,
      status: "CLEAR",
      completed_at: iso(at + 21 * 60_000),
    }),
  );
  return out;
}

function seedRecords(w: World): S["AccountRecord"][] {
  const t0 = w.now - 60 * DAY;
  const out: S["AccountRecord"][] = [];
  let n = 1;
  const push = (r: S["AccountRecord"]) => {
    out.push(r);
    n++;
  };
  push(
    record(w, n, "consent_receipt", t0, {
      entity_id: "consent_demo_0001",
      status: "ACTIVE",
    }),
  );
  push(
    record(w, n, "compliance_profile_attestation", t0 + 60_000, {
      entity_id: "attestation_demo_0001",
      status: "ACCEPTED",
    }),
  );
  push(
    record(w, n, "brokerage_connection", t0 + DAY, {
      entity_id: w.connectionId,
      status: "CONNECTED",
    }),
  );
  push(
    record(w, n, "brokerage_sync", t0 + DAY + 60_000, {
      entity_id: "sync_demo_0001",
      status: "COMPLETED",
      completed_at: iso(t0 + DAY + 120_000),
    }),
  );
  push(
    record(w, n, "preference", t0 + 2 * DAY, {
      entity_id: "preferences_demo_v1",
      status: "APPLIED",
    }),
  );
  push(
    record(w, n, "allocation", t0 + 2 * DAY + 60_000, {
      entity_id: "membership_demo_0001",
      status: "ACTIVE",
      notional: dec(equityAt(w, t0 + 2 * DAY) * 0.6),
      currency: "USD",
    }),
  );
  push(
    record(w, n, "action_receipt", t0 + 2 * DAY + 90_000, {
      entity_id: "action_demo_join_0001",
      status: "APPLIED",
    }),
  );
  push(
    record(w, n, "trading_control", t0 + 3 * DAY, {
      entity_id: "control_demo_0001",
      status: "NORMAL",
    }),
  );
  for (let d = 0; d < 5; d++) {
    push(
      record(w, n, "valuation", t0 + (10 + d * 10) * DAY, {
        entity_id: `snapshot_demo_${String(10 + d * 10).padStart(4, "0")}`,
        status: "READY",
        notional: dec(equityAt(w, t0 + (10 + d * 10) * DAY)),
        currency: "USD",
      }),
    );
  }
  for (const rec of w.recs) {
    const chain = executionChain(w, n, rec.createdAt, rec, {
      deny: rec.status === "BLOCKED",
      working: rec.status === "CURRENT",
    });
    chain.forEach(push);
  }
  push(
    record(w, n, "brokerage_sync", w.now - 6 * 60 * 60_000, {
      entity_id: "sync_demo_0044",
      status: "COMPLETED",
      completed_at: iso(w.now - 6 * 60 * 60_000 + 30_000),
    }),
  );
  return out;
}

// ─── Paging ─────────────────────────────────────────────────────────────────

function page<T>(
  items: T[],
  query: { page_size?: number; cursor?: string } | undefined,
) {
  const size = Math.min(Math.max(query?.page_size ?? 25, 1), 100);
  let offset = 0;
  if (query?.cursor) {
    const m = /^demo-offset-(\d+)$/.exec(query.cursor);
    if (!m) {
      throw new InvestorApiError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: "cursor is invalid",
        correlationId: null,
      });
    }
    offset = Number(m[1]);
  }
  const slice = items.slice(offset, offset + size);
  const has_more = offset + size < items.length;
  return {
    items: slice,
    page: {
      has_more,
      next_cursor: has_more ? `demo-offset-${String(offset + size)}` : null,
    },
  };
}

// ─── Client ─────────────────────────────────────────────────────────────────

export interface DemoClientOptions {
  authId: string;
}

export class DemoInvestorApiClient implements InvestorApiReadClient {
  private readonly authId: string;
  private corr = 0;
  constructor(opts: DemoClientOptions) {
    this.authId = opts.authId;
  }

  async call<K extends Exclude<OperationId, "streamAccountEvents">>(
    operationId: K,
    options: CallOptions<K> = {},
  ): Promise<InvestorApiResult<K>> {
    const w = worldFor(this.authId);
    const route = routeFor(operationId);
    const body = this.dispatch(w, operationId, options);
    // Fail closed exactly like the frozen client: a fixture that does not
    // match the operation's response schema is a contract mismatch.
    assertMatches(route.response_schema as SchemaName, body, "response");
    this.corr += 1;
    const correlationId = `corr_demo_${this.authId}_${String(this.corr)}`;
    return await Promise.resolve({
      status: route.success_status,
      correlationId,
      headers: new Headers({
        "cache-control": "private, no-store",
        "x-correlation-id": correlationId,
        "content-type": "application/json",
      }),
      data: body as InvestorApiResult<K>["data"],
    } as InvestorApiResult<K>);
  }

  private requireAccount(w: World, options: CallOptions<OperationId>): string {
    const path = (options as { path?: { account_id?: string } }).path;
    const requested = path?.account_id;
    if (!w.accountId || requested !== w.accountId) {
      throw new InvestorApiError({
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "resource not found",
        correlationId: null,
      });
    }
    return w.accountId;
  }

  private dispatch(
    w: World,
    op: OperationId,
    o: CallOptions<OperationId>,
  ): unknown {
    const q = (o as { query?: { page_size?: number; cursor?: string } }).query;
    const p = (o as { path?: Record<string, string> }).path ?? {};
    switch (op) {
      case "getOnboardingStatus":
        return {
          data: {
            user_id: w.userId,
            state: w.persona === "admitted" ? "READY" : "WAITLISTED",
            required_steps: w.persona === "admitted" ? [] : ["INTERNAL_REVIEW"],
            policy_version: "closed-us-alpha-1",
            evaluated_at: iso(w.now - 60_000),
          },
        };
      case "getEligibility":
        return {
          data: {
            eligibility_decision_id: "elig_demo_00000001",
            decision: "ELIGIBLE",
            jurisdiction: "US",
            reason_codes: [],
            policy_version: "closed-us-alpha-1",
            decided_at: iso(w.now - 30 * DAY),
            expires_at: iso(w.now + 60 * DAY),
          },
        };
      case "getKycStatus":
        return {
          data: {
            status: "NOT_REQUIRED",
            level: "CLOSED_US_INVITE_ALPHA",
            policy_version: "closed-us-alpha-1",
            public_launch_eligible: false,
          },
        };
      case "listEffectiveDisclosures":
        return { data: page(this.disclosures(w), q) };
      case "listConsents":
        return {
          data: page(w.persona === "admitted" ? this.consents(w) : [], q),
        };
      case "recordConsent":
        return { data: this.consents(w)[0] };
      case "listTemplates":
        return { data: page([this.template(w)], q) };
      case "getTemplate":
        if (p["template_id"] !== w.templateId)
          throw new InvestorApiError({
            status: 404,
            code: "RESOURCE_NOT_FOUND",
            message: "resource not found",
            correlationId: null,
          });
        return { data: this.template(w) };
      case "listAccounts":
        return { data: page(w.accountId ? [this.account(w)] : [], q) };
      case "getAccount":
        this.requireAccount(w, o);
        return { data: this.account(w) };
      case "getAccountAuthorization":
        this.requireAccount(w, o);
        return { data: this.authorization(w) };
      case "listAdvisoryProfiles":
        return {
          data: page(
            w.persona === "admitted" ? [this.advisoryProfile(w)] : [],
            q,
          ),
        };
      case "getCurrentAdvisoryProfile":
        if (w.persona !== "admitted")
          throw new InvestorApiError({
            status: 404,
            code: "RESOURCE_NOT_FOUND",
            message: "resource not found",
            correlationId: null,
          });
        return { data: this.advisoryProfile(w) };
      case "listComplianceProfileAttestations":
        this.requireAccount(w, o);
        return { data: page([this.attestation(w)], q) };
      case "getCurrentComplianceProfileAttestation":
        this.requireAccount(w, o);
        return { data: this.attestation(w) };
      case "listBrokerageConnections":
        this.requireAccount(w, o);
        return { data: page([this.connection(w)], q) };
      case "getBrokerageConnection":
        this.requireAccount(w, o);
        if (p["connection_id"] !== w.connectionId)
          throw new InvestorApiError({
            status: 404,
            code: "RESOURCE_NOT_FOUND",
            message: "resource not found",
            correlationId: null,
          });
        return { data: this.connection(w) };
      case "getAccountValuation":
        this.requireAccount(w, o);
        return { data: valuation(w, w.now, 90) };
      case "listAccountValuations": {
        this.requireAccount(w, o);
        const series = Array.from({ length: 91 }, (_, i) =>
          valuation(w, w.now - (90 - i) * DAY, i),
        ).reverse();
        return { data: page(series, q) };
      }
      case "listAccountPositions":
        this.requireAccount(w, o);
        return { data: page(positions(w), q) };
      case "listAccountMemberships":
        this.requireAccount(w, o);
        return { data: page([this.membership(w)], q) };
      case "getAccountPreferences":
        this.requireAccount(w, o);
        return { data: this.preferences(w, w.prefs) };
      case "listAccountPreferenceHistory":
        this.requireAccount(w, o);
        return {
          data: page(
            [...w.prefsHistory].reverse().map((pr) => this.preferences(w, pr)),
            q,
          ),
        };
      case "updateAccountPreferences":
        return { data: this.applyPreferencePatch(w, o) };
      case "getAccountActionReceipt": {
        this.requireAccount(w, o);
        const r = w.receipts.get(p["action_receipt_id"] ?? "");
        if (!r)
          throw new InvestorApiError({
            status: 404,
            code: "RESOURCE_NOT_FOUND",
            message: "resource not found",
            correlationId: null,
          });
        return { data: r };
      }
      case "listAccountRecommendations":
        this.requireAccount(w, o);
        return {
          data: page(
            [...w.recs]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((r) => recommendation(w, r)),
            q,
          ),
        };
      case "getAccountRecommendation": {
        this.requireAccount(w, o);
        const rec = w.recs.find((r) => r.id === p["recommendation_id"]);
        if (!rec)
          throw new InvestorApiError({
            status: 404,
            code: "RESOURCE_NOT_FOUND",
            message: "resource not found",
            correlationId: null,
          });
        return { data: recommendation(w, rec) };
      }
      case "listAccountRecommendationLegs": {
        this.requireAccount(w, o);
        const rec = w.recs.find((r) => r.id === p["recommendation_id"]);
        if (!rec)
          throw new InvestorApiError({
            status: 404,
            code: "RESOURCE_NOT_FOUND",
            message: "resource not found",
            correlationId: null,
          });
        return { data: page(legsFor(w, rec), q) };
      }
      case "listAccountRecords":
        this.requireAccount(w, o);
        return {
          data: page(
            [...w.records].sort((a, b) =>
              b.created_at.localeCompare(a.created_at),
            ),
            q,
          ),
        };
      case "getAccountRecord": {
        this.requireAccount(w, o);
        const r = w.records.find((x) => x.record_id === p["record_id"]);
        if (!r)
          throw new InvestorApiError({
            status: 404,
            code: "RESOURCE_NOT_FOUND",
            message: "resource not found",
            correlationId: null,
          });
        return { data: r };
      }
      default:
        throw new DemoUnsupportedOperationError(op);
    }
  }

  // ─── Per-persona fixtures ─────────────────────────────────────────────────

  private disclosures(w: World): S["Disclosure"][] {
    return [
      {
        disclosure_key: "form_adv_2a",
        disclosure_version: 3,
        locale: "en-US",
        content_hash: hex64("form_adv_2a:3"),
        content_ref: "https://demo.invalid/disclosures/form-adv-2a-3",
        effective_at: iso(w.now - 70 * DAY),
        status: "EFFECTIVE",
      },
      {
        disclosure_key: "form_crs",
        disclosure_version: 2,
        locale: "en-US",
        content_hash: hex64("form_crs:2"),
        content_ref: "https://demo.invalid/disclosures/form-crs-2",
        effective_at: iso(w.now - 70 * DAY),
        status: "EFFECTIVE",
      },
      {
        disclosure_key: "automated_portfolio_alpha",
        disclosure_version: 1,
        locale: "en-US",
        content_hash: hex64("automated_portfolio_alpha:1"),
        content_ref:
          "https://demo.invalid/disclosures/automated-portfolio-alpha-1",
        effective_at: iso(w.now - 70 * DAY),
        status: "EFFECTIVE",
      },
    ];
  }
  private consents(w: World): S["ConsentReceipt"][] {
    return this.disclosures(w).map((d, i) => ({
      account_id: w.accountId ?? "acct_demo_pending_00",
      consent_key: d.disclosure_key,
      consent_receipt_id: `consent_demo_${String(i + 1).padStart(4, "0")}`,
      disclosure_key: d.disclosure_key,
      disclosure_version: d.disclosure_version,
      disclosure_hash: d.content_hash,
      expires_at: iso(w.now + 300 * DAY),
      recorded_at: iso(w.now - 60 * DAY),
      status: "ACTIVE",
    }));
  }
  private template(w: World): S["Template"] {
    return {
      template_id: w.templateId,
      name: "SP500-Following",
      product_mode: "automated_portfolio_management",
      portfolio_id: w.portfolioId,
      benchmark: "SPX",
      target_version: "target_demo_0007",
      target_fingerprint: hex64("target_demo_0007"),
      constituent_count: 503,
      source_as_of: iso(w.now - 6 * 60 * 60_000),
      fresh_until: iso(w.now + 18 * 60 * 60_000),
      freshness_status: "FRESH",
    };
  }
  private authorization(w: World): S["AccountAuthorization"] {
    return {
      state_version: 3,
      status: "AUTHORIZED",
      reason_codes: [],
      expires_at: iso(w.now + 60 * DAY),
      policy_version: "closed-us-alpha-1",
      last_evaluated_at: iso(w.now - 60_000),
    };
  }
  private account(w: World): S["Account"] {
    return {
      account_id: accountOf(w),
      status: "active",
      product_mode: "automated_portfolio_management",
      authorization: this.authorization(w),
      managed_enabled: true,
      management_scope_status: "ACTIVE",
      reconciliation_hold_status: "CLEAR",
    };
  }
  private advisoryProfile(w: World): S["AdvisoryProfile"] {
    return {
      advisory_profile_id: "attestation_demo_0001",
      profile_version: 1,
      profile_status: "ACTIVE",
      pass_fail: "PASS",
      risk_calibration: "UNAVAILABLE",
      reason_codes: [],
      questionnaire_id: "questionnaire_v2_demo",
      questionnaire_version: "2",
      response_schema_version: "1.0",
      policy_version: "profile-policy-v1",
      response_hash: hex64("answers:demo"),
      profile_fingerprint: hex64("profile:demo"),
      effective_at: iso(w.now - 60 * DAY),
      expires_at: iso(w.now + 305 * DAY),
    };
  }
  private attestation(w: World): S["ComplianceProfileAttestation"] {
    return {
      attestation_id: "attestation_demo_0001",
      schema_version: "1.0",
      decision_version: "profile-policy-v1",
      decision_sequence: 1,
      kyc: {
        status: "passed",
        provider: "demo-provider-adapter",
        level: "frontend-lifecycle",
        evidence_ref: "kyc-session:demo_0001",
      },
      investor_profile: {
        status: "eligible",
        profile_version: "1",
        questionnaire_version: "2",
        risk_band: "profile-policy-v1:band-3:balanced",
      },
      trading_eligibility: "eligible",
      effective_at: iso(w.now - 60 * DAY),
      expires_at: iso(w.now + 305 * DAY),
      evidence_sha256: hex64("evidence:demo"),
      account_id: accountOf(w),
      payload_sha256: hex64("payload:demo"),
      authorization: this.authorization(w),
      status: "ACCEPTED",
      received_at: iso(w.now - 60 * DAY),
    };
  }
  private connection(w: World): S["BrokerageConnection"] {
    return {
      connection_id: w.connectionId,
      account_id: accountOf(w),
      broker: "alpaca",
      account_environment: "paper",
      connection_status: "CONNECTED",
      credential_status: "VALID",
      state_version: 4,
      created_at: iso(w.now - 59 * DAY),
      updated_at: iso(w.now - 6 * 60 * 60_000),
      validated_at: iso(w.now - 59 * DAY),
      last_synced_at: iso(w.now - 6 * 60 * 60_000),
      stale_at: iso(w.now + 18 * 60 * 60_000),
      sync_run_id: "sync_demo_0044",
      broker_account_id: "alpaca-paper-demo-0001",
      action_receipt_id: "action_demo_connect_0001",
      status_path: `/api/v1/investor/accounts/${accountOf(w)}/brokerage-connections/${w.connectionId}`,
    };
  }
  private membership(w: World): S["AccountMembership"] {
    return {
      account_id: accountOf(w),
      template_id: w.templateId,
      portfolio_id: w.portfolioId,
      membership_version: 1,
      status: "ACTIVE",
      allocation_percent: "0.6",
      allocation_version: 1,
      allocation_fingerprint: hex64("allocation:0.6"),
      joined_target_version: "target_demo_0007",
      joined_target_fingerprint: hex64("target_demo_0007"),
      effective_from: iso(w.now - 58 * DAY),
      effective_to: null,
    };
  }
  private preferences(w: World, pr: Prefs): S["Preferences"] {
    return {
      version: pr.version,
      drift_threshold: pr.driftThreshold,
      min_order: pr.minOrder,
      excluded_assets: pr.excludedAssets,
      fractional_enabled: pr.fractionalEnabled,
      preference_fingerprint: hex64(`prefs:${w.userId}:${JSON.stringify(pr)}`),
      updated_at: pr.updatedAt,
    };
  }

  /** PATCH preferences → new version, new CURRENT recommendation, new records. */
  private applyPreferencePatch(
    w: World,
    o: CallOptions<OperationId>,
  ): S["ActionReceipt"] {
    const accountId = this.requireAccount(w, o);
    interface PatchShape {
      drift_threshold?: string;
      min_order?: string;
      excluded_assets?: string[];
      fractional_enabled?: boolean;
    }
    const patch: PatchShape = (o as { body?: PatchShape }).body ?? {};
    const ifMatch = (o as { ifMatch?: string }).ifMatch;
    if (ifMatch !== undefined && ifMatch !== String(w.prefs.version)) {
      throw new InvestorApiError({
        status: 409,
        code: "STALE_VERSION",
        message: "preferences version is stale",
        correlationId: null,
      });
    }
    const next: Prefs = {
      version: w.prefs.version + 1,
      driftThreshold: patch.drift_threshold ?? w.prefs.driftThreshold,
      minOrder: patch.min_order ?? w.prefs.minOrder,
      excludedAssets: patch.excluded_assets ?? w.prefs.excludedAssets,
      fractionalEnabled: patch.fractional_enabled ?? w.prefs.fractionalEnabled,
      updatedAt: iso(w.now),
    };
    w.prefs = next;
    w.prefsHistory.push(next);
    // Prior advice is preserved, never mutated: the current recommendation
    // becomes SUPERSEDED and a new CURRENT one is generated from the new
    // preferences (exclusions drop legs; min order changes executability).
    const now = Date.now();
    for (const r of w.recs)
      if (r.status === "CURRENT") {
        r.status = "SUPERSEDED";
        r.freshness = "stale";
        r.reasonCodes = ["SUPERSEDED_BY_PREFERENCE_CHANGE"];
      }
    const seq = w.recs.length + 1;
    const excluded = new Set(next.excludedAssets);
    const rec: RecSpec = {
      id: `recommendation_demo_${String(seq).padStart(4, "0")}`,
      status: "CURRENT",
      createdAt: now,
      turnover: 2.4 + (seq % 3) * 0.9,
      executionEligible: true,
      freshness: "fresh",
      reasonCodes: [],
      seed: 41 + seq,
    };
    w.now = now;
    rec.legsOverride = legsFor(w, { ...rec, legsOverride: undefined }).filter(
      (l) => !excluded.has(l.security_id),
    );
    w.recs.push(rec);
    let n = w.records.length + 1;
    const prefRecord = record(w, n++, "preference", now, {
      entity_id: `preferences_demo_v${String(next.version)}`,
      status: "APPLIED",
    });
    w.records.push(prefRecord);
    for (const r of executionChain(w, n, now + 60_000, rec, { working: true }))
      w.records.push(r);
    const receipt: S["ActionReceipt"] = {
      action_receipt_id: `action_demo_prefs_${String(next.version).padStart(4, "0")}`,
      account_id: accountId,
      status: "ACCEPTED",
      effect: "queued",
      aggregate_version: next.version,
      duplicate: false,
      status_path: `/api/v1/investor/accounts/${accountId}/actions/action_demo_prefs_${String(next.version).padStart(4, "0")}`,
    };
    w.receipts.set(receipt.action_receipt_id, receipt);
    return receipt;
  }
}

export function createDemoInvestorApiClient(
  opts: DemoClientOptions,
): InvestorApiReadClient {
  return new DemoInvestorApiClient(opts);
}
