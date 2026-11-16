# Advisor v3 · Phase 0 "fix the ruler" + Phase 4 capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make every advisor grade honest (right benchmark, after-tax, with a confidence interval, on a universe without survivorship) and start the data clocks that later phases need — without changing a single verdict.

**Architecture:** all new logic is pure modules in the brain (`costs.py`, `benchmarks.py`, `universe_history.py`) fed by the existing `candles` table and two free NSE static files; `call_outcomes` gains two alpha columns and the scorecard gains CIs; the dashboard only displays. Capture jobs hang off the existing morning bar sync. v1 scoring untouched (guarded by an existing test that `trend_score` ignores dark inputs).

**Tech Stack:** Python 3.11 (brain), supabase-py 2.5, numpy; Next.js 14 dashboard; Supabase Postgres 17.

**Spec:** [2026-11-16-advisor-v3-roadmap.md](2026-11-16-advisor-v3-roadmap.md) §3 Phase 0 and Phase 4.

## Global Constraints

- No change to any verdict, score, threshold, rotation pick or sizing (operator rule). Test guard: `advise()` output byte-identical before/after on the fixture book.
- Tax constants (verify against Finance Act 2026 before Phase 1 uses them to *act*): STCG 20% (< 12 months), LTCG 12.5% above ₹1,25,000/FY, STT 0.1% each side on delivery, Zerodha CNC brokerage ₹0. Impact cost by ADV bucket: ≥ ₹50 Cr 0.05%, ≥ ₹5 Cr 0.15%, else 0.40% per side.
- Sector cohorts come from `data/nifty500.csv` `sector` (20 NSE macro-sectors) — not from external sector indices. Size cohorts from the three niftyindices constituent CSVs (Nifty 100 / Midcap 150 / Smallcap 250); a name in none = `micro`.
- Point-in-time universe in this phase = names that **left** the Nifty 500 since 2021-06 but still trade on Kite. Truly delisted names are listed, counted, and marked unpriceable; pricing them is Phase 3 (bhavcopy panel).
- Bootstrap: block by `run_date`, 1,000 resamples, seed 0, 95% percentile interval.
- Every new table has RLS enabled with service-role-only policies, like `call_outcomes`.
- `npx next build` before any dashboard push; brain suite green (`pytest -q`) before any brain push.

## Review Focus

1. A call whose sector has < 5 other priced names on a day — `sector_alpha_pct` must be `null`, not a 1-name "cohort". (Task 2 test)
2. A holding bought in several lots across the 12-month line — FIFO must split STCG/LTCG per lot, not use the average date. (Task 1 test)
3. The ₹1.25 L LTCG exemption is per FY per PAN: the model takes `ltcg_used_fy` as input and never assumes zero. (Task 1 test)
4. Bootstrap on n = 1 or all-identical outcomes must return a degenerate interval, not raise. (Task 3 test)
5. A bar-integrity WARN on an ex-demerger day must not block the watermark or score the call on the unadjusted close. (Task 5 test)

---

### Task 1: `costs.py` — round-trip cost and after-tax proceeds

**Files:**
- Create: `costs.py`, `tests/test_costs.py` (brain)

**Interfaces:**
- Produces: `round_trip_cost_pct(adv_inr: float | None) -> float` (STT both sides + 2 × impact by bucket; `None` ADV → worst bucket)
- Produces: `tax_lots(trades: list[dict], symbol: str, account: str) -> list[dict]` — FIFO open lots `{qty, price, date}` from tradebook rows `{symbol, account, trade_type, quantity, price, trade_date}`
- Produces: `after_tax_pct(lots: list[dict], qty: int, sale_price: float, sale_date: str, ltcg_used_fy: float = 0.0) -> dict` → `{gross_pct, stcg_inr, ltcg_inr, tax_inr, cost_inr, net_pct, ltcg_date}` where `ltcg_date` is the day the *next* lot turns long-term
- Produces constants `STCG_PCT=20.0, LTCG_PCT=12.5, LTCG_EXEMPT_INR=125000.0, STT_PCT=0.1, IMPACT_BUCKETS=((50e7,0.05),(5e7,0.15),(0,0.40))`

- [ ] **Step 1: failing tests** — `test_fifo_splits_lots_across_twelve_months` (two lots, 2025-10-01 and 2026-03-01, sale 2026-11-16 of all: first lot LTCG, second STCG), `test_exemption_is_an_input` (`ltcg_used_fy=125000` → full 12.5% on LTCG), `test_round_trip_worst_bucket_when_adv_unknown` (= 0.2 + 0.8 = 1.0).
- [ ] **Step 2: run** `pytest tests/test_costs.py -q` → Expected: FAIL `ModuleNotFoundError: costs`.
- [ ] **Step 3: implement** `costs.py` as pure functions; dates as ISO strings; 12 months = `date + relativedelta(years=1)` (use `dateutil`, already installed).
- [ ] **Step 4: run** → Expected: 3 passed.
- [ ] **Step 5: commit** `feat(costs): round-trip cost + FIFO after-tax proceeds [P-68 phase 0]`.

### Task 2: sector and size alpha on every scored day

**Files:**
- Create: `benchmarks.py`, `tests/test_benchmarks.py`, `data/size_buckets.csv` (symbol,bucket), `scripts/pull_size_buckets.py`
- Modify: `call_scoring.py` (`score_call` signature), `call_outcomes.py` (`update`, `_bars`, upsert columns), `tests/test_call_scoring.py`, `tests/test_call_outcomes.py`
- Migration: `alter table call_outcomes add column sector_alpha_pct numeric, add column size_alpha_pct numeric;`

**Interfaces:**
- Consumes: `score_call(call, bars, nifty_days, prior)` rows; `data/nifty500.csv` sector.
- Produces: `benchmarks.cohort_return(bars: dict, members: list[str], d0: str, d1: str, min_n: int = 5) -> float | None` — equal-weight mean close-to-close % of members priced on both dates
- Produces: `benchmarks.sectors() -> dict[str,str]`, `benchmarks.size_buckets() -> dict[str,str]` (`large|mid|small|micro`)
- Produces: `score_call(..., cohorts: dict | None = None)` where `cohorts = {'sector': [syms], 'size': [syms]}`; each row gains `sector_alpha_pct`, `size_alpha_pct` (signed by direction, like `signed_alpha_pct`; `None` when the cohort is thin)
- `scripts/pull_size_buckets.py` downloads `https://niftyindices.com/IndexConstituent/ind_nifty100list.csv`, `ind_niftymidcap150list.csv`, `ind_niftysmallcap250list.csv` → `data/size_buckets.csv`; committed; refreshed with the Nifty-500 pin audit (Cadence).

- [ ] **Step 1: failing tests** — `test_cohort_return_null_under_min_n`, `test_sector_alpha_signed_by_direction` (SELL call, sector cohort +2%, stock −1% → `sector_alpha_pct = +3.0`), `test_update_writes_cohort_columns` (FakeSupabase upsert carries both keys).
- [ ] **Step 2: run** `pytest tests/test_benchmarks.py tests/test_call_scoring.py -q` → Expected: FAIL (`benchmarks` missing; `score_call() got unexpected kwarg`).
- [ ] **Step 3: implement**; in `call_outcomes.update` build cohorts once per call from `sectors()`/`size_buckets()` ∩ symbols present in `bars`.
- [ ] **Step 4: run** both files + `pytest -q` → Expected: all green.
- [ ] **Step 5: apply migration** (Supabase MCP, project `gilmuwmtdpjccibfhqtx`), then `python3 call_outcomes.py --all` locally → Expected: `[call_outcomes] wrote … rows`, and `select count(*) filter (where sector_alpha_pct is not null) from call_outcomes` > 8,000.
- [ ] **Step 6: dashboard** — `app/api/advisor/calls/route.ts` Call payload adds `sector_alpha_pct`, `size_alpha_pct`; `lib/calls.ts` `verdictSentence` appends `(vs sector {±x.x}%)` when present; scorecard table gets a benchmark toggle Nifty · Sector · Size. e2e `advisor-calls.spec.ts` asserts the toggle renders three values.
- [ ] **Step 7: commit** brain `feat(calls): sector + size alpha on every scored day [P-68 phase 0]`, dashboard `feat(advisor): benchmark toggle on /advisor/calls [P-68]`.

### Task 3: bootstrap confidence intervals on the scorecard

**Files:**
- Modify: `call_lessons.py` (`scorecard`), `tests/test_call_lessons.py`; dashboard `app/advisor/calls/page.tsx` scorecard cells.

**Interfaces:**
- Produces: `call_lessons.block_bootstrap(values_by_date: dict[str, list[float]], stat: callable, n: int = 1000, seed: int = 0) -> tuple[float, float]`
- Scorecard cell shape becomes `{n, hit_pct, hit_ci: [lo, hi], mean_alpha_pct, alpha_ci: [lo, hi]}` for each of the three benchmarks: `by_source[src][td][benchmark]` with `benchmark ∈ nifty|sector|size`.

- [ ] **Step 1: failing tests** — `test_bootstrap_degenerate_on_single_date` (returns `(v, v)`), `test_scorecard_carries_ci_per_benchmark`.
- [ ] **Step 2: run** → Expected: FAIL `AttributeError: block_bootstrap`.
- [ ] **Step 3: implement** with `numpy.random.default_rng(seed)`; resample dates with replacement, pool their values, apply `stat`.
- [ ] **Step 4: run** `pytest -q` → green.
- [ ] **Step 5: dashboard** renders `49.3% [38–61]`; e2e asserts a bracket appears. Commit both repos: `feat(lessons): bootstrap CIs on the scorecard [P-68 phase 0]`.

### Task 4: point-in-time universe (names that left the 500)

**Files:**
- Create: `universe_history.py`, `scripts/build_universe_history.py`, `data/universe_history.csv` (`symbol,joined,left,status`), `tests/test_universe_history.py`
- Modify: `scripts/factor_lab.py`, `scripts/advisor_lab.py` (`--pit` flag), `scripts/pull_daily_history.py` (accept extra symbols)

**Interfaces:**
- Produces: `universe_history.members(date: str) -> set[str]` from the CSV; `status ∈ trading|delisted|renamed`.
- Source of truth for leavers: the niftyindices semi-annual press releases since 2021 (`https://niftyindices.com/Press_Release/ind_prs<ddmmyyyy>.pdf`, confirmed downloadable). Add `pypdf` to `requirements-dev.txt` only; the script parses the "Nifty 500 … Exclusions/Inclusions" tables and writes the CSV; unparsed releases are listed for hand entry.

- [ ] **Step 1: failing test** — `test_members_excludes_a_name_after_it_left`.
- [ ] **Step 2: run** → FAIL. **Step 3: implement** CSV reader + script. **Step 4:** run script → Expected: a CSV with ≥ 100 leavers 2021→2026 and a count of `delisted` printed.
- [ ] **Step 5:** `pull_daily_history.py --symbols-from data/universe_history.csv` extends `daily_history.pkl` with every `trading` leaver (Kite token from the public instrument master, as `audit_nifty500_tokens.py` does). Expected: pkl symbol count > 500.
- [ ] **Step 6:** `factor_lab.py --pit` and `advisor_lab.py --pit` restrict each date's cross-section to `members(date)`. Run both, 10d + 30d. Append a dated "point-in-time re-run" table to `FACTOR_LAB.md` and `ADVISOR_LAB.md` with the before/after IC per factor. Expected: most ICs lower; record it even if not.
- [ ] **Step 7: commit** `feat(lab): point-in-time Nifty 500 membership; labs re-run [P-68 phase 0]`.

### Task 5: bar integrity check + corporate-action patch list

**Files:**
- Create: `data/corporate_actions.csv` (`symbol,date,factor,kind,note`) seeded with `ABFRL,2025-05-22,0.441,demerger,` and `SPLPETRO,2022-06-07,0.509,capital-reduction,verify`; `tests/test_bar_integrity.py`
- Modify: `data_jobs.py` (after `sync_daily_bars`: `check_bar_integrity(through) -> list[dict]`), `data_watchdog.py` (one WARN line per anomaly), `call_scoring._base`/`call_outcomes._bars` (apply `factor` to closes before the action date when scoring across it)

**Interfaces:**
- Produces: `data_jobs.check_bar_integrity(date: str, lo: float = 0.6, hi: float = 1.6) -> list[{symbol, date, ratio}]` over that day's closes vs the previous bar, skipping rows present in `corporate_actions.csv`.

- [ ] **Step 1: failing tests** — `test_integrity_flags_a_halving`, `test_known_action_is_not_flagged`, `test_scoring_adjusts_across_a_listed_action`.
- [ ] **Step 2–4:** RED → implement → GREEN (`pytest -q`).
- [ ] **Step 5: commit** `feat(data): daily bar-integrity check + corporate-action patch list [P-68 phase 0]`.

### Task 6: Phase 4 capture — fundamentals with memory

**Files:**
- Modify: `fundamentals.py` (`store(parsed, asof)` also inserts snapshot rows), `scripts/ingest_fundamentals.py`; `tests/test_fundamentals.py`
- Migration: `create table fundamentals_snapshot (asof date, symbol text, data jsonb, primary key (asof, symbol))` + RLS.
- Backfill: run the ingest over `data/holdings_screener_2026-11-11.txt`, `data/universe_screener_2026-11-11.txt`, `data/universe_extended_2026-11-11.txt` with `--asof 2026-11-11`.

- [ ] **Step 1: failing test** — `test_store_writes_dated_snapshot_rows` (FakeSupabase sees `fundamentals_snapshot` upserts keyed by asof+symbol, and `fundamentals_latest` unchanged in shape).
- [ ] **Step 2–4:** RED → implement → GREEN. **Step 5:** migration + backfill → Expected: `select asof, count(*) from fundamentals_snapshot group by 1` shows 2026-11-11 with > 400 rows.
- [ ] **Step 6:** `monthly-chores` skill text: the Screener export now says "ingest with `--asof <export date>`". Commit `feat(fundamentals): dated snapshots (point-in-time history starts 2026-11-11) [P-68 phase 4]`.

### Task 7: Phase 4 capture — daily all-index closes

**Files:**
- Create: `index_bars.py`, `tests/test_index_bars.py`; migration `create table index_bars (index_name text, trade_date date, open numeric, high numeric, low numeric, close numeric, pe numeric, pb numeric, div_yield numeric, primary key (index_name, trade_date))` + RLS
- Modify: `scheduler.py` `_maybe_sync_daily_bars._run` (after `call_outcomes.update()`: `index_bars.sync()` non-fatal)

**Interfaces:**
- Produces: `index_bars.parse(csv_text: str) -> list[dict]`; `index_bars.sync(through: str | None = None) -> int` fetching `https://nsearchives.nseindia.com/content/indices/ind_close_all_<ddmmyyyy>.csv` for each trading day after the `index_bars_through` watermark (plain GET, no session; confirmed 200 for 13-11-2026, 404 on non-trading days = skip). Backfill script `scripts/backfill_index_bars.py --from 2021-06-14`.
- Captures all ~150 indices incl. Nifty 500, sectoral, Nifty 200 Momentum 30, Nifty 100 Low Vol 30 (Phase 3's external sanity check) and P/E, P/B, yield per index.

- [ ] **Step 1: failing tests** — `test_parse_reads_nifty_500_row`, `test_sync_skips_404_days`. **Step 2–4:** RED → GREEN. **Step 5:** migration + backfill → Expected: `select count(distinct trade_date) from index_bars` ≈ 1,330. **Step 6: commit** `feat(data): daily all-index closes from NSE archive [P-68 phase 4]`.

### Task 8: Phase 4 capture — events and flows (operator decision D1 first)

NSE's JSON endpoints (`/api/corporate-announcements`, `/api/corporates-pit`, board meetings, results) need a browser session cookie; fetching them server-side was blocked in this session as access the operator hasn't sanctioned, and NSE's terms are unclear on it. Two routes; pick one:

- **D1-a (recommended): operator's Chrome, monthly, as a `monthly-chores` step** — the browser is already logged into nothing; the chore saves the JSON for the last 31 days of results dates, insider (PIT) trades, and bulk/block deals into `data/console/nse_<kind>_<date>.json`; `scripts/import_nse_events.py` loads them into `events (symbol, kind, event_date, data jsonb)`. Grading of PEAD/insider trials starts when 60 result dates have accrued.
- **D1-b: server-side fetcher** with NSE's cookie handshake in the brain; the operator accepts the terms-of-use risk and the breakage risk when NSE changes the handshake.

- [ ] **Step 1:** record D1 in this plan. **Step 2:** implement the chosen route with one parser test per feed. **Step 3:** `event_calendar.policy(d, symbol, results_symbols=…)` gets its `results_symbols` from `events` (capture only; no verdict uses it — the advisor doesn't call `policy()` today and still won't).

### Task 9: operator chores this phase (no code)

- **Console tradebook since inception, both accounts** → `scripts/import_tradebook.py`. Today 11 of 23 primary holdings have lots older than 2026-02-11 with no buy date, so `after_tax_pct` cannot split STCG/LTCG for them; Natwar has one day of fills. Without this, Task 1 falls back to "all lots long-term if avg cost was set before 2025-11-16", flagged in the output.
- **Tax inputs**: LTCG exemption already used this FY per account (₹), to seed `ltcg_used_fy`.

---

## Self-review

- Spec coverage: Phase 0 bullets → T4 (PIT), T5 (adjusted bars), T2 (benchmark), T1 (cost + tax), T3 (CIs), T4 step 6 (labs re-run gate). Phase 4 capture → T6 (snapshots), T7 (indices), T8 (events/flows, gated on D1). ✔
- Verdict guard: Global Constraints require the byte-identical `advise()` test; `trend_score` dark-input guard already exists. ✔
- Type consistency: `score_call(..., cohorts)` in T2 is what T3's scorecard reads via `call_outcomes` rows; `after_tax_pct` is not consumed until Phase 1. ✔
- Review Focus 1–5 each pinned to a test in T2, T1, T1, T3, T5. ✔
