# Real-money P&L reconciliation — design

**Date:** 2026-11-12 · **Status:** awaiting operator approval · **Pipeline:** P-51

## Why

Every number the advisor reports today is a model number: graded hit-rates,
paper books, alpha labels. None of it answers the operator's actual question:
**"When I act on the advisor with real money, do I make or lose rupees — per
day and per month?"** This page answers that from Zerodha's own fills, and
reconciles our figures against Zerodha's P&L statement so the numbers can be
trusted.

## What exists (2026-11-12)

| Source | State |
|---|---|
| `tradebook` (exact fills: symbol, side, qty, price, trade_id, executed_at) | 229 rows; **gap 2026-05-26 → 2026-11-10** — the sync ran only at 09:45 and `/trades` returns today only. Fixed 11-12 (brain 43c35d4: every intraday refresh + 15:35). 11-11's 14 fills recovered. |
| `portfolio_advice` (every holding, every ~8 min: qty, avg, last price, verdict, rotation target) | complete since July; gives the call that was standing at any moment |
| `user_executions` (P-25) | infers trades by diffing holdings; SELL within ~8 min, BUY only at T+1. Superseded for P&L by exact fills; kept as a cross-check. |
| `user_decision` (accept/decline) | 29 rows, set by hand; no fill linked to any |
| `candles` interval=day | Nifty-500 + index daily closes from 2026-08-26 (mark-to-market + benchmark) |
| Natwar | token + holdings preview; no fills captured |

## Goals

1. **Account P&L by day and month, real ₹:** realized (FIFO on fills) +
   change in unrealized (holdings marked to the day's close) = total; beside
   Nifty 50 over the same window on the same capital.
2. **Decision ledger:** every fill tagged *followed* (matches a call standing
   when it executed), *against* (opposite of the call) or *own* (no call), and
   every SELL/TRIM call tagged *acted* or *ignored*. Rupee impact of each:
   - followed sell → ₹ saved/lost vs still holding (sale price vs later close)
   - rotation pair → buy-leg return − sold-leg return over the same window
   - ignored sell → what following would have done (same counterfactual)
3. **Monthly reconciliation:** our realized P&L for the month vs Zerodha
   Console's P&L statement (operator uploads the CSV once a month) → green
   when within ₹ tolerance, red with the per-symbol difference otherwise.
4. Both accounts, separately.

## Non-goals / anti-goals

- No tax computation (STCG/LTCG), no order placement, no broker writes.
- Not a model score — nothing here enters any trial or the n = 400 read.
  It is bookkeeping. (Anti-goal: dressing an attribution number up as edge.)
- No charges modelling beyond what Console reports.

## Design

**1. Data (prerequisite).**
- `tradebook` gains `account` (default `primary`). Natwar fills synced the
  same way on his token.
- `scripts/import_tradebook_csv.py`: Console → Reports → Tradebook (Equity)
  CSV → upsert on `trade_id` (dedup with the API rows). Closes the May→Nov gap
  now; reruns monthly as a completeness check.
- `scripts/import_pnl_csv.py`: Console → Reports → P&L (Equity) CSV →
  `pnl_statements` (account, month, symbol, realized, charges) for goal 3.

**2. Engine (brain, token-free, nightly after 15:35):** `reconcile.py`
- FIFO lots from all fills (opening lots from the first holdings snapshot
  for positions older than the tradebook) → realized ₹ per sell fill.
- Daily MTM: held qty × that day's close (`candles`), unrealized Δ per day.
- Benchmark: same day's capital × Nifty 50 return.
- Decision matching: a fill is *followed* when a `portfolio_advice` row for
  that symbol with a matching side (SELL/TRIM/SOB for sells; rotation target
  for buys) stood within the prior 3 trading days; windows fixed in code.
- Writes `pnl_daily` (account, date, realized, unrealized_delta, total,
  nifty_equiv, followed_realized) and `decision_ledger` rows.

**3. Page `/pnl` (dashboard):** account toggle (same as /advisor).
- Month header tiles: total ₹, realized, unrealized Δ, vs Nifty, ₹ from
  followed calls, reconciliation badge (✓ matched / ✗ off by ₹X / not uploaded).
- Calendar heat-map: one cell per trading day, green/red by total ₹; tap a
  day → that day's fills and P&L lines.
- Decision ledger table: call → what you did → ₹ result, filterable
  followed / ignored / own.
- Month list at the bottom: each month's total and reconciliation status.

## Phasing

1. CSV tradebook import + `account` column + Natwar fill sync (needs the
   operator's Console export once).
2. Engine: FIFO realized + daily MTM + benchmark → `pnl_daily`; `/pnl`
   tiles + calendar.
3. Decision ledger + ₹ impact on the page.
4. Monthly Console P&L upload + reconciliation badge.

## Open risks

- Corporate actions (bonus/split) break FIFO cost — flagged when our realized
  differs from Console's for that symbol; Console wins.
- Holdings older than the tradebook need an opening cost: taken from the
  holdings feed's `average_price` (Zerodha's own figure).
- Daily MTM before 2026-08-26 needs the local 5-year pickle (exists).

## Operator actions

- Console → Reports → Tradebook → Equity → 2026-05-01 to today → CSV.
- Console → Reports → P&L → Equity → per month → CSV (from phase 4).
- Natwar's token on trading days (his fills, like his preview).
