#!/usr/bin/env tsx
/**
 * Design-token parity + accessibility gate.
 *
 * 1. The vendored design-system token file must match its recorded hash
 *    (packages/config/design-system/MANIFEST.json) — the snapshot is
 *    read-only; re-vendor deliberately.
 * 2. packages/config/tailwind/index.ts must carry the design system's values
 *    under the documented name mapping.
 * 3. Every documented text/surface pair must meet WCAG 2.2 AA (4.5:1 for
 *    text; 3:1 for large text / UI boundaries). Failures print the pair and
 *    the measured ratio.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandTokens } from "../packages/config/tailwind/index";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DS_DIR = join(ROOT, "packages/config/design-system");
const css = readFileSync(join(DS_DIR, "colors_and_type.css"), "utf8");
const manifest = JSON.parse(
  readFileSync(join(DS_DIR, "MANIFEST.json"), "utf8"),
) as { sha256: string };

const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(
      `✗ ${name}\n  ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m?.[1]) throw new Error(`token --${name} missing from vendored css`);
  return m[1]
    .trim()
    .split(/\s+\/\*/)[0]!
    .trim();
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const C = brandTokens.colors;

check("vendored design-system snapshot matches MANIFEST sha256", () => {
  const actual = createHash("sha256").update(css).digest("hex");
  assert.equal(actual, manifest.sha256);
});

check(
  "charcoal ramp mirrors the design system's gray ramp + terminal ladder",
  () => {
    const map: Array<[keyof typeof C.charcoal, string]> = [
      [50, "color-gray-50"],
      [100, "color-gray-100"],
      [200, "color-gray-200"],
      [300, "color-gray-300"],
      [400, "color-gray-400"],
      [500, "color-gray-500"],
      [600, "color-gray-600"],
      [700, "color-gray-700"],
      [800, "color-charcoal-lighter"],
      [850, "color-charcoal-light"],
      [900, "color-charcoal"],
      [950, "color-charcoal-deep"],
    ];
    for (const [k, ds] of map) {
      assert.equal(
        C.charcoal[k].toUpperCase(),
        token(ds).toUpperCase(),
        `charcoal-${String(k)} ↔ --${ds}`,
      );
    }
  },
);

check("mint / phosphor anchors match", () => {
  assert.equal(C.mint[400].toUpperCase(), token("color-mint").toUpperCase());
  assert.equal(
    C.mint[500].toUpperCase(),
    token("color-mint-dark").toUpperCase(),
  );
  assert.equal(
    C.mint[200].toUpperCase(),
    token("color-mint-light").toUpperCase(),
  );
  assert.equal(
    C.mint.logo.toUpperCase(),
    token("color-mint-logo").toUpperCase(),
  );
  assert.equal(
    C.phosphor.dim.toUpperCase(),
    token("color-phosphor-dim").toUpperCase(),
  );
  assert.equal(
    C.phosphor.mid.toUpperCase(),
    token("color-phosphor-mid").toUpperCase(),
  );
  assert.equal(
    C.phosphor.DEFAULT.toUpperCase(),
    token("color-phosphor").toUpperCase(),
  );
  assert.equal(
    C.phosphor.hot.toUpperCase(),
    token("color-phosphor-hot").toUpperCase(),
  );
  assert.equal(
    C.phosphor.paper.toUpperCase(),
    token("color-paper-green").toUpperCase(),
  );
});

check(
  "status colours match (success/warning/error); documented substitutions only",
  () => {
    assert.equal(
      C.status.approved.toUpperCase(),
      token("color-success").toUpperCase(),
    );
    assert.equal(
      C.status.warning.toUpperCase(),
      token("color-warning").toUpperCase(),
    );
    assert.equal(
      C.status.rejected.toUpperCase(),
      token("color-error").toUpperCase(),
    );
    assert.equal(
      C.status.active.toUpperCase(),
      token("color-mint").toUpperCase(),
    );
    // Substitutions are pinned to design-system neutrals, never invented hues.
    assert.equal(
      C.status.expired.toUpperCase(),
      token("color-gray-400").toUpperCase(),
    );
    assert.equal(
      C.status.system.toUpperCase(),
      token("color-gray-300").toUpperCase(),
    );
  },
);

check(
  "radius scale is terminal-sharp (≤4px) and mirrors the design system",
  () => {
    const r = brandTokens.borderRadius;
    assert.equal(r.sm, token("radius-sm"));
    assert.equal(r.DEFAULT, token("radius"));
    assert.equal(r.md, token("radius-md"));
    assert.equal(r.lg, token("radius-lg"));
    assert.equal(r.xl, token("radius-xl"));
    for (const [k, v] of Object.entries(r)) {
      if (k === "full") continue;
      assert.ok(parseInt(v, 10) <= 4, `radius ${k}=${v} exceeds 4px`);
    }
  },
);

check("shadows and font families match", () => {
  assert.equal(brandTokens.boxShadow.card, token("shadow-card"));
  assert.equal(brandTokens.boxShadow.modal, token("shadow-modal"));
  assert.equal(brandTokens.boxShadow.dropdown, token("shadow-dropdown"));
  assert.ok(
    token("font-sans").includes("DM Sans") &&
      brandTokens.fontFamily.sans.includes("DM Sans"),
  );
  assert.ok(
    token("font-mono").startsWith('"JetBrains Mono"') &&
      brandTokens.fontFamily.mono.includes("JetBrains Mono"),
  );
});

check(
  "WCAG 2.2 AA: every documented text role clears 4.5:1 on page, card and hover surfaces",
  () => {
    const surfaces = {
      page: C.charcoal[900],
      card: C.charcoal[800],
      hover: C.charcoal[850],
    };
    const textRoles: Record<string, string> = {
      "primary text (charcoal-50)": C.charcoal[50],
      "body (charcoal-100)": C.charcoal[100],
      "secondary (charcoal-300)": C.charcoal[300],
      "tertiary/metadata (charcoal-400)": C.charcoal[400],
      "link/CTA text (mint-400)": C.mint[400],
      "approved text": C.status.approved,
      "warning text": C.status.warning,
      "rejected TEXT tint": C.status["rejected-text"],
      "expired text": C.status.expired,
      "system/info text": C.status.system,
    };
    const problems: string[] = [];
    for (const [role, fg] of Object.entries(textRoles)) {
      for (const [sname, bg] of Object.entries(surfaces)) {
        const ratio = contrast(fg, bg);
        if (ratio < 4.5)
          problems.push(`${role} on ${sname}: ${ratio.toFixed(2)}:1`);
      }
    }
    assert.deepEqual(problems, [], `AA failures:\n  ${problems.join("\n  ")}`);
  },
);

check(
  "WCAG 2.2 AA: filled controls — button labels ≥4.5:1 on their fills",
  () => {
    assert.ok(
      contrast(C.charcoal[950], C.mint[400]) >= 4.5,
      "primary button label on mint",
    );
    assert.ok(
      contrast(C.charcoal[950], C.status.rejected) >= 4.5,
      "danger button label on error red",
    );
    // Documented: white on the brand error red fails (4.13) — that is why danger uses charcoal-950.
    assert.ok(contrast("#FFFFFF", C.status.rejected) < 4.5);
  },
);

check(
  "charcoal-500 is disabled/placeholder only (documented: 3.98:1 on cards)",
  () => {
    const ratio = contrast(C.charcoal[500], C.charcoal[800]);
    assert.ok(
      ratio >= 3 && ratio < 4.5,
      `expected 3–4.5, got ${ratio.toFixed(2)}`,
    );
  },
);

check(
  "non-text boundaries: default border is perceivable on cards (≥1.3:1)",
  () => {
    assert.ok(contrast(C.charcoal[700], C.charcoal[800]) >= 1.3);
  },
);

if (failures.length > 0) {
  console.error(`\ndesign-token-parity: ${String(failures.length)} failure(s)`);
  process.exit(1);
}
console.log("\ndesign-token-parity: all checks passed.");
