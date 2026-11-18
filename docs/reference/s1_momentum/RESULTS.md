# S1 Monthly Momentum Core: results (run 2026-11-18, after PREREG.md was frozen)

Capital ₹50,000, no top-ups, exact Zerodha CNC costs, integer shares, 10 bps slippage per leg.
Trading from Jan 2019 to Dec 2025. In-sample 2019–2023, holdout 2024–2025.

| | S1 momentum | S1-T (+ Nifty 200-DMA filter) | B1 Nifty 50 (price) | B2 equal-weight top-200 |
|---|---|---|---|---|
| CAGR, full | 34.1% | 24.6% | 13.6% | 19.8% |
| CAGR, in-sample 2019–23 | 52.9% | 32.2% | 15.3% | 22.4% |
| **CAGR, holdout 2024–25** | **−3.1%** | 7.5% | 9.7% | 13.6% |
| Max drawdown | −42.6% (Jul 2024 → Mar 2025, not recovered) | −32.7% | −38.2% | −32.3% (monthly) |
| Sharpe, full | 1.27 | 1.14 | | |
| Excess vs Nifty, in-sample | +30.9%/yr, t = +3.30 | +14.4%/yr, t = +1.33 | | |
| Excess vs Nifty, holdout | −8.8%/yr, t = −0.50 | 0.0%/yr, t = 0.00 | | |
| Trades over 7 yrs | 408 | 398 | | |
| Costs | ₹21,839 (1.36% of avg equity/yr) | ₹13,717 (1.46%/yr) | | |

Calendar years, S1: 2019 +13%, 2020 +85%, 2021 +90%, 2022 +10%, 2023 +83%, 2024 +19%, 2025 −21%.

Cost sensitivity (not a hypothesis): the same rules with ₹5,00,000 starting capital give 35.1% CAGR
(costs 1.20%/yr). Cost drag at ₹50k is about 1 point a year, mostly the ₹15.34 DP charge on ₹5k
positions. A ₹5k round trip costs about ₹36 (73 bps).

## Decision (per the pre-registered rule)

| Criterion | Needed | S1 | Pass? |
|---|---|---|---|
| Full net CAGR > Nifty | > 13.6% | 34.1% | yes |
| Holdout CAGR > Nifty holdout − 5 pts | > 4.7% | −3.1% | **no** |
| Max drawdown | < 45% | 42.6% | yes (barely) |
| Costs | < 3%/yr | 1.36% | yes |

**S1 fails.** Per the rule, it is dropped and the pre-registered fallback is the Nifty200
Momentum 30 ETF/index fund.

S1-T is not adopted either. It cut drawdown by 9.9 pts (rule: ≥ 10) and gave up 9.5 pts of CAGR
(rule: ≤ 2). Its holdout looks better, but the holdout has now been seen, so choosing S1-T
because of it would be selection after the fact. If it is pursued, it is a new hypothesis that
can only be judged on data from Dec 2026 onward.

## Why the in-sample numbers can't be trusted

- Survivorship: the universe is today's Nifty 500. Even plain equal-weighting of it made 19.8%/yr,
  versus 13.6% for the Nifty. Stocks that ran up and then collapsed out of the index are missing,
  and those are exactly the stocks momentum buys.
- One hot regime: 2020–2023 was the strongest small/mid-cap rally in decades.
- For comparison, the real point-in-time Nifty200 Momentum 30 TRI beat Nifty 200 TRI by about
  4 pts/yr over 2005–2026, not 30. It also fell about 30% from Sep 2024 to Mar 2025 and had not
  recovered by Aug 2026.
- The in-sample t of +3.30 is below the project's 3.72 multiplicity bar, and the holdout turned
  negative. This is the same pattern as the "shorts before 13:00" filter.

## Files

- `PREREG.md`, `PREREG.sha256`: frozen spec plus Addendum A, with hash and timestamp
- `build_daily.py`: 1-min parquet → daily panel (dedupes repeated sessions)
- `prep.py`: gap classification (splits, glitches, demergers, data breaks) → `gap_events.csv`
- `backtest.py`: S1 / S1-T simulator with the Zerodha CNC cost model
- `bench.py`: B1/B2 benchmarks
- Run: `python3 -I build_daily.py <src> daily.parquet && python3 -I prep.py daily.parquet . &&
  python3 -I backtest.py . 50000 [--filter] && python3 -I bench.py .`
- Data: github.com/ganeshbiyer/nse_historical_data (1-min, 2018–2025, ~5 GB)
