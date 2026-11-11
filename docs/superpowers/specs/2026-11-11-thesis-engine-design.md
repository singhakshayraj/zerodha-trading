# Thesis engine — advisor v2 in shadow mode (2026-11-11)

**Status:** approved by operator 2026-11-11 (four decisions below); building.
**Tracked as** [P-47].

## Why

Every prediction layer of the current advisor has measured as a coin flip:
the 7-factor trend score (5-year replay 0.5085 / 0.4999), its 8 reweightings
(ADVISOR_LAB), 12 standard price factors (FACTOR_LAB), confidence (AUC
0.49), and BUY calls (V-23: 41–45%). They are one family — price trend —
and the family is exhausted. What survives measurement is the **risk layer**
(concentration, correlation, effective bets) and the counter-case.

Untested, and the only places a real improvement can come from:
1. **Fundamentals / business quality** (never in any factor set here).
2. **A long horizon** — the book is a long-term one; it is graded on 10/30 days.
3. **Position sizing and loss discipline** — the advisor never says *how much*,
   and five names it has rated SELL for weeks sit at −25% to −37%.

## Operator decisions (2026-11-11)

1. **Judge on 6–12-month book performance**, not 10/30-day calls.
2. **Shadow mode.** The existing advisor keeps running unchanged; the new
   engine's output is stored beside it and graded separately. It is promoted
   only after clearing a pre-registered bar. The V-20 n=400 read is untouched.
3. **No paid backtest data.** The fundamentals layer earns its record live.
4. **Loss-discipline + sizing layer, with my defaults** (operator may change):
   max loss **−20% from cost** unless the business is intact on fundamentals;
   max **10%** in one name; max **25%** in one sector; sized quantities.

## What it is

Per holding, per official run, a **thesis**: `action` ∈ {HOLD, ADD, TRIM,
EXIT}, a `target_weight_pct`, a `qty_delta`, a `quality` score (0–100 from
fundamentals), a one-line `reason`, and a `falsifier` (what would flip it).
Horizon 12 months. Stored at `portfolio_advice.indicators.thesis` on the same
row as the v1 verdict — **no schema change, v1 columns untouched.**

### Inputs
- Price history: the 400 daily bars the run already fetches + `candles`
  (interval `day`) + `mom_12_1` (the one dark flag with a stable positive sign).
- **Fundamentals:** `app_config['fundamentals_latest']` =
  `{asof, by_symbol: {SYM: {mcap, pe, cash, debt, cfo, roce, roe, piotroski,
  pledge, ev_ebitda, ...}}}`, written by `scripts/ingest_fundamentals.py` from
  a pasted Screener.in table (watchlist or screen). Stale after 45 days →
  flagged, not used for ADD.
- Book: quantity, avg price, last price, weight, sector (nifty500.csv).

### Quality score (0–100), from whatever fields are present
| field | points |
|---|---|
| ROCE (ROE for Financial Services) ≥20 / 15–20 / 10–15 | 25 / 18 / 8 |
| Piotroski ≥7 / 6 / 5 | 20 / 15 / 8 |
| cash ≥ debt / debt ≤ 2×cash (skipped for financials) | 20 / 10 |
| operating cash flow > 0 | 15 |
| pledge 0 / <5% | 10 / 6 |
| P/E ≤15 / ≤25 / ≤40 | 10 / 6 / 3 |
Normalised by the points available; `None` if fewer than 3 fields.
Intact = quality ≥ 60. ADD-grade = ≥ 70. Weak = < 40.

### Action rules (per holding, then book-level pass)
1. **ETF / index fund** (no fundamentals by nature): allocation rules only.
2. `pnl ≤ −20%` and **not intact** (weak or unknown) → **EXIT** (full).
3. quality < 40 and `mom_12_1 < 0` → **EXIT**; quality < 40 otherwise → **TRIM 50%**.
4. weight > 10% → **TRIM** to 10%.
5. sector > 25% → **TRIM** the lowest-quality names in that sector until ≤ 25%.
6. quality ≥ 70, weight < 5%, `pnl > −20%`, `mom_12_1 > 0`, fundamentals fresh
   → **ADD** to 5%.
7. else **HOLD**.
Every action carries a `falsifier`. Unknown fundamentals → `confidence: low`
and the reason says to paste Screener.

### Grading (pre-registered, trial ledger 256–257)
`scripts/grade_thesis.py`, monthly, no token: for every stored thesis, the
holding's close-to-close alpha vs Nifty 50 over **126** and **252** trading
days from `run_date`; hit = (action ∈ {HOLD, ADD}) == (alpha > 0). Deciding
statistic: Fama–MacBeth across-date t on (hit − 0.5) vs the ledger
threshold (3.72). Descriptive only: equal-weight basket of HOLD/ADD names
minus Nifty at 252d. Aggregate goes to `app_config['thesis_track_record']`.
**Promotion bar:** the 252d FM t clears the then-current threshold.

### Dashboard
`/advisor` gets a collapsed section **"Thesis engine (shadow · 12-month)"**
listing action, target weight, qty delta, quality, reason, falsifier, and the
fundamentals as-of date. Reads `indicators.thesis` from the existing API; the
route additionally returns `thesis_track_record`. The Telegram digest is
unchanged until promotion.

## Non-goals / anti-goals
- No change to v1 verdict, score, confidence, trigger, counter-case, grading,
  paper books, or digest. The suite must stay green with no assertion weakened.
- No order path. No new dependency. No schema migration.
- Not a short-horizon predictor; it must never be graded at 10/30 days.

## Files
Brain: `fundamentals.py` (parser + store), `thesis.py` (pure engine),
`portfolio_advisor.run_advisor` (attach), `scripts/ingest_fundamentals.py`,
`scripts/grade_thesis.py`, `scripts/hero_picks.py` (reuse parser), tests.
Dashboard: `app/advisor/page.tsx`, `app/api/advisor/route.ts`.
Docs: TRIAL_LEDGER (256–257), VERIFY (V-24 shadow accrual), PIPELINE [P-47].
