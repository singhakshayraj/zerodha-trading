# Intraday Strategy Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run ~54 pre-registered intraday paper strategies in parallel on the live Nifty 200
feed (1,000+ paper trades/day), each in its own ₹50k MIS book, and show a daily scoreboard
on `/lab`.

**Architecture:**
- A new, self-contained `lab_*` module family in **zerodha-brain**, started as one daemon
  thread from the scheduler's idle loop on trading days.
- It fetches 5-min bars once per cycle, fans them out to pure strategy functions, simulates
  fills through a per-strategy paper book with a margin cap, and writes to four new Supabase
  tables.
- At 15:20 it computes the stats (PF, day-clustered t, SPRT) **in Python** and writes them to
  `lab_daily`. The **zerodha-trading** `/lab` page only reads.

**Tech stack:**
- Brain: Python 3.11, supabase-py, pytest.
- Dashboard: Next.js 14 / TS / Tailwind / recharts, Supabase via `supabaseServer`.

**Spec:** `docs/superpowers/specs/2026-11-18-intraday-strategy-lab-design.md`

## Global constraints

- **Paper only.** No `place_order`, no Kite order endpoint, anywhere in `lab_*`.
- **Advisor untouched.** No edits to `portfolio_advisor.py`, `advisor_*`, grading, or the
  advisor paper books. The lab must yield Kite calls while the advisor or the daily-bar sync
  is running.
- **Book:** ₹50,000 capital; MIS 5× → gross open notional ≤ **₹2,50,000** per strategy;
  **₹25,000 notional per trade**; qty = floor(25000 / price), skip if qty < 1.
- **Charges:** `paper_broker._zerodha_intraday_charges`, with the exchange rate updated to
  **0.00307%** (`0.0000307`).
- **Slippage per leg:** **5 bps** for the top 100 by ADV, **15 bps** for ranks 101–200.
  - Stop exits fill at LTP clamped to **[stop − 0.25R, stop]** (longs; mirrored for shorts),
    with no extra bps.
  - Target exits fill at the target minus the leg bps.
- **Session times (IST):**
  - entries from the 09:30 bar close;
  - **no new entries after 14:30**;
  - **flatten all at 15:15**;
  - daily stats at **15:20**.
- **Limits:** at most **3 entries per symbol per variant per day**.
- **Kite pacing:** historical fetches ≥ **0.35 s** apart; one batch LTP call for exits every
  **30 s**.
- **SPRT:** H0 μ=0 vs H1 μ=0.1R, σ=1.5R, α=0.05/N (N = count of registered variants),
  β=0.2.
  - **Promote** also needs a day-clustered t ≥ **3.72**, PF ≥ **1.3**, and mean net ₹/day ≥
    **+100**.
  - A **killed** variant keeps trading (status only).
- **Storage:** numeric columns only in `lab_trades`, no JSON blobs. Never log per-decision
  rows.
- **Kill switch:** env `LAB_ENABLED` (default `'true'`).
- **Variant ids:** `{ARCH}_{stopTag}_{entryTag}_v1`. A changed rule means a new `_v2` id.
  Re-registering an existing id with different params must raise.

## Review focus

1. **Brain restart mid-session** (Railway redeploy at 11:00). Open positions must reload from
   `lab_trades` rows with `status='OPEN'` for today, not vanish or duplicate. *Test in
   Task 5.*
2. **Token expires mid-day** (`TokenExpiredError`). The lab stops new entries, flattens open
   positions at the last known LTP as `exit_reason='TOKEN_LOST'`, records a `lab_refusals`
   reason `token`, and the scheduler loop keeps running. *Test in Task 5.*
3. **Bar timing:** the in-progress 5-min bar must never be used as a completed bar. A cycle
   at 10:02:30 sees bars up to the 09:55 start only. *Test in Task 2 (`completed_bars`).*
4. **Gap-day prior close:** on Monday or after a holiday, the prior close is the last bar of
   the previous trading day present in the window, not "yesterday". *Test in Task 2.*
5. **Margin cap at the boundary:** an entry bringing open notional to exactly ₹2,50,000 is
   allowed, and one rupee over is refused and counted. *Test in Task 1.*

---

### Task 1: Paper book — fills, costs, R, margin cap

**Files:**
- Create: `zerodha-brain/lab_book.py`
- Modify: `zerodha-brain/paper_broker.py:42` (exchange `0.0000297` → `0.0000307`, and the
  docstring)
- Test: `zerodha-brain/tests/test_lab_book.py`

**Interfaces:**

Produces:
- `@dataclass Position(strategy_id, symbol, side: 'LONG'|'SHORT', qty, entry_price,
  entry_ts, stop, target: float|None, slip_bps, risk_inr, entry_charges, entry_slip_inr,
  db_id: int|None=None)`
- `class Book(strategy_id: str, capital=50000.0, leverage=5.0, notional=25000.0)`, with:
  - `.open: list[Position]`
  - `.entries_today: dict[str,int]`
  - `.try_open(symbol, side, ltp, stop, target, slip_bps, ts) -> Position | str` — the string
    is a refusal reason: `'margin'`, `'symbol_limit'` or `'qty'`
  - `.close(pos, ltp, ts, reason: 'STOP'|'TARGET'|'EOD'|'TOKEN_LOST') -> dict` (a closed-trade
    row, see Task 4)
  - `.check_exit(pos, ltp) -> str|None` (`'STOP'`/`'TARGET'`/None)
- Closed-trade dict keys: `strategy_id, symbol, side, qty, entry_ts, exit_ts, entry_price,
  exit_price, stop, target, exit_reason, gross_inr, charges_inr, slippage_inr, net_inr,
  gross_r, cost_r, net_r`.
- **R definitions:**
  - `risk_inr = |entry_price − stop| × qty`
  - `gross_r = gross_inr / risk_inr`
  - `cost_r = (charges_inr + slippage_inr) / risk_inr`
  - `net_r = net_inr / risk_inr`
  - `gross_inr` is measured at reference prices (pre-slippage).

- [ ] **Step 1: Write failing tests**

```python
def test_long_round_trip_costs():
    b = Book('T'); p = b.try_open('X', 'LONG', ltp=1000.0, stop=990.0, target=None, slip_bps=5, ts='t0')
    assert p.qty == 25 and abs(p.entry_price - 1000.5) < 1e-9          # +5 bps
    row = b.close(p, ltp=1010.0, ts='t1', reason='EOD')
    assert abs(row['exit_price'] - 1009.495) < 1e-6                     # −5 bps
    assert abs(row['gross_inr'] - 250.0) < 1e-6                         # (1010−1000)×25, reference prices
    assert row['net_inr'] == round(row['gross_inr'] - row['charges_inr'] - row['slippage_inr'], 2)
    assert abs(row['gross_r'] - 250.0 / (10.5 * 25)) < 1e-6

def test_margin_cap_boundary():
    b = Book('T')
    for i in range(10): assert isinstance(b.try_open(f'S{i}', 'LONG', 2500.0, 2475.0, None, 5, 't'), Position)
    assert b.try_open('S10', 'LONG', 2500.0, 2475.0, None, 5, 't') == 'margin'   # 10×25,000 = 2,50,000 exactly is full

def test_symbol_limit_three_per_day():
    b = Book('T')
    for _ in range(3): b.close(b.try_open('X', 'LONG', 100.0, 99.0, None, 5, 't'), 100.0, 't', 'EOD')
    assert b.try_open('X', 'LONG', 100.0, 99.0, None, 5, 't') == 'symbol_limit'

def test_stop_fill_clamped_to_quarter_r():
    b = Book('T'); p = b.try_open('X', 'LONG', 100.0, 99.0, None, 5, 't')
    assert b.check_exit(p, 98.0) == 'STOP'
    row = b.close(p, 98.0, 't', 'STOP')
    assert abs(row['exit_price'] - (99.0 - 0.25 * (p.entry_price - 99.0))) < 1e-9

def test_short_mirrors_long():
    b = Book('T'); p = b.try_open('X', 'SHORT', 100.0, 101.0, 98.0, 5, 't')
    assert b.check_exit(p, 98.0) == 'TARGET' and b.check_exit(p, 101.0) == 'STOP'
    assert b.close(p, 98.0, 't', 'TARGET')['gross_inr'] > 0

def test_qty_refusal_for_expensive_stock():
    assert Book('T').try_open('MRF', 'LONG', 130000.0, 129000.0, None, 5, 't') == 'qty'
```

- [ ] **Step 2:** Run `cd zerodha-brain && pytest tests/test_lab_book.py -v`. Expected: FAIL
  with `ModuleNotFoundError: lab_book`.
- [ ] **Step 3:** Implement `lab_book.py`, plus the exchange-rate edit in `paper_broker.py`.
  - Charges: `_zerodha_intraday_charges('BUY'|'SELL', fill_price, qty)` for each leg.
  - The margin check is `sum(p.qty × p.entry_price for p in open) + qty × ltp ≤ capital ×
    leverage`, computed at reference prices (so 10 × ₹25,000 fits exactly).
- [ ] **Step 4:** Run `pytest tests/test_lab_book.py tests/test_paper_broker*.py -v`.
  Expected: PASS. Fix any paper_broker test that pins `0.0000297`, by changing the constant
  it asserts and nothing else.
- [ ] **Step 5:** Commit `feat(lab): paper book with costs, R and MIS margin cap [P-70]`.

---

### Task 2: Strategy archetypes + variant registry

**Files:**
- Create: `zerodha-brain/lab_strategies.py`
- Test: `zerodha-brain/tests/test_lab_strategies.py`

**Interfaces:**

Consumes:
- `indicators.calculate_vwap`, `calculate_atr`
- `inplay.opening_range_stats`
- `signal_engine.SignalEngine().generate_signal`

Produces:
- `completed_bars(candles_5min: list, now_ist: datetime) -> list` drops any bar whose start
  is > now − 5 min.
- `resample(candles_5min: list, minutes: int) -> list` (15, 60), bucketed by IST session start
  09:15.
- `prior_close(candles_5min: list) -> float|None` is the last bar close of the latest date
  before today in the window.
- `@dataclass Ctx(now_ist, symbol, bars: list, ltp: float, nifty_bars: list, rank_adv: int,
  rs_rank: dict)`
  - `rs_rank`: `{'top': set, 'bottom': set}` — filled once at 10:15, empty before then.
- `@dataclass Variant(id, arch, stop_param: float, entry_param: float)`, with
  `.signal(ctx) -> dict|None`.
  - It returns `{'side','stop','target'}` or None.
  - `stop`/`target` are absolute prices; `target` is None for "exit at stop or 15:15 only".
- `VARIANTS: list[Variant]` — **54 ids**.
- `registry_rows() -> list[dict]`: `id, arch, params (dict), rule (str), spec_hash (sha256 of
  json.dumps({'arch','stop_param','entry_param','rule'}, sort_keys=True))`.

**Variant grid (pin these exact values):**

| arch | stop axis (stopTag) | entry axis (entryTag: loose/base/strict) | rule |
|---|---|---|---|
| `CONF` | natural ATR stop × {1,2,4} → `n1/n2/n4` | min confidence {60,70,80} | `generate_signal` on `resample(...,15)` / `resample(...,60)`. BUY/SELL above the threshold. Its target is used only at ×1; it is None at ×2/×4. Window 09:30–14:30. |
| `ORB` | far side of range × {1,2,4} distance → `n1/n2/n4` | OR RVOL ≥ {1.0,1.5,2.0} | `orb.orb_signal(ltp, opening_range_stats(bars))`. Target = 1 OR range from the break at ×1, None at ×2/×4. Window 09:30–11:00. |
| `GAPGO` | {0.5,1,2}% → `s0.5/s1/s2` | abs gap ≥ {1.0,1.5,2.5}% | Evaluated once on the 09:30 cycle. The gap is up and the 09:15–09:25 low stays above the prior close → LONG (mirror for down). Target None. |
| `GAPFADE` | {0.5,1,2}% | abs gap ≥ {1.0,1.5,2.5}% | Once at 09:30. The gap is up and the 09:25 bar close is below the day open → SHORT toward target = prior close (mirror). |
| `VWAPREV` | {0.5,1,2}% | ltp − vwap ≥ {1.5,2.0,3.0} × ATR14(5-min) | `rank_adv ≤ 100` only. Fade toward target = VWAP. Window 09:45–14:30. |
| `RSHOLD` | {0.5,1,2}% | K ∈ {3,5,10} | At 10:15, `rs_rank` holds the top/bottom K of the Nifty 200 by (stock % since prior close − Nifty % since prior close). LONG top, SHORT bottom, one entry/day, target None. |

6 archetypes × 9 = 54. ORB_WIDE from the spec is the ORB ×2/×4 rows.

- [ ] **Step 1: Write failing tests**

```python
def test_registry_has_54_unique_ids_and_stable_hash():
    rows = registry_rows(); assert len(rows) == 54 == len({r['id'] for r in rows})
    assert registry_rows()[0]['spec_hash'] == rows[0]['spec_hash']

def test_completed_bars_drops_in_progress_bar():
    bars = [_bar('2026-11-19T09:50'), _bar('2026-11-19T09:55'), _bar('2026-11-19T10:00')]
    assert [b['timestamp'][11:16] for b in completed_bars(bars, _ist('2026-11-19 10:02:30'))] == ['09:50', '09:55']

def test_prior_close_skips_weekend():
    bars = [_bar('2026-11-20T15:25', close=500), _bar('2026-11-23T09:15', close=510)]   # Fri → Mon
    assert prior_close(bars) == 500

def test_gapgo_long_only_when_gap_holds():
    v = _variant('GAPGO_s1_base_v1')
    ctx = _ctx_gap(prior=100, open_=102, first15_low=101, now='09:30')
    assert v.signal(ctx) == {'side': 'LONG', 'stop': pytest.approx(ctx.ltp * 0.99), 'target': None}
    assert v.signal(_ctx_gap(prior=100, open_=102, first15_low=99.5, now='09:30')) is None
    assert v.signal(_ctx_gap(prior=100, open_=102, first15_low=101, now='09:35')) is None   # once only

def test_no_entries_after_1430():
    assert all(v.signal(_ctx_any(now='14:35')) is None for v in VARIANTS)

def test_vwaprev_only_top100():
    v = _variant('VWAPREV_s1_base_v1')
    assert v.signal(_ctx_vwap(dev_atr=2.5, rank_adv=150)) is None
    assert v.signal(_ctx_vwap(dev_atr=2.5, rank_adv=50))['side'] == 'SHORT'
```

  `_bar`, `_ist`, `_ctx_*` and `_variant` are small helpers in the test file.

- [ ] **Step 2:** Run `pytest tests/test_lab_strategies.py -v`. Expected: FAIL (module
  missing).
- [ ] **Step 3:** Implement `lab_strategies.py` per the grid. Each archetype is one small pure
  function `(ctx, stop_param, entry_param) -> dict|None`, and `Variant.signal` dispatches on
  `arch`. Every archetype rejects outside its window and after 14:30.
- [ ] **Step 4:** Run `pytest tests/test_lab_strategies.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lab): 6 archetypes x 9 variants, pre-registered grid [P-70]`.

---

### Task 3: Stats — PF, day-clustered t, SPRT

**Files:**
- Create: `zerodha-brain/lab_stats.py`
- Test: `zerodha-brain/tests/test_lab_stats.py`

**Interfaces:**

Produces:
- `day_row(trades: list[dict]) -> dict` returns `n, wins, gross_inr, charges_inr,
  slippage_inr, net_inr, net_win_inr, net_loss_inr (positive number), sum_gross_r, sum_cost_r,
  sum_net_r`.
- `cumulative(days: list[dict], n_variants: int) -> dict` returns `cum_n, cum_days,
  cum_net_inr, cum_net_r, pf (None if no losses), win_rate, mean_net_inr_day, t_day (None if
  < 2 days), sprt_llr, sprt_state ('running'|'killed'|'promoted')`.
- `sprt_bounds(n_variants) -> (A, B)`.

- [ ] **Step 1: Write failing tests**

```python
def test_sprt_bounds_n60():
    A, B = sprt_bounds(60); assert abs(A - math.log(0.8 / (0.05/60))) < 1e-9 and abs(B - math.log(0.2/(1-0.05/60))) < 1e-9

def test_kill_line_matches_spec():          # S ≤ 0.05·n − 36 at N=60
    days = [{'n': 1000, 'sum_net_r': 0.05*1000 - 37, 'net_inr': -1, 'net_win_inr': 1, 'net_loss_inr': 2, 'wins': 400}]
    assert cumulative(_fill(days), 60)['sprt_state'] == 'killed'

def test_promote_needs_all_four_gates():
    c = cumulative(_fill(_strong_days(t_high=False)), 54)
    assert c['sprt_llr'] >= sprt_bounds(54)[0] and c['sprt_state'] == 'running'   # SPRT passed but t < 3.72

def test_t_day_uses_daily_means_not_trades():
    c = cumulative(_fill([{'n': 100, 'sum_net_r': 10}, {'n': 1, 'sum_net_r': -1}]), 54)
    assert c['cum_days'] == 2 and c['t_day'] is not None

def test_pf_none_without_losses():
    assert cumulative(_fill([{'n': 1, 'net_win_inr': 50, 'net_loss_inr': 0}]), 54)['pf'] is None
```

- [ ] **Step 2:** Run `pytest tests/test_lab_stats.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - `t_day` = mean of per-day `sum_net_r / n` ÷ (sd / √days).
  - Λ = (0.1/2.25)·S − n·0.01/4.5.
  - Promoted requires Λ ≥ A **and** `t_day ≥ 3.72` **and** `pf ≥ 1.3` **and**
    `mean_net_inr_day ≥ 100`.
  - Killed when Λ ≤ B.
- [ ] **Step 4:** Run `pytest tests/test_lab_stats.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lab): PF, day-clustered t and SPRT [P-70]`.

---

### Task 4: Tables + DB layer

**Files:**
- Create: `zerodha-brain/scripts/lab_tables_2026-11-18.sql` (applied to prod
  `gilmuwmtdpjccibfhqtx` via the Supabase MCP `apply_migration`, name `lab_tables`)
- Create: `zerodha-brain/lab_db.py`
- Test: `zerodha-brain/tests/test_lab_db.py` (mocks `db.supabase`, as in
  `tests/test_call_outcomes.py`)

**Schema:**
- `lab_strategies(id text pk, arch text, params jsonb, rule text, spec_hash text not null,
  registered_at timestamptz default now(), status text default 'running')`
- `lab_trades(id bigserial pk, trade_date date, strategy_id text references lab_strategies,
  symbol text, side text, qty int, entry_ts timestamptz, exit_ts timestamptz, entry_price
  numeric, exit_price numeric, stop numeric, target numeric, status text, exit_reason text,
  gross_inr numeric, charges_inr numeric, slippage_inr numeric, net_inr numeric, gross_r
  numeric, cost_r numeric, net_r numeric)`, indexed on `(trade_date, status)`
- `lab_daily(trade_date date, strategy_id text, <day_row fields>, <cumulative fields>,
  primary key (trade_date, strategy_id))`
- `lab_refusals(trade_date date, strategy_id text, reason text, count int, primary key
  (trade_date, strategy_id, reason))`
- RLS enabled on all four, **with no policies** (service_role only), matching the other
  tables.

**Interfaces:**

Produces:
- `register(rows) -> None` upserts new ids. An existing id with a different `spec_hash`
  raises `ValueError`.
- `insert_open(pos: Position, trade_date) -> int` (returns id)
- `close_trade(db_id, row: dict) -> None`
- `load_open(trade_date) -> list[dict]`
- `bump_refusals(trade_date, counts: dict[(strategy_id, reason), int]) -> None`
- `write_daily(trade_date, rows: list[dict]) -> None`
- `daily_history(strategy_id) -> list[dict]`
- `set_status(strategy_id, status) -> None`

- [ ] **Step 1: Write failing tests**
  - `test_register_rejects_changed_hash`: an existing row's hash differs → `ValueError`.
  - `test_register_idempotent_same_hash`: no upsert is sent.
- [ ] **Step 2:** Run `pytest tests/test_lab_db.py -v`. Expected: FAIL.
- [ ] **Step 3:** Write the SQL file, apply it with `apply_migration`, then implement
  `lab_db.py`.
- [ ] **Step 4:** Run `pytest tests/test_lab_db.py -v` → PASS. Then run
  `select count(*) from lab_strategies` via `execute_sql` → `0`.
- [ ] **Step 5:** Commit `feat(lab): lab_* tables + db layer [P-70]`.

---

### Task 5: Runner + scheduler hook

**Files:**
- Create: `zerodha-brain/lab.py`
- Modify: `zerodha-brain/scheduler.py`. Add `_maybe_run_lab()` and call it in the idle loop
  right after `_maybe_run_lessons()`, **outside** the `_maybe_sync_daily_bars` gate.
- Modify: `zerodha-brain/config.py` (`LAB_ENABLED`, `LAB_UNIVERSE_N = 200`,
  `LAB_FETCH_DELAY_S = 0.35`)
- Test: `zerodha-brain/tests/test_lab.py`

**Interfaces:**

Consumes:
- `Book`, `Position` (Task 1)
- `VARIANTS`, `Ctx`, `completed_bars`, `prior_close`, `registry_rows` (Task 2)
- `day_row`, `cumulative` (Task 3)
- `lab_db.*` (Task 4)
- `tax_context._adv`
- `config.NIFTY500_INSTRUMENT_TOKENS`
- `KiteClient.get_historical_data`, `.get_ltp`
- `data_jobs._is_trading_day`

Produces:
- `pick_universe(today: str, n=200) -> list[(symbol, token, rank_adv)]`: the top n by 20-day
  ADV.
- `class LabRunner(kite, today, should_yield: Callable[[], bool], clock=lambda:
  datetime.now(IST))`, with:
  - `.resume()` loads OPEN rows into books
  - `.cycle()` runs one 5-min decision pass
  - `.check_exits()`
  - `.flatten(reason)`
  - `.finish_day()` writes `lab_daily`, refusals and statuses
  - `.run()` is the loop until 15:25
- **Nifty bars:** token `256265` (`NSE:NIFTY 50`).

**Run loop:**
1. `resume()`.
2. Every 30 s: `check_exits()`.
3. At each 5-min boundary + 30 s from 09:30 to 14:30, unless `should_yield()`: fetch today's
   + 10 prior days of 5-min bars once at the first cycle, and today-only after that, merged
   per symbol. Run `cycle()`.
4. 15:15: `flatten('EOD')`. 15:20: `finish_day()`.
5. On `TokenExpiredError`: `flatten('TOKEN_LOST')` at the last LTPs, refusal reason `token`,
   then `finish_day()` and return.

`scheduler._maybe_run_lab()`:
- Starts **one** daemon thread named `lab` per trading day, when `LAB_ENABLED`, IST ≥ 09:14,
  a token is present, and no `lab` thread is alive.
- `should_yield = lambda: _advisor_running or (_bars_thread and _bars_thread.is_alive())`.
- Any exception in the thread is caught and logged. It never propagates to the loop.

- [ ] **Step 1: Write failing tests** (fake kite returning canned bars/LTPs and a
  controllable clock; `lab_db` monkeypatched to an in-memory dict)
  - `test_cycle_opens_and_eod_closes_positions`: one GAPGO setup → an OPEN row inserted, and
    after `flatten('EOD')` the row is closed with `exit_reason='EOD'`.
  - `test_resume_reloads_open_positions_no_duplicate`: a stored OPEN row → after `resume()`
    the book has 1 open, and the same signal on the next cycle is refused with
    `symbol_limit` only after 3.
  - `test_token_expired_flattens_and_returns`: the fake raises `TokenExpiredError` on fetch →
    every open row closed `TOKEN_LOST`, refusal `token` counted, and `run()` returns without
    raising.
  - `test_yields_while_advisor_running`: `should_yield=lambda: True` → zero fetch calls in
    `cycle`.
  - `test_finish_day_writes_one_row_per_variant_with_trades`
  - `test_scheduler_starts_single_lab_thread` (patch `threading.Thread`; call
    `_maybe_run_lab()` twice → 1 start).
- [ ] **Step 2:** Run `pytest tests/test_lab.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement `lab.py`, the scheduler hook and the config flags.
- [ ] **Step 4:** Run `pytest -q` (full brain suite). Expected: all pass, with the count = the
  previous count + the new tests.
- [ ] **Step 5:** Commit `feat(lab): runner + scheduler hook, LAB_ENABLED [P-70]`.

---

### Task 6: `/lab` page + API

**Files:**
- Create: `zerodha-trading/app/api/lab/route.ts` (pattern: `app/api/pnl/route.ts`)
- Create: `zerodha-trading/app/lab/page.tsx` (pattern and style: `app/pnl/page.tsx`)
- Modify: `zerodha-trading/components/layout/Sidebar.tsx` (add `{ href: "/lab", label: "Lab",
  icon: FlaskConical }` after `/pnl`)

**API:** `GET /api/lab` returns:
- `{ strategies: lab_strategies[], latest: lab_daily rows for max(trade_date), series:
  [{trade_date, strategy_id, cum_net_inr}] }`
- `refusals` for the latest date.

**Page:**
- **Header line:** the best variant by `pf` among `cum_n ≥ 300`. If none qualify, show
  "n not yet meaningful (need 300 trades)". Show its `cum_days`.
- **Caveat line (fixed copy):** "Variants trade the same stocks at the same moments — the
  real sample is trading days, not trades."
- **Tiles:** today's trades (sum of n), today's net ₹, the count of variants with cum net >
  0, and a promoted count.
- **Table**, sorted by `cum_net_inr` desc, with columns:
  - id
  - today n
  - today net ₹
  - cum n
  - cum days
  - cum net ₹
  - PF
  - win %
  - avg gross R / avg cost R
  - t_day
  - SPRT chip (running grey, killed muted/strikethrough, promoted green)
  - refusals today
- **Chart:** a recharts line of `cum_net_inr` by day for the top 5 variants + all `CONF_*`
  baselines.

- [ ] **Step 1:** Implement the route and the page.
- [ ] **Step 2:** Run `cd zerodha-trading && npm run build`. Expected: build succeeds with no
  type errors.
- [ ] **Step 3:** Run `npm run dev`, log in with `DASHBOARD_PASSWORD` and open `/lab`.
  Expected: the page renders an empty state ("No lab trades yet") with no console errors.
- [ ] **Step 4:** Commit `feat(lab): /lab scoreboard page [P-70]`.

---

### Task 7: Docs, deploy, first-day verification

**Files:**
- Modify: `zerodha-trading/docs/PIPELINE.md`. Add **[P-70] Intraday Strategy Lab** under
  IN PROGRESS, with the source (operator 2026-11-18, freeze lifted for paper intraday) and
  the spec/plan links.
- Modify: `zerodha-trading/docs/STATUS.md` (a top "Last updated" line)
- Modify: `zerodha-trading/docs/reference/VERIFY.md`. Add V-45 (trades land, ≥ 1,000 on the
  first full token day), V-46 (`charges_inr` per row equals `_zerodha_intraday_charges` for
  both legs, ±₹0.01) and V-47 (max open notional per strategy per day ≤ ₹2,50,000), each
  with runnable SQL.
- Modify: `zerodha-trading/app/learn/page.tsx`. Add a short "Strategy lab (paper)" section
  (behaviour change rule).
- Modify: `zerodha-trading/docs/README.md`. Link the spec, the plan and
  `reference/INTRADAY_REOPEN_PROMPT.md`.

- [ ] **Step 1:** Make the doc edits. Run `npm run build` → success.
- [ ] **Step 2:** Push both repos. Deploy the brain with `zerodha-brain/scripts/deploy.sh`,
  and confirm the Vercel deployment READY via the Vercel MCP.
- [ ] **Step 3:** Run `select count(*) from lab_strategies` → `54`. This registers on the
  first thread start; to force it, run `python -c "import lab_db, lab_strategies;
  lab_db.register(lab_strategies.registry_rows())"` locally with prod env.
- [ ] **Step 4 (next trading day, after the token paste):** at 10:00 IST run
  `select count(*) from lab_trades where trade_date = current_date`. Expected: > 0. After
  15:25, check that `lab_daily` has a row for every variant that traded, and run the
  V-45/46/47 SQL.
- [ ] **Step 5:** Commit `docs: P-70 strategy lab shipped; V-45..47 [P-70]`.

---

## Deferred (not in this plan)

- **Archiving raw `lab_trades` older than 60 days to Parquet** (spec §4). Add it when the DB
  passes ~350 MB or on 2027-01-17, whichever comes first. It needs `pyarrow` added to the
  brain requirements. The trigger is noted in VERIFY V-45.
