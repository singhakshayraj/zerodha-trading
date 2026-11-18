# Pre-registration: S5 "Trend-filtered momentum" — live paper (trial 265)

Frozen: 2026-11-19, before any S5 live output exists (first rebalance 2026-12-31).
Any change below is a new trial number. Project tracker: P-71.

## Rules

**S1-T exactly as specified in [PREREG.md](PREREG.md)** (hash `c251d8e2…5e5158`):
the S1 rules table plus the S1-T variant (at each rebalance, if NIFTY 50 closed
below its 200-session SMA on the signal day, sell everything and hold cash until
a month-end where it is back above). The costs, slippage and sizing are the same.

Why a new trial: S1-T's 2024–25 holdout (trial 263) has been seen, so only data
from 2026-12-31 onward can judge it.

## Addendum B — live adaptations (the only differences from the kit)

1. **Data:** Kite day bars, fetched at run time (split/bonus adjusted by Kite).
   Demergers are patched with brain `corporate_actions.adjust`
   (`data/corporate_actions.csv`). The universe is the current Nifty-500 pin
   (`data/nifty500.csv`), refreshed as the brain refreshes it. This is point in
   time going forward, so the survivorship bias of the kit does not apply.
2. **Traded value** = close × volume of the day bar. The kit summed 1-min bars.
   **Sessions** = each symbol's own bars, not a shared panel calendar.
3. **The 15:25 price** = the close of the 15:20 5-minute bar on the rebalance
   session. A held name with no such bar sells at its last available close. A buy
   candidate with no such bar is skipped for the next rank, and the skip is
   logged. This replaces the kit's `px notna & n_bars ≥ 200` check.
4. **Month-end** = the last NSE trading session of the month (weekday and not in
   `config.NSE_HOLIDAYS`). If the rebalance cannot run that day (no live token),
   it runs on a later day within **5 sessions**, using that month-end's own 15:20
   bars and the bars before it. Otherwise the month is skipped and logged.
5. **Splits on held names:** k = entry_price ÷ (the adjusted day close on the
   entry date). If k is outside [0.70, 1.45], the position becomes qty × k at
   entry_price ÷ k, which keeps the cost basis.
6. **Book:** a ₹50,000 paper book, no top-ups, first rebalance on
   **2026-12-31**. The orders are paper only; nothing is sent to the broker.

## Decision rule (fixed now)

Read once on **2028-12-31** (24 months). Adopt S5 only if both hold over
2026-12-31 → 2028-12-31:

- net CAGR is above the Nifty200 Momentum 30 price index (`index_bars`); **and**
- max drawdown is smaller than that index's.

Otherwise the index fund wins: it needs no code. Live paper cannot prove an edge
statistically (~60 trades a year). This read checks whether S5 is worth running
instead of the fund, not whether the edge is real.

## Addendum C (2026-11-19, from the pre-merge code review, before any S5 output)

No S5 rebalance or snapshot exists yet, so these changes carry no look-ahead. They
correct the live adaptations only; the strategy rules are unchanged.

1. **Split band** (replaces the band in B5): [0.95, 1.05]. With no corporate
   action, k ≈ 1 ± costs and the last-minutes drift. The 0.70/1.45 band came from
   the kit's raw-gap detector, and it missed Kite-adjusted 1:3, 1:4, 1:5 and 1:10
   bonuses (k = 1.33, 1.25, 1.2, 1.1). Those would have shown a fake loss.
2. **Fetch window:** 500 calendar days of day bars (≈ 340 sessions), not 400
   (≈ 271). This is so that halt days don't push a name under the 260-session
   minimum. MIN_HIST is unchanged.
3. **Data failures are retried, never traded on.** The rebalance aborts without
   marking the month done, and catches up per B4, when any of these happens:
   - a 5-minute or held-name day-bar fetch returns nothing;
   - fewer than half the pin is eligible;
   - a position read or write fails.

   "Bars exist but none at 15:20 on the day" is a genuine halt. In that case B3
   applies: a held name sells at its last close **whatever its rank** (this is the
   kit's behaviour), and a buy candidate is skipped.
4. **Names that leave the pin:** S5 stores the Kite token of every name it buys.
   A held name dropped from the Nifty 500 (reconstitution or rename) is still
   priced and sold at market. It is not sold at its entry price.
