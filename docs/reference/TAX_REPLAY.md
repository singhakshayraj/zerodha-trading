# Tax rule replay [P-68 Phase 1]

Replays `tax_actions.plan` over every official SELL-grade `advice` call
(`portfolio_advice`, `is_official`, verdict SELL / SELL_ON_BOUNCE / TRIM) from
2026-08-25 to 2026-11-17: **153 calls**. Run: `python3 scripts/tax_replay.py`
(brain repo, read-only). A wait is priced as `sell_qty × (price on call date −
close on the first stored path row on/after the LTCG date)`; tax saved =
`plan.saving_inr`.

| calls | told to wait | tax saved | drift paid | net | pending |
|---|---|---|---|---|---|
| 153 | 0 | ₹0 | ₹0 | ₹0 (0.00%) | 0 |

Waited calls: none. Why: the tradebook starts 2026-02-11, so every known lot is
under a year old; the nearest LTCG date is 61 trading days out (max 259) —
beyond the 60-day wait cap. 125 calls had known lots, 28 had none (unmatched).
So the rule never overrode a call; this replay is a no-op, not evidence for or
against waiting.

| symbol | call date | LTCG date | saving | drift | net |
|---|---|---|---|---|---|
| (none) | | | | | |

## Simplifications
- FY context (realised P&L so far) is as of today, not the call date —
  statement totals are only known for the whole period.
- Lots are partial for undated holdings (pre-2026-02-11 buys are not in the
  tradebook): `unmatched_qty` rows are priced on the known lots only.
- Cost curve is as of today. `app_config.tax_cost_curve` was not yet written,
  so the script derived the same curve in memory from stored paths
  (5d +1.37%, 10d −0.45%, 20d −4.68%, 40d −7.25%).
- ADV (liquidity) skipped.

Gate: Rule stays on while net ≥ 0; re-read monthly (V-41).
