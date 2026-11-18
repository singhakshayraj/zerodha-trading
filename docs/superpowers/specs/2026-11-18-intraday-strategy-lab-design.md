# Intraday Strategy Lab — design

_2026-11-18 · status: **draft, awaiting operator approval** · item: P-70 (to be added to PIPELINE)_

## 1. Intent

The operator started this project to get passive income from automated trading. The
target is ₹500/day net on ₹50,000, with ₹100+/day net as the first milestone that would
build confidence.

The 2026-09-09 decommission stopped the intraday engine at **PF 0.37**. An outside review
(2026-11-18, `reference/INTRADAY_REOPEN_PROMPT.md` + the reply) recommended multi-day
strategies tested on historical data. **The operator chose to reopen intraday paper
trading anyway**, with a different approach to collecting evidence:

- run **many strategies in parallel** on the same live feed;
- generate **thousands of paper trades a month**;
- **watch each strategy's profit factor move day by day**.

The operator lifts the engineering freeze for this. Paper only.

## 2. Goals

1. Run **N pre-registered intraday strategies at once**. Each one has its own virtual
   ₹50,000 MIS book, with realistic charges, slippage and a margin cap.
2. **Target ~1,000–2,000 closed paper trades a _day_** across all strategies (operator,
   2026-11-18). That comes from ~60 variants (7 archetypes × a parameter grid, §5) on a
   Nifty 200 universe.
3. Show a **daily scoreboard** on the dashboard, per strategy and cumulative: trades, net ₹
   after charges, PF, win rate, gross R vs cost R, and a day-clustered t.
4. Apply **pre-registered kill/promote rules**, so a winner is a real one and not a lucky draw.
5. Directly test the cost identity (cost in R ≈ friction ÷ stop width) by including
   strategies with wide intraday stops (1–2%) alongside tight ones.

## 3. Non-goals and anti-goals

- **No real orders.** Live auto-execution needs Kite Connect + SEBI Algo-ID. That is out of
  scope here and is a separate decision after a strategy is promoted.
- **The advisor and its pending reads are untouched.** That covers the n=400 grading, the
  paper books and the thesis engine. The lab must not slow or break the advisor run.
- **No reviving the old monolithic `brain.run_cycle()`.** It is single-strategy, has no
  margin check (peak exposure 7.85×) and is 2,400 lines. We reuse its parts instead.
- **No editing a strategy after it is registered.** A changed rule becomes a new strategy
  id with a fresh count.
- **Anti-goal: a scoreboard that crowns the luckiest of N strategies.** That would be the
  9-of-9-days filter from the post-mortem all over again. Promotion is by the pre-registered
  rule only.

## 4. Constraints

- **Data:** the session token (`enc_token`), pasted daily. TOTP auto-login comes in P-03,
  starting 2026-11-19. Sources are 5-minute candles plus a batch LTP; there is no depth or
  ticks. A missed paste means a lost day, and the scoreboard shows it as such.
- **Kite rate limits:** stay within the existing `market_data` and `kite_client` pacing.
- **Supabase free tier:** 236 of 500 MB used. At 2,000 trades/day × ~0.4 KB that is
  ~0.8 MB/day, or ~17 MB a month.
  - Keep `lab_trades` lean: no JSON blobs, numeric columns only.
  - Never log per-decision rows.
  - After 60 days, archive raw trades older than 60 days to a local Parquet file and keep
    only `lab_daily` in Supabase (§6).
- **Railway:** the lab runs inside the existing brain service as its own thread, active only
  09:15–15:30 IST on trading days.

## 5. How it works (operator-agreed parts)

**Loop (every 5 min, 09:15–15:15 IST).**
- Fetch 5-minute candles once for the universe, then hand the same bars to every strategy.
- Each strategy returns zero or more entries, each with a side, a stop and a target or exit
  rule.
- Exits are checked on every 5-min cycle until 15:10, against each new bar's open/high/low. A retail enctoken has no `/quote/ltp` (it returns 400; finding of 2026-11-18, the first live run), so the price is the latest bar's close. The stop is checked first when a bar holds both levels; a gap past the stop fills at the open, capped at stop − 0.25R.
- Every position is flattened at 15:15.

**Paper book per strategy.**
- ₹50,000 virtual capital, MIS at 5× → gross exposure capped at ₹2,50,000. An entry is
  refused (and counted) if it would breach the cap.
- **Fixed ₹25,000 notional per trade**, so up to 10 concurrent positions per strategy and
  comparable costs across strategies.
- **Charges:** the existing `paper_broker` charge function (Zerodha MIS rates). Update the
  NSE exchange rate to 0.00307% (revised 2026-03-01).
- **Slippage per leg:** 5 bps for Nifty 100 names, 15 bps for the rest, plus the existing
  capped stop/target fill band.

**Strategy roster v1 (pre-registered when shipped).**

| id | idea | stop | exit |
|---|---|---|---|
| `CONF_v1` | the old indicator-confluence engine, used as a baseline (should reproduce ~0.37) | ATR-based, as before | target / stop / 15:15 |
| `ORB_v1` | 15-min opening-range breakout | far side of the range | 1 measured move / 15:15 |
| `ORB_WIDE_v1` | same entry | 1.5% | 15:15 only |
| `GAP_GO_v1` | gap ≥ 1.5% that holds its first 15 min → continue | 1% | 15:15 |
| `GAP_FADE_v1` | gap ≥ 1.5% that fails its first 15 min → fade toward prior close | 1% | prior close / 15:15 |
| `VWAP_REV_v1` | Nifty 100 name ≥ 2×ATR away from VWAP → revert | 1% | VWAP touch / 15:15 |
| `RS_HOLD_v1` | at 10:15, top-5 / bottom-5 by relative strength vs Nifty → long / short | 2% | 15:15 only |

Five of the seven use 1–2% stops, which tests the friction lever directly.

**Variant grid (for 1,000+ trades/day).**
- Each archetype runs in up to 9 variants: **stop width {0.5%, 1%, 2%}** (or the
  archetype's natural stop, ×1 / ×2 / ×4) × **entry threshold {loose, base, strict}**.
  ORB_WIDE and ORB merge into one grid.
- That gives ~60 strategy ids, named like `ORB_s1.0_base_v1`.
- **Per-symbol limit:** each variant may trade a symbol at most 3 times a day.
- ~60 variants × ~15–30 trades each ≈ **1,000–2,000 trades/day**.

**Honest caveat (kept visible on `/lab`):**
- Variants trade the same stocks at the same moments, so their results are highly
  correlated.
- The independent unit is the **trading day**, not the trade. 2,000 trades on 20 days is
  still 20 days of evidence.
- The scoreboard's t-stat therefore uses day-clustered P&L.

**Daily scoreboard (`/lab` page on the dashboard), per strategy:**
- today and cumulative trades;
- net ₹ after all charges;
- PF (net);
- win rate;
- average gross R and average cost R, shown separately;
- day-clustered mean and t;
- trades refused by the margin cap;
- an SPRT status chip (running / killed / promoted);
- a cumulative net-₹ line chart over days.

A header line shows the best strategy by net PF, with its day count and an
"n not yet meaningful" warning until it reaches 300 trades.

**Kill/promote rules (pre-registered, from the outside review §6):**
- **Statistic:** SPRT on per-trade net R, H0 μ=0 vs H1 μ=+0.1R, σ=1.5R, α=0.05/N, β=0.2.
- **Boundaries:** A = ln((1−β)/α), B = ln(β/(1−α)). Λ = (μ₁/σ²)·S − n·μ₁²/(2σ²),
  where S is cumulative net R over n trades.
- **Kill** when Λ ≤ B. With N=60 that is S ≤ 0.05·n − 36.
- **Promote** when Λ ≥ A (with N=60, S ≥ 0.05·n + 155), AND the day-clustered t ≥ 3.72,
  AND PF ≥ 1.3, AND net ₹/day ≥ +100 on the ₹50k book. N = the count of registered
  variants.
- A killed strategy keeps trading on paper (data is cheap) but is greyed out.
- "Promoted" means "worth discussing real money", nothing more.

**Historical replay (pre-registered 2026-11-18, before any replay output).**
- **Data:** github.com/ganeshbiyer/nse_historical_data. It has 1-min bars for ~550 current Nifty
  500 names, 2018–2025. We resample them to 5-min, on the Mac only (`zerodha-brain/scripts/lab_backtest.py`).
- **Engine:** the same `lab.py` / `lab_book` / `lab_strategies` code that runs live.
  - A fake Kite serves only fully closed bars.
  - Storage is in memory; prod is never touched.
- **Universe:** point in time, the top 200 by the prior 20-session traded value.
  - A symbol is excluded for 20 sessions after any overnight gap of more than 25% (a corporate action or a
    data break).
- **Window:** 2018-03 → 2025-12. The same 54 frozen variants, with no tuning.
- **A variant passes history only if every one of these holds:**
  - over the full window: the SPRT state is `promoted` (N=54), the day-clustered t ≥ 3.72,
    PF ≥ 1.3, and mean net ≥ ₹100 per replay day;
  - **and** net ₹ is > 0 in each of the 3 blocks 2018-03→2020-12, 2021→2022 and 2023→2025.
- Passing history is not a promotion. The variant still has to pass the live rule above.
- **Known biases:**
  - Survivorship: names that collapsed and left the index are missing. This flatters longs.
  - The in-progress bar is dropped. This is conservative: live sees 30 s more.
  - Only one data source.

## 6. Storage (new tables)

- **`lab_strategies`:** id, version, rule text, params JSON, registered_at, spec hash.
- **`lab_trades`:** strategy_id, symbol, side, entry/exit ts + price, qty, stop, target,
  exit_reason, gross ₹, charges ₹, slippage ₹, net ₹, gross R, cost R, net R.
- **`lab_daily`:** date × strategy_id aggregates. Written at 15:20; the scoreboard reads
  these.
- **`lab_refusals`:** date × strategy_id × reason counts (margin cap, rate limit, no data).

Service-role-only RLS, like the other tables. The dashboard reads through its API behind
the existing `DASHBOARD_PASSWORD` gate.

## 7. Left to the builder

- **Universe (decided):** Nifty 200 by market cap, from the Nifty 500 pin.
  - That is 200 candle fetches every 5 minutes, or ~0.7 req/s, inside Kite's
    historical-API limit.
  - Slippage is 5 bps for the top 100 and 15 bps for the next 100.
- **Reuse vs re-implement:** reuse `indicators`, `orb`, `inplay`, `market_data`,
  `kite_client` and the `paper_broker` charges. Decide how much of `signal_engine` `CONF_v1`
  can call unchanged.
- **Thread structure and error isolation:** a lab exception must never kill the scheduler
  loop.
- **Exact shape of the SPRT/scoreboard code and the page layout:** follow the existing
  `/pnl` and `/advisor` style.
- **Docs, owed in the same change:** PIPELINE P-70, a STATUS line, VERIFY rows (trades
  landing, charges reconcile with `paper_broker`, margin cap never exceeded), and `/learn`
  (behaviour change).

## 8. Success, plainly

- **Week 1:** all ~60 variants trade on every day with a pasted token, there are ~1,000+
  trades a day, and the scoreboard updates by 15:30.
- **Month 1:** ~20,000+ trades, with each variant's net PF visible and moving.
- **Real success:** a strategy is promoted by §5's rule. Given the post-mortem, the most
  likely outcome is that none is, and the lab will show that clearly instead of hiding it.
