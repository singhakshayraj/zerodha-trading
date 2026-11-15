# Call Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score every advisor call every trading day for 60 days (alpha, path, pair) and report pre-registered "lessons" about which day-of-call attributes produce bad calls — without touching any verdict.

**Architecture:** Brain (Python, Railway) owns the data: a new `call_outcomes` table filled each morning after the daily-bar sync, and a weekly lessons job that writes `app_config.call_lessons_latest` / `call_scorecard_latest`. Dashboard (Next.js) reads them through two new API routes and shows a `/advisor/calls` page; the Ask drawer gets a `call_scores` tool over the same route. The morning brief gains a `lessons` line.

**Tech Stack:** Python 3.9, supabase-py, scipy 1.9 (`binomtest`), pytest + `tests/fake_supabase.py`; Next.js 14.2, TypeScript, Playwright (`PW_CHANNEL=chrome`), inline SVG for the sparkline.

**Spec:** `docs/superpowers/specs/2026-11-16-call-evaluation-design.md`

## Global Constraints

- Brain repo `~/Desktop/GITHUB/zerodha-brain`, dashboard repo `~/Desktop/GITHUB/zerodha-trading`; each task commits in the repo it touches. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Python 3.9 syntax (no `match`, no `X | Y` types). Every DB-facing test uses `FakeSupabase` via `patch.object(<module>.db, 'supabase', fake)`; the autouse guard in `tests/conftest.py` blocks production.
- No new dependencies. Daily bars come from `candles` (interval `day`, columns `symbol, trade_date, close`); the Nifty is symbol `NIFTY 50` (`universe_calls.INDEX`).
- The official grade columns on `portfolio_advice` (`outcome_*`, `evaluated_at`) are never written by this work.
- Config values from the spec: horizon 60 trading days; checkpoints 5, 10, 20, 40, 60; `PAIR_COST_PCT = 0.3`; `should_have_sold` at mae ≤ −10; lesson at checkpoint 20, n ≥ 30, hit-rate gap ≥ 15 points, one-sided binomial p ≤ 0.05 / buckets scanned; a lesson clears after two consecutive runs below threshold.
- Page copy: plain English, ₹ with Indian commas, no jargon. Reply length to the operator stays ≤ 4 sentences.

## Review Focus

1. A call whose symbol has no bar on a Nifty day (holiday halt, delisting, missing sync) must produce a gap, not a zero return or a crash → Task 1 test `test_missing_symbol_bar_is_a_gap`.
2. Re-running the morning update twice (or after a missed morning) must not duplicate rows or recompute mae/mfe wrongly from a partial history → Task 2 test `test_update_is_idempotent_and_catches_up`.
3. A sell row whose target has no bar on the call day (unheld name, bar sync skipped it) must still score the sell and leave `pair_pct` null → Task 1 test `test_pair_without_target_bars`.
4. Lessons on a day where one bucket has n ≥ 30 but the overall population is tiny (first weeks) must not fire from noise → Task 3 test `test_haircut_blocks_a_small_scan`.
5. The page for a day with calls but fewer than 1 scored day (today) must say "no scored days yet", not render empty tiles → Task 6 e2e `calls page explains an unscored day`.

---

### Task 1: Pure scoring of one call

**Files:**
- Create: `call_scoring.py` (brain)
- Test: `tests/test_call_scoring.py`

**Interfaces:**
- Produces:
  - `HORIZON = 60`, `CHECKPOINTS = (5, 10, 20, 40, 60)`, `PAIR_COST_PCT = 0.3`, `SHOULD_HAVE_SOLD_PCT = -10.0`
  - `direction(verdict: str) -> int` — −1 for `SELL`, `SELL_ON_BOUNCE`, `TRIM`; +1 for `HOLD`, `BUY`; `0` for anything else (skipped).
  - `score_call(call: dict, bars: dict, nifty_days: list) -> list[dict]` where `call = {'source','account','run_date','symbol','entry','direction','target': str|None, 'target_entry': float|None}`, `bars = {symbol: {date: close}}`, `nifty_days` = ascending Nifty bar dates. Returns one dict per trading day after `run_date` (td 1..60) on which the symbol has a bar: `{'source','account','run_date','symbol','td','date','close','ret_pct','nifty_pct','signed_alpha_pct','mae_pct','mfe_pct','pair_pct'}`; percentages rounded to 2 dp; `pair_pct` only when `target` and the target has a bar that day, else `None`.
  - `summarize(rows: list[dict], direction: int) -> dict` → `{'days': int, 'signed_alpha_pct', 'mae_pct', 'mfe_pct', 'correct': bool, 'early_wrong_days': int, 'should_have_sold': bool, 'at': {5: float|None, 10:…, 20:…, 40:…, 60:…}}` (`at[k]` = signed alpha on td k or `None` if not reached).

- [ ] **Step 1: Write the failing tests**

```python
import call_scoring as cs

NIFTY = {f'2026-11-{d:02d}': 100 + i for i, d in enumerate((3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 18))}
DAYS = sorted(NIFTY)

def _bars(sym_closes):
    return {'NIFTY 50': NIFTY, **sym_closes}

def test_sell_call_wrong_three_days_then_right():
    # entry 100 on 11-03; stock rises to 104 then falls to 90; Nifty +1/day
    closes = dict(zip(DAYS[1:], [102, 103, 104, 96, 93, 90, 90, 90, 90, 90, 90]))
    call = {'source': 'advice', 'account': 'primary', 'run_date': '2026-11-03', 'symbol': 'AAA',
            'entry': 100.0, 'direction': -1, 'target': None, 'target_entry': None}
    rows = cs.score_call(call, _bars({'AAA': closes}), DAYS)
    assert [r['td'] for r in rows] == list(range(1, 12))
    assert rows[0]['ret_pct'] == 2.0 and rows[0]['nifty_pct'] == 1.0 and rows[0]['signed_alpha_pct'] == -1.0
    assert rows[3]['signed_alpha_pct'] == 8.0            # 96: ret -4, nifty +4 -> alpha -8, signed +8
    assert rows[3]['mae_pct'] == -1.0 and rows[3]['mfe_pct'] == 8.0
    s = cs.summarize(rows, -1)
    assert s['correct'] and s['early_wrong_days'] == 3 and s['at'][5] == rows[4]['signed_alpha_pct'] and s['at'][20] is None

def test_pair_after_costs_and_pair_without_target_bars():
    closes = dict(zip(DAYS[1:], [100] * 11)); tgt = dict(zip(DAYS[1:], [110] * 11))
    call = {'source': 'advice', 'account': 'primary', 'run_date': '2026-11-03', 'symbol': 'AAA',
            'entry': 100.0, 'direction': -1, 'target': 'BBB', 'target_entry': 100.0}
    rows = cs.score_call(call, _bars({'AAA': closes, 'BBB': tgt}), DAYS)
    assert rows[0]['pair_pct'] == 9.7                      # +10 target, 0 sold, -0.3 cost
    rows = cs.score_call(call, _bars({'AAA': closes}), DAYS)
    assert rows[0]['pair_pct'] is None and rows[0]['ret_pct'] == 0.0

def test_missing_symbol_bar_is_a_gap():
    closes = {d: 100 for d in DAYS[1:]}; del closes[DAYS[3]]
    call = {'source': 'universe', 'account': 'universe', 'run_date': '2026-11-03', 'symbol': 'AAA',
            'entry': 100.0, 'direction': 1, 'target': None, 'target_entry': None}
    rows = cs.score_call(call, _bars({'AAA': closes}), DAYS)
    assert [r['td'] for r in rows][:4] == [1, 2, 4, 5] and len(rows) == 10

def test_hold_should_have_sold_and_horizon_cap():
    days = [f'2027-01-{d:02d}' for d in range(1, 32)] + [f'2027-02-{d:02d}' for d in range(1, 29)] + [f'2027-03-{d:02d}' for d in range(1, 15)]
    nifty = {d: 100 for d in days}; closes = {d: 88 for d in days}
    call = {'source': 'advice', 'account': 'primary', 'run_date': days[0], 'symbol': 'AAA',
            'entry': 100.0, 'direction': 1, 'target': None, 'target_entry': None}
    rows = cs.score_call(call, {'NIFTY 50': nifty, 'AAA': closes}, days)
    assert len(rows) == 60 and rows[-1]['td'] == 60
    assert cs.summarize(rows, 1)['should_have_sold'] is True and cs.direction('INSUFFICIENT') == 0
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd ~/Desktop/GITHUB/zerodha-brain && python3 -m pytest tests/test_call_scoring.py -q`
Expected: FAIL with `ModuleNotFoundError: call_scoring`

- [ ] **Step 3: Implement `call_scoring.py`**

`score_call` walks `nifty_days` after `run_date`, counting td on Nifty days (a symbol gap consumes a td without emitting a row); the Nifty return uses the Nifty close on the call day as base (`bars['NIFTY 50'][run_date]`; if absent, the last Nifty close before it). `mae/mfe` are running min/max of `signed_alpha_pct` over emitted rows.

- [ ] **Step 4: Run to verify they pass**

Run: `python3 -m pytest tests/test_call_scoring.py -q` → `4 passed`

- [ ] **Step 5: Commit**

```bash
git add call_scoring.py tests/test_call_scoring.py
git commit -m "feat(calls): pure daily scoring of one advisor call [P-60]"
```

---

### Task 2: `call_outcomes` table, loader and the morning update

**Files:**
- Create: `call_outcomes.py` (brain), `tests/test_call_outcomes.py`
- Modify: `scheduler.py:303-309` (inside `_run` of `_maybe_sync_daily_bars`, after the macro snapshot)
- Migration: apply with the Supabase MCP `apply_migration` (project `gilmuwmtdpjccibfhqtx`), name `call_outcomes`

**Interfaces:**
- Consumes: Task 1 `score_call`, `direction`, `HORIZON`; `universe_calls._paged`, `universe_calls.INDEX`; `sector_view.group_of`.
- Produces:
  - `TABLE = 'call_outcomes'`
  - `load_calls(since: str) -> list[dict]` — every call with `run_date >= since` from `portfolio_advice` (is_official, source `advice`, account `primary`), its targets (source `target`, symbol = target, entry = `rotation_buy_price` else the `universe_calls` row's `last_price` for that date), `account_calls` (source `natwar`, call = `sector_verdict or verdict`; plus source `natwar_v1` when `sector_verdict` is set and differs), `universe_calls` (source `universe`, account `universe`). Each dict is a Task 1 `call` plus `attrs`: `{'verdict','regime','trigger_type','confidence','quality','sector_group','sector_rule','rotation_reason','thesis_action','weekday'}`. Rows with `direction == 0` or no entry are dropped.
  - `update(through: str = None) -> int` — for every call whose run_date is within the last 60 Nifty days, computes rows with `score_call` and upserts only those with `date` > the call's latest stored `date` (`on_conflict='source,account,run_date,symbol,td'`). Returns rows written. Prints `[call_outcomes] wrote N rows for M calls through <date>`.
  - `latest_summary(call_keys) -> dict[(source,account,run_date,symbol)] -> Task 1 summarize dict` — used by Tasks 3 and 5.

- [ ] **Step 1: Apply the migration**

```sql
create table if not exists call_outcomes (
  source text not null, account text not null, run_date date not null, symbol text not null,
  td smallint not null, date date not null, close numeric, ret_pct numeric, nifty_pct numeric,
  signed_alpha_pct numeric, mae_pct numeric, mfe_pct numeric, pair_pct numeric,
  computed_at timestamptz default now(),
  primary key (source, account, run_date, symbol, td));
create index if not exists call_outcomes_date on call_outcomes (date);
```

- [ ] **Step 2: Write the failing tests**

```python
import json
from unittest.mock import patch
import call_outcomes as co
from tests.fake_supabase import FakeSupabase

DAYS = [f'2026-11-{d:02d}' for d in (10, 11, 12, 13, 14)]

def _fake():
    f = FakeSupabase()
    f.tables['candles'] = ([{'symbol': 'NIFTY 50', 'interval': 'day', 'trade_date': d, 'close': 100 + i} for i, d in enumerate(DAYS)]
                           + [{'symbol': 'AAA', 'interval': 'day', 'trade_date': d, 'close': 100 - i} for i, d in enumerate(DAYS)]
                           + [{'symbol': 'BBB', 'interval': 'day', 'trade_date': d, 'close': 100 + 2 * i} for i, d in enumerate(DAYS)])
    f.tables['portfolio_advice'] = [{'symbol': 'AAA', 'verdict': 'SELL', 'run_date': '2026-11-10', 'is_official': True, 'last_price': 100.0,
                                     'rotation_target_symbol': 'BBB', 'rotation_buy_price': 100.0, 'market_regime': 'BULL',
                                     'trigger_type': 'MACRO', 'confidence': 72, 'rotation_reason': 'same_sector', 'indicators': {'thesis': {'action': 'EXIT'}}}]
    f.tables['account_calls'] = [{'account': 'natwar', 'symbol': 'AAA', 'verdict': 'SELL', 'sector_verdict': 'TRIM', 'run_date': '2026-11-10',
                                  'last_price': 100.0, 'regime': 'BULL', 'trigger_type': 'MACRO', 'confidence': 60, 'quality': 55, 'sector_rule': 'strong_sector_softens_sell'}]
    f.tables['universe_calls'] = [{'symbol': 'BBB', 'verdict': 'HOLD', 'run_date': '2026-11-10', 'last_price': 100.0, 'sector': 'X',
                                   'regime': 'BULL', 'trigger_type': 'MICRO', 'confidence': 50, 'quality': 70}]
    f.tables['call_outcomes'] = []
    return f

def test_load_calls_builds_every_source():
    with patch.object(co.db, 'supabase', _fake()):
        calls = co.load_calls('2026-11-01')
    by = {(c['source'], c['symbol']): c for c in calls}
    assert set(by) == {('advice', 'AAA'), ('target', 'BBB'), ('natwar', 'AAA'), ('natwar_v1', 'AAA'), ('universe', 'BBB')}
    assert by[('advice', 'AAA')]['direction'] == -1 and by[('advice', 'AAA')]['target'] == 'BBB'
    assert by[('natwar', 'AAA')]['attrs']['verdict'] == 'TRIM' and by[('natwar_v1', 'AAA')]['attrs']['verdict'] == 'SELL'
    assert by[('advice', 'AAA')]['attrs']['thesis_action'] == 'EXIT' and by[('advice', 'AAA')]['attrs']['weekday'] == 'Tue'

def test_update_is_idempotent_and_catches_up():
    f = _fake()
    with patch.object(co.db, 'supabase', f):
        n1 = co.update('2026-11-12')                      # bars through 11-12 -> td 1,2
        n2 = co.update('2026-11-12')                      # nothing new
        n3 = co.update('2026-11-14')                      # catch-up -> td 3,4
    rows = [r for r in f.tables['call_outcomes'] if r['source'] == 'advice']
    assert (n1, n2) == (5 * 2, 0) and n3 == 5 * 2 and [r['td'] for r in sorted(rows, key=lambda r: r['td'])] == [1, 2, 3, 4]
    assert rows[-1]['mae_pct'] <= rows[0]['mae_pct']      # running min carried across runs, not restarted
    assert [r['pair_pct'] for r in rows][0] == round(2 - (-1) - 0.3, 2)
```

- [ ] **Step 3: Run to verify they fail**

Run: `python3 -m pytest tests/test_call_outcomes.py -q` → FAIL `ModuleNotFoundError`

- [ ] **Step 4: Implement `call_outcomes.py`**

`update` reads existing rows for the open calls (`select source,account,run_date,symbol,td,date,mae_pct,mfe_pct`), seeds `score_call` with the stored running min/max when continuing a call (add an optional `prior: {'mae','mfe','td','date'}` argument to Task 1's `score_call`; emit only rows after `prior['date']`). `through` defaults to the last Nifty bar date in `candles`.

- [ ] **Step 5: Run to verify they pass** → `2 passed`; then the full suite: `python3 -m pytest -q` → all pass.

- [ ] **Step 6: Hook the scheduler and add the CLI**

In `scheduler.py` `_maybe_sync_daily_bars._run`, after the macro `try` block:
```python
            try:                  # P-60: score every open call through the new bars
                import call_outcomes
                call_outcomes.update()
            except Exception as e:
                print(f"[SCHEDULER] call outcomes failed (non-fatal): {e}")
```
`call_outcomes.py` gets `if __name__ == '__main__': update(sys.argv[1] if len(sys.argv) > 1 else None)`.

- [ ] **Step 7: Backfill once against production and verify**

Run: `python3 -m call_outcomes` (calls since 2026-08-25 have bars). Then:
`select source, count(distinct (run_date, symbol)) calls, count(*) rows, max(date) from call_outcomes group by 1` — every source present; `max(date)` = 2026-11-13.

- [ ] **Step 8: Commit**

```bash
git add call_outcomes.py call_scoring.py scheduler.py tests/test_call_outcomes.py
git commit -m "feat(calls): call_outcomes table + morning update after the bar sync [P-60]"
```

---

### Task 3: Lessons and scorecard

**Files:**
- Create: `call_lessons.py` (brain), `tests/test_call_lessons.py`
- Modify: `scheduler.py` (new once-per-week slot next to `_maybe_run_watchdog`, Sunday ≥ 08:00 IST, also run at the end of `call_outcomes.update` when `datetime.now(IST).weekday() == 6`), `morning_brief.py` (`compose` gains `lessons: dict = None`; `publish` passes `_cfg_json('call_lessons_latest')`)

**Interfaces:**
- Consumes: Task 2 `load_calls`, `latest_summary`; `scipy.stats.binomtest`.
- Produces:
  - `BUCKETS = ('verdict_regime', 'trigger_type', 'confidence_band', 'sector_group', 'thesis_agrees', 'sector_rule', 'quality_band', 'rotation_reason', 'weekday')`, `CHECKPOINT = 20`, `MIN_N = 30`, `GAP_PP = 15`, `ALPHA = 0.05`.
  - `key(call: dict) -> tuple` — `(source, account, run_date, symbol)`, the same key Task 2 `latest_summary` uses.
  - `bucket_key(name: str, call: dict) -> str | None` (bands: confidence `<50 / 50–69 / ≥70`, quality `<40 / 40–69 / ≥70`; `thesis_agrees` = thesis action EXIT/TRIM with a sell call or HOLD/ADD with a hold/buy → `agree`/`disagree`/`None`).
  - `find_lessons(calls: list[dict], scores: dict, prior: dict = None) -> dict` — pure; `scores` maps call key → Task 1 summary; uses `at[20]` (correct = > 0). Returns `{'asof', 'checkpoint': 20, 'populations': {'holdings': {...}, 'universe': {...}}}` where each population has `overall: {n, hit_pct, mean_alpha_pct}`, `buckets_scanned`, `lessons: [{bucket, key, n, hit_pct, overall_hit_pct, p, mean_alpha_pct, since, text}]`, `strengths: [...]`, `clearing: [...]` (a prior lesson that failed once; cleared when it fails twice).
  - `scorecard(calls, summaries) -> dict` — `{'asof', 'by_source': {source: {checkpoint: {n, hit_pct, mean_alpha_pct}}}}`.
  - `compute() -> dict` — loads, computes, writes `app_config.call_lessons_latest` and `call_scorecard_latest`, prints one line per lesson.
  - Lesson `text` form (fixed copy): `"SELL calls in AGGRESSIVE_BULL: 12 of 34 right (35%) vs 61% overall, p=0.004"`.

- [ ] **Step 1: Write the failing tests**

```python
import call_lessons as cl

def _calls(n, key, correct_n, src='advice'):
    out = []
    for i in range(n):
        c = {'source': src, 'account': 'primary', 'run_date': '2026-10-01', 'symbol': f'{key}{i}',
             'attrs': {'verdict': 'SELL', 'regime': key, 'trigger_type': 'MACRO', 'confidence': 72, 'quality': None,
                       'sector_group': 'X', 'sector_rule': None, 'rotation_reason': None, 'thesis_action': None, 'weekday': 'Mon'}}
        out.append((c, {'at': {20: 5.0 if i < correct_n else -5.0}, 'days': 25}))
    return out

def test_one_true_lesson_one_blocked_by_haircut():
    base = _calls(200, 'BULL', 120) + _calls(40, 'CHOP', 10) + _calls(31, 'PANIC', 14)   # 60% / 25% / 45%
    res = cl.find_lessons([c for c, _ in base], {cl.key(c): s for c, s in base})
    pop = res['populations']['holdings']
    assert pop['overall']['n'] == 271 and pop['buckets_scanned'] > 1
    firing = {(l['bucket'], l['key']) for l in pop['lessons']}
    assert ('verdict_regime', 'SELL×CHOP') in firing and ('verdict_regime', 'SELL×PANIC') not in firing   # 20pp gap but p > 0.05/k
    assert pop['lessons'][0]['text'] == 'SELL calls in CHOP: 10 of 40 right (25%) vs 53% overall, p=0.000'

def test_haircut_blocks_a_small_scan():
    base = _calls(30, 'CHOP', 5)                       # 17% but it IS the population
    res = cl.find_lessons([c for c, _ in base], {cl.key(c): s for c, s in base})
    assert res['populations']['holdings']['lessons'] == []

def test_lesson_clears_after_two_misses():
    prior = {'populations': {'holdings': {'lessons': [{'bucket': 'verdict_regime', 'key': 'SELL×CHOP', 'since': '2026-11-01'}], 'clearing': []}}}
    base = _calls(200, 'BULL', 120) + _calls(40, 'CHOP', 25)
    r1 = cl.find_lessons([c for c, _ in base], {cl.key(c): s for c, s in base}, prior)
    assert r1['populations']['holdings']['clearing'][0]['key'] == 'SELL×CHOP'
    r2 = cl.find_lessons([c for c, _ in base], {cl.key(c): s for c, s in base}, r1)
    assert r2['populations']['holdings']['clearing'] == [] and r2['populations']['holdings']['lessons'] == []

def test_brief_line_on_new_or_cleared_lesson():
    import morning_brief as mb
    lessons = {'asof': '2026-11-15', 'new': ['SELL calls in CHOP: 10 of 40 right (25%) vs 53% overall, p=0.000'], 'cleared': []}
    lines = mb.compose('2026-11-16', [], [], None, None, {}, None, None, None, lessons)
    assert [l for l in lines if l['kind'] == 'lessons'][0]['text'] == 'New lesson: SELL calls in CHOP: 10 of 40 right (25%) vs 53% overall, p=0.000'
```

- [ ] **Step 2: Run to verify they fail** → `ModuleNotFoundError: call_lessons`

- [ ] **Step 3: Implement `call_lessons.py` and the brief line**

Universe calls form population `universe`; `advice`, `natwar`, `natwar_v1` form `holdings`; `target` rows are counted in the scorecard only. `find_lessons` sets `new`/`cleared` lists at the top level by diffing against `prior`; the brief line (kind `lessons`, warn False) is `"New lesson: …"` / `"Lesson cleared: …"` and appears only when `asof` is the previous trading day (same rule as the watchdog line).

- [ ] **Step 4: Run** → `4 passed`, then full suite passes.

- [ ] **Step 5: Scheduler slot + first run**

Add `_maybe_run_lessons()` (Sunday, ≥ 08:00 IST, once per date, daemon thread, non-fatal) and call it in the idle loop after `_maybe_run_watchdog()`. Run `python3 -c "import call_lessons; call_lessons.compute()"` once; expected now: both populations `lessons: []` with the overall n printed (holdings ≈ 400 at day 20, universe 0 until ~12-09).

- [ ] **Step 6: Commit**

```bash
git add call_lessons.py scheduler.py morning_brief.py tests/test_call_lessons.py
git commit -m "feat(calls): weekly lessons + scorecard with a Bonferroni haircut; brief line [P-60]"
```

---

### Task 4: API routes

**Files:**
- Create: `app/api/advisor/calls/route.ts`, `app/api/advisor/calls/days/route.ts` (dashboard)
- Modify: `app/api/advisor/route.ts:84-92` (add `call_lessons_latest`, `call_scorecard_latest` to the `.in("key", …)` list → `lessons`, `scorecard` in the payload), same in `app/api/advisor/natwar/route.ts`.

**Interfaces:**
- Produces:
  - `GET /api/advisor/calls/days` → `{ days: { run_date: string; n: number; scored_days: number }[] }` — distinct `run_date` in `call_outcomes` (sources `advice`,`natwar`,`universe`), newest first, max 90.
  - `GET /api/advisor/calls?date=YYYY-MM-DD&population=holdings|universe` → `{ run_date, calls: Call[] }` where `Call = { source, account, symbol, call: string, entry: number, days: number, signed_alpha_pct, mae_pct, mfe_pct, pair_pct: number|null, target: string|null, correct: boolean, early_wrong_days: number, should_have_sold: boolean, path: { date: string; signed_alpha_pct: number; nifty_pct: number }[], context: { regime, trigger_type, confidence, reasons: string[] } }`. `call` and `context` come from the source row (`portfolio_advice` / `account_calls` / `universe_calls`); `path` is every stored td. Sorted worst `signed_alpha_pct` first. Population `holdings` = sources `advice`, `natwar`, `target`; `universe` = `universe`.
  - `GET /api/advisor` and `/api/advisor/natwar` additionally return `lessons` and `scorecard` (parsed JSON or null).

- [ ] **Step 1: Implement both routes** following `app/api/pnl/route.ts` (supabaseServer, `force-dynamic`, `{ error }` with 500 on failure). The calls route reads `call_outcomes` for the date (≤ 60 rows per call × ≤ 500 calls for universe: page with `.range` in 1000s) and joins the source tables in memory.

- [ ] **Step 2: Verify against production**

Run: `npm run dev` then `curl -s 'localhost:3000/api/advisor/calls/days' | head -c 300` → the 11-13, 11-12, 11-11 dates with counts; `curl -s 'localhost:3000/api/advisor/calls?date=2026-11-13&population=holdings' | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['calls']), d['calls'][0]['symbol'], d['calls'][0]['days'])"` → ≥ 24 calls, 1 day.

- [ ] **Step 3: Commit**

```bash
git add app/api/advisor
git commit -m "feat(api): call outcomes by day, days list, lessons + scorecard [P-60]"
```

---

### Task 5: `/advisor/calls` page

**Files:**
- Create: `app/advisor/calls/page.tsx`, `components/CallPath.tsx` (inline-SVG sparkline: signed alpha and Nifty lines, 0 axis)
- Modify: `components/layout/Sidebar.tsx:19` (add `{ href: "/advisor/calls", label: "Calls", icon: ListChecks, short: "Calls" }` after Scorecard)
- Test: `e2e/advisor-calls.spec.ts` (mocked routes, like `e2e/advisor-pnl.spec.ts`)

**Interfaces:**
- Consumes: Task 4 payloads.
- Page sections, in order: scorecard strip (`scorecard.by_source`: hit % and mean alpha at 5/10/20/40/60, tabs Kanaklata · Natwar · Universe · Targets); day picker (chips from `/calls/days`, default the newest with `scored_days ≥ 5`, else the newest) + population chip; call rows (symbol, call, account, entry ₹, signed alpha coloured, "day n", worst/best, pair when present, one sentence); tap → `CallPath` + context; lessons panel (firing lessons as sentences with n/hit/p; strengths muted; empty copy `"Nothing fires yet — a lesson needs 30 scored calls in one bucket."`).
- One-sentence verdict copy, exact: `"{CALL} {SYMBOL} {run_date}: {right|wrong}, {±x.x}% vs Nifty after {n} days; worst point {mae}% on day {k}"`; for a HOLD with `should_have_sold`: append `" — should have sold"`; pair rows add `" · switch {+x.x}% after costs"`.

- [ ] **Step 1: Write the failing e2e spec**

```ts
test("calls page: day rows, path on tap, lessons, unscored day copy", async ({ page }) => {
  await mockCalls(page);                       // routes: /api/advisor (lessons+scorecard), /calls/days, /calls?date=
  await page.goto("/advisor/calls");
  await expect(page.getByText("SELL ATGL 2026-11-03: right, +8.0% vs Nifty after 11 days; worst point -1.0% on day 1 · switch +9.7% after costs")).toBeVisible();
  await page.getByText("SELL ATGL 2026-11-03").click();
  await expect(page.getByTestId("call-path")).toBeVisible();
  await expect(page.getByTestId("lessons")).toContainText("SELL calls in CHOP: 10 of 40 right (25%) vs 53% overall, p=0.000");
  await page.getByRole("button", { name: "2026-11-13" }).click();       // day with 0 scored days in the mock
  await expect(page.getByText("No scored days yet — scores start the morning after the call.")).toBeVisible();
});
```

- [ ] **Step 2: Run** → FAIL (page 404)

- [ ] **Step 3: Implement the page and sparkline** reusing `/advisor`'s colours (`GREEN/RED/AMBER` constants, `INR`), the `Sidebar`, `useAppStore` connect gate and the `reqId` stale-response guard pattern.

- [ ] **Step 4: Run** `PW_CHANNEL=chrome npx playwright test e2e/advisor-calls.spec.ts` → `1 passed`; `npx tsc --noEmit -p .` clean.

- [ ] **Step 5: Commit**

```bash
git add app/advisor/calls components/CallPath.tsx components/layout/Sidebar.tsx e2e/advisor-calls.spec.ts
git commit -m "feat(advisor): /advisor/calls — daily call scores, paths and lessons [P-60]"
```

---

### Task 6: Ask drawer tool

**Files:**
- Modify: `lib/ask/tools.ts` (append tool `call_scores`), `lib/ask/agent.ts:22-28` (route examples: `"how is the ATGL sell doing?" / "what are the lessons?" -> call_scores`), `e2e/ask-unit.spec.ts`

**Interfaces:**
- Tool `call_scores`, args `{ symbol?, date?, account? }`: with a symbol → the newest call for it from `/advisor/calls?date=<its run_date>` (find the date via `/calls/days`, newest first, first day whose calls include the symbol) and `summary` = the Task 5 one-sentence verdict; without → lessons from `/advisor` (`lessons.populations.holdings.lessons[].text` joined, or the empty copy) plus the day-20 scorecard line `"Holdings calls: {hit}% right at day 20 over {n} calls, mean {±x.x}% vs Nifty."`.

- [ ] **Step 1: Write the failing unit test** (fetcher fixture serving the three paths; assert both summaries exactly).
- [ ] **Step 2: Run** → FAIL (`call_scores` not found)
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `PW_CHANNEL=chrome npx playwright test e2e/ask-unit.spec.ts` → all pass
- [ ] **Step 5: Commit** `feat(ask): call_scores tool — one call's running score, or the lessons [P-60]`

---

### Task 7: Docs and verify ledger

**Files:**
- Modify: `docs/PIPELINE.md` (new item `[P-60] Call evaluation` under IN PROGRESS → Done with the scope and the first production numbers from Task 2 Step 7 and Task 3 Step 5), `docs/reference/VERIFY.md` (new `V-35 · call_outcomes has a row for every call × trading day` — from 11-18: every call since 11-11 has td rows through yesterday; `select count(*) from call_outcomes where date = <yesterday>` ≥ number of open calls − symbols without bars; FAIL if a morning is missed two days running; and `V-36 · lessons stay silent until n ≥ 30` — the weekly run writes `call_lessons_latest` with `lessons: []` until a bucket has 30 scored calls; the first lesson, when it comes, must show n, hit %, overall % and p), `docs/STATUS.md` START HERE line.

- [ ] **Step 1: Write the entries.**
- [ ] **Step 2: Commit** `docs: P-60 call evaluation shipped; V-35/V-36 registered`.
