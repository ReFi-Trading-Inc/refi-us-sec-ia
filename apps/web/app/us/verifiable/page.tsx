/**
 * /us/verifiable — F-track "verifiable by design" public page.
 *
 * Sprint 6 F-track deliverable. Positioned at the quant-skeptic audience
 * the alpha form attracts: an advisory firm whose boundary, redaction,
 * and audit posture are code you can read.
 *
 * Every claim below links to file:line evidence in the public repo or to
 * a regenerable CI artifact. This page is a marketing surface, not a
 * compliance filing; the Marketing Rule §206(4)-1 boundary is respected
 * by making no forward-looking performance claim.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { usBrand } from "../_content/brand";

export const metadata: Metadata = {
  title: "Verifiable by design",
  description:
    "The boundary is code, not policy. Every rule in this document maps to a file in the public repo, a CI gate, or a regenerable evidence artifact.",
};

interface Claim {
  title: string;
  body: string;
  evidence: Array<{ label: string; href: string }>;
}

const CLAIMS: readonly Claim[] = [
  {
    title: "No per-trade Accept anywhere in the product",
    body: "SEC Rule 203A-2(e) internet-adviser status means advice is delivered exclusively through the website — not by staff over the phone, not by a per-trade confirmation button, not by anyone at ReFi tapping a green button. That is enforced in code: the InvestorActions allowlist has no accept, approve, or submit verb, and a CI script (tripwire) scans every source file to reject per-trade phrasing before merge.",
    evidence: [
      {
        label: "InvestorActions allowlist",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/apps/web/src/lib/sec203a/actions.ts",
      },
      {
        label: "Tripwire scanner",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/scripts/tripwire-investor-boundary.ts",
      },
    ],
  },
  {
    title: "Cross-account isolation, twice",
    body: "Two independent defences must both fail for one investor to see another's data. First, the BFF resolves the caller's account from a signed session — never from a caller-supplied header. Second, the backend-facing proxy has its own account-scope check with a structured audit log. A property-based fuzz test in CI injects operator-only fields into every endpoint fixture and asserts none survive the projection layer.", // allow-investor-boundary: "admin-portal" reason: "not present in this string"
    evidence: [
      {
        label: "ACL enforcement",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/apps/web/src/lib/admin-portal-proxy/acl.ts", // allow-investor-boundary: "admin-portal" reason: "engineering-repo URL on the public /us/verifiable page; the identifier is a directory name in the public repo and is not rendered as body copy"
      },
      {
        label: "Redaction fuzz",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/scripts/proxy-redaction-fuzz.ts",
      },
    ],
  },
  {
    title: "Deny by default at the API surface",
    body: "New API routes cannot ship without being added to a reviewed allowlist file. A CI script enumerates every route file on disk and fails the build if any is missing from the allowlist or vice versa. The result: a rogue route cannot land unnoticed, and every route in production has a documented purpose and owner.",
    evidence: [
      {
        label: "Route manifest",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/apps/web/route-manifest.json",
      },
      {
        label: "Route allowlist gate",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/apps/web/scripts/route-manifest-check.ts",
      },
    ],
  },
  {
    title: "Every wire schema is strict",
    body: "The BFF's contract with the trading backend uses .strict() Zod schemas. If the backend ships a field we haven't reviewed, the projection rejects it — fail closed, not silently passed through. The same schemas are published as versioned JSON Schemas with sha256 provenance so the backend can validate its own responses against them.",
    evidence: [
      {
        label: "Contract V3 schemas manifest",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/artifacts/contract-schemas/v3/manifest.json",
      },
    ],
  },
  {
    title: "The audit trail is on durable storage from day one",
    body: "Every state-changing action writes an InvestorActionReceipt. Every records or documents read writes a RecordAccessLog entry — a CI assertion enforces completeness across every route. Both streams live on the durable driver (Firestore) so they survive redeploys, well ahead of the Rule 204-2 books-and-records obligation that applies the day the Form ADV files.",
    evidence: [
      {
        label: "Receipt entity",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/apps/web/src/lib/prototype-store/entities/receipt.ts",
      },
      {
        label: "Access-log completeness assertion",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/scripts/contract-assertions.ts",
      },
    ],
  },
  {
    title: "Threat model + incident response are documented, not verbal",
    body: "A STRIDE-based threat model covers auth, the backend-facing proxy, the SSE bridge, and the signup funnel; every threat maps to a control at a file:line or an open ticket with an owner. The incident-response runbook has flag-based kill-switches per surface, timeboxed procedures for a suspected cross-account leak, and a notification tree. Both are diligence assets, not aspirations.",
    evidence: [
      {
        label: "Threat model",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/docs/security-threat-model.md",
      },
      {
        label: "IR runbook",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/docs/incident-response-runbook.md",
      },
    ],
  },
  {
    title: "The evidence bundle regenerates itself",
    body: "One command runs all eight CI gates fresh, snapshots the current contract schemas + route manifest + security docs + commit state, and writes a sha256-hashed manifest. That's what counsel, auditors, and institutional clients get on request — not a slide deck we cobbled together the night before.",
    evidence: [
      {
        label: "Evidence bundle assembler",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/scripts/assemble-evidence-bundle.ts",
      },
      {
        label: "Alpha-gate checklist",
        href: "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/blob/main/docs/alpha-gate-checklist.md",
      },
    ],
  },
];

export default function VerifiableByDesignPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4 flex items-center justify-between">
        <Link
          href="/us"
          className="text-sm font-semibold text-charcoal-200 hover:text-mint-300 transition-colors"
        >
          {usBrand.productSurface}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/us/disclosures"
            className="text-charcoal-400 hover:text-charcoal-200 transition-colors"
          >
            Disclosures
          </Link>
          <Link
            href={{ pathname: "/us/alpha-signup" }}
            className="rounded-md bg-mint-400 px-4 py-1.5 text-charcoal-950 font-medium hover:bg-mint-300 transition-colors"
          >
            Join the alpha
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-16 pb-24">
        <h1 className="text-4xl font-semibold text-charcoal-50 tracking-tight">
          Verifiable by design
        </h1>
        <p className="mt-4 text-lg text-charcoal-300 leading-relaxed">
          Most advisories describe their boundary in a marketing page. Ours is
          in a public repository, enforced by continuous integration, and
          regenerable as a sha256-hashed bundle on demand. This page links every
          claim to the file that enforces it.
        </p>
        <p className="mt-3 text-sm text-charcoal-500">
          None of the material on this page is investment advice or a
          performance representation. Every link points to source code or
          documentation in the public engineering repository.
        </p>

        <div className="mt-14 flex flex-wrap gap-3">
          <a
            href="https://github.com/ReFi-Trading-Inc/refi-us-sec-ia"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md border border-charcoal-700 px-3 py-1.5 text-xs font-medium text-charcoal-200 hover:bg-charcoal-900 transition-colors"
          >
            Public repo
          </a>
          <a
            href="https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/actions/workflows/ci.yml"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md border border-charcoal-700 px-3 py-1.5 text-xs font-medium text-charcoal-200 hover:bg-charcoal-900 transition-colors"
          >
            CI pipeline
          </a>
          <a
            href="https://github.com/ReFi-Trading-Inc/refi-us-sec-ia#admin-portal-integration-scoreboard" // allow-investor-boundary: "admin-portal" reason: "anchor link into the public README's scoreboard section; identifier is a fragment id, not user-visible copy"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md border border-charcoal-700 px-3 py-1.5 text-xs font-medium text-charcoal-200 hover:bg-charcoal-900 transition-colors"
          >
            Integration scoreboard
          </a>
        </div>

        <section className="mt-16 space-y-12">
          {CLAIMS.map((c) => (
            <article key={c.title} className="border-l-2 border-mint-400 pl-6">
              <h2 className="text-xl font-semibold text-charcoal-100 tracking-tight">
                {c.title}
              </h2>
              <p className="mt-3 text-charcoal-300 leading-relaxed">{c.body}</p>
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {c.evidence.map((e) => (
                  <li key={e.href}>
                    <a
                      href={e.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-mint-300 hover:text-mint-200 underline decoration-mint-400/40 hover:decoration-mint-300 underline-offset-2 transition-colors"
                    >
                      {e.label}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="mt-16 rounded-lg border border-charcoal-800 bg-charcoal-900/50 p-6">
          <h2 className="text-lg font-semibold text-charcoal-100">
            Why this matters
          </h2>
          <p className="mt-3 text-charcoal-300 leading-relaxed">
            Every gap between what an advisory claims and what it can
            demonstrate is an unpriced risk for a client. The way to close that
            gap is to publish the enforcement, not the aspiration. If any claim
            on this page turns out to be unenforced in the code the link points
            to, that&apos;s a bug — file it as{" "}
            <a
              href="https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/issues/new?labels=boundary"
              className="text-mint-300 hover:text-mint-200 underline decoration-mint-400/40 hover:decoration-mint-300 underline-offset-2 transition-colors"
            >
              a boundary issue
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="border-t border-charcoal-800 px-8 py-6 text-xs text-charcoal-500">
        © {new Date().getFullYear()} ReFi Trading Inc. Simulated results are
        clearly labeled where they appear elsewhere in this product; no such
        results appear on this page.
      </footer>
    </div>
  );
}
