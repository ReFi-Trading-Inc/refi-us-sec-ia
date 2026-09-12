# Portfolio funding and account notices

Alpha.4 adds `funding_assessment` to allocation previews and recommendation
list/detail responses. No request fields, authentication, consent keys or SSE
event types change. All currency amounts are USD **decimal strings**. Never
parse them through binary floating point for decisions.

## What to display

| Field | Meaning |
| --- | --- |
| `allocated_capital` | Current reconciled equity × requested/active allocation fraction. Includes existing portfolio holdings; it is not spendable cash or broker buying power. |
| `required_portfolio_capital` | Estimated minimum allocated capital supporting every included target weight at broker-valid entry quantities and the additional user order floor. |
| `required_account_equity` | Required allocated capital ÷ allocation fraction. |
| `capital_shortfall` | Nonnegative additional **allocated capital** required, not additional total account equity. To explain an account deposit at fixed allocation, compare required account equity with snapshot equity. |
| `smallest_target_notional` | Smallest desired positive-weight position at this allocation, not the smallest maintenance order. |
| `broker_required_portfolio_capital` | Same calculation without the extra user notional floor. Fractional-share preference and broker quantity rules still apply. |
| `user_min_order` | Additional user floor; zero means no extra restriction. Broker minimums remain enforced. |
| `limiting_constituents` | Union of effective-floor and broker-only limiting security IDs, with weight, reference price, broker/reported/effective minimum, minimum quantity, increment and separate limiting flags. Not necessarily the lowest-weight security. |
| `input_versions` | Exact target, snapshot, prices, capability and preference bindings used. Resolve security display names through the existing template/asset data; IDs are not broker symbols. |

Requirements and shortfall round **up** to cents. They are reference-price
estimates, not promises about fills, cash, fees, or exact weights after quantity
rounding. `effective_min_order` on the parent preview remains a per-asset floor,
never the required portfolio capital. Do not sum it over constituents.

`broker_minimum_source=alpaca_us_equity_buy_floor_v1` means the configured
documented $1 Alpaca US-equity buy baseline applies because metadata omitted
or undershot it. `broker_asset_metadata` means an equal/larger reported minimum
applies. `reported_minimum_notional=null` explicitly means absent metadata.
Quantity constraints can dominate either dollar floor.

## Status, replay and subscription

1. `SUFFICIENT`: entry affordability passes under these inputs. Parent preview
   `feasible` and all other account/authority/freshness gates must still pass.
2. `INSUFFICIENT`: show a persistent portfolio funding notice with the amounts
   and limiting constituents. The preview is infeasible. Do not offer partial
   membership or silently change allocation/weights to bypass it.
3. `INCOMPLETE`: required amounts and smallest-position estimate are null;
   show data/capability readiness, not an invented zero or a deposit instruction.
4. `funding_assessment=null`: historical unassessed evidence, **not** sufficient.
   Fetch a new preview using a new idempotency key before join/update. Old
   preview retries return their saved response without recalculating history.

Join/update consumes only a current, unconsumed, feasible, assessed preview
whose preferences, snapshot, target, price and capability bindings still match.
`ALLOCATION_PREVIEW_STALE` requires a new preview and new action key. Replaying
an already completed action retains the original receipt and does not reapply it.
Preview creation never changes allocation, reserves cash or creates trades.

## Persistent account notification flow

Subscribe to the existing account-owned `recommendation.updated` SSE event.
`data.reason_codes` includes `PORTFOLIO_CAPITAL_BELOW_MINIMUM` when assessed
funding is insufficient. `data.entity_id` is the recommendation ID and
`data.record_id` links its safe audit Record. Fetch recommendation detail for
`funding_assessment` and `lineage.template_id`; the SSE frame stays compact.

On initial load/reconnect, list recommendations and select the newest **current**
recommendation for the portfolio, then fetch detail. Pagination remains required.
Deduplicate notices by account + portfolio + condition, not every refresh/event.
Do not let an older replayed event overwrite newer evidence. Superseded/expired
or unassessed evidence cannot clear a warning; show its age until newer current,
fresh evidence is available. A newer sufficient assessment clears the funding
condition only, not other account stops. Cashflow/allocation/preference/target
changes trigger normal backend maintenance; there is no new acknowledgment API.

A warning is not a KYC/suitability rejection, and dismissing it grants no trading
permission. The backend preserves target weights, leaves existing holdings in
place, blocks incompatible buy baskets and permits independently safe exits.
Tiny maintenance deltas are a different condition. Explicit existing exclusions
remain effective; this is not a new permission to construct partial portfolios.
Alternative reweighting/partial-coverage methodologies are not enabled and need
their own versioned policy, preview and explicit disclosure/consent.

See `examples.json.funding` for sufficient, insufficient, user-floor, incomplete
and historical-null cases. These are synthetic client fixtures, not broker proof.
