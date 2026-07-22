# Session Handoff — Paper Trading Infra Setup

Read this first in a new session to resume exactly where we left off.
Companion doc: `docs/VISION.md` — mission, trading fundamentals, risk
limits, pre-run gates, go/no-go criteria. Read that too if the "why" behind
any decision here is unclear; it's the durable reference, this file is the
fast-moving state.

---

## ⭐ CURRENT STATE as of 2026-07-23 — READ THIS FIRST

Everything below this box is historical log. This box is the live summary —
start here, dip into the log only for the "why."

### Track C bug found + fixed: SELL decisions logged wrong-direction stop/target (brain `6948767`)
While building the pacing-cost replay script (below), found `decision_outcomes`
(Track C, shipped 07-15) was silently mislabeling almost every SELL/SHORT
counterfactual as an instant +1.000R win. Root cause: `signal_engine`
always computes long-side levels (stop below price, target above);
`_open_short` correctly inverts them for the real trade, but
`db.log_decision()` logged the pre-invert (wrong-direction) values for
every SELL signal — so `decision_outcomes`'s stop-first walk-forward saw
a "stop" sitting below entry and crossed it almost immediately. **Real
executed trades were never affected** (verified against `trades`:
07-22 SHORT avg stop 1604 > entry 1596 > target 1584, correct) — only the
logged decision snapshot used for counterfactual labeling. Fixed: shared
`_invert_for_short()` now used by both the decision log and `_open_short`
so they can't drift apart again. Backfilled the already-logged 07-22
`brain_decisions.indicators` (965 SELL rows), deleted + relabeled all
965 `decision_outcomes` rows for that date — now a realistic mix of
outcomes instead of a forced sweep. 07-14 decisions stay NO_DATA
regardless (candle-archive bug that day, unrelated, unfixable
retroactively). Suite still 777 green. **Any future SELL-side
`decision_outcomes` that looks too clean (~all `STOP_HIT`/`WIN` at
exactly +1.000R) means this regressed — check `_invert_for_short` is
still wired into the decision-log path.**

### Pacing-cost replay shipped + run (brain `ff8109c`, `scripts/pacing_cost.py`)
Counterfactual-audit §5 was a placeholder ("heavier lift than inline
SQL") — built it as a real, reusable script instead of one-off SQL,
reusing `decision_outcomes.py`'s existing candle walk-forward rather than
duplicating it. Also hit and fixed a silent PostgREST 1000-row page cap
truncating full-day queries in both this script and (implicitly)
anywhere else doing an unpaginated `brain_decisions` scan — worth
remembering if another script starts under-counting.

**Result on 2026-07-22 (only date with both deferred signals AND
candle data — 07-14's 115 deferrals are permanently NO_DATA):**

| Gate | n | total R | ~₹ (approx) | Verdict |
|---|---|---|---|---|
| HOURLY_PACE | 10 | −6.917 | −₹327.54 | **Helped** — blocked a net loser (1W/9L) |
| SYMBOL_DAY_CAP | 12 | +1.800 | +₹85.24 | Cost — blocked a net winner (7W/5L) |
| CYCLE_LIMIT | 8 | +1.353 | +₹64.07 | Cost — blocked a net winner (3W/4L) |

Net across all three: −3.764R (~−₹178) — as a group, deferred signals
that day would have lost money if let through; pacing helped on net,
almost entirely via HOURLY_PACE. n is small (8-12 per gate, one day) —
**not enough to touch the pacing knobs on this alone**, same LOW-CONFIDENCE
bar as the rest of the counterfactual audit. Rupee column is approximate:
this system sizes via Kelly, not flat 1%, so ₹/R isn't constant — used
07-22's own realized avg risk/trade (₹47.35) as the closest available
conversion. Re-run `scripts/pacing_cost.py` after each future clean
session; it accumulates evidence the same way the rest of the audit does.

### Gate #6 backtest harness built (brain `c311f35`) — code done, data blocked
Went after VISION's biggest unstarted gate. Two real findings before any
harness code got written:
- `regime_detector.detect()` always read the wall clock for its intraday
  gates (opening window / no-new-entries / lunch) — meaning a historical
  replay would silently apply TODAY's real time to a simulated 2020 bar.
  Fixed: `regime_detector`/`signal_engine` now take an optional `now`
  override (defaults to wall clock — live behavior unchanged). This was
  a real prerequisite, not scope creep: without it, decision-fidelity
  replay would have been quietly wrong.
- The §8 "LLM Brain backtestability" open question turned out to be moot
  — grepped the whole codebase, zero LLM/Anthropic/OpenAI calls anywhere.
  `regime_detector` is 100% mechanical (ADX + Nifty direction +
  multi-timeframe). Decided (b) from the two options anyway, for if one
  gets built later. Moved from VISION §8 Open to the decision log.

`backtest.py` replays in-play filter → §4.3b tells → signal_engine/ORB
entry → stop/target/time-stop/EOD exit bar-by-bar, reusing the actual
production modules (not a lookalike — decision-fidelity requires shared
code). Supports both entry archetypes (CONFLUENCE, ORB) and both exit
styles (FIXED_TARGET, TRAIL_TO_CLOSE) per gate #6's required comparisons.
Costs via the real Zerodha MIS charge model, sizing via the fixed-1%-risk
path. 11 new tests (walk-forward exit priority, time-stop, trailing-stop
ratchet, PF/drawdown math, regime-period classification, ORB end-to-end).
Suite 777 → 788. Validated against real archived candles (`scripts/
backtest_smoke.py`, INFY 07-22, resampled to 15m/1h) — 0 trades that day
(insufficient prior history for indicators, correctly gated, not a bug).

**What's NOT done and can't be from here**: an actual gate #6 result
needs historical candles, which needs an account-level decision only the
user can make. Evaluated alternatives this session: TradingView (no
official bulk API, only ToS-violating scrapers — ruled out), Fyers
(genuinely free API, but same 100-day-per-request chunking as Kite —
no real advantage once you're already building the chunked puller),
free daily-only sources (NSE bhavcopy/yfinance — insufficient, gate #6's
strategy is intraday). **Decided: Kite Connect** (₹500/mo, no static IP
needed since this is data-only not order placement — confirmed against
Zerodha's current docs) — mainly because it's zero new integration
work given `kite_client.py` already has `get_historical_data()`, and
it's the same auth path VISION already plans for live trading (§3c)
regardless.

**Scope decided: pull everything available, not just 2020/2021/2022.**
Those three were VISION's stated *minimum* (crash/bull/chop coverage,
§5 gate 6's "≥" is a floor not a ceiling) — since the marginal cost of
pulling more years is near-zero once the chunked puller exists, going
back to Kite's actual retention ceiling (unconfirmed — the 100/200/400
day numbers found are the per-request chunk size, not total depth; needs
one empirical test call once a key exists) is worth it. Decided
**against** writing this into the live Supabase `candles` table — tens
of millions of rows expected across the full universe/years/intervals,
real cost/quota risk, and it'd mix backtest data with live paper-session
data. Land it as local Parquet/CSV on the Mac instead, matching VISION's
own "heavy work runs on the Mac, never touches live infra" principle.

**Parked until the user has Kite API credentials** (`api_key`/
`api_secret`/`access_token` from developers.kite.trade — needs the ₹500/mo
subscription). Next session, once keys exist: build the chunked
historical-data puller (auto-detect the true retention ceiling by walking
backward until empty, don't hardcode a start date), backfill the liquid
universe to local Parquet, then actually run `backtest.py` for a real
gate #6 result. Nothing else is blocking this — harness, cost model,
archetype/exit-style comparisons all ready and waiting.

### Advisor: accountability loop closed (brain `eac5bee`)
Audited the advisor as the "make it god-mode" first step. Key finding: **80
official calls made, 0 ever graded** — partly not-yet-due (10-trading-day
MICRO / 30-day MACRO horizons; oldest 07-12 batch matures ~07-24), partly a
real fragility (grading only ran inside the scheduler's official-advisor
path, so a verdict due on a tokenless day silently never got judged). The
deeper point: the 7 scoring weights are hand-picked priors **never checked
against outcomes** — "god mode" on unvalidated weights is just fancier
guessing. Built the fix (same discipline as Track C / gate #6):
- `scripts/grade_advice.py` — grades every due row on demand, runnable any
  day a token exists (read-only, no order path); `--attrib-only` needs no
  token.
- `advisor_backtest.factor_attribution()` — buckets graded calls by each
  factor and ranks them by hit-rate separation, i.e. which factors actually
  predict vs which don't earn their weight. The evidence to reweight on.
- Suite 788→792. Wiring verified live (`--attrib-only` against prod returns
  the correct 0-graded empty state).

**NEXT (from 2026-07-24):** run `python3 scripts/grade_advice.py` (in a venv
w/ requirements, needs a pasted token for the candle reads) to start
accumulating the track record. Once ~30-50 calls graded, the attribution
ranking tells us which weights to raise/cut — that's the actual god-mode
upgrade.

### Advisor step 2 shipped: weekly (higher-timeframe) confluence (brain `cd92317`)
The scorer was daily-only — blind to the single most decision-relevant
cross-timeframe fact: a daily uptrend *inside a weekly downtrend* (sell the
rip) vs *inside a weekly uptrend* (hold the dip) looked identical. Added a
weekly structure read (`resample_weekly` + `weekly_trend`: price vs ~30-week
EMA + 8-week momentum) and `daily_weekly_alignment`, surfaced in the
advice reasons — a countertrend WARNING on CONFLICT, a conviction note on
agreement. Kept OUT of the numeric score deliberately (unproven weight →
dark-flag discipline): it's logged (`indicators.daily_weekly_alignment`) and
`factor_attribution` now grades it, so step 1's loop decides whether it
earns a score weight. Holdings-only (no universe-scan cost). Suite 792→799.

### Advisor god-mode plan — reframed into 3 world-class-system pillars (2026-07-23)
Reassessed "make it best in the world." Honest framing (VISION §7a.2): a
solo retail-data advisor can't out-predict institutions on raw signal.
The winnable game is a world-class **decision** system — the three pillars
of any serious forecasting system:
1. **Probability calibration** — make `confidence` a real probability
   (stated 72% → right 72% of the time), measured off the grading loop.
   Blocked on graded data (~50+ calls, from 07-24).
2. **Portfolio-level risk view** — ✅ SHIPPED this session (below).
3. **Regime-conditional factor weighting** — which factors predict *in which
   regime*; the self-improving flywheel. Blocked on graded data + days/regime.

### Advisor pillar 2 SHIPPED: portfolio-level risk + tax-loss harvesting (brain `f5e7858`)
The advisor scored every holding in isolation — blind to whole-book risk.
`portfolio_risk()` adds single-name concentration, sector concentration (a
correlation proxy — 3 banks ≈ one bet at 3× size), and **tax-loss-harvest**
candidates (underwater names already flagged SELL/TRIM — selling realizes
capital losses that offset gains, real rupees for a red book). Surfaced in
a "Portfolio-level:" digest section (silent on a clean book), stored to
`app_config portfolio_risk_latest` for the dashboard. Official-run only,
non-fatal. Suite 799→806. Verified with a realistic red-book render
(flagged a 91% bank-sector over-concentration + ₹1.04L harvestable).

**Dashboard surfacing DONE (dash `bb9fefe`):** `/api/advisor` now returns
`portfolioRisk` (read from `app_config portfolio_risk_latest`, gated to the
displayed run_date), and the `/advisor` page renders a "Portfolio-level
risk" panel above the holdings (concentration flags + tax-loss-harvest
tally, hidden when the book is clean). typecheck + next build pass; the live
visual render just needs the next token-driven official advisor run to
repopulate the config in the new shape.

**NEXT on the advisor:** pillars 1 (calibration) and 3 (regime-conditional
weights) both wait on graded outcomes — so the gating item is simply
**running `scripts/grade_advice.py` from 07-24** to accumulate them.
Earnings/event-risk flag folds under pillar 2's risk layer when a calendar
data source is picked.

### Still open from 07-22 (unchanged, carried forward)
**Token not pasted yet this week** — nothing runs until a fresh enc_token
goes in before 09:15 IST. Once it does: watch trade count holds up under
pacing, confirm official advisor run fires ~09:45, and re-run
`/counterfactual-audit` (now with a working pacing-cost step) once 2-3
more clean sessions land.

---

## Historical: CURRENT STATE as of 2026-07-22

### Week-long gap 07-15 → 07-21: enc_token never repasted, watchdog alert never reached the phone
User away/busy a week; nobody pasted a fresh token, so the system correctly
sat idle the whole time (heartbeat ONLINE, brain_status IDLE, zero
sessions/decisions/candles — not a bug). **Real gap found while
diagnosing**: the watchdog DID detect + log a dead-token alert every single
day, but `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` were never set on the
`watchdog` Railway service — alerts only ever reached Railway logs, never
the phone. **Fixed 2026-07-22**: watchdog now reuses the advisor bot's
working Telegram creds. Next lapse reaches the phone same morning.
**Still needs the user**: paste a fresh enc_token to resume — nothing else
is broken, everything (pacing fix, advisor intraday refresh, Track C
labeling) is deployed and simply hasn't had a live session to run against
since 07-14. See memory `enc-token-refresh` for the fuller note + the case
for revisiting TOTP auto-login now that the manual-paste risk materialized.

### Data-richness pacing raised (brain `aabce55`, Railway vars set)
Diagnosed why only 14/1269 decisions became trades on 07-14: pacing knobs,
not strategy selectivity, deferred 115 qualifying signals. Raised (Railway
env vars on `zerodha-brain` service, redeployed ~01:47 IST):
`MAX_TRADES_PER_CYCLE` 3→8, `DATA_MAX_TRADES_PER_DAY` 40→150,
`DATA_MAX_TRADES_PER_SYMBOL` 3→6, `DATA_MAX_NEW_TRADES_PER_HOUR` 6→15,
`DATA_MAX_CONCURRENT_POSITIONS` 8→20. MIN_BUY_CONFIDENCE/MIN_SELL_CONFIDENCE/
MIN_RISK_REWARD_RATIO untouched — same signal quality, just less throttled
execution of it. Reasoning + the paper-vs-real / overfitting discipline
this connects to: `VISION.md` §7a (new). **NEXT SESSION: watch tomorrow's
trade count — should be meaningfully >14 if pacing was really the
bottleneck; if still low, the ceiling is signal availability itself, not
pacing, and that's useful information too.**

### Advisor: dedup bug fix + intraday refresh (brain `0661155`, pushed)
User noticed the advisor page felt stale. Root cause found: the once-per-day
dedup flag was set in-memory BEFORE the run executed — a transient failure
(e.g. holdings fetch hiccup) silently burned the day's one attempt with zero
rows written, no retry until a lucky redeploy reset the flag. Hadn't bitten
in practice yet (3/3 days present, no gap), but was a live landmine.
**Fixed**: dedup now DB-backed (`has_official_advisor_run` /
`get_last_advisor_run_time`), survives redeploys, retries on failure.

Alongside the fix, shipped what the user actually wanted: the advisor no
longer runs once/day. First live-token run past 09:45 IST = "official"
(full: Nifty-500 rotation scan + digest + backtest-eligible). Every 300s
after that until market close (15:20), a lightweight re-score fires — fresh
price/verdict only, stored as a new snapshot row (`is_official=false`), no
rotation rescan (that's a ~3min/484-name scan, decoupled — see
`ADVISOR_MODULE.md` "Future work" for the parked plan to speed it up if
ever needed), no digest spam. `/advisor` now shows "updated HH:MM IST" +
an intraday-refresh tag instead of just a date.

Schema (prod+sim migrated): `portfolio_advice` gained `is_official`/`run_id`;
dropped the old `(run_date,symbol)` unique constraint. Backtest/track-record/
decision-recording queries scoped to `is_official=true` — unaffected by the
new snapshot rows. Brain suite 733→752 (19 new tests). **NEXT SESSION: watch
tomorrow's first live day — confirm the official run still fires ~09:45-ish
and lite snapshots accumulate every 5min without spamming Telegram or
rescanning rotation.**

### The last 48h in one line
Advisor became regime-aware + interactive (Telegram accept/decline with
₹-sizing), the engine got data-richness pacing (analysis never stops,
entries spread all day), two full scan-and-fix passes cleared every parked
bug, and today was the first rich full-day session — **1,269 decisions vs
125 the day before**.

### Today's session (2026-07-14) — first data-richness day
- Started late (token pasted ~11:45 IST; 09:16 preflight had alerted),
  COMPLETED clean at close. **14 trades, 6W/8L, −₹36.77**, 0 stuck open.
- **1,269 decisions** across 46 symbols, zero nulls — ~10× the old cadence.
  Entries spread across 4 hourly buckets (pacing worked).
- Counterfactuals captured: 22 ENTRY_DEFERRED (11 CONCURRENT_CAP ×
  11 CYCLE_LIMIT), 4 LIMIT_WOULD_STOP markers.
- **exit_state on all 14 exits** — P4 snapshot shipped this morning, worked
  first try.
- Advisor: 20 rows, CHOPPY_SIDEWAYS stamped, 19 MACRO / 1 MICRO, 9 rotation
  calls with ₹-sizing, digest + decision buttons delivered.

### Bug found live TODAY (fixed, deployed post-close, brain `0be362d`)
**Candle archive lost every batch all day** (`candles_today = 0`).
`upsert_candles` batches carried duplicate (symbol,interval,ts) rows — a
symbol present in BOTH holdings and nifty50 universe buffers its bars twice
per cycle — and Postgres rejects a single upsert touching one row twice,
rejecting the WHOLE 141-row batch. Fix: dedup before upsert (test-pinned,
suite 727). Impact: today has quote_snapshots (28/cycle-wise) but no 5-min
bars; archive resumes tomorrow. Also explains why the archive looked thin on
earlier days — any cycle with a holdings∩nifty50 overlap lost its batch.

### Post-close audits run (this session, still 2026-07-14 night)
- **`/post-session-check`**: all clean. Only known FAIL = candles (0 rows
  today, expected — fix deployed post-close, verifies tomorrow). W1 cycle
  duration unverifiable (Railway log buffer only reaches back to the
  23:27 IST redeploy, market-hours lines already rotated out — check via
  a log export or earlier pull next time). W4 smoothed advisor run PASS
  (bars=272 across holdings, no absurd verdicts). One benign 409
  (Telegram getUpdates conflict, single occurrence, redeploy-overlap).
- **`/counterfactual-audit`**: gate says LOW-CONFIDENCE (only 14 closed
  trades, 1 day) — no flags enabled. Notable: trend-tells direction is
  right (blocked bucket −₹34.69/40%win vs permitted −₹2.08/50%win) but n
  too small. **Market-direction unmeasurable today — every trade's
  `market_context.direction` was SIDEWAYS**, so the strongest prior
  candidate flag has zero informative days so far; needs a trending day.
  LIMIT_WOULD_STOP markers show session recovered from −₹140 (at
  CIRCUIT_BREAKER) to final −₹36.77 by continuing — supports keeping
  data-collection mode on. Pacing-cost step (rupees foregone on the 98
  CONCURRENT_CAP + 17 CYCLE_LIMIT deferrals) couldn't run — needs candle
  price-path data, blocked by today's 0-candle bug. Re-run after 2-3 more
  clean days, and once candles backfill for the deferred-entry pricing.

### NEXT SESSION — pick up here
1. **Verify candle fix live** (first cycles tomorrow, 07-14 checked = 0,
   confirmed still broken as expected pre-fix):
   `select count(*) from candles where ts::date=current_date` >0, growing.
2. ~~`/post-session-check` on today's (07-14) session~~ — **done this
   session, all clean**, see box above. Re-run again after tomorrow's
   session for W1 (need an earlier log pull, buffer rotated out this time).
3. ~~`/counterfactual-audit`~~ — **done this session, LOW-CONFIDENCE**
   (n=14, 1 day) — see box above. Re-run after tomorrow adds a 2nd day;
   market-direction still needs an actual trending (non-SIDEWAYS) day to
   be measurable at all before it can be enabled.
4. **Coverage push parked mid-batch-1** — plan/baseline in
   `docs/TEST_COVERAGE.md` (76% production). Done: indicators 95%,
   trading_principles 97% + dead-code deletion + pytest.ini collection fix.
   Next: telegram/advisor files (batch 2), database error branches (batch 4).
5. **User-side open item**: Kite Console → connected apps — identify the
   external CNC INFY order source from 07-10.
6. Data-gated, untouched: timing pillars 3-4; M5 replay harness (archive
   starts actually filling tomorrow thanks to the candle fix).

### Where everything lives
- Bug/improvement backlog: `docs/KNOWN_ISSUES.md` (parked: empty; watchlist
  W1-W4 active) · Post-session audit: `/post-session-check` skill ·
  Flag measurement: `/counterfactual-audit` skill · Coverage:
  `docs/TEST_COVERAGE.md` · Advisor: `docs/ADVISOR_MODULE.md`
- Daily rhythm: token paste ≤09:15 → 09:16 preflight → 09:30 autopilot →
  09:45 advisor + digest with ✅/❌ buttons → intraday ±3% alerts →
  15:40 weekly-profiles window → post-close: commit/deploy + audits.

---

## 2026-07-22 (post-close) — First full session post-gap + counterfactual audit round 2 (n=80, 2 days)

**Session**: COMPLETED, squared off 15:21 IST. 66 trades (15W/51L), −₹1,277.75.
Pacing fix (see box above) confirmed working under real load: 4.7× the
07-14 trade volume from the same signal pipeline. Candle-archive fix also
confirmed: 3,266 candles captured today across 46 symbols, 0-row bug fully
resolved. `/post-session-check`: all clean, zero new findings.

**`/counterfactual-audit` re-run (80 closed trades now, 2 days — up from
n=14/1 day on 07-14):**

| Flag | Trades affected | Effect | Verdict |
|---|---|---|---|
| Trend-tells gate | 66 blocked / 14 permitted | Blocked-bucket avg −₹16.5/trade vs permitted −₹16.1/trade — **converged**, no longer distinct (07-14 alone looked like −₹34.69 vs −₹2.08) | **WAIT** — single-day signal didn't hold at n=80 |
| Market-direction | 0 informative (LONG+SHORT, both days: `market_context.direction`=SIDEWAYS 100% of the time) | Unmeasurable — still zero trending days | **WAIT** — needs an actual non-SIDEWAYS session before this can be judged at all |
| Time-stop | SESSION_END exits n=7, avg_r −0.46, avg hold 85min | Directionally plausible (long-held losers) but n too small | **WAIT** — same call as 07-14 (n=5 then) |
| Pacing gates (data-richness) | CONCURRENT_CAP 98, CYCLE_LIMIT 25, SYMBOL_DAY_CAP 12, HOURLY_PACE 10 (2-day totals) | Not yet priced — needs a price-path replay against `candles` (now populated) to compute rupees foregone/saved; not done this pass, heavier lift than inline SQL | Deferred — good candidate for a dedicated script now that candle data exists |
| LIMIT_WOULD_STOP (data-collection mode's own effect) | 07-14: recovered from −₹163 (marker) to −₹36.77 final. **07-22: got worse** — from −₹803 (DAILY_STOP_3R marker, trade 40) to −₹1,277.75 final | **Direction flipped between the two days** — 07-14 says continuing past the old caps helped, 07-22 says it hurt | **WAIT** — do not read this as settled either way; the two-day sample disagrees with itself |

**Bottom line: nothing crosses the enable bar yet.** The one flag that looked
promising on a single day (trend-tells) washed out at 2× the sample; the
strongest prior candidate (market-direction) still has zero informative
days; and data-collection mode's own net effect on P&L reversed direction
between the two days measured, so no verdict there either — keep it on
for the data value, but don't cite 07-14's recovery as a demonstrated
benefit anymore now that 07-22 contradicts it. Re-run again after 2-3 more
clean sessions, and ideally after a genuinely trending (non-SIDEWAYS) day
lands so market-direction becomes measurable at all.

---

## Historical: CURRENT STATE as of 2026-07-12

### What shipped this session (brain suite 496 → 588; all pushed to `main`)

1. **Data-collection mode** (brain `2c0be75`) — 8th dark flag. Soft session
   stops (MAX_TRADES/DAILY_STOP_3R/loss-floor/circuit-breaker/MAX_PROFIT)
   become logged counterfactuals instead of ending the session, so a paper
   day can run to natural close instead of stopping at 10 trades.
   **Still OFF** — enable via Railway env `DATA_COLLECTION_MODE=true`
   (post-close only) when ready for a full-day run.
2. **Dashboard fixes** (dash `e9e1ca2`, `ec64a12`… wait these are brain) —
   trade-log SHORT/LONG display bug fixed (was hardcoded "SHORT"); brain
   token-incident banner now clears before `initialize()`, not after (no
   more flash on a healthy start).
3. **Tier-2 capture** (brain `f054ea0`) — `market_context.realized_vol`
   (cross-sectional stdev) replaces the dead `india_vix=15` constant;
   `trades.execution` jsonb captures slippage decomposition (reference vs
   fill price, bps) on the paper path.
4. **REQ-030 live-tunable signal knobs** (brain `0e22ba9`) — `MIN_BUY_CONFIDENCE`,
   `MIN_SELL_CONFIDENCE`, `MIN_RISK_REWARD_RATIO`, `ADX_TRENDING/WEAK_THRESHOLD`
   overridable via app_config `tunables` JSON, no redeploy, 60s cache,
   fails safe to compiled defaults. Risk-sizing knobs deliberately NOT
   included (money path stays code-only).
5. **Timing capture** (brain `46652f8`) — every decision carries a `timing`
   block (minutes_since_open/close, session_phase, cycle, data_age_seconds,
   concurrency) in `indicators`. Realizes Pillars 1-2 of
   `TIMING_CORRELATION_PLAN.md`. **Live now, no action needed.**
6. **News pipeline** (brain `40be41e`→`b8b9a64`→`2f5c619`→`8c33995`) —
   `news_events` table (both DBs), `news_jobs.py` (Marketaux normalize/
   fetch/collect/backfill), per-decision `news_context` cache-read (no
   hot-loop API calls), Insights "News context" section (dashboard `4e359e0`).
   **WORKING as of 2026-07-12 (brain `72221c4`)** — 0-rows bug was the
   Marketaux ticker suffix (`.NSE` vs `.NS`), see resolved #1 below.
7. **Portfolio Advisor** (brain `c466cc0`→`22298c4`→`a029c85`→`f236d4d`→`ed40e5f`,
   dashboard `3995709`) — NEW daily HOLD/SELL/TRIM/SELL_ON_BOUNCE advisory
   for the user's REAL long-term holdings (separate from the paper-trading
   engine). Advisory only — physically cannot place orders (test-pinned).
   `/advisor` page. Auto-runs once/day after 09:20 IST on a live token;
   manual on-demand trigger also built (see below). **CONFIRMED WORKING
   with real data as of 2026-07-12** — 20 holdings scored, real verdicts,
   `daily_bars: 270` (not the old bug's `0`).
8. **Real tradebook** (brain `22298c4`) — user's Kite Console CSV
   (215 fills, 46 symbols, 2026-02-11 → 2026-05-25) imported into new
   `tradebook` table. Every advisor run auto-appends TODAY's real fills via
   `GET /trades` (`sync_tradebook()`) — self-maintaining going forward, no
   more manual exports needed for NEW trades.
9. **Manual advisor trigger** (brain `a029c85`) — set app_config
   `advisor_run_now`='true' to fire the advisor immediately (bypasses the
   09:20 window + once/day dedup), checked every ~30s scheduler tick, no
   redeploy. Consumed after firing.
10. **Advisor bug fix** (brain `f236d4d`) — root cause of "0 daily bars /
    INSUFFICIENT for every holding": `run_advisor` read holdings via
    `kite.get_holdings()` directly, never calling
    `market_data.refresh_holdings_cache()`, so the instrument-token cache
    `get_candles()` depends on was empty. Fixed by seeding
    `_instrument_cache` straight from the holdings response. **Verified
    fixed** — `daily_bars: 270` confirmed live in `portfolio_advice`.
11. **Advisor v2 — "10/10" scoring overhaul** (brain `f236d4d`, `ed40e5f`) —
    was EMA200/EMA50 snapshot + momentum + ADX only (4 factors). Now 7:
    - `trend_consistency` — % of last 20 days above 50-day EMA (steadier
      than one EMA-cross snapshot)
    - `relative_strength` — stock's 20-day return vs Nifty 50's (is it
      actually beating the market, or just moving with it)
    - `volume_trend` — reason-only signal, is a move backed by real
      participation
    - **overextension guard** — an uptrend with RSI≥75 AND >15% above its
      50-day EMA no longer blind-HOLDs, downgrades to TRIM ("take some off
      into strength")
    - **portfolio concentration flag** — position ≥25% of total holdings
      value flagged regardless of trend direction (risk mgmt, not direction)
    - **news sentiment** — 7th factor, mean of the symbol's last 5 tagged
      articles' sentiment_score, contributes 0 when no coverage (same
      honest degradation pattern as relative strength)
    Score reweighted to sum to 100 across all factors. All optional terms
    (consistency/rel-strength/news) contribute 0 rather than skew the read
    when data is missing.

### Rotation Advisor suite (LATER same day, 2026-07-12 — brain suite 588→639)

Six phases, all shipped + pushed (brain `8bb34de`→`3da5f16`, dashboard
`631c0d4`,`97073f1`). Full plan: `~/.claude/plans/tingly-coalescing-cocke.md`.
Advisory-only pin (no order-path method) extended to every new module.

1. **`telegram.py`** — shared send wrapper (never raises); watchdog
   refactored onto it, behavior unchanged.
2. **Nifty 500 universe** — `data/nifty500.csv` pins symbol/token/sector for
   all 500 names (joined from public niftyindices CSV × Kite public
   instrument master — both curl-able, no auth). Regenerate quarterly:
   `scripts/build_nifty500_tokens.py` then `scripts/seed_nifty500_universe.py`.
   `stock_universe` gained instrument_token/industry/is_nifty500/
   advisor_score (separate from paper-engine `brain_score`). Both DBs
   migrated + seeded (500 rows, 21 sectors, 0 missing tokens).
3. **Rotation calls** — daily scan scores every unheld Nifty 500 name with
   the same 7-factor scorer (350ms pacing ≈ 3min once/day); a weak holding
   (score ≤ −20) gets a rotation target only if target ≥ 50 AND gap ≥ 40
   (all env-tunable) — same-sector preferred, cross-sector fallback.
   Advice rows carry rotation_target_symbol/score/reason; /advisor shows a
   "rotate into X" chip. **ROTATION_ADVISOR_ENABLED=true set on Railway.**
4. **Accountability backtest** — `advisor_backtest.py` judges every verdict
   after 10 trading days (HOLD right if price rose; exit calls right if it
   fell; alpha vs Nifty). Track record on /advisor: hit rate, avg alpha,
   and rupees the exit calls saved vs sitting still (qty-sized, TRIM
   half-weight). `/api/advisor/track-record`.
   **ADVISOR_BACKTEST_ENABLED=true set on Railway.** First outcomes land
   ~10 trading days after the first advice rows (late July).
5. **Daily Telegram digest** — actionable calls only, worst first, silent on
   HOLD-only days, durable per-day dedup. **ACTIVE** — bot `@singhakshayraj_bot`
   created, chat_id `1721064751` confirmed (test message delivered),
   `ADVISOR_DIGEST_ENABLED=true` set on Railway. First digest fires after
   tomorrow's 09:20 IST advisor run.
6. **Intraday holdings watch** — daemon thread, one holdings call per 5min
   during market hours, one alert per symbol/direction/day at ±3% vs prev
   close, direction-aware guidance. **ACTIVE** —
   `ADVISOR_INTRADAY_ALERTS_ENABLED=true` set, same bot.

**ALL SIX PHASES LIVE as of 2026-07-12.** Rotation scan live-verified same
day with real data: 484/500 Nifty 500 names scored in 278s, 6 rotation calls
correctly gated (NTPC/SILVERBEES/ITC/NBCC/RVNL/NMDC → mostly same-sector
targets, all clearing the 40pt-gap/50-min-target bar). Nothing left to
configure — only remaining wait is the backtest's first outcomes, which need
~10 trading days of price action to accrue (~late July).

### Live verdicts as of 2026-07-12 (proof the fix + v2 work)

20 real holdings scored. Worst-to-best trend_score sample: NTPC
(SELL_ON_BOUNCE, −79), SILVERBEES (SELL, −58), ITC (SELL, −57) … up to
SUPRAJIT/ITCHOTELS/MAHLIFE (HOLD, 97-98). All `news_sentiment: null`
(no news captured yet — see PENDING #1).

---

## PENDING — nothing here should be lost

**#1 — ✅ RESOLVED 2026-07-12 (brain `72221c4`) — news now capturing.**
Root cause: Marketaux tags Indian tickers Yahoo-style (`RELIANCE.NS`) but
every query sent `.NSE` — API returned 200 with `found: 0`, so no error was
ever logged. Key was valid all along (curl `AAPL` → 98k articles,
`RELIANCE.NS` → 11k, `RELIANCE.NSE` → 0). Fixed `.NSE`→`.NS` in all three
call sites (brain collect, advisor refresh, backfill) + fetch limit 25→3
(free-plan cap). Suite 588 green. Verified live: boot backfill
(`NEWS_BACKFILL_WINDOW=2026-07-09,2026-07-12` WAS set on Railway, contrary
to earlier note) upserted 29 rows post-deploy → 20 unique articles in prod
`news_events`. Advisor news_sentiment + Insights news section now populate
automatically. Optional cleanup: remove `NEWS_BACKFILL_WINDOW` env var
(idempotent, harmless if left).

**#2 — ✅ CLOSED 2026-07-12: no gap after all.** User confirmed no real
trades were placed 2026-05-26 → 2026-07-11, so the tradebook (215 fills,
02-11 → 05-25, source='import') is complete as-is. A re-export of 05-25
matched the DB exactly (21/21 rows already present). `sync_tradebook()`
appends each day's fills from Monday onward (source='kite_daily') —
self-maintaining, no more CSVs needed.

**#3 — ✅ DECIDED 2026-07-12: keep `AUTOPILOT=true`** (hands-off,
self-starts 09:30 IST, once/day). No config change needed — was already
set. Daily manual step stays: enc_token paste before 09:15 IST. (Root
cause of the earlier "starts when I open Auto Trade" confusion was
autopilot self-starting on token-live, NOT the page — no bug.)

**#4 — CNC rejected orders source (user-side, not us).** 2026-07-10 08:58
IST: 5× BUY INFY CNC orders rejected on the real Kite account. Proven NOT
our system (PAPER_TRADING=true, MIS-only never CNC, brain was idle,
`PAPER-*` fills only). User should check Kite Console → connected apps for
another bot/script on the same account. Nothing to fix in our code.

**#5 — Dark-flag enablement (needs more clean paper-trading days).**
Counterfactual audit (2 clean days, 20 trades) ranked candidates:
`MARKET_DIRECTION_ENABLED` (shorts had avg MFE ≈ −0.04, barely ever green —
strongest candidate), then trend-tells gate (cuts ~71% of signals, blocked
6 would-be losers). Time-stop is weak on n=5, don't enable yet. Needs 2-3
more clean days before flipping anything for real.

**#6 — ✅ ENABLED 2026-07-12: `DATA_COLLECTION_MODE=true` set on Railway**
(Saturday, market closed; redeploy SUCCESS 12:14 UTC). From Monday
2026-07-14 sessions run to natural close — soft stops (MAX_TRADES /
DAILY_STOP_3R / loss-floor / circuit-breaker / MAX_PROFIT) log as
counterfactuals instead of ending the day. Hard safety (risk sizing,
per-trade stops) unchanged.

**#7 — Deferred builds (not urgent, no action needed unless revisited):**
- P4 exit-state feature snapshot — needs careful TA recompute inside the
  ~30s exit loop; deferred to avoid a cycle-latency regression.
- P5 M5 replay/backtest harness — blocked on candle-archive depth (only
  ~1 partial day archived as of 2026-07-10; needs weeks for indicator
  warmup). `generate_signal` is pure so the engine is buildable once depth
  exists.
- Timing Pillars 3-4 (correlation surface + factor-importance model) — the
  capture (Pillars 1-2) is live; the analysis waits for more data days.
- Insights "News context" section is built and will populate automatically
  once #1 is fixed — no separate action needed there.

**#8 — Portfolio Advisor: possible future depth (not requested yet, ideas
only if revisited)** — fundamentals/sector overlay, dividend/corporate-action
awareness (large single-day gaps in daily candles could be splits/bonuses
misread as trend), advisor's own historical accuracy tracking (verdict vs.
what the stock actually did N days later — the data is already being stored
daily in `portfolio_advice`, just needs a query once enough days accrue).

---

## Big picture

Goal: validate the auto-trade platform against real market data with
simulated execution (paper trading), run it unattended for ~1 month, store
all decisions/trades as a training dataset. Full plan:
`docs/PAPER_TRADING_ROADMAP.md` (Phases 0-4).

Two repos involved:
- `zerodha-trading` (this repo) — Next.js dashboard + API + Supabase, deployed on Vercel
- `zerodha-brain` (`~/Desktop/GITHUB/zerodha-brain`) — Python decision engine, moving back to Railway (see below)

## What's DONE

**Phase 0 (zerodha-trading, commit `cd8b36e`, pushed):** fixed 5 money-path
bugs before running anything for real — P&L guardrail double-count, invalid
`STOPPED` session status, `closeTrade` NaN guard, session-restore config-key
mismatch, stop route not clearing `active_session_id`.

**Mock/validation system (zerodha-trading, multiple commits through `96f4b14`,
`aa06d2d`):** `/mock/trading` dashboard against a staging Supabase project,
realistic market simulator, live-seed mode, `/mock/validations` 7-step
automated test suite. All 7 passing as of last run.

**Phase 1 (zerodha-brain, commit `8bb2240`):** `paper_broker.py` — drop-in
replacement for `OrderManager`. Fills at real live LTP + slippage, `PAPER-*`
order ids, selected via `config.PAPER_TRADING` env flag.

**Realistic cost model (zerodha-brain, commit `ae90de6`, pushed):**
`paper_broker.py` was slippage-only, which overstated paper P&L. Added
`_zerodha_intraday_charges()` — full Zerodha MIS schedule (brokerage, STT,
exchange, SEBI, GST, stamp, ~0.1% round trip), folded into the fill price
adversely. No schema change needed. 208 brain tests still pass.

**Vision doc (zerodha-trading, commit `b257519`, pushed):** `docs/VISION.md`
written — mission/stages table, edge hypothesis, architecture, trading
fundamentals (R-multiples, stop discipline, regime awareness, NSE intraday
clock, process-over-outcome, losing-streak throttle), risk limits, 9-item
pre-run gate, go/no-go criteria with metric definitions, live kill criteria,
the trade→data→learn→improve flywheel, and a decision log. **This is now
the source of truth for "what are we building and why" — read it before
re-deriving any of this from scratch.**

## Oracle Cloud VM — ABANDONED, do not resume

Tried migrating the brain off Railway to a free Oracle Cloud VM. Killed this
approach after ~1hr of fighting it. Keeping the story here so we don't
repeat the mistake:

- Created `zerodha-brain` VM, `VM.Standard.E2.1.Micro` (1 OCPU, ~500MB
  *usable* RAM despite "1GB" spec), Oracle Linux 9, `ap-hyderabad-1`, IP
  `129.159.233.238`, user `opc`, key `~/.ssh/oracle-zerodha-brain.key`.
  **Terminated 2026-07-05 — cleanup done, no longer running.**
- `dnf install docker-ce` **OOM-killed twice** — even a bundled install of
  just `git` alone got OOM-killed after growing swap from 498MB to 3GB.
  Root cause: this VM shape's real headroom is too thin for dnf's
  metadata/transaction overhead, let alone running Docker + Python +
  indicators + Kite polling unattended for a month.
- Tried the bigger free-tier shape (`VM.Standard.A1.Flex`, ARM, 4 OCPU/24GB
  pool) as a fix — hit "out of capacity" in `ap-hyderabad-1` **twice**
  (region is single-AD, no fallback AD to try). A1.Flex capacity is
  globally contested; not worth an open-ended retry loop.
- Verdict (see `VISION.md` §5 gate #2, #4 — silent failure is disqualifying):
  a host that OOMs on `dnf install git` cannot be trusted for an unattended
  month handling real trade decisions. Decided to stop fighting free tier.
- The VM (`129.159.233.238`) is still running in OCI — **not yet
  terminated**. Low priority cleanup: terminate it once Railway is
  confirmed working, to avoid confusion/leftover cost-free-but-clutter.

## Railway — DONE (confirmed working 2026-07-05)

Decided to resume Railway (~$5/mo Hobby plan) instead of self-hosting.
Rationale: code already ran there before credits ran out; PaaS means no OS
to babysit; checked pricing against Hetzner/DigitalOcean/Render — Railway
isn't the cheapest (~$1-2/mo more than a raw VPS) but the alternatives all
require managing your own box, which is the exact risk category just
escaped with Oracle.

**Done:**
- User signed up for Railway Hobby plan.
- Railway CLI installed locally (`brew install railway`, v5.23.3).
- `railway login` completed — authenticated as `singhakshayraj@ymail.com`.
- `railway setup agent` run — installs Railway's own Claude Code
  integration:
  - Skill `use-railway` → `~/.claude/skills/use-railway`
  - MCP server registered in `~/.claude.json`
  - **Requires a Claude Code session restart to actually load** — this was
    just configured, not yet active as of this handoff.
- Existing Railway project confirmed via `railway list`: **`stunning-harmony`**
  (this is presumably the old zerodha-brain deployment — not yet inspected
  in detail).

**Verified 2026-07-05, all items closed:**
1. Railway MCP tools live post-restart — confirmed via `whoami`/`list_projects`.
2. `stunning-harmony` (id `c2088221-f7bb-4d10-9e6e-3af8238203d9`) is the
   zerodha-brain deployment, linked to `singhakshayraj/zerodha-brain` repo
   (Railpack builder), single service `zerodha-brain`, one environment
   `production`.
3. `PAPER_TRADING` was **not** set (old deployment predates paper mode) —
   added `PAPER_TRADING=true` via `mcp__railway__set_variables`, which
   auto-triggered a redeploy.
4. `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` confirmed pointing at prod
   (`gilmuwmtdpjccibfhqtx`), not sim.
5. Redeploy landed automatically from the var change — deployment SUCCESS
   at 2026-07-05 18:35:47 UTC, picks up `main` HEAD (includes cost-model
   fix `ae90de6`).
6. `[BRAIN] PAPER TRADING mode` banner (`brain.py:31`) only prints when a
   `TradingBrain` session actually starts (market-hours gated via
   scheduler), not at container boot — **not yet observed live**, container
   boot alone just runs the heartbeat loop. Confirm this during the next
   NSE market session (09:15-15:30 IST) by tailing deploy logs.
7. Heartbeat confirmed live in Supabase: `brain_heartbeat` row updating in
   real time (`last_ping` 18:36:28 UTC post-redeploy), `status=ONLINE`,
   `message="Waiting for START command"` — correct idle state outside
   market hours.
8. Abandoned Oracle VM (`129.159.233.238`) terminated 2026-07-05.

**Next session should pick up here:**
- During next market session, confirm the `PAPER TRADING mode` banner
  actually appears in Railway deploy logs and a real cycle count > 0 shows
  up in `brain_heartbeat` (proves the scheduler is starting sessions and
  the paper broker path is live end-to-end).
- Note: only 2 custom vars are defined on the Railway service
  (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, now + `PAPER_TRADING`). Kite
  `enc_token` is **not** a Railway env var — it's read from the Supabase
  `config` table via `database.get_enc_token()`. Daily token refresh
  (open risk, see below) needs to write there, not to Railway.

## Other loose ends

- **Supabase MCP working** — confirmed via `mcp__supabase__list_projects`.
  4 projects visible: `zerodha-trader` (prod, ACTIVE_HEALTHY,
  `gilmuwmtdpjccibfhqtx`), `zerodha-trading-sim` (staging,
  `fbfluafzxgynasvuryiu`), `MarketMind` + `zerodha-portfolio` (both
  INACTIVE, unrelated/unused). No naming collision issue in practice.
- **Mystery test files — RESOLVED 2026-07-06.** They were the untracked
  half of the passing 208-test suite (written May 26, "T2.2" batch, never
  committed). Verified all green, committed + pushed (`da23cf5`),
  `.coverage` gitignored.
- `test_paper_broker.py` was discussed as a good addition (unit tests for
  the new cost-model math) but **not yet written**.
- **Daily enc_token refresh — DECIDED 2026-07-06, partially closed.**
  - TOTP auto-login **built and shipped** (`token_refresher.py`, commit
    `ad01ce3`): replays kite.zerodha.com login (password + TOTP via pyotp),
    writes fresh enctoken to Supabase `config.enc_token`. Scheduler fires
    it daily 6:30 IST + on START-with-no-token. 13 unit tests, suite 221.
  - **Currently DORMANT** — user not comfortable storing broker creds yet,
    so `KITE_USER_ID` / `KITE_PASSWORD` / `KITE_TOTP_SECRET` are NOT set on
    Railway. Without all three, every refresher call is a no-op by design.
  - Interim decision: **manual paste daily before 9:15 AM IST** (user
    commitment). To activate auto-login later: set the 3 env vars on
    Railway (user should set them via dashboard themselves, TOTP secret =
    base32 string from 2FA re-setup, not a 6-digit code).
  - **Hard alert NOT built (user chose defer)** — VISION gate #3 therefore
    still OPEN: manual paste with no missed-morning alert is not
    month-run-ready. Revisit before the run starts (heartbeat watchdog in
    Phase 3 overlaps this).
- **Phase 2 — DONE 2026-07-06** (brain commit `3df3f9c`, trading commit
  `44b4281`):
  - Decision logging verified complete: every analyzed symbol logs
    BUY/SELL/HOLD with indicators + skip_reasons. Patched two gaps:
    regime-blocked HOLDs now carry indicator snapshots, and data-gap skips
    (no candles / no price) log as `SKIP` decisions.
  - `quote_snapshots` table created (prod migration): one row per cycle,
    jsonb symbol→LTP map, written from `brain.run_cycle`.
  - `performance_daily` view created (prod migration): IST trade-date
    rollup — trades, win rate, net pnl, max intraday drawdown, regime
    distribution. Validated against May trades.
  - `/api/analytics/export` route: sessions/trades/decisions/daily for a
    date range, JSON or CSV, paginated. **Gated by `ANALYTICS_EXPORT_TOKEN`
    env var — NOT YET SET on Vercel** (route 401s until set; generate with
    `openssl rand -hex 32`).
- **Phase 3 — code DONE 2026-07-06, activation pending:**
  - NSE 2026 holiday list hardcoded + merged with 2025; risk_manager now
    uses the merged set (old check was 2025-only, silently useless).
  - AUTOPILOT env flag: self-start at 09:30 IST trading days, at most once
    per day (any session today suppresses restart — manual stop, loss
    limit, token expiry). Square-off at 15:20 already existed via
    `end_session`. **AUTOPILOT NOT YET SET on Railway** — user chose to
    keep manual dashboard START for now; set `AUTOPILOT=true` when ready
    for the shakedown day.
  - Run config written to prod `app_config.session_config`: ₹10,000,
    10 trades/day, 3% max loss, 10% max profit, 300s interval, NIFTY50.
  - Heartbeat watchdog + alerts still NOT built (user deferred alerts) —
    remaining Phase 3 gap, blocks month-run start per VISION §5.
- Backtest across multiple market regimes (gate #6) also not started —
  needed to separate "infra works" from "strategy has edge," per
  `VISION.md` §1.

## 2026-07-07 — Architecture-failure scan + hardening (brain `db2fbb9`)

Full-system failure-mode scan, then fixed everything found. Brain:

1. **Transient Supabase error no longer ends the session** — the
   `active_session_id` re-verification now retries and fails OPEN
   (`get_config_strict` distinguishes "query failed" from "key cleared").
   Was the most probable month-run killer.
2. **Instance lock + SIGTERM handler** — Railway redeploy overlap can no
   longer double-trade one session; older process exits without teardown
   when a newer one claims `brain_instance_id`.
3. **Zombie unfilled trades voided on init/resume** (`UNFILLED_VOID`) —
   a NULL-quantity row used to crash every cycle silently after a resume.
4. **STOP while brain idle now finalizes the orphaned session** (was:
   brain_status stuck STOP + session RUNNING forever).
5. **Startup interlocks** (`config.assert_safe_boot`): QA_MODE+prod DB
   refuses to boot; real trading requires `REAL_TRADING_CONFIRM` env.
   NOTE: brain now REQUIRES `PAPER_TRADING=true` on Railway to boot.
6. Circuit-breaker streak rebuilt on resume; loss limit now counts open
   (unrealized) losses; `write_config` retries; `total_pnl_percent` vs
   capital; `_execute_sell_by_symbol` LONG-only match.

Dashboard: `/api/trade/start` + `/stop` now 403 unless `x-enc-token`
matches the stored `enc_token` (was presence-only = effectively public).
QA unaffected (sim DB has no enc_token row).

Verified: 256 brain unit tests, QA stack 4/4 Playwright scenarios,
brain-restart scenario PASS. Railway auto-deploys from main — confirm
`PAPER_TRADING=true` is set there before/at next deploy (it is today).

## 2026-07-07 (late) — Tier 1 alerting DEPLOYED (brain `ace1bfd`)

- **Watchdog service live on Railway** (`stunning-harmony` → `watchdog`,
  same repo/image, `SERVICE_ROLE=watchdog` dispatch in main.py). Checks
  every 60s, trading days only: heartbeat stale/missing (CRITICAL),
  ERROR/DEGRADED status, TOKEN_EXPIRED, zero trades by 11:00, and an
  08:45 IST enc_token paste reminder. 30-min per-key dedup.
- **Telegram NOT configured yet — alerts print to Railway logs only.**
  To activate: create bot via @BotFather, get chat id, then
  `railway variables --service watchdog --set TELEGRAM_BOT_TOKEN=... --set TELEGRAM_CHAT_ID=...`
- **AUTOPILOT=true set on brain service** — self-starts 09:30 IST trading
  days (once/day). Manual daily step remaining: paste enc_token before 09:15.
- Error budget: ≥5 consecutive control-plane DB failures → heartbeat
  DEGRADED → watchdog alert.
- NOTE: watchdog service is NOT repo-connected (CLI auth limitation) —
  redeploy it after watchdog.py changes with:
  `railway up --service watchdog --detach` from the brain repo.
- Suite: 273 tests passing.

## 2026-07-07 (later) — ENGINEERING_SPEC alignment round 1 (brain `44a6714`)

- Spec reviewed vs system; amendments A1–A3 added to ENGINEERING_SPEC §9b.
- Decision: current month = M2 acceptance run (data now), M5 backtest
  later, M4 pipeline v2 built in parallel behind QA stack.
- Shipped: config_hash+git_sha on sessions and every decision row;
  immutable config on resume; r_multiple on all trade closes; 3R daily
  stop (mark-to-market) + REQ-005 config sanity checks; deploy-freeze
  incident (SHA change mid-session → watchdog alert, one-shot);
  SKIP/HOLD reason codes. Migrations applied to prod + sim.
- Process rule now in force: NO pushes to zerodha-brain main between
  09:00–15:30 IST (Railway auto-deploys = mid-session restart).
- Suite: 296 tests passing. Watchdog redeployed with deploy-incident check.

## 2026-07-07 (round 2) — spec-alignment items 1–5 (brain 6e55a51, 5db1889)

Worked the ordered backlog from the spec review:

1. **Chaos drills (REQ-083)** — QA_FAULT fault injection in FakeKiteClient;
   `scripts/qa-scenario-token-expiry.sh` PASSES end-to-end. Found+fixed a
   real silent-failure: expired token was swallowed by market_data → zero-
   trade stall. Now propagates → clean end + durable `token_incident` flag.
   Network-drop covered by unit tests + error-budget → DEGRADED.
2. **Sizing property test (REQ-080)** — deterministic grid sweep.
3. **Alert tiers (REQ-071)** — watchdog P1/P2/P3; token/deploy incidents P1.
4. **Trend tells (REQ-052)** — trend_tells.py, logged non-gating on every
   decision for later validation. breadth_sector abstains (no data yet).
5. **M3 data layer** — level_pack/stock_profile/inplay pure modules +
   tables (prod+sim) + Mac cron runner scripts; data-quality quarantine
   gate WIRED LIVE (REQ-050 step 0). Crons + in-play locker + gating are
   post-run activation.

Suite: 352 tests passing. QA stack 4/4 + token-expiry drill green.
Spec amendments A4 added. Two new watchdog config keys already covered.
Process rule reminder: no pushes to brain main 09:00–15:30 IST.

## 2026-07-08 — M4 piece #6: time-stop + event-day calendar (brain 5cbb721)

- Time-stop exit (REQ-051) and event-day calendar (REQ-053) built, tested,
  shipped. BOTH flag-gated OFF (TIME_STOP_ENABLED / EVENT_DAY_ENABLED) so
  the in-flight paper run is unchanged; flip on once validated.
- Time-stop logs TIME_STOP_WOULD_FIRE while disabled → measure impact first.
- Event policy logged on every decision row (event_policy) for later study.
- Suite 367 passing. QA stack 4/4 (one flaky red under heavy local load;
  clean on isolated re-run — not a regression).
- Spec amendment A5 added. Prod brain redeployed clean (off-hours, 01:14 IST).
- Next per the backlog: activate M3 crons (level_pack/profiles) so ORB +
  level-anchored stops (M4 #8) have data, or REQ-030 config-table cleanup.

## 2026-07-08 (cont) — M3 activated brain-side (brain b933411)

- Level pack now builds automatically at session start (27/27 in sim
  verify); in-play list locks at first cycle ≥09:30 (retry-safe when no
  RVOL baseline). Both idempotent, never-throw, non-gating.
- Deviation from spec recorded (A6): brain-side, not Mac cron — enctoken
  expiry makes an 07:00 cron unauthable. Profiles stay manual
  (scripts/build_profiles.py) until M0.
- Verify run also live-validated REQ-072 deploy incident (fired on resume
  under new SHA) and the 3R daily stop on a resumed session.
- Suite 379 passing. From tomorrow's session, level_pack rows accumulate
  daily in prod — unblocks ORB + level-anchored stops (M4 #8).

## 2026-07-08 (cont) — M4 #8: level filter + anchored stops (brain a9137fb)

- levels.py: level filter (§5 step 6) + level-anchored stops/targets (§5
  step 7), consuming the live M3 level pack. Flag-gated OFF
  (LEVEL_FILTER_ENABLED / LEVEL_STOPS_ENABLED); logged as counterfactual.
- Level packs loaded at init (27/27 in QA); every decision row now carries
  a level_snapshot → REQ-020 full snapshot complete (config_hash + git_sha
  + indicators + trend_tells + event_policy + level_snapshot together,
  verified in sim).
- Suite 395; QA stack 4/4.
- Strategy flags now built + dark: TIME_STOP, EVENT_DAY, LEVEL_FILTER,
  LEVEL_STOPS. Validate against accumulated counterfactuals, then enable.
- Next: ORB archetype, boundary extras (max_open_positions/profit_lockin),
  or REQ-030 config-table cleanup.

## 2026-07-08 (cont) — M4 ORB archetype (brain e5ec3c6)

- orb.py: opening-range breakout, second entry archetype. Flag-gated OFF
  (ORB_ENABLED); logged as counterfactual (orb=) on every decision.
- Promotion made executable: ORB_MIN_CONFIDENCE=70 clears BUY gate; short
  branch accepts archetype==ORB.
- Decision rows now carry orb + level_snapshot + trend_tells + event_policy
  + config_hash + git_sha (verified in sim; ORB fired SELL on synthetic mkt).
- Suite 407; QA 4/4.
- FIVE dark strategy flags now built: TIME_STOP, EVENT_DAY, LEVEL_FILTER,
  LEVEL_STOPS, ORB. Entry+exit+filter machinery complete.
- **Next real milestone = M5 backtest/replay harness** to validate the dark
  flags against accumulating counterfactual logs, then enable with evidence.
  (Lighter alternatives remain: boundary extras, REQ-030 config cleanup.)

## 2026-07-09 — Day-1 data review + stop-latency fix (brain 902f807)

**Day-1 capture (2026-07-08 session): EXCELLENT.** 905 decisions, 100%
carrying all six analytics blocks (config_hash, git_sha, trend_tells,
level_snapshot, orb, event_policy). 23 trades all closed w/ r_multiple.
47 level_pack + 8 inplay rows. Result: 1W/22L, −₹877 (−3.51%), ended by
CIRCUIT_BREAKER — safety layers all worked.

**Two learnings, one fixed:**
1. FIXED — stop-detection latency: stopped longs filled at −2.78R vs −1R
   design because stops were checked once per 5-min cycle against
   cycle-start prices. Now: get_fresh_close (TTL-bypass) + intra-cycle
   check_open_exits every ~30s in the scheduler slice loop. Worst-case
   stop detection 300s → 30s. Every future day's R data is now honest.
2. OPEN — 14/14 shorts lost via signal-flip whipsaw (COVER_SHORT, avg
   −0.40R). Suspected root cause: get_nifty_level stubbed to SIDEWAYS
   (retail enctoken can't fetch index) so no market-direction gate on
   shorts. Trend-tells counterfactuals were logged on all 905 decisions —
   NEXT STEP: counterfactual audit (mini-M5) to see if trend_tells/level
   filter/time-stop would have prevented the losses, then decide flags.

Also fixed REQ-072 incident log spam (dedup per session+sha — yesterday's
autopilot retry loop re-reported one incident every 40s for an hour).
Suite 418. QA 4/4. Deployed off-hours 03:0x IST.

## 2026-07-09 (cont) — market-direction fix + REQ-073 (brain ac54406)

- Dead SIDEWAYS stub (root cause of day-1 short whipsaw) replaced by real
  universe-breadth direction from level_pack PDC vs live price. Logged on
  every decision (market_context); feeds trend-tells breadth_sector.
  MARKET_DIRECTION_ENABLED (default off) gates the engine feed — 6th dark
  flag. Verified in sim.
- REQ-073: decision_to_order_ms per entry (~800ms in QA), prod+sim column.
- Suite 428. QA 4/4. Deployed 03:06 IST (off-hours).
- NEXT: collect a few more days dark, re-run counterfactual audit; if the
  trend-tells/market-direction effect holds, enable those flags first.
  Then REQ-030 config cleanup + M5 replay harness.
