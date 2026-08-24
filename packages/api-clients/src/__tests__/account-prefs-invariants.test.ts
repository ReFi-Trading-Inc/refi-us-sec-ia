/**
 * Property-based invariants for the account-preferences kernel — the four
 * investor-editable backend `AccountPrefs` fields Daniel approved
 * (docs/phase2-7-daniel-direction-resolution.md §4):
 *
 *   drift_threshold | min_order | excluded_assets | fractional_enabled
 *
 * Code under test (imported from apps/web — the closest money-adjacent
 * logic in this repo):
 *   - apps/web/src/lib/sec203a/decimal.ts          (DecimalString gate, G-104)
 *   - apps/web/src/lib/sec203a/account-prefs.ts    (editable-field surface)
 *   - apps/web/src/lib/prototype-store/entities/execution-policy-draft.ts
 *   - apps/web/src/lib/prototype-store/entities/execution-policy.ts
 *
 * Deliberately NOT under test:
 *   - The "trading-expanding / material change" classification (e.g. "any
 *     change that enables fractional or lowers drift_threshold requires a
 *     fresh disclosure ack"). Per the doc-contract in account-prefs.ts, that
 *     classification is a versioned BACKEND policy; the frontend must render
 *     a backend-supplied classification and must never reimplement the rule
 *     ("That is why no isMaterialChange() lives here"). Testing one here
 *     would require reimplementing it, violating that contract.
 *   - The Zod range validation (driftThreshold in [0.001, 0.25], minOrder in
 *     [1, 25000]): it is defined inline and unexported in
 *     apps/web/app/api/v1/investor/execution-policy/draft/route.ts (and
 *     duplicated in apps/web/app/us/app/settings/automation/page.tsx). The
 *     route module cannot be imported without apps/web's `@lib` path aliases,
 *     which this test package does not configure. Reported as a testability
 *     gap: the schema should be extracted to an importable module.
 *
 * Harness substitution (documented per the invariants skill): fast-check is
 * not a repo dependency and adding dependencies was out of scope, so this
 * file carries a minimal seeded-PRNG property harness (mulberry32) with
 * greedy shrinking. Seeds are fixed; a failure message contains the seed,
 * the run index, and the shrunk counterexample.
 */
import { afterAll, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  asDecimalString,
  decimalStringRefiner,
  isDecimalString,
  type DecimalString,
} from "../../../../apps/web/src/lib/sec203a/decimal";
import {
  INVESTOR_EDITABLE_ACCOUNT_PREFS,
  INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS,
  READ_ONLY_CONTROL_NAMES,
  isInvestorEditableAccountPref,
  isInvestorEditableAccountPrefField,
} from "../../../../apps/web/src/lib/sec203a/account-prefs";
import type { ExecutionPolicyDraft } from "../../../../apps/web/src/lib/prototype-store/entities/execution-policy-draft";
import type { ExecutionPolicy } from "../../../../apps/web/src/lib/prototype-store/entities/execution-policy";

// The prototype store resolves its directory at module-import time, so the
// override must be set BEFORE the entity modules are imported. Static imports
// above are type-only or store-free; the store-backed entities are imported
// dynamically here.
const STORE_DIR = mkdtempSync(join(tmpdir(), "refi-prefs-invariants-"));
process.env["REFI_PROTOTYPE_STORE_DIR"] = STORE_DIR;

const { getExecutionPolicyDraft, saveExecutionPolicyDraft } =
  await import("../../../../apps/web/src/lib/prototype-store/entities/execution-policy-draft");
const {
  appendExecutionPolicy,
  getExecutionPolicy,
  getLatestExecutionPolicy,
  listExecutionPolicies,
} =
  await import("../../../../apps/web/src/lib/prototype-store/entities/execution-policy");

afterAll(() => {
  rmSync(STORE_DIR, { recursive: true, force: true });
});

// ─── Minimal seeded property harness ─────────────────────────────────────────

type Rng = () => number; // uniform in [0, 1)

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r: Rng, lo: number, hi: number): number =>
  lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rng, xs: readonly T[]): T => {
  const v = xs[int(r, 0, xs.length - 1)];
  if (v === undefined) throw new Error("pick() from an empty array");
  return v;
};

/** Narrow away null/undefined with a message, instead of a bare `!`. */
function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`expected ${what}`);
  return v;
}

function show(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val: unknown) =>
      val === undefined ? "«undefined»" : val,
    );
  } catch {
    return String(v);
  }
}

/**
 * Run `prop` against `runs` generated values. On failure, greedily shrink and
 * throw with the shrunk counterexample verbatim.
 */
async function forAll<T>(opts: {
  seed: number;
  runs: number;
  gen: (r: Rng) => T;
  prop: (v: T) => void | Promise<void>;
  shrink?: (v: T) => T[];
}): Promise<void> {
  const rng = mulberry32(opts.seed);
  for (let run = 0; run < opts.runs; run++) {
    const value = opts.gen(rng);
    try {
      await opts.prop(value);
    } catch (err) {
      let best = value;
      let bestErr: unknown = err;
      if (opts.shrink) {
        let steps = 0;
        let improved = true;
        while (improved && steps < 400) {
          improved = false;
          for (const cand of opts.shrink(best)) {
            steps += 1;
            if (steps >= 400) break;
            try {
              await opts.prop(cand);
            } catch (err2) {
              best = cand;
              bestErr = err2;
              improved = true;
              break;
            }
          }
        }
      }
      throw new Error(
        `Property falsified (seed=${String(opts.seed)}, run=${String(run + 1)}/${String(opts.runs)})\n` +
          `  shrunk counterexample: ${show(best)}\n` +
          `  original counterexample: ${show(value)}\n` +
          `  failure: ${bestErr instanceof Error ? bestErr.message : String(bestErr)}`,
      );
    }
  }
}

function shrinkString(s: string): string[] {
  if (s.length === 0) return [];
  const out: string[] = [""];
  if (s.length > 1) {
    out.push(s.slice(0, s.length >> 1), s.slice(s.length >> 1));
  }
  for (let i = 0; i < Math.min(s.length, 16); i++) {
    out.push(s.slice(0, i) + s.slice(i + 1));
  }
  for (let i = 0; i < Math.min(s.length, 8); i++) {
    if (s[i] !== "a") out.push(s.slice(0, i) + "a" + s.slice(i + 1));
  }
  return out;
}

// ─── Generators ──────────────────────────────────────────────────────────────

const DIGITS = "0123456789";

function digits(r: Rng, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += DIGITS.charAt(int(r, 0, 9));
  return s;
}

/** A valid, possibly hostile decimal string: leading zeros, "0", 32-digit
 * fractional parts (beyond IEEE 754 double precision), huge integer parts. */
function genValidDecimal(r: Rng): string {
  const intPart = digits(r, int(r, 1, 14));
  const frac = r() < 0.7 ? "." + digits(r, int(r, 1, 32)) : "";
  return intPart + frac;
}

const DECIMAL_ATOMS = [
  "",
  "-",
  ".",
  "+",
  "e",
  "E",
  " ",
  "\n",
  "\t",
  "0",
  "9",
  "٣", // ARABIC-INDIC DIGIT THREE — \d must stay ASCII-only
  "１", // FULLWIDTH DIGIT ONE
  "_",
  ",",
  "x",
] as const;

const SPECIAL_DECIMAL_LITERALS = [
  "",
  "-",
  ".",
  "-.",
  "1.",
  ".5",
  "+1",
  " 1",
  "1 ",
  "1\n",
  "1e5",
  "1E5",
  "0x10",
  "Infinity",
  "-Infinity",
  "NaN",
  "1,000",
  "--1",
  "1.2.3",
  "-0",
  "007",
  "0.10000000000000000000000000000000000000001",
] as const;

/** Strings clustered around the decimal-string boundary. */
function genDecimalCandidate(r: Rng): string {
  switch (int(r, 0, 3)) {
    case 0:
      return (r() < 0.3 ? "-" : "") + genValidDecimal(r);
    case 1: {
      const base = (r() < 0.3 ? "-" : "") + genValidDecimal(r);
      const pos = int(r, 0, base.length);
      return base.slice(0, pos) + pick(r, DECIMAL_ATOMS) + base.slice(pos);
    }
    case 2: {
      let s = "";
      const n = int(r, 0, 6);
      for (let i = 0; i < n; i++) s += pick(r, DECIMAL_ATOMS);
      return s;
    }
    default:
      return pick(r, SPECIAL_DECIMAL_LITERALS);
  }
}

/**
 * Independent oracle for the decimal-string domain, hand-rolled so INV-1 does
 * not test the regex against itself. Spec sentence (decimal.ts): "a
 * stringified decimal number" — optional leading '-', one or more ASCII
 * digits, optionally '.' plus one or more ASCII digits, nothing else.
 */
function decimalOracle(s: string): boolean {
  let i = 0;
  if (s[i] === "-") i += 1;
  const intStart = i;
  while (i < s.length && s.charAt(i) >= "0" && s.charAt(i) <= "9") i += 1;
  if (i === intStart) return false;
  if (i === s.length) return true;
  if (s[i] !== ".") return false;
  i += 1;
  const fracStart = i;
  while (i < s.length && s.charAt(i) >= "0" && s.charAt(i) <= "9") i += 1;
  return i > fracStart && i === s.length;
}

const ASSET_ATOMS = [
  "AAPL",
  "BRK.B",
  "VTI",
  "a",
  "α",
  "X_Y",
  " ",
  "0",
] as const;

/** excluded_assets — hostile shapes: empty, duplicates, unsorted, unicode. */
function genExcludedAssets(r: Rng): string[] {
  const n = int(r, 0, 8);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    // Bias toward duplicates.
    const first = out[0];
    out.push(r() < 0.3 && first !== undefined ? first : pick(r, ASSET_ATOMS));
  }
  return out;
}

interface PrefSet {
  driftThreshold: DecimalString;
  minOrder: DecimalString;
  excludedAssets: string[];
  fractionalEnabled: boolean;
}

function genPrefSet(r: Rng): PrefSet {
  return {
    driftThreshold: asDecimalString(genValidDecimal(r)),
    minOrder: asDecimalString(genValidDecimal(r)),
    excludedAssets: genExcludedAssets(r),
    fractionalEnabled: r() < 0.5,
  };
}

let uid = 0;
const nextUid = (): number => {
  uid += 1;
  return uid;
};

function draftInput(
  accountId: string,
  prefs: PrefSet,
): Omit<ExecutionPolicyDraft, "updatedAt" | "meta"> {
  return {
    accountId,
    strategyId: "core-balanced",
    accountScope: "primary",
    assetUniverse: ["US_LARGE_CAP_EQUITY"],
    restrictedSectors: [],
    ...prefs,
    staleBrokerDataPauseAfter: "PT15M",
    staleProfilePauseAfter: "P90D",
    pauseOnDisclosureSuperseded: true,
    pauseOnProfileSuperseded: true,
  };
}

function policyInput(
  r: Rng,
  accountId: string,
): Omit<ExecutionPolicy, "policyVersion" | "policyId" | "meta"> {
  return {
    accountId,
    strategyId: pick(r, ["core-balanced", "growth", "s"]),
    accountScope: "primary",
    assetUniverse: ["US_LARGE_CAP_EQUITY"],
    ...(r() < 0.8 ? genPrefSet(r) : {}),
    riskGuardrailHash: digits(r, 16),
    restrictionsHash: digits(r, 16),
    pauseRules: [],
    notificationPreferences: [],
    advisoryProfileVersion: int(r, 1, 9),
    disclosureVersions: [{ docId: "managed-prefs", version: "v1" }],
    advisoryAgreementVersion: "2026-01",
    signedAt: new Date(0).toISOString(),
    signedByAuthId: "auth-invariants",
    signedIpHash: "iphash",
    signedDeviceFingerprintHash: "fphash",
    correlationId: "corr-invariants",
  };
}

// ─── INV-1: DecimalString gate ───────────────────────────────────────────────

describe("INV-1 — DecimalString domain gate (decimal.ts, G-104)", () => {
  // Spec: "Every monetary, quantity, weight, price, threshold ... value
  // crossing the BFF surface must be a DecimalString — a stringified decimal
  // number with no IEEE 754 round-tripping."
  test("accepts exactly the decimal-string shape; accepted values round-trip verbatim", async () => {
    await forAll<string>({
      seed: 0xc0ffee,
      runs: 3000,
      gen: genDecimalCandidate,
      shrink: shrinkString,
      prop: (s) => {
        const expected = decimalOracle(s);
        expect(isDecimalString(s)).toBe(expected);
        expect(decimalStringRefiner(s)).toBe(expected);
        if (expected) {
          // Round-trip: brand does not normalize, trim, or float-mediate.
          expect(asDecimalString(s)).toBe(s);
        } else {
          expect(() => asDecimalString(s)).toThrow();
        }
      },
    });
  });

  test("precision policy: sub-double precision survives the gate verbatim", () => {
    // 41 significant decimals — unrepresentable in an IEEE 754 double.
    const hi = "0.10000000000000000000000000000000000000001";
    expect(isDecimalString(hi)).toBe(true);
    expect(asDecimalString(hi)).toBe(hi);
    // If this value were ever mediated through Number, digits would be lost:
    expect(String(Number(hi))).not.toBe(hi);
  });
});

// ─── INV-2 / INV-3: editable surface ────────────────────────────────────────

const snakeToCamel = (s: string): string =>
  s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const camelToSnake = (s: string): string =>
  s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe("INV-2 — the investor-editable surface is exactly four fields, mirrored pairwise", () => {
  // Spec (account-prefs.ts): "Daniel approved EXACTLY four investor-editable
  // fields" and "Frontend camelCase mirror, in the same order."
  test("both spellings have length 4, no duplicates, and correspond pairwise", () => {
    expect(INVESTOR_EDITABLE_ACCOUNT_PREFS).toHaveLength(4);
    expect(INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS).toHaveLength(4);
    expect(new Set(INVESTOR_EDITABLE_ACCOUNT_PREFS).size).toBe(4);
    expect(new Set(INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS).size).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(
        snakeToCamel(
          must(INVESTOR_EDITABLE_ACCOUNT_PREFS[i], `pref field ${String(i)}`),
        ),
      ).toBe(INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS[i]);
    }
  });
});

describe("INV-3 — editable/read-only disjointness and guard exactness", () => {
  // Spec (account-prefs.ts): READ_ONLY_CONTROL_NAMES lists controls the
  // investor "may VIEW but never EDIT", in BOTH spellings, because the
  // Phase 2.7 snake_case-only grep missed seven live camelCase controls.
  test("no editable name, in either spelling, is read-only", () => {
    const readOnly = new Set<string>(READ_ONLY_CONTROL_NAMES);
    for (const n of INVESTOR_EDITABLE_ACCOUNT_PREFS) {
      expect(readOnly.has(n)).toBe(false);
    }
    for (const n of INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS) {
      expect(readOnly.has(n)).toBe(false);
    }
  });

  test("regression: every read-only control carries BOTH spellings (the camelCase-miss bug shape)", () => {
    const readOnly = new Set<string>(READ_ONLY_CONTROL_NAMES);
    for (const n of READ_ONLY_CONTROL_NAMES) {
      const alternate = n.includes("_") ? snakeToCamel(n) : camelToSnake(n);
      expect(readOnly.has(alternate)).toBe(true);
    }
  });

  test("guards accept exactly the listed members — near-miss mutations are rejected", async () => {
    const bases: readonly string[] = [
      ...INVESTOR_EDITABLE_ACCOUNT_PREFS,
      ...INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS,
      ...READ_ONLY_CONTROL_NAMES,
    ];
    const mutate = (r: Rng, name: string): string => {
      switch (int(r, 0, 6)) {
        case 0:
          return name; // unmutated — must be classified by exact membership
        case 1: {
          const i = int(r, 0, name.length - 1);
          const c = name.charAt(i);
          const flipped =
            c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
          return name.slice(0, i) + flipped + name.slice(i + 1);
        }
        case 2: {
          const i = int(r, 0, name.length - 1);
          return name.slice(0, i) + name.slice(i + 1); // drop a char
        }
        case 3:
          return name + pick(r, ["s", "_", " ", "2"]); // suffix
        case 4:
          return pick(r, [" ", "_", "x"]) + name; // prefix
        case 5:
          return name.includes("_") ? snakeToCamel(name) : camelToSnake(name);
        default:
          return name.replace("_", "-");
      }
    };
    await forAll<string>({
      seed: 0xbeef01,
      runs: 2000,
      gen: (r) => mutate(r, pick(r, bases)),
      shrink: shrinkString,
      prop: (s) => {
        expect(isInvestorEditableAccountPref(s)).toBe(
          (INVESTOR_EDITABLE_ACCOUNT_PREFS as readonly string[]).includes(s),
        );
        expect(isInvestorEditableAccountPrefField(s)).toBe(
          (INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS as readonly string[]).includes(
            s,
          ),
        );
      },
    });
  });

  test("guards reject every non-string", () => {
    const junk: unknown[] = [0, 1, NaN, null, undefined, {}, [], true, 0.05];
    for (const v of junk) {
      expect(isInvestorEditableAccountPref(v)).toBe(false);
      expect(isInvestorEditableAccountPrefField(v)).toBe(false);
    }
  });
});

// ─── INV-4: draft round-trip ─────────────────────────────────────────────────

describe("INV-4 — draft save/read round-trips the four prefs verbatim; latest write wins", () => {
  // Spec (execution-policy-draft.ts): "Single draft per account: latest write
  // wins." and "Values are carried in the same units the backend AccountPrefs
  // uses: driftThreshold and minOrder as DecimalString (never float)."
  test("round-trip preserves DecimalStrings char-for-char and arrays in order (dupes included)", async () => {
    await forAll<{ first: PrefSet; second: PrefSet }>({
      seed: 0xd06f00d,
      runs: 80,
      gen: (r) => ({ first: genPrefSet(r), second: genPrefSet(r) }),
      prop: async ({ first, second }) => {
        const accountId = `inv4-acct-${String(nextUid())}`;
        await saveExecutionPolicyDraft({
          draft: draftInput(accountId, first),
          correlationId: "corr-inv4",
        });
        const afterFirst = await getExecutionPolicyDraft(accountId);
        const firstBack = must(afterFirst, "draft after first save");
        expect(firstBack.driftThreshold).toBe(first.driftThreshold);
        expect(firstBack.minOrder).toBe(first.minOrder);
        expect(firstBack.excludedAssets).toEqual(first.excludedAssets);
        expect(firstBack.fractionalEnabled).toBe(first.fractionalEnabled);

        await saveExecutionPolicyDraft({
          draft: draftInput(accountId, second),
          correlationId: "corr-inv4",
        });
        const afterSecond = await getExecutionPolicyDraft(accountId);
        const secondBack = must(afterSecond, "draft after second save");
        expect(secondBack.driftThreshold).toBe(second.driftThreshold);
        expect(secondBack.minOrder).toBe(second.minOrder);
        expect(secondBack.excludedAssets).toEqual(second.excludedAssets);
        expect(secondBack.fractionalEnabled).toBe(second.fractionalEnabled);
      },
    });
  }, 120_000);
});

// ─── INV-5: signed-policy ledger ─────────────────────────────────────────────

describe("INV-5 — the ExecutionPolicy ledger is append-only, contiguous, and immutable (stateful)", () => {
  // Spec (execution-policy.ts): "a BFF-owned, durable, append-only ledger";
  // versions are assigned 1..n by the writer and never overwritten
  // (putIfAbsent). Random interleaved appends across accounts, invariants
  // asserted after every step — single-shot properties miss ordering bugs.
  test("random interleaved appends keep every account's version chain 1..n and history unchanged", async () => {
    await forAll<number[]>({
      seed: 0x5eed5,
      runs: 15,
      // A sequence of account choices (0..2), up to 10 steps.
      gen: (r) => Array.from({ length: int(r, 1, 10) }, () => int(r, 0, 2)),
      shrink: (seq) =>
        seq.length === 0
          ? []
          : [seq.slice(0, seq.length >> 1), seq.slice(1), seq.slice(0, -1)],
      prop: async (seq) => {
        const tag = `inv5-${String(nextUid())}`;
        const accounts = [`${tag}a`, `${tag}b`, `${tag}c`];
        const model = new Map<string, ExecutionPolicy[]>(
          accounts.map((a) => [a, []]),
        );
        const r = mulberry32(0xabcdef);
        for (const choice of seq) {
          const accountId = must(accounts[choice], `account ${String(choice)}`);
          const stored = await appendExecutionPolicy({
            policy: policyInput(r, accountId),
          });
          const chain = must(model.get(accountId), `chain for ${accountId}`);
          // Contiguity + monotonicity: next version is exactly chain length + 1.
          expect(stored.policyVersion).toBe(chain.length + 1);
          expect(stored.policyId).toBe(
            `${accountId}-policy-v${String(stored.policyVersion)}`,
          );
          chain.push(structuredClone(stored));
          // After every step: each account's full history matches the model
          // (append-only ⇒ earlier versions unchanged), list is sorted, and
          // latest/get agree with the model.
          for (const a of accounts) {
            const listed = await listExecutionPolicies(a);
            expect(listed).toEqual(model.get(a));
            const latest = await getLatestExecutionPolicy(a);
            const expected = must(model.get(a), `chain for ${a}`);
            expect(latest).toEqual(
              expected.length === 0 ? null : expected[expected.length - 1],
            );
          }
          const byVersion = await getExecutionPolicy(
            accountId,
            stored.policyVersion,
          );
          expect(byVersion).toEqual(stored);
        }
      },
    });
  }, 120_000);
});

// ─── INV-6: account isolation of preference state ───────────────────────────

/**
 * Hostile account-id alphabet. Account ids reach the store from the auth
 * layer; the store's safeKey() sanitizes to [A-Za-z0-9._-], mapping every
 * other character to "_". These properties assert the spec sentence "Single
 * draft per account" extends to: writes for account B never alter reads for
 * account A when A ≠ B.
 *
 * DOMAIN NOTE (skill rule: question the invariant before the code): seeded
 * sessions mint ids like "acct-001", inside the safe alphabet. Whether ids
 * containing "/", spaces, or "__" are reachable in production depends on the
 * upstream auth issuer, which this repo does not control. The failures below
 * are therefore reported as domain-boundary counterexamples, pinned with
 * test.fails as known-bug regressions (they start passing the moment the
 * store keys become collision-free, which will flag the marker for removal).
 */
const HOSTILE_ID_CHARS = ["a", "b", "0", "-", "_", ".", "/", " ", "A"] as const;

function genHostileId(r: Rng): string {
  const n = int(r, 1, 6);
  let s = "";
  for (let i = 0; i < n; i++) s += pick(r, HOSTILE_ID_CHARS);
  // safeKey() throws on ids that sanitize to a leading "." — a separate
  // (availability, not isolation) failure mode; keep it out of this domain.
  return s.startsWith(".") ? `a${s}` : s;
}

function shrinkIdPair(p: {
  a: string;
  b: string;
}): Array<{ a: string; b: string }> {
  const out: Array<{ a: string; b: string }> = [];
  for (const a2 of shrinkString(p.a)) {
    if (a2.length > 0 && !a2.startsWith(".") && a2 !== p.b)
      out.push({ a: a2, b: p.b });
  }
  for (const b2 of shrinkString(p.b)) {
    if (b2.length > 0 && !b2.startsWith(".") && b2 !== p.a)
      out.push({ a: p.a, b: b2 });
  }
  return out;
}

describe("INV-6 — preference state is isolated per account id", () => {
  test.fails(
    "KNOWN FAILURE (store key sanitization collision): a draft write for B must not clobber A's draft",
    async () => {
      await forAll<{ a: string; b: string }>({
        seed: 0xfeedface,
        runs: 400,
        gen: (r) => {
          const base = genHostileId(r);
          const roll = r();
          if (roll < 0.4) {
            // Distinct raw ids that sanitize identically ("/", " ", "_" all
            // map to "_"): the canonical collision shape.
            const cls = ["_", "/", " "] as const;
            const c1 = pick(r, cls);
            let c2 = pick(r, cls);
            if (c2 === c1) c2 = c1 === "_" ? "/" : "_";
            return { a: base + c1, b: base + c2 };
          }
          let b =
            roll < 0.7 ? genHostileId(r) : base + pick(r, HOSTILE_ID_CHARS);
          if (b === base) b = `${base}x`;
          return { a: base, b };
        },
        shrink: shrinkIdPair,
        prop: async ({ a, b }) => {
          const rA = mulberry32(1);
          await saveExecutionPolicyDraft({
            draft: draftInput(a, {
              ...genPrefSet(rA),
              driftThreshold: asDecimalString("0.11"),
            }),
            correlationId: "corr-inv6a",
          });
          await saveExecutionPolicyDraft({
            draft: draftInput(b, {
              ...genPrefSet(rA),
              driftThreshold: asDecimalString("0.22"),
            }),
            correlationId: "corr-inv6a",
          });
          const readBack = await getExecutionPolicyDraft(a);
          expect(readBack).not.toBeNull();
          const row = must(readBack, `read-back for ${a}`);
          expect(row.accountId).toBe(a);
          expect(row.driftThreshold).toBe("0.11");
        },
      });
    },
    120_000,
  );

  test.fails(
    "KNOWN FAILURE (sanitized ids break the version chain): appending twice always yields v1 then v2",
    async () => {
      await forAll<string>({
        seed: 0xdeadb0,
        runs: 300,
        gen: genHostileId,
        shrink: (s) =>
          shrinkString(s).filter((c) => c.length > 0 && !c.startsWith(".")),
        prop: async (id) => {
          const accountId = `inv6b-${String(nextUid())}-${id}`;
          const r = mulberry32(2);
          const first = await appendExecutionPolicy({
            policy: policyInput(r, accountId),
          });
          expect(first.policyVersion).toBe(1);
          const second = await appendExecutionPolicy({
            policy: policyInput(r, accountId),
          });
          expect(second.policyVersion).toBe(2);
        },
      });
    },
    120_000,
  );

  test.fails(
    "KNOWN FAILURE (list-prefix ambiguity): listExecutionPolicies(A) returns only A's policies",
    async () => {
      await forAll<{ a: string; b: string }>({
        seed: 0xa11ce,
        runs: 300,
        gen: (r) => {
          // Bias toward prefix-related ids: B extends A.
          const a = genHostileId(r);
          const b =
            r() < 0.7
              ? a + pick(r, ["__x", "_", "x", "/z"] as const)
              : `${a}-other`;
          return { a, b };
        },
        shrink: shrinkIdPair,
        // The unique tag is applied INSIDE the property (not the generator) so
        // every evaluation — including shrink candidates — runs against fresh
        // store state; prefixing both ids identically preserves any prefix
        // relationship between them.
        prop: async ({ a, b }) => {
          const tag = `inv6c-${String(nextUid())}-`;
          const [ta, tb] = [tag + a, tag + b];
          const r = mulberry32(3);
          await appendExecutionPolicy({ policy: policyInput(r, ta) });
          await appendExecutionPolicy({ policy: policyInput(r, tb) });
          const listed = await listExecutionPolicies(ta);
          for (const p of listed) {
            expect(p.accountId).toBe(ta);
          }
        },
      });
    },
    120_000,
  );
});
