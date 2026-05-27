# Brand Voice — ReFi.Trading

**Last reviewed:** 2026-05-19

ReFi.Trading is a software-generated investment adviser, not a brokerage, not a fintech, not a "trading app." Voice and copy decisions flow from that one fact. Everything below is in service of two outcomes: a professional financial workstation that respects the investor's time and intelligence, and copy that survives a securities-compliance review without rewrites.

---

## 1. Who we're writing for

Two audiences, both demanding, both intolerant of consumer-fintech tonality:

- **The primary investor:** an investment manager who spends most of their day in Bloomberg Terminal, Addepar, and spreadsheets. Expects dense, scannable information. Will dismiss the product if any screen feels like a consumer app.
- **The compliance reader:** SEC staff, counsel, and the client's own legal review. Reads every word. Will flag superlatives, advice-like language, performance promises, and anything that implies fiduciary positioning we have not earned.

Write for both. The investor wants speed; the lawyer wants restraint. Restraint is not a tax — it is the product.

---

## 2. Voice principles

### Restrained

We do not sell. We describe. The product's value is obvious from what it does; copy that tries to amplify it backfires.

| Avoid                                | Use                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| "Powerful AI-driven recommendations" | "Software-generated recommendations"                                         |
| "Crush the market with…"             | "Allocates per your stated profile and risk tolerance"                       |
| "Best-in-class compliance"           | "Every recommendation passes through a compliance preview before execution." |
| "Lightning-fast"                     | (do not describe speed)                                                      |
| "Game-changing"                      | (delete)                                                                     |

### Precise

Numbers, document names, status states, and timestamps are facts. They go in `font-mono`. They are never approximated.

| Avoid                  | Use                                  |
| ---------------------- | ------------------------------------ |
| "Recently updated"     | "Updated 23s ago"                    |
| "A few orders pending" | "2 orders pending"                   |
| "Quickly"              | (state the actual duration)          |
| "Our Privacy Policy"   | "Privacy Notice — version 2026.05.1" |

### Software-generated, not personified

Recommendations and verdicts come from the platform. Not from "we," not from "ReFi," not from "your adviser." There is no human adviser implied.

| Avoid                     | Use                                                        |
| ------------------------- | ---------------------------------------------------------- |
| "We recommend buying QQQ" | "Recommendation: buy QQQ"                                  |
| "Our system suggests…"    | "The platform generated this recommendation at 09:31 UTC." |
| "Let our experts…"        | (delete; we have no human experts in this loop)            |
| "Talk to an advisor"      | "Open a support ticket"                                    |

### Calm

The dashboard is not an emergency. Verdicts, blocked states, and exceptions are described matter-of-factly. The user is intelligent and will read what we put on the screen.

| Avoid                        | Use                                                           |
| ---------------------------- | ------------------------------------------------------------- |
| "⚠️ ATTENTION REQUIRED"      | "Action: acknowledge updated disclosures"                     |
| "Your account is BLOCKED!"   | "Activation is blocked pending disclosure acknowledgment."    |
| "🎉 Congratulations!"        | "Account activated."                                          |
| "Oops, something went wrong" | "The request did not complete. Try again or contact support." |

### Honest about state

If data is simulated, we say it is simulated. If a feature is pending Phase 3, we say "Phase 3." If a document is not yet filed, we say "Document in preparation — available after registration." We never imply readiness we have not delivered.

---

## 3. Words we use

**Platform.** The aggregate of services that produce recommendations, verdicts, and audit records. Use "the platform" — not "the app," not "ReFi," not "the system."

**Recommendation.** A software-generated suggestion. Always passes through compliance preview before it can be acted on.

**Managed Execution.** The opt-in mode where the platform may route accepted recommendations to the connected broker. Always capitalized when used as a feature name.

**Compliance preview.** The pre-submission check that returns ALLOW, REVIEW, or DENY. Always referred to as a preview, never a "guarantee" or "approval."

**Verdict.** What the compliance preview returns. ALLOW / REVIEW / DENY are the three states. Anything else (network error, 5xx) is treated as DENY.

**Decision record.** The signed, hashable artifact produced for every recommendation, verdict, and order. Becomes Merkle-anchored in Phase 3.

**Activation.** The one-time gate after which Managed Execution becomes available. Requires all preconditions to pass.

**Disclosure.** A regulatory document the user must acknowledge before activation. Each has a name, a version, a hash, and an unlock condition.

**Support boundary.** The platform does not answer "should I buy X?" — that would be advice outside the software-generated channel. Support handles technical, billing, document, and platform questions only.

---

## 4. Words we avoid

| Banned                             | Why                                                       |
| ---------------------------------- | --------------------------------------------------------- |
| "Guarantee," "guaranteed"          | Implies a return promise — securities-law risk            |
| "Best," "top-rated," "leading"     | Superlatives with no factual basis                        |
| "Easy," "simple," "effortless"     | Investment is not easy; the copy should not pretend       |
| "Recommended by experts"           | We have no human experts in the loop                      |
| "Powered by AI"                    | Marketing language; "software-generated" is more accurate |
| "Trade," "trader," "trading floor" | We are an investment adviser, not a brokerage             |
| "Beat the market"                  | Performance claim                                         |
| "Personalized advice"              | Advice is the regulatory term we are most careful about   |
| "Your money grows"                 | Performance claim                                         |
| "Risk-free"                        | Always wrong                                              |
| "Limited time," "exclusive offer"  | Consumer-fintech tonality; never used                     |

Every banned word is scanned for by `scripts/scan-copy.ts` (MIG-P2.5-08). Exceptions require an inline `// allow-blocked-term: "term" reason: "..."` comment.

---

## 5. Structural rules

### All visible copy lives in `_content/*`

JSX must not contain English string literals. Pull from `apps/web/app/us/_content/*.ts` files. The copy scanner enforces this.

### Document names are final, even when pending

Form CRS, ADV Part 2A, Investment Advisory Agreement, Privacy Notice, E-Delivery Consent, Fee Schedule, Managed Execution Acknowledgment. These names ship today on the disclosures page with "Document in preparation" status. We do not invent friendlier labels.

### Numbers are mono, words are sans

`font-mono` for prices, quantities, percentages, hashes, dates, durations, and any value that represents a measurement or identifier. `font-sans` for everything else.

### Plain-language gloss next to every metric

A non-expert investor must be able to read any screen without a glossary. Beside every metric, ratio, or status pill, include a short "What this means" line (≤ Flesch-Kincaid grade 10). This is product copy, not a tooltip — it ships visible.

### One CTA per surface

A screen has one primary action. Secondary actions are tertiary buttons or text links. Two equal CTAs on a screen is a bug.

### Empty states are designed

Empty lists carry a one-sentence explanation of what would appear there and what to do next. "No recommendations yet — the platform reviews your portfolio nightly. Check back tomorrow morning." Not "No data."

### Loading states show the structure

Skeleton placeholders that match the final layout. Never "Loading…" as a single string.

### Error states say what to do

"Could not complete the request. Try again, or open a support ticket if it persists." Not "Error: 500."

---

## 6. Tone calibration by surface

| Surface               | Tone                               | Example                                                                                                                                         |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing / `/us`       | Restrained, confident, factual     | "Software-generated investment advisory services for US investors."                                                                             |
| Eligibility           | Direct, non-judgmental             | "Eligibility requires residence in a supported state and minimum portfolio."                                                                    |
| Onboarding            | Stepwise, calm                     | "Connect a broker. The platform will read positions but cannot place orders until you activate Managed Execution."                              |
| Dashboard             | Status-oriented, no celebration    | "Activation: blocked pending disclosures. Acknowledge 3 of 7 documents."                                                                        |
| Recommendation detail | Explanatory, version-stamped       | "Generated 09:31 UTC by signal-1.4.0 against profile v2026.05.1."                                                                               |
| Compliance verdict    | Matter-of-fact, never alarming     | "DENY — order exceeds maximum quantity per submission (1,200 vs 1,000)."                                                                        |
| Disclosure / legal    | Final document names, no marketing | "Form CRS. Document in preparation. Required before activation."                                                                                |
| Support               | Boundary-aware                     | "I cannot answer questions about specific buy or sell decisions. For platform, document, billing, or broker-connection issues, continue below." |
| Errors                | Actionable, non-anthropomorphic    | "The compliance preview did not return a verdict in time. Submit is disabled until the preview completes."                                      |

---

## 7. Anti-patterns we will not ship

- Exclamation marks (anywhere in product surface copy).
- Emojis (in product copy or doc content). Emojis are not part of the brand.
- First-person plural without a referent: "we believe," "we think," "we recommend."
- Personification of the platform as an adviser, friend, or assistant.
- Marketing tropes: "Join thousands of investors," "Trusted by," "As seen in."
- "Click here" / "Learn more" — link text describes the destination.
- Faux-conversational onboarding copy: "Hey! 👋 Let's get started!"
- Performance numbers in landing or marketing copy.
- "Coming soon" as a default placeholder — replace with a finished future-phase card.

---

## 8. Reviewing copy

Before merging any copy change:

1. Does it use a banned word? Run the scanner.
2. Could it be read as advice? Rewrite as a description.
3. Could it be read as a guarantee? Strike the phrase entirely.
4. Is every number `font-mono`?
5. Is the copy in a `_content/*` file, or hardcoded in JSX?
6. Is there a calm version of the same sentence? Use it.
7. Would the compliance reviewer flag it? Rewrite proactively.

---

## 9. Document history

- 2026-05-19 — Initial publication (MIG-P2.5-13).
