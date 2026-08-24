# Design — investor-profile questionnaire and alpha allocation gate

**Status:** design for review, 2026-08-24. Sourced from Daniel's 2026-08-24 response
(points 3 and 9) and the existing advisory-profile surface. Implementation follows the
D-LAUNCH-06 answer, but the design below is deliberately valid under **both** readings
of the September launch — the gate's _enforcement point_ is the only thing that moves.

## What Daniel asked for

- Point 3: "our risk questionnaire for investor profile on the front end should be
  asking things like net worth, risk tolerance etc and during alpha you could add
  either a max percentage allocation gate like max 2% of net worth on alpha system or
  alternatively have a massive risk disclaimer sign off as an alpha user."
- Point 9: "investor profile questionnaire (can be quite simple, generic and specific
  to our product) … use general rule of thumbs in the industry … price in the risk
  associated with using an alpha product (essentially that massive percent gate)."

## Current state

`POST /api/v1/investor/profile` already writes an immutable advisory-profile snapshot
with: `goal`, `horizon`, `incomeBand`, `liquidityNeed`, `riskTolerance`, `experience`,
`accountPurpose` (see `signal-smoke.spec.ts` positive control). Missing for Daniel's
ask: any **net-worth measure**, and any **alpha-specific gate or acknowledgment**.

## Design

### 1. Questionnaire additions (advisory profile v2)

Add two banded fields — bands, never exact dollars (less invasive, still sufficient
for a percentage gate, standard industry practice):

| Field                | Bands                                                           |
| -------------------- | --------------------------------------------------------------- |
| `netWorthBand`       | `<25k` · `25k_100k` · `100k_500k` · `500k_1m` · `1m_5m` · `>5m` |
| `liquidNetWorthBand` | same bands — the gate computes from LIQUID net worth            |

Both flow through the existing immutable-snapshot machinery: a change creates a new
`profileVersion`, prior versions preserved, receipt emitted — no new persistence
concepts. The rest of the questionnaire stays as-is; it already covers the
industry-standard suitability axes (objective, horizon, income, liquidity, tolerance,
experience, purpose).

### 2. Alpha allocation guidance (both readings)

Compute a **suggested alpha cap** = 2% of the LOWER BOUND of `liquidNetWorthBand`
(conservative by construction; the `<25k` band maps to a fixed floor, e.g. $250, or
to "paper account recommended"). Rendered wherever account value meets the product:
onboarding completion, recommendations header when reconciled account value exceeds
the cap.

The percentage and floor are **backend-owned policy values** delivered with the
profile/status projection — the frontend renders them and never hardcodes 2% (same
rule as freshness thresholds; the tripwire pattern already enforces this class of
mistake for freshness).

### 3. Alpha-risk acknowledgment (both readings)

A new disclosure document `alpha-program-risk` enters the EXISTING disclosure/consent
machinery — registry, versioning, `contentHash`, acknowledgment, re-acknowledgment on
material change. Placeholder content is acceptable at Gate A; counsel supplies final
text at Gate B (it likely merges with their alpha-cohort terms). Acknowledgment is
required before joining the template during the alpha window.

This is Daniel's "massive risk disclaimer sign off" — and it is needed under BOTH his
options, because even a hard gate needs the investor to understand the alpha status.

### 4. Enforcement point — the only D-LAUNCH-06-dependent piece

| Launch reading                   | Enforcement                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signal-only (Ship Contract)      | Advisory only: cap is displayed guidance + required acknowledgment. Nothing executes, so nothing is blocked; the recommendation itself is unscaled.                                                                            |
| Execution-capable alpha (Dan §3) | The cap becomes a **backend risk input** (his own risk-snapshot machinery is the natural home — exec overview §8.2). The frontend still only renders the backend's verdict; it never computes or enforces the cap client-side. |

Under no reading does the frontend own the gate's math. That keeps the questionnaire
implementable NOW without betting on the D-LAUNCH-06 answer.

## Open questions (carry to Daniel / counsel — do not decide silently)

1. Gate vs. disclaimer, or both (Daniel offered either; this design assumes both,
   with gate strength per reading above).
2. Exact percentage and the sub-band floor — backend policy values; who versions them?
3. Is `netWorthBand` required or optional-with-consequence (no cap computable → paper
   account recommended)?
4. Does counsel want the questionnaire's suitability record in a specific form for the
   203A-2(e) file?

## Implementation slices (after D-LAUNCH-06)

1. `feat(profile)`: two banded fields through schema, form, snapshot, receipt, tests.
2. `feat(disclosure)`: `alpha-program-risk` document registered with placeholder
   content; acknowledgment gate on template join during alpha.
3. `feat(guidance)`: cap rendering from backend-supplied policy values (mock adapter
   values until the connection package lands).
