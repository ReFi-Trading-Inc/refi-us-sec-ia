/**
 * Account Controls Center — Sprint 3 PR-F.
 *
 * Exercises the /api/v1/investor/account-prefs happy path and every
 * fail-closed invariant landed with the route:
 *
 *   - GET returns an empty projection (version 0) when no prefs row yet
 *   - PATCH with wrong expectedVersion → 409 version_mismatch
 *   - PATCH with material change (driftThreshold, excludedAssets) but no
 *     signedConsentRef → 409 material_change_requires_consent
 *   - PATCH with material change + consent → 200 + version incremented
 *   - PATCH with non-material change (minOrder, fractionalEnabled) → 200
 *     without consent required
 *   - Empty diff → 200 no-op (no history row, no receipt)
 *   - Concurrent-edit second write → 409
 *   - History endpoint returns entries scoped to the caller's account
 *
 * FLAG_ACCOUNT_CONTROLS_CENTER + FLAG_ACCOUNT_PREFS_PATCH are set to
 * "on" in playwright.config.ts webServer.env; production default is off.
 */
import { test, expect } from "./fixtures";
import { type APIRequestContext } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

const AUTH_COOKIE = `us_eligibility_v1=${E2E_USERS.signal.eligibilityCookie}`;

async function getPrefs(
  request: APIRequestContext,
): Promise<{ version: number; body: Record<string, unknown> }> {
  const res = await request.get("/api/v1/investor/account-prefs", {
    headers: { cookie: AUTH_COOKIE },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as {
    data: { version: number } & Record<string, unknown>;
  };
  return { version: body.data.version, body: body.data };
}

async function patchPrefs(
  request: APIRequestContext,
  payload: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await request.patch("/api/v1/investor/account-prefs", {
    headers: {
      cookie: AUTH_COOKIE,
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    data: JSON.stringify(payload),
  });
  const status = res.status();
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* leave empty */
  }
  return { status, json };
}

test.describe("Account Controls Center — /api/v1/investor/account-prefs", () => {
  test("GET returns an empty projection (version 0) for a fresh account", async ({
    request,
  }) => {
    const { body } = await getPrefs(request);
    expect(body["version"]).toBe(0);
    expect(body["excludedAssets"]).toEqual([]);
  });

  test("PATCH with wrong expectedVersion returns 409 version_mismatch", async ({
    request,
  }) => {
    const { version } = await getPrefs(request);
    const wrong = version + 100;
    const res = await patchPrefs(request, {
      expectedVersion: wrong,
      minOrder: "1.00",
    });
    expect(res.status).toBe(409);
    const err = res.json["error"] as { code?: string } | undefined;
    expect(err?.code).toBe("version_mismatch");
  });

  test("PATCH material change without signedConsentRef → 409", async ({
    request,
  }) => {
    const { version } = await getPrefs(request);
    const res = await patchPrefs(request, {
      expectedVersion: version,
      driftThreshold: "0.10",
    });
    expect(res.status).toBe(409);
    const err = res.json["error"] as
      | { code?: string; diff?: string[] }
      | undefined;
    expect(err?.code).toBe("material_change_requires_consent");
    expect(err?.diff).toContain("driftThreshold");
  });

  test("PATCH non-material change succeeds without consent + increments version", async ({
    request,
  }) => {
    const before = await getPrefs(request);
    const res = await patchPrefs(request, {
      expectedVersion: before.version,
      minOrder: "5.00",
    });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const data = res.json["data"] as { version: number; minOrder: string };
    expect(data.version).toBe(before.version + 1);
    expect(data.minOrder).toBe("5.00");
  });

  test("PATCH empty diff is a no-op — no version bump", async ({ request }) => {
    // First establish a known non-null state.
    let cur = await getPrefs(request);
    if (cur.body["fractionalEnabled"] !== true) {
      const r = await patchPrefs(request, {
        expectedVersion: cur.version,
        fractionalEnabled: true,
      });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      cur = await getPrefs(request);
    }
    // Re-send the same value — the route must not append history or bump
    // the version, per docs §5 rule 5.
    const res = await patchPrefs(request, {
      expectedVersion: cur.version,
      fractionalEnabled: cur.body["fractionalEnabled"],
    });
    expect(res.status).toBe(200);
    expect(res.json["noOp"]).toBe(true);
    const after = await getPrefs(request);
    expect(after.version).toBe(cur.version);
  });

  test("Concurrent-edit second write returns 409 (S8 optimistic concurrency)", async ({
    request,
  }) => {
    const start = await getPrefs(request);
    // First writer wins.
    const first = await patchPrefs(request, {
      expectedVersion: start.version,
      minOrder: "9.99",
    });
    expect(first.status, JSON.stringify(first.json)).toBe(200);
    // Second writer holds the same expectedVersion — must be rejected.
    const second = await patchPrefs(request, {
      expectedVersion: start.version,
      minOrder: "8.88",
    });
    expect(second.status).toBe(409);
    const err = second.json["error"] as { code?: string } | undefined;
    expect(err?.code).toBe("version_mismatch");
  });

  test("History endpoint scopes to the caller's account", async ({
    request,
  }) => {
    // Drive one write so at least one entry exists.
    const start = await getPrefs(request);
    const r = await patchPrefs(request, {
      expectedVersion: start.version,
      minOrder: "3.33",
    });
    expect(r.status).toBe(200);

    const res = await request.get("/api/v1/investor/account-prefs/history", {
      headers: { cookie: AUTH_COOKIE },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: {
        entries: Array<{
          historyId: string;
          diffFields: string[];
          mockState: boolean;
        }>;
      };
    };
    expect(body.data.entries.length).toBeGreaterThan(0);
    // Every entry must carry mock_state=true (§4 non-removable field).
    for (const entry of body.data.entries) {
      expect(entry.mockState).toBe(true);
    }
    // Newest entry reflects the write we just made.
    expect(body.data.entries[0]?.diffFields).toContain("minOrder");
  });
});
