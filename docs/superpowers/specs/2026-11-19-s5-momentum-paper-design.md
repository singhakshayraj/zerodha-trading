# S5 trend-filtered momentum — paper book (design) [P-71]

_2026-11-19 · approved in conversation 2026-11-19 ("yes, go ahead")._

## Intent

Run S1-T (monthly momentum + Nifty 200-DMA filter) as a **live paper book from
2026-12-31**, so it can be judged after 24 months against the Nifty200 Momentum 30
index. It is the one P-71 candidate that cannot be tested on history: its holdout
has already been seen (trial 263), so only new data counts. Paper only. No broker
orders, ever.

## Goals / non-goals

- **Goal:** on each month-end session, rank, rebalance a ₹50k paper book at the
  15:25 price with exact CNC costs, Telegram the trades, and mark the book daily.
- **Non-goals (deferred by P-71):** S2 book, NSE results feed (D1), Kite Connect
  login, `sw_*` tables, scoreboard/SPRT, manual order-list workflow.
- **Anti-goal:** any rule drift from PREREG.md. A changed rule is a new trial.

## Approaches considered

1. **Outside spec (rejected):** 16 `sw_` tables, 7 jobs, Kite Connect callback.
   Mostly duplicates what the brain has, and builds S2 before it passes history.
2. **Store-and-read day bars (rejected):** the `candles` day store starts
   2026-08-25. S1-T needs ≥ 260 sessions, so it would need a backfill
   (~136k rows on the free tier) plus re-adjustment after every split.
3. **Chosen: fetch at the rebalance.** Fetch ~420 days of Kite day bars per
   Nifty-500 name at the rebalance. This is the rotation scan's pattern: ~3 min,
   Kite bars are already split-adjusted, and nothing is stored. The book lives in
   the existing `advisor_paper_positions` / `advisor_paper_equity` tables as
   `book = 'S5'`, using the PICKING_RP pattern.

## Design

- **Module:** brain `s5_momentum.py`.
  - A pure `rank(bars, nifty)` mirrors the kit's `backtest.py`:
    - eligibility: ≥ 260 bars, close ≥ ₹20, and vol/R12 defined;
    - top 200 by the median 126-session traded value (close × volume);
    - score = 0.5·z(R6/σ) + 0.5·z(R12/σ), where σ is the annualised 252-session
      std of log returns (min 200);
    - risk-off when the Nifty 50 close is below its 200-session SMA.
  - Signals use bars dated before the rebalance day only.
  - The demerger patch is `corporate_actions.adjust`.
- **Rebalance (month-end session only, from 2026-12-31):**
  - **Sells:** every held name when risk-off, plus any held name that is unranked
    or ranked above 20.
  - **Buys:** walk the ranks until 10 are held. Each budget is
    min(equity ÷ 10, cash ÷ empty slots), in whole shares. An unaffordable name,
    or one with no 15:20 bar, is skipped and logged.
  - **Price:** the close of the 15:20 5-min bar.
  - **Costs:** baked into the fill price, as in PICKING_RP, so the ledger stays
    net. That means STT, exchange txn, SEBI, GST and stamp on buys, plus ₹15.34
    DP per sell, plus 10 bps slippage per leg.
- **Splits on held names:** k = entry_price ÷ (the adjusted close on the entry
  date). Outside [0.70, 1.45], patch the row to qty × k and entry_price ÷ k, which
  keeps the cost basis. Idempotent.
- **Schedule:** `scheduler._maybe_run_s5()` runs at 15:40–16:30 IST on trading
  days, on a daemon thread, once per day, with a live token.
  - It rebalances when the latest month-end session (≥ 2026-12-31) is not yet
    done.
  - A missed month-end catches up for up to 5 trading days, because the 15:20 bars
    stay fetchable. After that the month is skipped and logged.
  - It then snapshots equity daily. The baseline is ₹50k scaled by Nifty200
    Momentum 30 from `index_bars`.
- **State:** `app_config` holds `s5_seed` (capital, inception, index level) and
  `s5_last_rebalance`. Flag: `S5_PAPER_ENABLED` (default true).
- **Telegram:** one message per rebalance (sells, buys with qty @ price, risk-off
  flag, equity), sent through the advisor bot.
- **Dashboard:** add `S5` to the accountability route's `BOOKS`, plus one card
  (a copy of the PICKING_RP card).
- **Registration:** trial **265**, frozen before 2026-12-31 as
  `docs/reference/s1_momentum/PREREG_S5.md`. It is PREREG.md's S1-T plus
  Addendum B (the live adaptations above), hashed.
  - **Read on 2028-12-31:** adopt only if net CAGR beats the Nifty200 Momentum 30
    index, with a smaller max drawdown. Otherwise the fund wins.
- **Checks:**
  - one `tests/test_s5_momentum.py`, covering rank parity on synthetic data,
    costs, split patch, month-end detection, and idempotency;
  - a VERIFY row (next free id) for the first rebalance.

## Left to the builder

The exact Telegram wording, the card layout, and the pacing constant (reuse
`ADVISOR_UNIVERSE_SCAN_DELAY_MS`).
