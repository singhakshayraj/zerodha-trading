# Household portfolio manager (`/household`) — design

_2026-11-17. Operator: "think of the best portfolio management system in the market and implement it for our trading accounts … you review and rank and decide the best for me and implement." Decisions below are Claude's calls unless marked otherwise._

## Intent

Both Zerodha accounts (Kanaklata = primary, Natwar) are one household book, but today the picture is split three ways. `/portfolio` shows Kite holdings, `/pnl` shows daily P&L, and `/advisor` shows calls, sectors and tax. Nothing answers the questions an owner actually asks:

- What am I worth?
- Am I beating the index?
- What do I really own, compared with what I meant to own?
- What is my risk?
- What do I owe in tax?
- What should I do to get back on plan?

`/household` answers all six on one page, borrowing the best idea from each leading tool:

- Kubera: net worth across everything.
- Sharesight: true returns and tax.
- Morningstar X-ray: look-through exposure.
- Smallcase / Wealthfront: targets, drift and a rebalance list.

It is advisory only, like everything else here.

## Ranking (value × data readiness) — what ships

| # | Section | Data | Ships |
|---|---|---|---|
| 1 | **Returns vs benchmark** (TWR + XIRR, per account and combined, vs Nifty 500) | `pnl_daily` since 2026-08-27 (value_open, pnl, flows, nifty_pnl); `tradebook`; `index_bars` | yes |
| 2 | **Net worth** today, day / 30-day change, by account and asset class | latest official `portfolio_advice` rows + Natwar preview payload (`app_config.advisor_natwar_latest`) | yes |
| 3 | **X-ray vs targets** (sector, size bucket, single name, both-account overlap, ETF sleeve) with drift | rows above + `data/nifty500.csv` sectors, `data/size_buckets.csv`, `household._index_weights()` | yes |
| 4 | **Risk** (effective bets, correlation clusters, max drawdown, top risk contributors) | `advisor_risk.py` (Ledoit–Wolf, `effective_number_of_bets`, `risk_contributions`, `_correlation_read`), daily closes in `candles`; drawdown from `pnl_daily` | yes |
| 5 | **Tax** (FY realised, unrealised STCG/LTCG, LTCG calendar, harvest candidates) | Phase 1 `indicators.tax`, `costs.py`, `tax_context`, `pnl_statements` | yes |
| 6 | **Rebalance list** (trims that bring each breach back inside target, after tax and cost; where freed cash would go) | items 3 + 5; `costs.round_trip_cost_pct`; index weights for underweight sectors | yes |
| 7 | **Ledger** (every fill, both accounts, filterable) | `tradebook` | yes |
| 8 | Mutual funds / gold FoFs | `holding_scheme_map` has 3 schemes with `TODO` codes, 0 units | placeholder: "3 funds unconfirmed — add scheme codes + units" |
| 9 | Dividends / income | none captured | deferred (Console dividend report = future chore) |

## Goals / non-goals / anti-goals

- **Goals:** one page; every number traceable to a table; returns that subtract flows (TWR) and that weight money-timing (XIRR); targets the operator can change without a deploy.
- **Non-goals:** placing orders; changing any advisor verdict, score, rotation or sizing; new data vendors; MF/dividend capture.
- **Anti-goals:**
  - a "return" that counts deposits as gains;
  - drift measured against a target nobody set (defaults must be visible and labelled "default");
  - a rebalance suggestion that ignores tax;
  - a number shown without its as-of date.

## How (decided)

**Brain: one pure module `household_book.py`** builds the book and writes `app_config.household_book_latest` (JSON) once a day. It runs after `reconcile` (so `pnl_daily` is final) and again after the official advisor run. It is non-fatal and wrapped like the other jobs.

**Positions:** Kanaklata from the latest official `portfolio_advice` batch; Natwar from `advisor_natwar_latest` rows. Each position carries `{account, symbol, quantity, avg_price, last_price, value, sector, size, asset_class}`. Asset classes:
- `equity`;
- `etf_gold_silver` (`sector_view.is_etf`);
- `fund_unconfirmed` (from `holding_scheme_map` rows with `confirmed=false`, value 0, listed only).

**Returns** (from `pnl_daily`, per account and combined):
- Daily return `r_t = pnl_t / value_open_t`. TWR = Π(1+r_t) − 1 over 1M / 3M / since-start.
- Benchmark TWR: `nifty_pnl_t / value_open_t` chained the same way (`nifty_pnl` is the Nifty-equivalent P&L reconcile already writes). Also Nifty 500 price return from `index_bars` over the same dates.
- XIRR: flows from `tradebook` (buys negative, sells positive, by `trade_date`) plus today's value as the final inflow. Mark `xirr_partial=True` when the tradebook starts after the first holding's purchase (today: true for both).
- Max drawdown: on the chained value index.

**X-ray targets** live in `app_config.household_targets` (JSON). Defaults are written the first time, labelled `default`, and copied from `household.py`:
- sector ≤ 20%;
- single name ≤ 8%;
- name held in both accounts ≤ 3%;
- ETF / gold sleeve ≤ 15%;
- size mix target = Nifty 500's own size mix (from `size_buckets` over the pin), tolerance ±10pp.

Drift = actual − target, reported for every breach.

**Risk:** `advisor_risk` on the combined book (60-day closes from `candles`). Report effective bets, the top 5 risk contributors (% of risk vs % of value), correlation clusters ≥ 0.7, and max drawdown.

**Tax:** sum Phase 1 `indicators.tax` across rows:
- FY realised: `pnl_statements`.
- Unrealised STCG / LTCG: per lot via `costs.tax_lots` + `costs.after_tax_pct` at last price.
- LTCG calendar: lots crossing 12 months in the next 90 days.
- Harvest candidates: underwater positions, with the loss.

**Rebalance list:**
- For each breach, the smallest whole-share trim that brings it inside target. Account picked to minimise tax: lots with a loss or long-term first, using `tax_actions.fy_tax` / `costs`.
- Show qty, ₹ freed, tax, cost.
- Freed cash: name the most underweight sectors vs index weight (sector names, not stocks — stock picks stay the advisor's job).
- Advisory text only.

**Dashboard:** `app/api/household/route.ts` reads `household_book_latest` + `household_targets` + the last 200 `tradebook` rows (both accounts). `app/household/page.tsx` has sections in ranked order:
- net worth header;
- returns (line chart: household value index vs Nifty-equivalent; table TWR / XIRR / drawdown);
- X-ray (bars vs target, breaches red);
- risk;
- tax;
- rebalance list;
- ledger (account filter);
- funds placeholder.

It gets a Sidebar entry "Household", and the Ask drawer gets a `household` tool returning the headline sentence. Every section shows its as-of date.

## Constraints

- No verdict, score, rotation or sizing change; `household_book.py` reads only.
- PostgREST 1,000-row cap: every multi-row read paged (`universe_calls._paged`).
- Phone width: 16px gutters, no horizontal scroll, charts responsive.
- Python 3.9-compatible locally; `next build` before every dashboard push; Vercel READY.
- Real account numbers never committed (fixtures synthetic).

## Left to the builder

Chart styling (reuse the dashboard's existing palette and chart approach), exact copy, table pagination.
