# Pre-registration: S1 "Monthly Momentum Core" (CNC)

Frozen: 2026-11-18, before any backtest output was seen.
Any change below creates a new hypothesis (S1b, S1c…) and must be logged as one.

## Why this strategy first

- Mechanism: under-reaction to news and slow institutional re-rating. The other side is
  investors anchored to old prices and flows that sell past winners too early.
- Evidence prior (not from our own data): IIMA WML factor ~11%/yr long-short since 1994;
  NSE's Nifty200 Momentum 30 TRI ~19.2%/yr vs ~15.1% for Nifty 200 TRI (Apr 2005 – Feb 2026).
- Cost fit: monthly holding, wide effective stops → cost per trade ≈ 0.03–0.05R, versus 0.41R
  for the intraday book.
- Execution fit: ~5–10 orders a month. Can be placed by hand from a generated list, so it
  does not need automated order placement (outside SEBI's retail-algo framework).

## Data

- 1-minute bars for 554 current/recent Nifty 500 names, 2018-01-01 → 2025-12-31
  (github.com/ganeshbiyer/nse_historical_data), aggregated to daily.
- Splits/bonuses detected from overnight price ratios and back-adjusted. Dividends not
  adjusted (price return); this understates strategy and benchmarks alike (~1–1.5%/yr).
- **Known bias: survivorship.** The universe is today's list. Stocks that collapsed and left
  the index are missing, which flatters momentum. Treat all absolute returns as upper bounds.

## Rules (S1)

| Item | Rule |
|---|---|
| Rebalance | Last trading day of each month, executed at the 15:25 bar price |
| Signal data | Daily closes up to and including the previous trading day |
| Eligible universe | Top 200 by median daily traded value over the prior 126 sessions; ≥ 260 sessions of history; price ≥ ₹20 |
| Score | 0.5·z(R6/σ) + 0.5·z(R12/σ). R6, R12 = 126- and 252-session price returns; σ = annualised std of daily log returns over 252 sessions; z across the eligible universe |
| Holdings | Top 10 by score, equal weight |
| Buffer | Keep a held stock while its rank ≤ 20 and it remains eligible; otherwise sell. Fill empty slots from the top |
| Sizing | Integer shares. Target = current equity ÷ 10. Unaffordable names (price > target) are skipped for the next rank |
| Capital | ₹50,000 start, no additions, profits reinvested |
| Cash | Earns 0% (conservative; LIQUIDBEES would earn ~6%) |

## Variant (S1-T): S1 plus a market trend filter

At each rebalance, if NIFTY 50 close < its 200-session SMA, sell everything and hold cash
until the next month-end where it is back above. Otherwise identical to S1.

## Costs (Zerodha CNC, Nov 2026)

- Brokerage 0; STT 0.1% buy and sell; NSE txn 0.00307%; SEBI 0.0001%;
  GST 18% on (txn + SEBI); stamp 0.015% buy; DP ₹15.34 per scrip per sell day.
- Slippage: 10 bps adverse per leg (liquid top-200 names near the close).

## Benchmarks

- B1: NIFTY 50 price index, buy and hold.
- B2: equal-weight eligible universe, rebalanced monthly, gross of costs.

## Metrics

Net CAGR, annualised volatility, Sharpe (rf = 0), max drawdown and its length,
monthly hit rate vs B1, turnover, total costs in ₹ and as % of capital per year,
t-stat of monthly excess return vs B1 and vs B2.

## Periods

- Signals need 252 sessions, so trading starts 2019-01.
- In-sample: 2019-01 → 2023-12. Holdout: 2024-01 → 2025-12. No parameter is tuned on either;
  both are reported separately.

## Decision rule (fixed in advance)

This backtest cannot prove the edge: 7 years at Sharpe ~0.6 gives t ≈ 1.6. Its job is to
check that the implementation, at ₹50k with real costs, behaves like the published evidence.

- **Proceed to live paper** if: net CAGR (full period) > B1 CAGR, holdout net CAGR > B1
  holdout CAGR − 5 pts, max drawdown < 45%, and costs < 3% of capital per year.
- **Then go live small** after 6 months of paper in which paper fills/costs match the model
  within ±50% and the live picks match the script's picks.
- **Otherwise** drop S1 and buy the Nifty200 Momentum 30 ETF instead (no code needed).
- S1-T is adopted over S1 only if it cuts max drawdown by ≥ 10 pts without losing more than
  2 pts of CAGR.

## Addendum A (2026-11-18, written after data cleaning, before any backtest run)

Data-handling and implementation choices that the rules above left open:

1. Source repeats whole sessions on ~25 dates; duplicates removed by timestamp.
2. Overnight gaps outside [0.70, 1.45] × prior close are classified (see `prep.py`):
   47 standard splits/bonuses → holders' shares scaled by 1/factor; 3 one-to-five-day
   glitches that reverse → bad days forward-filled; 10 non-standard drops (mostly
   demergers: ABFRL, PEL, RAYMOND, TATAMOTORS, SANOFI, TATACHEM, BSOFT…) → gap stripped,
   value preserved; 4 non-standard jumps (ELGIEQUIP, PATANJALI, JWL, MAHSCOOTER) → history
   before the break discarded.
3. Positions kept by the buffer rule are not trimmed or topped up. Only new buys are sized,
   at min(equity ÷ 10, cash ÷ empty slots).
4. Index files (*-INDEX) are excluded from the stock universe.
5. A cost-sensitivity run of S1 at ₹5,00,000 starting capital is reported. It is not a
   separate hypothesis and plays no part in the decision rule.
