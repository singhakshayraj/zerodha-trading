# S5 Momentum Paper Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ₹50k paper book that runs S1-T (monthly momentum + Nifty 200-DMA filter) on every month-end session from 2026-12-31. It fills at the 15:25 price with exact CNC costs, Telegrams the trades, and is marked to market daily.

**Architecture:**
- New brain module `s5_momentum.py`: a pure `rank()` that mirrors the kit's `backtest.py`, plus `run_s5()`, which rebalances and snapshots.
- The book lives in the existing `advisor_paper_positions` / `advisor_paper_equity` tables as `book='S5'`, using the PICKING_RP pattern.
- Bars are fetched from Kite at run time (Kite day bars are split-adjusted). Nothing new is stored.
- It is scheduled post-close on a daemon thread.

**Tech Stack:**
- Python 3.11, numpy, supabase-py, pytest with the `tests/fake_supabase.py` conftest.
- Next.js dashboard (zerodha-trading).

**Spec:** `docs/superpowers/specs/2026-11-19-s5-momentum-paper-design.md` (zerodha-trading). Rules: `docs/reference/s1_momentum/PREREG.md` (S1-T).

## Global Constraints

- Paper only. No `order_manager` / `kite.place_order` import in `s5_momentum.py` (test-pinned).
- Constants are copied verbatim from the kit:
  - `N_HOLD=10`, `BUFFER=20`, `TOP_LIQ=200`, `MIN_HIST=260`, `MIN_PRICE=20.0`;
  - `SLIP=0.0010`, `STT=0.001`, `STAMP=0.00015`, `TXN=0.0000307`, `SEBI=0.000001`,
    `GST=0.18`, `DP=15.34`;
  - windows: liquidity median 126 (min 100), vol 252 (min 200), R6 126, R12 252, Nifty SMA 200.
- `S5_START='2026-12-31'`, `S5_CAPITAL=50000.0`, `CATCHUP_SESSIONS=5`, split band `[0.70, 1.45]`.
- Book id `'S5'`. app_config keys: `s5_seed`, `s5_last_rebalance`. Flag: `S5_PAPER_ENABLED` (default `'true'`).
- Baseline index name, exactly as in `index_bars`: `'Nifty200 Momentum 30'`.
- Any rule change after trial 265 is frozen is a new trial number.

## Review Focus

1. **Token dead on the month-end session.** The book catches up with that session's 15:20 bars for up to 5 sessions. After that it marks the month `skipped` and does not trade late. (Task 4 test)
2. **A held name has no 15:20 bar (halted).** It sells at its last close. A buy candidate with no bar is skipped for the next rank and logged. (Task 4 test)
3. **A split or bonus on a held name.** The quantity is patched once and equity doesn't show a fake loss. (Task 4 test)
4. **The DB rejects the position insert.** The month guard is not written, so the next run retries. This is the PICKING_RP bug. (Tasks 2 and 4 tests)
5. **A same-day rerun after a restart.** No duplicate trades. (Task 4 test)

---

### Task 1: Freeze the S5 registration (trial 265)

**Files** (all zerodha-trading):
- Create: `docs/reference/s1_momentum/PREREG_S5.md`
- Create: `docs/reference/s1_momentum/PREREG_S5.sha256`
- Modify: `docs/reference/TRIAL_LEDGER.md`

- [ ] **Step 1:** Write `PREREG_S5.md`. It is S1-T exactly as in PREREG.md, plus **Addendum B (live adaptations)**:
  - Data: Kite day bars (split/bonus adjusted) with the `corporate_actions.adjust` demerger patch. Universe: the current Nifty-500 pin.
  - Traded value = close × volume. Sessions are each symbol's own bars.
  - The 15:25 price is the close of the 15:20 5-minute bar. A held name with no bar sells at its last close. A buy candidate with no bar is skipped.
  - Month-end = the last NSE session of the month (`config.NSE_HOLIDAYS`). A missed month-end catches up for up to 5 sessions using that day's bars, or else the month is skipped.
  - Split patch: k = entry_price ÷ the adjusted close on the entry date. Outside [0.70, 1.45], set qty to qty×k and entry_price to entry_price÷k.
  - Start 2026-12-31, ₹50,000, no top-ups.
  - Decision on 2028-12-31: adopt only if net CAGR beats the Nifty200 Momentum 30 price index **and** max drawdown is smaller. Otherwise the fund wins.
- [ ] **Step 2:** Hash it: `shasum -a 256 docs/reference/s1_momentum/PREREG_S5.md > docs/reference/s1_momentum/PREREG_S5.sha256 && date -u +%FT%TZ >> docs/reference/s1_momentum/PREREG_S5.sha256`.
- [ ] **Step 3:** Update the ledger:
  - add the row `S5 live paper (S1-T re-registered, judged 2028-12-31) | 1`;
  - set the total to **264** and the threshold row to `264 → 3.73` (`python3 -c "from statistics import NormalDist as N; print(round(N().inv_cdf(1-0.025/264),2))"`);
  - add a section `## Registered 2026-11-19 — S5 live paper (trial 265; 264 reserved for S2)` with the hash.
- [ ] **Step 4:** Commit: `git commit -m "docs: register S5 live paper as trial 265 [P-71]"`.

### Task 2: Paper-book CHECK constraint + PICKING_RP silent failure

Found 2026-11-19. Both tables allow only `book IN ('MANAGEMENT','PICKING')`. PICKING_RP's 11-18 inserts were rejected, the error was swallowed, and the month guard was written anyway. Result: 0 rows, and no retry until December. V-44 would read FAIL.

**Files** (brain):
- Create: `scripts/paper_book_check_2026-11-19.sql`
- Modify: `advisor_paper.py` (`_rebalance_rp`)
- Modify: `tests/fake_supabase.py`
- Test: `tests/test_advisor_paper_rp.py`

**Interfaces:**
- Produces: the DB and FakeSupabase both accept `book ∈ {'MANAGEMENT','PICKING','PICKING_RP','S5'}`, and FakeSupabase raises on any other value for `advisor_paper_positions` / `advisor_paper_equity`.

- [ ] **Step 1: Failing tests.**
  - `test_rp_guard_not_written_when_insert_fails`: patch `db.insert_paper_positions` to return 0 and run a rebalance day. Assert `db.get_config('advisor_paper_rp_last_rebalance') is None`.
  - `test_fake_rejects_unknown_book`: inserting `{'book': 'NOPE', ...}` into `advisor_paper_positions` raises.
- [ ] **Step 2:** Run `pytest tests/test_advisor_paper_rp.py -v`. Expected: both new tests FAIL.
- [ ] **Step 3: Code changes.**
  - In `_rebalance_rp`, write `_RP_LAST_KEY` only when `not new` or `db.insert_paper_positions(new) == len(new)`.
  - In FakeSupabase's insert/upsert for the two tables, raise `ValueError` when `book` is not in the allowed set.
- [ ] **Step 4:** Run `pytest tests/ -q`. Expected: all green.
- [ ] **Step 5: Migration.** Write the SQL file to drop and re-add both `*_book_check` constraints with the four books. Apply it with Supabase MCP `apply_migration` on project `gilmuwmtdpjccibfhqtx`. Verify with `select pg_get_constraintdef(oid) from pg_constraint where conname like 'advisor_paper_%book_check'`: both rows list the four books.
- [ ] **Step 6: Reset the RP book so it reseeds cleanly on the next official run.** Run `delete from app_config where key in ('advisor_paper_rp_last_rebalance','advisor_paper_seed_rp')`. In zerodha-trading `docs/reference/VERIFY.md`, add an 11-19 reading under V-44: FAIL (0 rows), root cause, fixed.
- [ ] **Step 7:** Commit both repos: `fix(paper): book CHECK rejected PICKING_RP; never write the RP guard on a failed insert [P-68]`.

### Task 3: `s5_momentum.rank` (pure)

**Files** (brain):
- Create: `s5_momentum.py` (constants plus `rank`)
- Test: `tests/test_s5_momentum.py`

**Interfaces:**
- Produces: `rank(bars: dict[str, list[dict]], nifty: list[dict], asof: str) -> dict`.
  - Input bars are Kite dicts (`timestamp`, `close`, `volume`). Only bars with `str(timestamp)[:10] < asof` are used.
  - Returns `{'ranked': list[str], 'risk_off': bool, 'eligible': int}`. `ranked` is the top-`TOP_LIQ` liquid eligible names ordered by score, best first.

- [ ] **Step 1: Failing tests** (synthetic geometric series of 300 bars, volume 1e6):
  - `test_rank_orders_by_momentum`: daily growth AAA 0.3% > BBB 0.1% > CCC 0%, with equal vol noise. `ranked[:3] == ['AAA','BBB','CCC']`.
  - `test_rank_excludes_short_history_and_penny`: a 259-bar name and a ₹19 name are both absent from `ranked`.
  - `test_rank_liquidity_cut`: with `TOP_LIQ` patched to 2, the lowest-value name of 3 is absent.
  - `test_risk_off_below_sma200`: a Nifty series ending below its 200-bar mean gives `risk_off is True`. A rising one gives False.
  - `test_rank_ignores_asof_bar`: a huge `asof`-dated bar for CCC does not change the order.
  - `test_no_order_imports`: the source of `s5_momentum.py` contains neither `order_manager` nor `place_order`.
- [ ] **Step 2:** Run `pytest tests/test_s5_momentum.py -v`. Expected: FAIL (no module).
- [ ] **Step 3:** Implement `rank` with numpy, following the kit's `run()`:
  - Use `corporate_actions.adjust` on the closes.
  - Eligibility: bars ≥ 260 and last close ≥ 20.
  - vol = std(log returns, last 252, ddof=1, ≥ 200 returns) × √252. R6/R12 = last/close[-127] − 1 and last/close[-253] − 1.
  - Take the median of the last 126 values (≥ 100), keep the top 200, then z-score (ddof=1) each of R6/σ and R12/σ, and score = 0.5·z6 + 0.5·z12.
  - risk_off = the last Nifty close < the mean of the last 200 closes.
- [ ] **Step 4:** Run `pytest tests/test_s5_momentum.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(s5): momentum rank mirroring the S1 kit [P-71]`.

### Task 4: Rebalance, split patch, snapshot, `run_s5`

**Files** (brain):
- Modify: `s5_momentum.py`
- Modify: `advisor_paper.py` (rename `_nifty500_close(run_date)` to `_index_close(run_date, name='Nifty 500')` and update its one caller)
- Modify: `config.py` (`S5_PAPER_ENABLED`, `S5_START`, `S5_CAPITAL`)
- Test: `tests/test_s5_momentum.py`

**Interfaces:**
- Consumes:
  - `rank()` from Task 3;
  - `advisor_paper._reconstruct_cash(book, positions, seed_cash)`, `_open_position`, `_close_position`, `_index_close`;
  - `db.paper_positions`, `insert_paper_positions`, `update_paper_position`, `upsert_paper_equity`, `get_config`, `write_config`;
  - `data_jobs._is_trading_day(d)`;
  - `telegram.send_message`.
- Produces:
  - `buy_fill(px: float, qty: int) -> float`: all-in per-share cost = (qty·px·(1+SLIP) + charges(qty·px, 'buy')) / qty;
  - `sell_fill(px: float, qty: int) -> float`: (qty·px·(1−SLIP) − charges(qty·px, 'sell') − DP) / qty;
  - `pending_rebalance(today: str, last: dict | None) -> tuple[str, str] | None`: returns `(month_end, 'run' | 'skip')`, or None;
  - `patch_splits(positions: list, bars: dict) -> int`: the count patched;
  - `run_s5(md, today: str = None) -> dict`: `{'rebalanced': str | None, 'snapshot': bool}`.

- [ ] **Step 1: Failing tests** (FakeSupabase, MagicMock `md` serving day and 5-minute bars):
  - `test_fills_match_kit_costs`: `buy_fill(1000, 5)` and `sell_fill(1000, 5)` equal hand-computed values. Sell includes DP 15.34 and 10 bps.
  - `test_pending_rebalance`:
    - `('2026-12-31', None) → ('2026-12-31', 'run')`;
    - `('2026-12-30', None) → None`;
    - `('2027-01-08', None) → ('2026-12-31', 'skip')` (6 sessions later);
    - `('2027-01-07', {'date': '2026-12-31', 'status': 'run'}) → None`.
  - `test_first_rebalance_buys_ten_and_seeds`: 30 ranked names, all affordable. 10 open S5 positions, `s5_seed.capital == 50000`, and cash ≥ 0.
  - `test_risk_off_sells_all_buys_none`.
  - `test_buffer_keeps_rank_20_sells_rank_21`.
  - `test_missing_1520_bar`: a held name with no bar sells at its last close. A candidate with no bar is skipped and the next rank is bought.
  - `test_split_patch`: entry 1000 × 5, and the adjusted entry-date close is now 500. Expect qty 10 and entry 500. A second call patches 0.
  - `test_rerun_same_day_no_duplicates`: running twice gives the same position count.
  - `test_insert_failure_no_guard`: `insert_paper_positions` returns 0, so `s5_last_rebalance` is unset.
  - `test_snapshot_baseline`: an equity row for `book='S5'`, with baseline = 50000 × the Nifty200 Momentum 30 ratio since inception.
- [ ] **Step 2:** Run `pytest tests/test_s5_momentum.py -v`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - **Fetching:** fetch day bars for the Nifty-500 pin plus held names. Use `days = max(400, (today − oldest open entry_date).days + 10)`. Warm `md._instrument_cache` from `config.NIFTY500_INSTRUMENT_TOKENS`, sleep `ADVISOR_UNIVERSE_SCAN_DELAY_MS` between calls, and get Nifty 50 via token 256265.
  - **The 15:20 bar:** the `'5minute'` bar where `str(ts)[:10] == month_end and str(ts)[11:16] == '15:20'`.
  - **Abort without writing the guard** when Nifty bars are empty or `TokenExpiredError` is raised.
  - **Rebalance:** sells, then equity = cash + held × px, then buys in rank order. Use `min(equity/10, cash/slots)` and `floor(budget / buy_fill(px, 1))`, then re-check that `q·buy_fill(px, q) ≤ cash` (decrement q until it holds). Rows use `source='S5'`.
  - **Writing:** insert all new rows, then write `s5_last_rebalance` as `{'date', 'status': 'run'}` only if the count matches. A `skip` result writes `{'date', 'status': 'skipped'}` and logs.
  - **Telegram:** one message (sells, buys qty@px, risk-off, equity) via `config.ADVISOR_TELEGRAM_BOT_TOKEN/CHAT_ID`.
  - **Snapshot every run once seeded:** equity row with `nifty_level` = Nifty 50.
  - **Gate:** `run_s5` returns early when `not config.S5_PAPER_ENABLED`.
- [ ] **Step 4:** Run `pytest tests/ -q`. Expected: all green.
- [ ] **Step 5:** Commit: `feat(s5): paper rebalance, split patch, daily snapshot [P-71]`.

### Task 5: Scheduler wiring + deploy

**Files** (brain):
- Modify: `scheduler.py` (new `_maybe_run_s5()`, called in the main loop after `_maybe_run_lab()`)
- Test: `tests/test_scheduler.py`

- [ ] **Step 1: Failing tests.**
  - `test_s5_outside_window_noop`: at 15:39 IST, no thread starts.
  - `test_s5_runs_once_per_day`: two calls in the window start one thread.
- [ ] **Step 2:** Run `pytest tests/test_scheduler.py -k s5 -v`. Expected: FAIL.
- [ ] **Step 3:** Copy `_maybe_backfill_candles`'s shape:
  - skip on QA_MODE, weekends and holidays;
  - window 15:40–16:30;
  - `_s5_days` / `_s5_inflight` sets and a live-token check;
  - a daemon thread calling `s5_momentum.run_s5(MarketData(KiteClient(token)))`;
  - mark the day done only on a return without exception.
- [ ] **Step 4:** Run `pytest tests/ -q`. Expected: all green.
- [ ] **Step 5:** Commit, then `scripts/deploy.sh`. Confirm the Railway log shows `GIT_SHA` = HEAD. On the next trading day, the 15:40 log shows `[s5]` "before start" (no snapshot until it is seeded).

### Task 6: Dashboard card + docs

**Files** (zerodha-trading):
- Modify: `app/api/advisor/accountability/route.ts:53` (`BOOKS` gets `"S5"`)
- Modify: `app/advisor/accountability/page.tsx` (one card like the PICKING_RP card at ~371, titled "S5 momentum (paper)", baseline "Nifty200 Momentum 30")
- Modify: `e2e/advisor.spec.ts` (mock `S5: empty`)
- Modify: `docs/reference/VERIFY.md` (next free V-id; V-50 as of writing)
- Modify: `docs/PIPELINE.md` (P-71 entry)

- [ ] **Step 1:** Make the code changes. Run `npm run build`. Expected: build succeeds.
- [ ] **Step 2:** Run `npx playwright test e2e/advisor.spec.ts`. Expected: PASS.
- [ ] **Step 3: VERIFY row "S5 first rebalance lands", registered 2026-11-19 [P-71].** On 2026-12-31 after 16:30 IST:
  - `select count(*) from advisor_paper_positions where book='S5' and is_open` = 10, or 0 with risk-off in the Telegram message;
  - `s5_last_rebalance.status = 'run'`;
  - one `advisor_paper_equity` S5 row per trading day after that.

  **NOT-YET** before 2026-12-31.
- [ ] **Step 4:** Update the P-71 entry: "S5 paper built (trial 265), first rebalance 2026-12-31".
- [ ] **Step 5:** Commit and push. Confirm the Vercel deployment is READY.
