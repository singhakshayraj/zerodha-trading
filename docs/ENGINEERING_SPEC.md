# ENGINEERING SPEC — Zerodha Auto-Trading System

**Audience:** the engineer building this (you, or a future you at 11 PM).
**Relationship to VISION.md:** VISION.md is the *why* (strategy rationale,
evidence, philosophy). This document is the *what and how* — every rule
translated into requirements, formulas, state machines, schemas, config
keys, and a milestone plan. Where they conflict, VISION.md wins and this
doc has a bug. Requirement IDs (`REQ-*`) are stable — reference them in
commits and tests.

---

## 0. The contract (what the system promises)

The operator hands the system a config at session start:

```json
{
  "pool_inr": 25000,
  "daily_floor_pct": -5.0,
  "daily_ceiling_pct": 7.0,
  "risk_per_trade_pct": 1.0,
  "mode": "PAPER" | "LIVE"
}
```

**REQ-001** The system MUST halt all trading for the day when realized +
unrealized P&L ≤ `daily_floor_pct` of pool, computed from
**broker-reported data** (not the internal ledger).
**REQ-002** The system MUST halt and bank when P&L ≥ `daily_ceiling_pct`.
The ceiling is a stop, never a target: no behavior may condition on
"distance to ceiling."
**REQ-003** The operational daily stop is **3R** (3 × 1% = −3%); it fires
before the floor on any normal day. Floor firing = incident (the 3R stop
failed) → auto-halt + alert + no restart until investigated.
**REQ-004** Config is immutable within a session; loaded at session start,
hash logged on every decision row.
**REQ-005** Sanity checks at load: `daily_floor_pct` ≥ operational stop;
minimum position size must not force risk > `risk_per_trade_pct`.

No profit is guaranteed. What is guaranteed: bounded loss, honest
accounting (all costs in P&L), and a complete decision log.

---

## 1. Architecture

```
┌─ Mac (analysis, any IP) ──────────────────────────────┐
│ backtester · nightly level-pack cron · profile cron   │
└──────────────┬────────────────────────────────────────┘
               │ Supabase (Postgres)
┌──────────────┴────────────────────────────────────────┐
│ prod: zerodha-trader     staging: zerodha-trading-sim │
└──────────────┬────────────────────────────────────────┘
               │
┌─ Oracle VM (static IP, registered w/ Kite) ───────────┐
│ zerodha-brain (Python): poll → decide → execute       │
│ systemd/Docker · swap enabled · NTP                   │
└──────────────┬────────────────────────────────────────┘
               │ Kite Connect API (₹500/mo)
        quotes/WS (any IP) · orders (static IP only)
┌─ Vercel ──────────────────────────────────────────────┐
│ zerodha-trading (Next.js): dashboard · kill switch    │
└───────────────────────────────────────────────────────┘
```

**REQ-010** Order placement runs ONLY from the VM's registered static IP.
**REQ-011** Market data is always real (Kite quotes/WS); only execution
swaps: `PaperBroker` vs `OrderManager` via `PAPER_TRADING` env. Every
other line of code is shared between paper and live.
**REQ-012** Heavy compute (backtests, profiles, level pack) runs on the
Mac. The VM runs only the polling brain (~500MB RAM budget).
**REQ-013** Compliance preconditions for LIVE mode (hard gate, checked at
startup): Kite Connect auth OK, static IP registered, `market_protection`
set on all market orders, order rate ≪ 10/sec. Any failure → refuse to
enter LIVE.

---

## 2. Data model (Supabase, additive-only during experiment months)

Existing tables (sessions, trades, decisions, brain_heartbeat, config)
persist. New/extended:

```sql
-- nightly, per liquid-universe stock (Mac cron)
level_pack(symbol, date, pdh, pdl, pdc, gap_levels jsonb,
           round_levels jsonb, atr14, vol_curve_20d jsonb,
           weekly_high, weekly_low, computed_at)

-- weekly, per stock (Mac cron)
stock_profile(symbol, asof_date, trendiness, gap_follow_rate,
              range_profile jsonb, sample_sizes jsonb, lookback_days)

-- intraday, written by brain at 09:30
inplay_list(date, rank, symbol, or_rvol, gap_pct, or_high, or_low,
            locked_at)

-- order state machine (§4)
orders(id, client_tag UNIQUE, state, broker_order_id, symbol, side,
       qty, order_type, price, market_protection, created_at,
       state_history jsonb)

positions(id, symbol, state, side, qty, entry_price, stop_price,
          target_price, time_stop_at, r_value_inr, opened_at, closed_at)

reconciliation_log(ts, kind, ledger_view jsonb, broker_view jsonb,
                   mismatch bool, action_taken)

incidents(ts, severity, kind, detail jsonb, resolved_at)
```

**REQ-020** Every `decisions` row carries: git SHA, config hash, full
indicator/level/regime snapshot, and the decision incl. SKIP/HOLD.
**REQ-021** All timestamps stored UTC; business logic reasons in IST.

---

## 3. Configuration (single source, all tunables)

| Key | Start value | Used by | VISION ref |
|---|---|---|---|
| `pool_inr` | 25000 | sizing, boundaries | §4c |
| `risk_per_trade_pct` | 1.0 (live ramp: 0.25→0.5→1.0) | sizing | §4.1, §6c |
| `daily_stop_r` | 3 | risk engine | §4b |
| `daily_floor_pct` / `daily_ceiling_pct` | −5 / +7 | boundary engine | §4c |
| `max_trades_per_day` | 3 | risk engine | §4.7 |
| `max_open_positions` | 1 | risk engine | §4.7 |
| `profit_lockin_r` | 2 | risk engine | §4.7 |
| `min_rr` | 1.5 | trade planner | §4.1 |
| `cost_floor_pct_of_r` | 10 | trade planner | §4.2 |
| `time_stop_min` | 40 (shorts: 25) | exit engine | §4.2, §4.3c |
| `rvol_threshold` | 2.0 | universe | §2.1 |
| `inplay_cap` | 10 | universe | §2.1 |
| `gap_qualifier_pct` | 1.5 | universe | §2.1 |
| `trend_tells_required` | 3 of 4 | regime | §4.3b |
| `short_confidence_min` | 0.70 | shorts | §4.3c |
| `losing_streak_n` | 3 | sizing throttle | §4.6 |
| `level_proximity_block_r` | 0.5 | entry filter | §4.8b |
| `stale_quote_max_s` | 2 × poll interval | data quality | §3b.4 |
| `reconcile_interval_min` | 5 | reconciler | §3b.3 |
| `square_off_ist` | 15:15 (shorts: also hard 15:15 cover) | exit engine | §4.4 |

**REQ-030** No tunable may be hardcoded; all flow from this config table.
**REQ-031** Changing any value = new config hash = logged; mid-session
changes rejected.

---

## 4. State machines (the heart of correctness)

### 4.1 Order lifecycle
```
INTENT ──persist──> SUBMITTED ──ack──> ACKED ──fill──> FILLED
                        │                 │
                     timeout           reject
                        ▼                 ▼
                    ORPHANED          REJECTED
```
**REQ-040** `client_tag` generated + persisted BEFORE the API call.
**REQ-041** Retry path: query broker order book by tag; re-place only if
absent. Never blind-retry.
**REQ-042** Any order in `ORPHANED` → block new entries until
reconciliation resolves it.
**REQ-043** Every market order sets `market_protection` (start: −1);
plain market orders are rejected by the broker (compliance).

### 4.2 Position lifecycle
```
PENDING_ENTRY → OPEN → PENDING_EXIT → CLOSED
        (crash) ↘ UNKNOWN ↗ (recovery resolves)
```
**REQ-044** No new entries while any position is `UNKNOWN`.

### 4.3 Startup recovery (runs on every boot, unconditionally)
```
1 fetch broker positions + open orders
2 fetch ledger state
3 diff
4 adopt broker truth; re-attach stop/time-stop monitors to live
  positions; write incidents for every discrepancy
5 only then: enter decision loop
```
**REQ-045** Time-to-reattached-stops is measured and logged per boot.
**REQ-046** Recovery is exercised by chaos tests (M2), not discovered live.

### 4.4 Session state
```
PRE_OPEN (auth, level pack loaded, calendar check)
  → OBSERVE 09:15–09:30 (build OR, no entries)
  → LOCK_INPLAY at 09:30
  → TRADE_PRIMARY 09:30–11:00
  → TRADE_RAISED_BAR 11:00–13:30
  → TRADE_SECONDARY 13:30–14:45
  → MANAGE_ONLY 14:45–15:15
  → SQUARE_OFF 15:15 → CLOSED
Any state ──(floor/ceiling/3R/kill-switch)──> HALTED
```
**REQ-047** Kill switch: Supabase flag checked every cycle; on set →
flatten all, halt, alert.

---

## 5. Strategy pipeline (per decision cycle)

Order of checks — each is a named, individually-testable function; first
failure short-circuits to a logged SKIP with reason code:

```
0 data_quality(quote)          stale/gap/sanity → QUARANTINE symbol
1 session_state allows entry?
2 boundary_engine: floor/ceiling/3R/lockin/max-trades/streak-throttle
3 symbol in today's inplay_list?
4 regime: trend_tells >= 3?  (direction must match side)
5 signal: entry archetype fired?
     A: ORB — break of 15-min OR high/low
     B: indicator confluence (existing engine)
6 level filter: no major level within 0.5R against the trade
7 trade_plan: stop (beyond nearest level ± profile buffer),
     target = first opposing level; require RR >= 1.5
8 cost check: (roundtrip + expected slippage) <= 10% of R
9 sizing: qty = (pool * risk%) / (entry - stop); floor-vs-1% check
10 shorts only: confidence >= 0.70, TRENDING-down, not CNC-held
→ place order (state machine §4.1)
```

**REQ-050** Every cycle writes a decision row even when the outcome is
SKIP, with the failing step's reason code and full snapshot.
**REQ-051** Exits are evaluated every cycle for open positions, in
priority order: stop hit → target hit → time-stop expired → square-off
time. Shorts: hard cover at 15:15 IST.
**REQ-052** Trend-day tells (all mechanical, computed from index + breadth
+ sector data): gap-hold, VWAP persistence, breadth+sector agreement,
range expansion ≥ 60% of 14-day avg. Tells override the LLM regime call
for entry permission.
**REQ-053** Event-day policy from a calendar table: Tuesdays (NSE weekly
expiry) and last-Tuesday (monthly) → exclude index heavyweights or raise
bar; results-day symbols → stand aside through the event.

---

## 6. P&L, costs, and metrics

**REQ-060** Paper fills = live LTP + adverse slippage + full MIS cost
stack folded into fill price. Live and paper share the P&L code path.
**REQ-061** R-multiple recorded per trade: `(exit − entry)/(entry − stop)`
signed by side. Expectancy, PF, drawdown, win rate all computed net of
costs; raw P&L is display-only.
**REQ-062** Two independent P&L computations: brain ledger (decisions) and
broker-derived (boundary engine, §0). They must agree within tolerance;
divergence → incident.

---

## 7. Observability & ops

**REQ-070** Heartbeat row every cycle; external watchdog (off-VM) alerts
on staleness > 2 intervals.
**REQ-071** Alert tiers: P1 (halt-class: floor hit, orphan unresolved,
reconcile mismatch, silent-failure detection) → immediate push; P2
(degraded: quarantines, missed cycles) → batched; P3 (info) → dashboard.
**REQ-072** No deploys during market hours; experiment months run a frozen
SHA; hotfix ⇒ month clock restarts unless observability-only.
**REQ-073** Decision-to-order latency and stop-detection delay logged per
trade; measured slippage feeds the cost model (whichever is worse is
truth).

---

## 8. Testing requirements

**REQ-080** Unit + property tests on all money math (sizing never exceeds
risk% for ANY input; P&L round-trips; R math).
**REQ-081** Mock suite (staging Supabase): full session lifecycle.
**REQ-082** Replay harness: recorded market days through the real decision
loop — this same harness IS the decision-fidelity checker (VISION §6.2)
and the backtester's execution core.
**REQ-083** Chaos drills (pass required before paper month): kill brain
mid-position; expire token mid-session; drop network mid-order; reboot
VM. Each ends reconciled + alerted + safe.

---

## 9. MILESTONES

Each milestone = deliverables + acceptance criteria (AC). A milestone is
DONE only when every AC passes. Order respects dependencies; M1–M3 are
sequential, M4–M5 can interleave, M6 gates everything after it.

### M0 — Compliance & auth foundation  *(everything depends on this)*
Deliverables: Kite Connect app (₹500/mo plan), VM static IP registered,
`kite_client.py` migrated enctoken → Kite Connect (OAuth daily flow),
`market_protection` in `order_manager.py`, Oracle → PAYG conversion.
AC:
- [ ] Order placed from VM succeeds; same order from Mac IP rejected
- [ ] Market order without protection param rejected; with param fills
- [ ] Daily token renewal runs unattended ≥ 5 consecutive days (or hard
      pre-open alert proven)
- [ ] Historical API returns minute candles for backtest range

### M1 — Order/position state machines + reconciliation
Deliverables: order state machine (REQ-040..043), position states +
UNKNOWN handling, startup recovery sequence, reconciler loop (5 min),
broker-derived boundary P&L (REQ-062).
AC:
- [ ] Simulated timeout-after-ack produces ORPHANED, blocks entries,
      resolves via tag lookup — no duplicate order in mock suite
- [ ] Boot with fake open position: stops re-attached, time measured
- [ ] Injected ledger/broker mismatch → halt + incident row

### M2 — Chaos-hardened infra (VISION gates 1,2,4,5,10,11)
Deliverables: systemd/Docker with auto-restart, swap, NTP, external
watchdog + alert tiers, market-hours scheduler + holiday calendar, kill
switch, all four chaos drills scripted and passing.
AC:
- [ ] VM reboot during mock session: brain back + recovered < 3 min,
      alert received
- [ ] All REQ-083 drills green, repeatable by one command
- [ ] 5 consecutive unattended mock days, zero silent failures

### M3 — Data layer: level pack, profiles, in-play engine
Deliverables: nightly level-pack cron (Mac→Supabase), weekly
stock_profile cron (trendiness, gap-follow, range profile; ≥30-sample
rule with universe-average fallback), 09:30 in-play locker
(opening-range RVOL top-10), data-quality gates (REQ-050 step 0).
AC:
- [ ] Level pack populated for full liquid universe by 07:00 IST
- [ ] In-play list locks at 09:30 with logged RVOL ranks on 5 live days
- [ ] Stale/garbage quote injection → quarantine, not a trade

### M4 — Strategy pipeline v2 in code
Deliverables: pipeline steps 0–10 (REQ-050) as named functions with
reason codes; trend tells (REQ-052); ORB entry archetype alongside the
existing indicator archetype; level filter + level-anchored stops +
first-opposing-level targets; time-stop; shorts per §4.3c incl. CNC
lock; boundary engine (floor/ceiling/3R/lock-in/streak throttle);
event-day calendar.
AC:
- [ ] Every SKIP in mock month carries a machine-readable reason code
- [ ] Unit tests per pipeline step; property test on sizing
- [ ] Short on CNC-held symbol impossible by construction (test proves)

### M5 — Backtest harness + ablations  *(Mac; VISION gate 6)*
Deliverables: replay/backtest core reusing pipeline code on Kite minute
candles; 2020/2021/2022 regime periods; head-to-heads: ORB vs
indicator-confluence entries, fixed-1.5R vs trail-to-close exits;
ablations: level filter, trendiness gate, confluence scoring; costs +
adverse slippage modeled; kill-condition evaluation (PF<1.1 net ⇒
hypothesis rejected ⇒ pivot per VISION §7b).
AC:
- [ ] Same code path as live pipeline (imports, not copies)
- [ ] Full 3-regime run completes on the Mac; results reproducible
- [ ] Report auto-generates: PF/regime, DD, expectancy, per-ablation
      deltas, verdict vs §2.2 kill line

### M6 — DECISION GATE: edge verdict
Not a build milestone — a reading of M5's output against VISION §2.2/§6.1.
Outcomes: (a) pass → M7; (b) fail → execute pivot path (swing/positional
spec becomes a new M-series; infra M0–M4 carries over untouched);
(c) marginal → one iteration loop (change one thing, re-run M5), max N
iterations before treating as fail.

### M7 — One-month paper campaign (VISION §5 all gates + §6.2)
Deliverables: frozen SHA; daily campaign config (₹25k, −5/+7); full
month unattended.
AC (= VISION §6.2):
- [ ] Uptime > 95%, zero silent failures
- [ ] Decision fidelity ≥ 95% vs replay, every mismatch explained
- [ ] All guardrail triggers correct; drawdown < 10%; slippage within
      model

### M8 — Live ramp (VISION §6c)
0.25% risk (4 wks) → 0.5% (4 wks) → 1.0%. Advance criteria per §6c;
any §6b trigger steps back one phase. Deliverable: it runs; you watch.

### M9 — Flywheel operations (VISION §7)
Weekly review job (rule-adherence grading, expectancy tracking), one-
change-at-a-time iteration process with stated predictions, profile v2
(spread, stop-hunt buffers), ML consideration only after 1000+ trades.

---

## 9b. Amendments (2026-07-07 review)

**A1 — Architecture phasing.** §1's Oracle VM + Kite Connect describes
M0's end state. During the paper phase the brain runs on Railway with
retail enctoken auth; REQ-010/013 and all of M0 gate entry to M8 (live),
not the paper campaign. Audits against §1 before M0 should read
"Railway" for "Oracle VM."

**A2 — Sequencing (both-ways decision).** The current month-long paper
run is an **M2 acceptance run** (infra shakedown + data collection —
"5+ consecutive unattended mock days, zero silent failures"), NOT the
M7 campaign. M7 still requires the M5→M6 edge verdict first. In
parallel with the M2 run: M4 pipeline v2 (tells, ORB, level filter,
time-stop) is built and tested against the QA stack, adopted piecewise
as pieces prove out; M5 backtest runs on the data later. Data now,
verdict later, strategy code in parallel.

**A3 — Implemented as of brain `44a6714`:** REQ-004, REQ-020 (git SHA +
config hash on decisions; reason codes partial — brain-level codes done,
per-pipeline-step codes arrive with M4), REQ-031, REQ-003, REQ-005,
REQ-061, REQ-070, REQ-072 (guard + alert; process rule: no pushes to
main 09:00–15:30 IST), REQ-081, REQ-083 (kill-brain drill; token-expiry
and network drills pending), REQ-011, REQ-060, REQ-047.

**A4 — Implemented as of brain `5db1889` (2026-07-07 round 2):**
- REQ-083 chaos drills: token-expiry drill (`qa-scenario-token-expiry.sh`,
  PASSES) + network-drop coverage via QA_FAULT injection + unit tests.
  Found + fixed a silent-failure bug: an expired token was swallowed by
  `market_data`'s blanket excepts → universal empty-candle SKIPs → zero-
  trade stall. Now propagates → clean session end + durable `token_incident`
  flag the watchdog alerts on. VM-reboot drill still pending (Railway
  auto-restart covers the mechanism; not scripted).
- REQ-071 alert tiers P1/P2/P3 in the watchdog.
- REQ-080 sizing property test (grid sweep; no hypothesis dep).
- REQ-052 trend tells: `trend_tells.py`, computed + logged on every decision
  (NON-GATING during the paper run — entry-gating flips on after M5
  validation). `breadth_sector` abstains until M0 unlocks the data feed.
- REQ-050 step 0: `data_quality.py` quarantine gate WIRED LIVE (stale /
  missing / non-finite / >20%-deviation quote → QUARANTINE_* SKIP).
- M3 data layer built + tested (level_pack, stock_profile, inplay ranking,
  tables prod+sim, Mac cron runners) — NOT yet cron-scheduled or gating;
  activation is post-M2-run.

**A5 — Implemented as of brain `5cbb721` (M4 piece #6):**
- REQ-051 time-stop exit — flag-gated (TIME_STOP_ENABLED, default off);
  40m/25m; priority-correct (stop→target→time-stop); logs
  TIME_STOP_WOULD_FIRE while disabled so its impact is measurable first.
- REQ-053 event-day calendar — event_calendar.py; weekly (Tue) / monthly
  (last Tue) expiry; STAND_ASIDE monthly heavyweights, RAISE_BAR weekly
  heavyweights, STAND_ASIDE results-day. Logged on every decision; gates
  entries only when EVENT_DAY_ENABLED (default off).

**A6 — Implemented as of brain `b933411` (M3 activation):** level-pack
builder and 09:30 in-play locker run BRAIN-SIDE, not on the Mac cron the
spec drew — retail enctoken auth makes an 07:00 IST cron impossible (old
token dies ~06:00; fresh one arrives just before 09:15). Level pack builds
at brain.initialize (prior-day data — post-open build loses nothing);
in-play locks at the first cycle ≥09:30. Both idempotent, never-throw,
non-gating. stock_profile stays a manual/weekend Mac script
(scripts/build_profiles.py) until M0 removes the token constraint. Live-
verified in sim: 27/27 level_pack rows; REQ-072 incident + 3R stop also
fired correctly under real conditions during the verify run.

**A7 — Implemented as of brain `a9137fb` (M4 #8):** level filter (§5 step
6) + level-anchored stops/targets (§5 step 7) in levels.py, consuming the
M3 level pack. Flag-gated OFF (LEVEL_FILTER_ENABLED / LEVEL_STOPS_ENABLED),
logged as a counterfactual on every decision. REQ-020 full snapshot now
complete — decision rows carry config_hash + git_sha + indicators +
trend_tells + event_policy + level_snapshot together.

Remaining before M4 proper: per-pipeline-step reason codes, ORB archetype
(entry-side; the level machinery for its stops/targets now exists), boundary
extras (max_open_positions=1, max_trades_per_day=3, profit_lockin_r=2),
move remaining hardcoded tunables into the config table (REQ-030). Then,
once a few days of real level packs + counterfactual logs exist, validate
and flip the strategy flags (TIME_STOP / EVENT_DAY / LEVEL_FILTER /
LEVEL_STOPS) on.

---

## 10. Traceability

| Spec section | VISION source |
|---|---|
| §0 contract | §4c |
| §1 architecture | §3, §3c |
| §4 state machines | §3b.1–3b.3 |
| §5 pipeline | §2.1, §4.1–4.8b |
| §6 metrics | §6 defs |
| §8 testing | §3b.7 |
| M0 | §3c, gate 3 |
| M2 | gates 1,2,4,5,10,11 |
| M5/M6 | gate 6, §2.2, §6.1, §7b |
| M7 | §5, §6.2 |
| M8 | §6c, §6b |