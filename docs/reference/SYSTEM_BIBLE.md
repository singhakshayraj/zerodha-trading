# SYSTEM BIBLE — complete reference for the Zerodha paper-trading system

**Generated 2026-08-27.** Every number here was read from the live database or
the source tree at that moment, not recalled. Where something is unproven,
unverified or contradicted by evidence, it says so — this document is intended
to be handed to another model for architectural critique, and flattering it
would defeat the purpose.

**Contents**
1. [What this system is, and its honest verdict](#1)
2. [Physical architecture](#2)
3. [The intraday trading loop, end to end](#3)
4. [The portfolio advisor subsystem](#4)
5. [Data model — every table](#5)
6. [Configuration surface — every flag](#6)
7. [Brain module reference — every file](#7)
8. [Dashboard reference — every page, route, component](#8)
9. [Scripts and offline tooling](#9)
10. [Measurement and verification discipline](#10)
11. [What has been proven and disproven](#11)
12. [Known defects, open items, and decisions owed](#12)
13. [Operational runbook](#13)
14. [House rules and conventions](#14)
15. [Glossary](#15)

---

<a id="1"></a>
## 1. What this system is, and its honest verdict

### 1.1 Purpose

An automated intraday equity trading system for the Indian market (NSE), run
against a Zerodha retail account. It has two largely independent halves:

- **The intraday engine ("the brain")** — scans a universe, generates BUY/SELL
  signals, sizes positions, places (currently simulated) orders, manages stops
  and targets, and closes everything by session end. Trades are **paper only**.
- **The portfolio advisor** — a daily HOLD / TRIM / SELL read on the user's
  **real** long-term holdings, plus rotation suggestions across the Nifty 500.
  Advisory only; it never places an order.

The stated goal is a month-long paper validation run to decide whether the
engine is worth trading with real money, judged against explicit go/no-go
gates.

### 1.2 The verdict, stated plainly

Measured on the live database on 2026-08-27:

| Metric | Value |
|---|---|
| Total trades | **914** (832 carry an `r_multiple`) |
| Profit factor | **0.365** |
| Expectancy | **−0.425R** per trade |
| Win rate | **23.4%** |
| Net P&L | **−₹50,849** (on ₹100,000 deployed, paper) |
| Session days | 29 |
| Completed sessions | 34 |
| Decisions logged | 32,145 |
| Counterfactually labelled decisions | 9,281 |
| Graded advisor calls | 98 |
| Database size | 108 MB (of a 500 MB free tier) |

**The engine loses money and no edge has been found.** This is not a
provisional state pending more tuning; it is the result of repeated, deliberate
attempts to find an edge, all of which failed (see §11). A profit factor of
0.365 means the system returns 36.5 paise for every rupee it risks and loses.

The system's *engineering* is in good order — it runs, recovers, measures
itself, and its failures are visible. Its *strategy* has no demonstrated edge.
Those two facts should be held separately when reading everything below.

### 1.3 The single biggest operational constraint

**Token acquisition.** Zerodha's `enc_token` expires daily (measured flush at
~04:34 IST) and must be manually pasted before the session can start.
Measured uptime: **29.2% lifetime, 45.2% since 2026-07-10**. Recent sessions
started 1.25–2.75 hours after the 09:15 open, purely because of paste timing.

A headless TOTP auto-login exists (`token_refresher.py`) and is **dormant by
user decision**. Autopilot self-start is built and enabled (`AUTOPILOT=true`),
firing at 09:30 — it simply finds no token and retries until one appears.

---

<a id="2"></a>
## 2. Physical architecture

### 2.1 Deployment topology

```
┌──────────────────────────────────────────────────────────────────┐
│ RAILWAY (one Docker image, role-dispatched by main.py)           │
│                                                                  │
│   SERVICE_ROLE unset → THE BRAIN                                 │
│     scheduler.run() → trading loop, advisor, data jobs,          │
│     heartbeat thread (30s), autopilot, background catch-ups       │
│                                                                  │
│   SERVICE_ROLE=watchdog → WATCHDOG                               │
│     independent process; polls brain_heartbeat + app_config,      │
│     alerts to Telegram on stale heartbeat / token / silence       │
└───────────────────────────┬──────────────────────────────────────┘
                            │  Supabase client (service key)
                            ▼
              ┌──────────────────────────────┐
              │ SUPABASE POSTGRES 17.6       │
              │ project gilmuwmtdpjccibfhqtx │
              │ 21 tables, 108 MB, FREE tier │
              │ timestamps UTC (IST = +5:30) │
              └───────────┬──────────────────┘
                          │ PostgREST + service key
                          ▼
              ┌──────────────────────────────┐
              │ VERCEL — Next.js dashboard   │
              │ 10 pages, 29 API routes      │
              │ App Router, Zustand store    │
              └───────────┬──────────────────┘
                          │ x-enc-token header
                          ▼
              ┌──────────────────────────────┐
              │ ZERODHA KITE (kite.zerodha   │
              │ .com/oms) — retail enctoken  │
              │ auth, NOT the paid API       │
              └──────────────────────────────┘
```

### 2.2 The two repositories

| Repo | Path | Stack | Role |
|---|---|---|---|
| **zerodha-brain** | `~/Desktop/GITHUB/zerodha-brain` | Python 3.9 | Decision engine, advisor, data jobs, watchdog. 48 modules, 76 test files, **965 tests passing**. |
| **zerodha-trading** | `~/Desktop/GITHUB/zerodha-trading` | Next.js / TypeScript | Dashboard, API layer, all documentation. |

### 2.3 A critical auth detail that shapes everything

The system authenticates with a **retail `enc_token`** scraped from a browser
session, not Zerodha's paid Kite Connect API (₹500/month, deliberately not
purchased). Consequences that propagate through the whole design:

- **`/quote` is unavailable.** Live index quotes cannot be read. This is why
  `nifty_level_at_decision` is always 0, and why market direction is
  reconstructed from the universe itself (`_market_context`) rather than read
  from the index.
- **Historical candles DO work** (`/instruments/historical/{token}/{interval}`),
  capped by Kite at **2000 days**.
- The token dies daily and cannot be renewed programmatically without TOTP.

---

<a id="3"></a>
## 3. The intraday trading loop, end to end

### 3.1 Session lifecycle

```
04:34 IST   Zerodha flushes enc_token (measured)
~09:00      USER pastes token at /connect  ── the binding constraint
09:15       Market opens
09:30       Autopilot window opens: _should_autostart() checks
              trading day + 09:30–15:20 + no session today
            → creates trading_sessions row, status RUNNING
            → writes brain_instance_id (single-owner lock)
            → starts heartbeat thread (30s cadence)
            → _grade_advice_catchup(), _label_decisions_catchup()
09:30       data_jobs.maybe_lock_inplay() — ranks candidates by opening-range
              RVOL, writes inplay_list, LOCKED for the day
09:20+      Portfolio advisor runs (once/day, official batch)
every 300s  TRADING CYCLE (see 3.2)
15:20       Session end: close all positions, status COMPLETED,
              end_reason MARKET_CLOSED, clear active_session_id
15:40–16:30 data_jobs archives the traded day's candles (post-close, NOT in
              the exit path — doing it inline cost ~7s/cycle and filled stops
              at −2.78R instead of ≈−1R)
```

### 3.2 One trading cycle

```
1. DATA QUALITY GATE (data_quality.py, REQ-050 step 0)
     stale quotes, missing bars → skip the cycle rather than trade blind

2. MARKET CONTEXT (brain._market_context)
     Each universe stock's day change = (live − prior-day close) from the
     level pack's PDC. Yields direction, breadth, advancers/decliners.
     Replaced a dead stub that always returned SIDEWAYS — that stub was the
     cause of 2026-07-08's shorts into a rising tape, and has been deleted.
     Per-stock moves beyond MARKET_MAX_STOCK_MOVE_PCT are dropped as bad data;
     fewer than MARKET_BREADTH_MIN_SAMPLES clean stocks → low_confidence.

3. REGIME DETECTION (regime_detector.py, market_regime.py)
     ADX + ATR → TRENDING / CHOPPY / HIGH_VOLATILITY_PANIC / QUIET.
     Regime reweights the advisor's score ONLY in HIGH_VOLATILITY_PANIC.

4. EVENT POLICY (event_calendar.py, REQ-053)
     Weekly/monthly expiry → NORMAL | RAISE_BAR | STAND_ASIDE.

5. CANDIDATE SELECTION
     inplay_list (locked at 09:30) ∪ holdings ∪ NIFTY50 universe

6. PER-SYMBOL SIGNAL (signal_engine.py)
     Indicators (indicators.py): EMA 9/21/50/200, RSI-14, MACD, Bollinger,
     ATR-14, ADX + DI, VWAP, volume SMA.
     Archetypes: ORB (orb.py, opening-range breakout).
     Gates: trend tells (trend_tells.py, REQ-052 — gap hold, VWAP
     persistence, range expansion, breadth/sector; N of 4 required),
     level filter (levels.py — refuse entries too close to a known level).
     Thresholds are LIVE-TUNABLE via config.get_tunable() reading app_config
     'tunables' JSON: MIN_BUY_CONFIDENCE (70), MIN_SELL_CONFIDENCE (60),
     MIN_RISK_REWARD_RATIO (2.0), ADX_TRENDING/WEAK_THRESHOLD.

7. RISK SIZING (risk_manager.py)
     Kelly when ≥10 historical trades AND a target exists:
       f = w − (1−w)/b ; risk = capital × max(0, f × 0.33)
     With live inputs (w=0.234, planned b=2.08) f = −0.134 → clamps to 0 →
     falls back to FIXED 1% of capital. Kelly is therefore DORMANT, correctly:
     it needs w > 32.5% to fire.
     Caps: MAX_POSITION_PERCENT 0.40 (binding — largest real position was
     ₹40,033 = 40.0% of ₹100,000), MIN_POSITION_VALUE ₹2,000,
     MAX_TRADES_PER_CYCLE 3.

8. EXECUTION (paper_broker.py — PAPER_TRADING=true)
     Simulated fill at LTP ± PAPER_SLIPPAGE_PCT, then real Zerodha intraday
     charges folded adversely into the fill price so they flow through P&L
     with no schema change.

9. EXIT MANAGEMENT (brain._evaluate_exit, ~30s poll)
     LONG:  price ≤ stop → STOP_LOSS_HIT ; price ≥ target → TARGET_HIT
     SHORT: price ≥ stop → STOP_LOSS_HIT ; price ≤ target → TARGET_HIT
     Then time stop (TIME_STOP_MIN 40 / SHORT 25), flag-gated.
     Both stop and target fills are MODELLED, not taken raw from the poll —
     see 3.3.

10. RISK STOPS (risk_manager.check_*)
     −3R daily stop (DAILY_STOP_R), max loss %, max profit %, max trades,
     circuit breaker on 3 consecutive losses.
     Under DATA_COLLECTION_MODE these become LOGGED COUNTERFACTUALS so the
     session keeps accruing data — EXCEPT the −3R daily stop, which stays
     HARD because overriding it was measured to bleed money.
```

### 3.3 The fill model (important, and subtle)

The exit checker polls roughly every 30s, so a breach is only noticed after
price has already moved past the level. Booking that polled price charges
poll latency to the strategy.

- **Stops** ([P-05]): fill capped `PAPER_STOP_SLIPPAGE_CAP_R` (0.25R) past the
  stop. Measured effect: STOP_LOSS_HIT went **−1.622R → −1.261R**.
- **Targets** (2026-08-27): the identical artifact on the gain side was
  uncapped until this date. Now mirrored — fill no worse than target ∓ 0.25R,
  and **never better than the target**, modelling a resting limit order.

Both are pre-capped in `brain`, so `paper_broker` must not re-apply
`PAPER_SLIPPAGE_PCT` on top (the `model_stop` flag prevents that double count).

**Honest note on the target cap:** the commit that shipped it argued it would
*recover* understated gain. A replay of 222 real trades showed the opposite —
it also clamps overshoots, and on this history those dominate:

| exit | n | mean R change | worst |
|---|---|---|---|
| STOP_LOSS_HIT | 149 | +0.117 | +0.000 |
| TARGET_HIT | 73 | **−0.062** | −2.043 |

The change stands on *realism* (a resting limit fills at its limit), not on the
effect size, and it now errs toward understating performance.

### 3.4 Exit-reason distribution (all 832 trades with R)

| exit_reason | n | avg R | total R | avg MFE | avg MAE |
|---|---|---|---|---|---|
| COVER_SHORT | 285 | −0.358 | −102.0 | +0.312 | −0.696 |
| BRAIN_SIGNAL | 200 | −0.655 | −131.0 | +0.089 | −0.719 |
| STOP_LOSS_HIT | 148 | −1.330 | −196.8 | −0.516 | −1.430 |
| SESSION_END | 88 | −0.198 | −17.4 | +0.416 | −0.489 |
| **TARGET_HIT** | 73 | **+1.410** | +102.9 | +1.624 | −0.029 |
| EOD_CLOSE | 38 | −0.241 | −9.2 | +0.522 | −0.579 |

Planned reward:risk is **2.08** on every trade; realised is **+0.991R win /
−0.850R loss ≈ 1.17**. The gap between plan and fill is ~97.7R of the 353.5R
total loss (**27.6%**).

---

<a id="4"></a>
## 4. The portfolio advisor subsystem

Advisory only. Never places an order. Operates on the user's **real** holdings.

### 4.1 Scoring (`advisor_scoring.py`, 692 lines)

`trend_score(ind, closes, ...) → [−100, +100]`, seven hand-picked factors:

| Factor | Weight |
|---|---|
| Price vs EMA200 | ±20 |
| Price vs EMA50 | ±15 |
| Trend consistency (% of last 20 closes above EMA50) | ±15 |
| 20-bar momentum (capped at ±6%) | ±20 |
| ADX directional pressure (only when ADX ≥ 20) | ±10 |
| Relative strength vs Nifty (20-day) | ±20 |
| News sentiment | ±10 |

`advise()` is **pure — no I/O, no orders**. This property is what makes the
offline replay labs (§9) possible at all.

Verdicts: **HOLD / TRIM / SELL / SELL_ON_BOUNCE / INSUFFICIENT**.

Also emitted, deliberately **not scored** ("dark flags" — logged so they can
earn a weight from live evidence rather than plausibility):
- `weekly_trend` / `daily_weekly_alignment`
- **`mom_12_1`** — 12-month return skipping the last month (Jegadeesh &
  Titman 1993), added 2026-08-27
- `counter_case` — an explicit bear case for every verdict ([P-33])

### 4.2 Grading (`advisor_backtest.py`, 460 lines)

Horizons by trigger type: **MICRO 10 trading days, MACRO 30**.

```python
if verdict == 'HOLD':            correct = forward_return_pct > 0
elif verdict in EXIT_VERDICTS:   correct = forward_return_pct < 0
```

**⚠️ This label is market-confounded.** It judges on *absolute* return, so in a
rising tape every HOLD scores correct regardless of quality.
`outcome_vs_nifty_pct` — the market-neutral version — is computed and stored by
the same grader and then never used for correctness. On the same 98 calls:

| label | hit rate | AUC |
|---|---|---|
| absolute (stored) | 0.480 | 0.4917 |
| alpha vs Nifty | **0.551** | 0.5133 |

Per verdict, the two disagree about which calls work:

| verdict | n | hit rate | avg alpha |
|---|---|---|---|
| HOLD | 45 | 0.467 | +0.04 |
| SELL | 30 | 0.467 | **−0.36** (right in alpha terms) |
| TRIM | 22 | 0.545 | **+0.47** (wrong in alpha terms) |
| SELL_ON_BOUNCE | 1 | 0.000 | +2.52 |

**Which label is authoritative is an open decision.** Nothing has been rewired.

### 4.3 Other advisor components

| Module | Role |
|---|---|
| `portfolio_advisor.py` (615) | Orchestration; `run_advisor()` official batch, `score_universe()` Nifty-500 scan |
| `advisor_rotation.py` (128) | Rotation targeting + sizing — sell weak, buy stronger |
| `advisor_risk.py` (246) | Whole-book concentration and measured return-correlation |
| `advisor_paper.py` (354) | Two paper books — **PICKING** (does it choose well?) and **MANAGEMENT** (does acting on it beat holding?) |
| `advisor_digest.py` (116) | Telegram digest with inline Accept/Decline |
| `advisor_bot.py` (148) | Records the Accept/Decline taps |
| `advisor_watch.py` (126) | Intraday push when a real holding moves hard |
| `user_executions.py` (211) | [P-25] what the user *actually did* vs what was advised |

---

<a id="5"></a>
## 5. Data model — every table

21 tables, 108 MB. Timestamps are UTC.

### 5.1 `brain_decisions` — 32,145 rows, 49 MB (largest)
Every evaluation, traded or not. This is the counterfactual record.
`id, session_id, trade_id, symbol, decided_at, price_at_decision,
nifty_level_at_decision, time_of_day_bucket, indicators jsonb, signal,
confidence_score, reasons text[], skip_reasons text[], created_at`

`indicators` averages **1,100 B of a 1,344 B row** — 82% of the table, ~36% of
the whole database. Composition: `orb` 296 B, `trend_tells` 243, `market_context`
232, `timing` 193, `news_context` 93, `event_policy` 92, `level_snapshot` 87,
~20 scalars at ~22 B each.

### 5.2 `brain_activity` — 47,273 rows, 23 MB
Human-readable event log. `id, session_id, activity_type, symbol, message,
data jsonb, created_at`. Pruned by `prune_activity()`.

### 5.3 `portfolio_advice` — 6,346 rows, 13 MB
Advisor verdicts, official batches and intraday snapshots.
`id, run_date, created_at, symbol, quantity, avg_price, last_price,
pnl_percent, breakeven_gain_pct, verdict, confidence, trend_score,
reasons jsonb, stop_level, exit_target, indicators jsonb,
rotation_target_symbol, rotation_target_score, rotation_reason, evaluated_at,
outcome_return_pct, outcome_vs_nifty_pct, outcome_correct, market_regime,
trigger_type, evaluation_horizon_days, rotation_sell_qty, rotation_freed_inr,
rotation_buy_qty, rotation_buy_price, user_decision, decided_at, is_official,
run_id, counter_case`

`is_official = true` → the graded daily batch. `false` → intraday snapshots
(≈5,361 rows), never graded by design.

### 5.4 `candles` — 40,647 rows, 13 MB
5-minute OHLCV archive. **Unique on `(symbol, interval, ts)`** — already
market-wide keyed, so `session_id` is provenance, not identity.
`id, symbol, exchange, interval, ts, trade_date, open, high, low, close,
volume, session_id, created_at, updated_at`

### 5.5 `decision_outcomes` — 9,281 rows, 2.5 MB
Track C counterfactual labels: what WOULD have happened to every directional
decision. `id, decision_id, symbol, run_date, direction, entry_price,
stop_price, target_price, exit_price, exit_reason, r_multiple, outcome,
bars_used, evaluated_at`

### 5.6 `trades` — 914 rows, 1.4 MB
`id, session_id, symbol, exchange, source, entry_order_id, entry_time,
entry_price, quantity, entry_value, exit_order_id, exit_time, exit_price,
exit_value, exit_reason, pnl, pnl_percent, is_winner, stop_loss_price,
target_price, risk_reward_ratio, status, created_at, position_type, regime,
confidence_score, updated_at, r_multiple, decision_to_order_ms, mfe_r, mae_r,
execution jsonb, exit_state jsonb`

### 5.7 `stock_universe` — 505 rows, 2.3 MB
Nifty 500 registry + per-symbol performance + latest advisor score.
Current-state only, **no history** — the universe scan leaves no time series.

### 5.8 Remaining tables

| Table | Rows | Purpose |
|---|---|---|
| `stock_observations` | 1,104 | Per-stock always-on observation timeline (`stock_agent.py`) |
| `quote_snapshots` | 480 | Per-cycle price snapshot (`session_id, cycle, prices jsonb`) |
| `level_pack` | 1,043 | Per-symbol daily levels: PDH/PDL/PDC, gaps, round numbers, ATR14, 20-day volume curve, weekly high/low |
| `news_events` | 162 | Marketaux headlines + sentiment |
| `stock_profile` | 444 | Weekly per-stock trendiness, gap-follow rate, range profile |
| `tradebook` | 215 | Imported real Zerodha tradebook |
| `market_context` | 309 | Per-cycle market snapshot (index level, breadth, VIX, realized vol) |
| `user_executions` | 35 | What the user really did vs advice |
| `inplay_list` | 54 | Daily locked candidates — **unique `(date, symbol)`**, rank, or_rvol, gap_pct, OR high/low, locked_at |
| `advisor_paper_positions` | 42 | Paper book positions (PICKING / MANAGEMENT) |
| `advisor_paper_equity` | ~10 | Daily equity curve per book |
| `trading_sessions` | 89 | Session records + `config_hash`, `git_sha` |
| `app_config` | 19 | **Singleton control plane**, PK is bare `key` |
| `brain_heartbeat` | 1 | Literal one-row singleton (`id = 1`) |

### 5.9 `app_config` keys (the control plane)

`enc_token`, `token_updated_at`, `token_incident`, `token_probe_log`,
`active_session_id`, `brain_status`, `brain_instance_id`, `paper_mode`,
`session_config`, `advisor_run_now`, `advisor_digest_date`,
`advisor_calibration_latest`, `advisor_paper_seed_mgmt`,
`advisor_paper_seed_pick`, `portfolio_risk_latest`, `deploy_incident`,
`experiment_cursor`, `profiles_week`, `advisor_bot_offset`, `tunables`

`session_config` currently: `{"capitalDeployed":100000, "maxTrades":40,
"maxLossPercent":5, "maxProfitPercent":15, "tradeIntervalSeconds":300,
"stockUniverse":"NIFTY50", "experimentCell":"NIFTY50"}`

---

<a id="6"></a>
## 6. Configuration surface — every flag

`config.py` is 723 lines, **85 `os.getenv` calls**, 126 module constants.

### 6.1 Currently set on Railway
`AUTOPILOT=true`, `PAPER_TRADING=true`, `DATA_COLLECTION_MODE=true`,
`ADVISOR_BACKTEST_ENABLED=true`

### 6.2 The enforced risk limits (and only these)

| Constant | Value | Enforced where |
|---|---|---|
| `RISK_PER_TRADE_PCT` | 1.0 | `risk_manager` sizing |
| `MAX_POSITION_PERCENT` | **0.40** | `risk_manager` hard cap — binding |
| `MIN_POSITION_VALUE` | ₹2,000 | `risk_manager` floor |
| `DAILY_STOP_R` | 3 | Hard even under data-collection mode |
| `MAX_TRADES_PER_CYCLE` | 3 | Per-cycle burst cap |
| `CIRCUIT_BREAKER_CONSECUTIVE_LOSSES` | 3 | Risk manager |

Three constants (`MAX_RISK_PER_TRADE_PERCENT`, `MAX_POSITION_SIZE_PERCENT=20`,
`MIN_TRADE_VALUE=1000`) sat here reading as authoritative and were wired to
nothing; the 20% one advertised half the real 40% cap while the *average*
position was already 26.9%. Deleted 2026-08-27.

### 6.3 Flag groups

- **Auth/infra** — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `KITE_USER_ID`,
  `KITE_PASSWORD`, `KITE_TOTP_SECRET`, `GIT_SHA`
- **Mode** — `AUTOPILOT`, `QA_MODE`, `PAPER_TRADING`, `DATA_COLLECTION_MODE`,
  `TRADING_MODE_FORCE`
- **Signal gates** — `TREND_TELLS_REQUIRED`, `VWAP_PERSISTENCE_FRAC`,
  `RANGE_EXPANSION_THRESHOLD`, `LEVEL_FILTER_ENABLED`, `LEVEL_STOPS_ENABLED`,
  `LEVEL_PROXIMITY_BLOCK_R`, `LEVEL_STOP_BUFFER_FRAC`, `ORB_ENABLED`,
  `ORB_BREAK_BUFFER_FRAC`, `ORB_MIN_CONFIDENCE`
- **Universe/pacing** — `INPLAY_CAP`, `INPLAY_FALLBACK_TOP_N`,
  `RVOL_THRESHOLD`, `STALE_QUOTE_MAX_S`, `MAX_SYMBOLS_PER_QUOTE`,
  `QUOTE_REQUEST_DELAY_MS`
- **Exits** — `TIME_STOP_MIN` 40, `TIME_STOP_MIN_SHORT` 25,
  `TIME_STOP_ENABLED`, `REENTRY_COOLDOWN_ENABLED/MIN`,
  `TRADE_ONLY_OPEN_ENABLED`, `OPEN_WINDOW_END_HOUR/MIN`
- **Paper fills** — `PAPER_SLIPPAGE_PCT` 0.05, `PAPER_STOP_SLIPPAGE_CAP_R` 0.25,
  `PAPER_TARGET_SLIPPAGE_CAP_R` 0.25
- **Data collection** — `DATA_MAX_TRADES_PER_DAY`, `..._PER_SYMBOL`,
  `..._NEW_TRADES_PER_HOUR`, `DATA_UNIVERSE_ROTATION_N`
- **Regime** — `REGIME_ADX_TREND/CHOP`, `REGIME_ATR_PANIC_PCT/QUIET_PCT`
- **Rotation** — `ROTATION_MAX_EXIT_SCORE`, `ROTATION_MIN_TARGET_SCORE`,
  `ROTATION_MIN_GAP`, `ROTATION_MIN_GAP_CHOPPY`
- **Advisor** — `ADVISOR_RUN_AFTER_IST`, `ADVISOR_PREFLIGHT_IST`,
  `ADVISOR_BACKTEST_ENABLED`, `ADVISOR_BACKTEST_HORIZON_DAYS` 10,
  `ADVISOR_BACKTEST_MACRO_HORIZON_DAYS` 30, `ADVISOR_PAPER_ENABLED`,
  `ADVISOR_PRICE_SMOOTHING_ENABLED`
- **News** — `NEWS_ENABLED`, `MARKETAUX_API_KEY`, `NEWS_FETCH_INTERVAL_MIN`
- **Telegram** — `ADVISOR_TELEGRAM_BOT_TOKEN`, `ADVISOR_TELEGRAM_CHAT_ID`

### 6.4 Live-tunable knobs (REQ-030)

`get_tunable(key)` reads `app_config.tunables` JSON, 60s TTL cache, falls back
to the compiled default, coerces type, fails safe. Whitelist:
`MIN_BUY_CONFIDENCE` 70, `MIN_SELL_CONFIDENCE` 60, `MIN_RISK_REWARD_RATIO` 2.0,
`ADX_TRENDING_THRESHOLD`, `ADX_WEAK_THRESHOLD`.

**Risk-sizing and stop knobs are deliberately excluded** — nothing mutable at
runtime may relax the money path.

### 6.5 Boot interlocks (`assert_safe_boot`)

Refuses to start on: `QA_MODE=true` against the production Supabase project, or
`DATA_COLLECTION_MODE=true` without `PAPER_TRADING=true`.

---

<a id="7"></a>
## 7. Brain module reference — every file

| Module | Lines | Responsibility |
|---|---|---|
| `brain.py` | 2,400 | `TradingBrain` — the cycle, entries, exits, `_market_context`, `_stop_fill_price`, `_target_fill_price`, `_exit_fill_price`, `_evaluate_exit`, `_cover_short`, `_execute_sell_by_trade` |
| `scheduler.py` | 1,078 | Process loop, session lifecycle, autopilot, heartbeat thread (30s), instance lock, advisor triggers, background catch-ups. ~15 module-level globals hold per-account state |
| `config.py` | 723 | All flags, tunables, boot interlocks |
| `advisor_scoring.py` | 692 | `trend_score`, `advise` (pure), `momentum_12_1`, `build_counter_case`, weekly trend, swing levels |
| `portfolio_advisor.py` | 615 | Advisor orchestration, `run_advisor`, `score_universe` |
| `database.py` | 594 | Supabase client, config get/set, `get_win_rate` (server-side counts), health/degraded tracking |
| `db_records.py` | 566 | Decision/quote/candle writes, `INDICATOR_DENYLIST`, `_is_default_event_policy` sparse drop, `prune_activity` |
| `db_stocks.py` | 479 | Universe, observations, levels, advice snapshots, `get_candles_for_symbol_from` |
| `advisor_backtest.py` | 460 | `evaluate_verdict`, `run_backtest_pass`, `factor_attribution`, calibration bins |
| `backtest.py` | 390 | Gate #6 harness; `decision_fidelity_replay` (§6.2 interface, deliberately uncalled) |
| `indicators.py` | 356 | `run_all_indicators` + every individual indicator |
| `advisor_paper.py` | 354 | Two paper books |
| `market_data.py` | 322 | Kite candle/quote access, `_get_historical` windows, instrument cache, token verification |
| `risk_manager.py` | 296 | Position sizing, Kelly, all risk stops, circuit breaker |
| `data_jobs.py` | 292 | Level pack at session start, in-play lock at 09:30, candle archive post-close, activity pruning |
| `signal_engine.py` | 275 | `generate_signal` — the entry decision |
| `watchdog.py` | 270 | Independent alerting service (Tier 1) |
| `kite_client.py` | 253 | Raw Zerodha OMS HTTP client |
| `advisor_risk.py` | 246 | Portfolio concentration + correlation |
| `trading_principles.py` | 237 | Encoded trading rules |
| `order_manager.py` | 230 | Real order placement (unused while paper) |
| `user_executions.py` | 211 | Real-money accountability |
| `paper_broker.py` | 204 | Simulated fills + real charge modelling |
| `news_jobs.py` | 196 | Marketaux collector |
| `qa_market.py` | 185 | Synthetic market for off-hours rehearsal |
| `regime_detector.py` | 156 | ADX/ATR regime classification |
| `advisor_bot.py` | 148 | Telegram tap handling |
| `trend_tells.py` | 145 | REQ-052 mechanical trend-day tells |
| `logger.py` | 141 | Axiom structured logging + stdout fallback |
| `level_pack.py` | 132 | Nightly level computation |
| `advisor_rotation.py` | 128 | Rotation targeting/sizing |
| `advisor_watch.py` | 126 | Intraday holdings watch |
| `decision_outcomes.py` | 123 | `_walk_forward`, `label_one`, `label_decisions_for_date` |
| `token_refresher.py` | 117 | TOTP auto-login — **dormant by decision** |
| `advisor_digest.py` | 116 | Telegram digest |
| `stock_agent.py` | 113 | Per-stock observation timeline |
| `levels.py` | 109 | Level filter + level-anchored stops |
| `inplay.py` | 100 | In-play ranking, `opening_range_stats` |
| `stock_profile.py` | 98 | Weekly per-stock profile |
| `orb.py` | 93 | Opening-range breakout archetype |
| `market_regime.py` | 86 | Regime → score weights |
| `event_calendar.py` | 83 | Expiry/event policy |
| `db_paper.py` | 80 | Paper book data access |
| `telegram.py` | 76 | Shared send wrapper |
| `data_quality.py` | 47 | REQ-050 step 0 gate |
| `main.py` | 23 | `SERVICE_ROLE` dispatch |

**Tests:** 76 files, **965 passing**.

---

<a id="8"></a>
## 8. Dashboard reference

Next.js App Router. **10 pages, 29 API routes, 6 components, 10 libs.**

### 8.1 Pages

| Route | Lines | Purpose |
|---|---|---|
| `/trading` | 963 | Main console — live positions, controls, activity feed |
| `/learn` | 597 | Teaching page: vocabulary, the loop, how measurement works, findings. Numbers read live from `/api/learn/stats` — deliberately never hard-coded |
| `/autopsy` | 524 | Exit-frontier grid: replays every take-profit × stop-width pairing over real price paths |
| `/advisor` | 516 | Holdings verdicts + `StockLookup` for any Nifty-500 name |
| `/insights` | 513 | Aggregate analytics |
| `/connect` | 505 | Token paste + session bootstrap |
| `/portfolio` | 466 | Real holdings |
| `/advisor/accountability` | 372 | Advisor track record, paper books |
| `/` | 316 | Landing/overview |
| `/advisor/timeline` | 210 | Per-symbol advice history |

### 8.2 API routes (29)

**Advisor** — `/api/advisor` (verdicts), `/accountability`, `/lookup`
(Nifty-500 search + typeahead), `/refresh` (sets `advisor_run_now`, requires
`x-enc-token`), `/timeline`, `/track-record`
**Analytics** — `/api/analytics/insights` (332 lines — the heaviest; collapsed
from nine scalar round trips into one aggregate), `/export`
**Autopsy** — `/api/autopsy` (single `autopsy_dataset` RPC; 2.741s → 0.284s)
**Brain** — `/api/brain/status`, `/activity`, `/decision`
**Trading** — `/api/trade/start`, `/stop`, `/close`, `/record`,
`/open-positions`, `/orders`, `/api/trades/live`
**Sessions** — `/api/sessions`, `/api/sessions/[id]/trades`
**Portfolio** — `/api/portfolio/holdings`, `/funds`, `/positions`
**Connect** — `/api/connect`, `/connect/restore`
**Other** — `/api/market/context`, `/api/learn/stats`, `/api/db/health`

### 8.3 Components and libs

`BrainActivityFeed` (123), `StockLookup` (328 — datalist typeahead, debounced
180ms, full verdict rendering), `OpenPositions` (176), `RiskMeter` (99),
`BrainStatus` (80), `TokenAlert` (61 — **must use raw `fetch`, not the shared
api client, and must skip `/connect`**; the client's 401 interceptor calls
`clearSession()` and would loop, wiping the token being pasted).

`lib/store.ts` (224, Zustand), `lib/types.ts` (214), `lib/exit-replay.ts` (112 —
first-touch ladder for the autopsy), `lib/zerodha.ts` (50), `lib/api.ts` (38 —
axios + the dangerous 401 interceptor), `lib/supabase.ts`, `lib/db-sim.ts`,
`lib/supabase-sim.ts`, `lib/useRefreshOnVisible.ts`, `lib/utils.ts`.

---

<a id="9"></a>
## 9. Scripts and offline tooling

| Script | Purpose |
|---|---|
| `edge_study.py` | Walk-forward entry-edge study with confound controls. **The headline analysis.** |
| `label_decisions.py` | Counterfactually label decisions for a date (no token needed) |
| `grade_advice.py` | Grade due advisor calls on demand (needs token) |
| `advisor_lab.py` | Replays 8 pre-registered scoring-weight variants; per-date Fama-MacBeth IC, non-overlapping windows, chronological holdout, Holm correction |
| `factor_lab.py` | 12 standard cross-sectional factors + composites, z-scored, winsorised, optional sector-neutral |
| `advisor_discrimination.py` | AUC of confidence under both labels — makes the number regenerable |
| `pull_daily_history.py` | Caches daily bars for 500 symbols (median 1,291 bars ≈ 5.2 years) to local pickle |
| `backtest_smoke.py`, `build_level_pack.py`, `build_profiles.py`, `build_nifty500_tokens.py`, `audit_nifty500_tokens.py`, `seed_nifty500_universe.py`, `backfill_user_executions.py`, `pacing_cost.py`, `premarket_pacing.sh`, `deploy.sh` | Supporting tooling |
| `*.sql` | Hand-run migrations and rollbacks |

---

<a id="10"></a>
## 10. Measurement and verification discipline

This is the part of the system that works best, and it is unusual enough to be
worth describing explicitly.

### 10.1 The loop

```
KNOWN_ISSUES  →  PIPELINE  →  (ship)  →  VERIFY  →  PIPELINE
  a finding      gets a P-nn            owes a       PASS → Done
  (K/W/A/B id)   + measurable done      runnable     FAIL → Ready
                                        check
```

**Shipping a fix means registering a check with runnable SQL and a pass
condition stated as a number.** No SQL, no verify — say so explicitly rather
than leaving it vague.

### 10.2 Standing invariants

| ID | Checks |
|---|---|
| I-1 | No duplicate paper exits |
| I-2 | Exit reasons are side-symmetric |
| I-3 | Every closed trade carries its risk unit |
| I-4 | The in-play list locks on session days |
| I-5 | No phantom executions on quiet days |
| I-6 | The Nifty-500 pin matches Kite's live instrument master |
| I-7 | **Every session's decisions are actually labelled** (added 2026-08-27 after finding 647 of 724 unlabelled) |

### 10.3 Open checks

**V-9** (durable no-token trace) NOT-YET · **V-13** (target fills obey the cap
band) NOT-YET · **V-14** (win rate keeps moving past 1,000 closed trades)
NOT-YET · **V-15** (TOAST compression) **FAILED and reverted** — see §11.4.

### 10.4 Discipline rules learned the hard way

- **Never audit a live session** — half the day's rows don't exist yet.
- **Never push while a session is RUNNING** — it restarts the brain and
  truncates the day's data.
- **Production DDL ships as a reviewable `.sql` file**, not applied by an agent.
- A per-day number computed on partial data is worse than no number.

---

<a id="11"></a>
## 11. What has been proven and disproven

This section matters most for anyone proposing improvements: **these avenues
are closed, with measurements.**

### 11.1 There is no entry edge (V-12 / [P-35])

Latest: **+0.009R ±0.027, t = +0.3, n = 2,051**. The rule beats plain SHORT on
12 of 13 days, but the margin equals its cost.

The history is instructive. A filter (short + before 13:00 + strongly trending)
looked like the first real edge: **+0.097R, t = +3.0**, beating plain shorting
9 days out of 9. One more day erased it: the next session scored −0.532R on
that filter and the out-of-sample average fell to −0.003R. Reclassified from
"unstable" to **converged to zero**.

### 11.2 No exit rule rescues it ([P-29] / [P-30])

Every take-profit × stop-width pairing (180 combinations) replayed over real
price paths **with costs set to zero** — none made money. Results varied far
more with stop width than target width, the signature of entries carrying no
directional information.

### 11.3 The advisor's scoring is a dead axis

- **Confidence carries no information.** AUC **0.4917** (0.5133 market-neutral);
  mean confidence 70.3 when right, 69.8 when wrong. Displayed, never fed into a
  decision.
- **Reweighting the seven factors changes nothing.** 8 pre-registered variants,
  43,952 observations, 101 dates: Holm p = 1.000 for all eight, and the entire
  leaderboard spans an IC range of **0.004**.
- **The standard cross-sectional factor set does not survive either.** 12
  factors from published literature (momentum 12-1 and 6-1, short-term reversal,
  52-week-high proximity, low vol, low beta, low idio vol, low max return, low
  skew, Amihud illiquidity, time-series trend, volume growth) + composites, over
  5.2 years, four cuts (10d/30d × plain/sector-neutral): **nothing clears Holm
  in the holdout.**

Two sub-findings worth more than the leaderboards:
- The low-risk family (vol, ivol, max, skew) **flips sign explore → holdout in
  all four cuts, together** — a regime signature, but one split, so recorded as
  an observation, not a result.
- **"Keep what worked" is measurably harmful.** Factors selected on explore and
  scored on holdout are negative in every cut. `amihud`: explore t = **+4.18**,
  holdout −0.0109.

`mom_12_1` was the only factor keeping a positive sign in both periods across
all four cuts, and it ships **dark** — logged, never scored — at IC ≈ 0.022–0.025,
below what 101 dates can certify.

### 11.4 Compression is not a storage lever ([P-41])

Measured in-database with a scratch table and an uncompressed control column,
500 real `indicators` blobs:

| | avg bytes | rows compressed |
|---|---|---|
| uncompressed control | 1,427 | — |
| pglz | 1,431 | **0 of 500** |
| lz4 | 1,431 | **0 of 500** |

Harness validated in the same table: a repetitive blob went 2,015 → 51 B (~97%).
The earlier 42% estimate compressed the JSON **text** form; Postgres stores
**jsonb binary**, which has already stripped the punctuation that made text look
compressible.

### 11.5 Costs are most of the loss but removing them does not save it

Of roughly −0.40R lost per trade, about **−0.24R is transaction costs**. The
zero-cost replay above still loses.

### 11.6 What this leaves

If an edge exists it must be in **which trades are taken at all**, and every
candidate tested there has failed. The design review's standing conclusion:
**"Do not build more analysis. It is the part that is already working."**

---

<a id="11b"></a>
## 11b. External review findings (2026-08-27) — three results that close §11

An external architectural review was run against this document. Three of its
proposed tests were executed; all three are recorded here because each changes
what §11 can claim.

**The deployment branch does not exist.** SEBI circular
`SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/0000013` (2025-02-04) and its September
2025 extension require, from **2026-04-01**, that algorithmic orders carry an
exchange-assigned **Algo-ID** and reach the broker via a
**vendor-client-specific API key on a whitelisted static IP**. Unregistered
API-based strategies are explicitly in scope. This system authenticates with a
scraped retail `enc_token` against `kite.zerodha.com/oms` — outside that
framework, not a lenient corner of it. **Verified independently against SEBI
and NSE sources, not taken on trust.** The go/no-go gates were therefore
answering a question whose "go" branch had already closed.

**The open-window cell is closed.** The review's one identified weakness was
that the ORB thesis lives at 09:30–10:30 IST and that token-paste failures
under-sample exactly that hour. Measured:

| segment | n | mean R | t |
|---|---|---|---|
| all trades | 832 | −0.425 | −12.86 |
| entry 09:30–10:30 IST | **159** | **−0.410** | −4.70 |
| …and session started on time | 86 | −0.411 | −4.31 |

n = 159 against a decision threshold of ~150, mean R = −0.410 against ≤ −0.2.
The open window is neither under-sampled nor better. **"No edge exists in this
approach" needs no narrowing.**

**The benchmark, measured for the first time.** Nothing in this system ever
compared itself to doing nothing:

| 2026-05-19 → 2026-08-26 | |
|---|---|
| Nifty 50 buy-and-hold | **+3.03%** |
| This system (paper) | **−50.85%** |
| **Alpha vs doing nothing** | **−53.88 pp (−₹53,883)** |
| Rupees per operator-hour | **−₹565/h** (~90 sessions, excluding build time) |

**A methodological correction to §11.3:** `pull_daily_history.py` caches the
*current* Nifty 500 constituents, so the factor lab carries **survivorship
bias** — tilted toward finding edge, especially on the long side, and it still
found nothing. The null in §11.3 is therefore **stronger** than stated, and
`mom_12_1`'s IC of 0.022–0.025 is if anything optimistic.

**Actioned:** the real-money order path is now hard-disabled in code
(`order_manager._refuse_live_orders`); arming requires two separate flags.

---

<a id="12"></a>
## 12. Known defects, open items, and decisions owed

### 12.1 Fixed recently (context for reviewers)

- **[C7]** `_get_historical` ignored its `days` parameter for intraday, so
  after a weekend the in-play ranking had fewer than the 2 prior trading days
  it needs for an RVOL baseline. Worked mid-week, **failed every Monday**.
  Verified 2026-08-26 (mid-week); the decisive post-weekend test is **Monday
  2026-08-31**.
- **`get_nifty_level`** — a dead stub always returning SIDEWAYS, the cause of
  2026-07-08's shorts into a rising tape. Deleted.
- **`get_win_rate`** — selected every closed trade and counted in Python;
  PostgREST caps at 1,000 rows and the book is at 914 (+69/session), so it was
  about to silently freeze on the oldest 1,000. Now two server-side counts.
- **`event_policy` sparse drop** compared a dict to the string `'NORMAL'`, so
  it never fired once: 16,229 of 22,463 rows stored ~94 B to say nothing
  happened. The tests passed the string too — **the test agreed with the bug**.
- **Three dead risk constants** deleted (§6.2).
- **`HEARTBEAT_INTERVAL_SECONDS`** — dead *and* wrong (said 60, reality 30),
  adjacent to the watchdog's 150s staleness threshold which is calibrated to
  the real 30s across a service boundary with no binding between them.

### 12.2 Open — blocked on the user

| Item | Decision |
|---|---|
| **[P-38]** | Supabase FREE tier (500 MB) vs growth of ~6.5 MB/session. ~60 sessions of runway. |
| **[P-40]** | De-duplicate `market_context` + `event_policy` out of the per-decision blob (~25–30% of the largest table). Deferred. |
| **[P-26]** | Paper MANAGEMENT seed basis |
| **[P-32]** | Is `stop_level` a thesis invalidation or a suggested stop? They grade differently |
| **[P-04]** | Rotate the Telegram bot token |
| **[P-03]** | TOTP auto-login — deprioritised |
| **Advisor label** | Absolute vs market-neutral grading (§4.2) |

### 12.3 Open — waiting on time

**Monday 2026-08-31** — the post-weekend [C7] test. **V-13, V-14** — need live
sessions. **~2026-09-02** — the next MACRO advisor batch matures, moving graded
calls off 98.

### 12.4 Latent risks recorded but not fixed

- The counterfactual labeller never evaluates the **0–5 minutes** between a
  decision and the next bar open, so a spike-and-revert in that gap is invisible.
- `get_directional_decisions_for_date` paginates hourly with no explicit limit;
  max observed is 235/hour against PostgREST's 1,000 cap, and decision volume
  doubled on 08-26.
- `scheduler.py` holds ~15 module-level globals of per-account state, which is
  what makes multi-tenancy a process-per-account design rather than threads.

---

<a id="13"></a>
## 13. Operational runbook

**Daily, before 09:15 IST:** paste `enc_token` at `/connect`. Everything else
is automatic — autopilot starts the session at 09:30, the advisor runs, grading
and labelling catch up on their own.

**Post-close (after 15:30 IST):** run the audits. Never during a session.

**Deploys:** push to GitHub → Railway auto-deploys. **Never push while a
session is RUNNING.**

**Schema changes:** written to a `.sql` file and run by hand.

---

<a id="14"></a>
## 14. House rules and conventions

- Living docs: `STATUS` (current state), `ROADMAP` (what's next), `PIPELINE`
  (the board), `VERIFY` (open checks), `OPEN_ITEMS` (by owner), `VISION` (why),
  and `/learn` (the in-app explanation). No dated `HANDOFF_*` files.
- **Two ID namespaces:** `K7`/`W2`/`A1`/`B3` are KNOWN_ISSUES findings;
  `P-01`…`P-41` are PIPELINE work items. `K7` is not `P-07`.
- **Changing behaviour means updating `/learn` in the same change.**
- **Dark-flag discipline:** a factor earns a score weight by grading out on our
  own live calls — never on plausibility, never on a backtest.
- Corrections are recorded, not quietly overwritten. Several conclusions in
  this system have been reversed by later data, and the reversals are logged.

---

<a id="15"></a>
## 15. Glossary

**R / R-multiple** — profit or loss in units of the risk taken. −1R = a full
stop loss. Makes trades of different sizes comparable.
**Expectancy** — average R per trade. The single most important number.
**Profit factor (PF)** — gross wins ÷ gross losses. Below 1.0 = losing.
**MFE / MAE** — maximum favourable / adverse excursion: the best and worst the
trade ever looked before it closed.
**IC (information coefficient)** — rank correlation between a score and the
forward return. ~0.03+ is a real signal at this sample size.
**AUC** — does a number separate right from wrong at all? 0.5 = coin flip.
Distinct from calibration: a signal that always guesses the base rate is
perfectly calibrated and completely useless.
**Fama-MacBeth** — compute the statistic per date, then t-test across dates.
Prevents 500 names moving together on one day from counting as 500 facts.
**Holm correction** — adjusts for testing many hypotheses. Testing 8 ideas at
p<0.05 finds a "winner" from noise about a third of the time.
**Dark flag** — computed and logged, deliberately not fed into any decision.
**ORB** — opening-range breakout.
**RVOL** — relative volume versus a baseline.
**PDH / PDL / PDC** — previous day high / low / close.
**enc_token** — Zerodha's browser session token; expires daily ~04:34 IST.
**Soft stop** — a risk limit that, under `DATA_COLLECTION_MODE`, is logged as a
counterfactual instead of acted on. The −3R daily stop is exempt and stays hard.
