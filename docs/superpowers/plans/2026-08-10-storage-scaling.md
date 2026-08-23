# Storage Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut projected storage growth from ~3.3 GB/year to ~2.7 GB/year by removing verified per-row duplication in `brain_decisions` and adding retention to `brain_activity` — without losing a single datapoint any analysis uses.

**Architecture:** Three independent changes, ordered by risk. All three converge on a single chokepoint: `db_records.log_decision()` builds the `indicators` jsonb by merging its `indicators` argument with every non-`None` `**kwargs` value. Filtering there covers all three existing call sites in `brain.py` (lines 681, 703, 814) *and* any future one, which editing the call sites would not. The four keys removed are already stored elsewhere (`git_sha`/`config_hash` are columns on `trading_sessions`; market state has its own `market_context` table) or are recomputable defaults (`event_policy`). Then schedule retention on `brain_activity`, which is write-only in practice. Old rows are left untouched throughout — every change affects new writes only, so nothing is destructive and nothing needs backfilling.

**Tech Stack:** Python 3.9 (brain, on Railway), Postgres 17 via Supabase, pytest.

## Global Constraints

- **Never deploy the brain during market hours (09:15–15:30 IST).** A deploy restarts it and truncates the day's data collection. Deploy pre-open or post-close.
- **Never delete or rewrite existing rows.** Every task changes what is *written from now on*. Historical rows keep their embedded copies; readers must tolerate both shapes.
- **A fix with no VERIFY row is unmeasured, not shipped.** Each task that changes behaviour registers a row in `docs/reference/VERIFY.md`.
- **The brain's full suite must stay green.** Currently **931** tests: `python3 -m pytest -q` from `~/Desktop/GITHUB/zerodha-brain`.
- **F-lint clean on changed files:** `python3 -m flake8 --select=F <files>`.
- **PATH in a fresh shell:** `export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/opt/anaconda3/bin:$PATH"`.
- **`brain_decisions.indicators` is load-bearing.** It is the substrate [P-35]'s entry-edge study runs on. Only the four keys named in this plan may be removed, and only because each was verified redundant on 2026-08-10.

---

## Task 0 (do first, not code): confirm the Supabase plan tier

**This can invalidate the plan's urgency, so it is cheap and goes first.**

At ~3.3 GB/year: Supabase **Pro** includes 8 GB → ~2.4 years of runway, and this plan is a worthwhile tidy-up rather than an emergency. Supabase **Free** is 500 MB → the database fills in **roughly six weeks**, and this plan is insufficient on its own (you would also need aggressive retention or an upgrade).

✅ **ANSWERED 2026-08-23: FREE tier, 97 MB / 500 MB (19%).** So the escalation
branch applies — **the correct fix is a tier change, not this plan**. Tasks 1, 2
and 4 shipped anyway on 2026-08-23 (brain `b21a09b`) because they are lossless
and cheap, but they buy ~600 MB/yr against a 3.3 GB/yr problem in a 500 MB box.
Task 3 (`market_context`) is **not worth doing until the tier question is
settled** — it is the only task that can lose data.

- [x] **Step 1: Check the tier**

Supabase dashboard → Project Settings → Billing, or ask the project owner.

- [ ] **Step 2: Record it**

Add one line to `docs/reference/CAPACITY.md` under "Growth rate" stating the tier and the resulting runway. If Free, stop and escalate before implementing anything below — the correct fix is a tier change, not 600 MB of savings.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `db_records.py` | `log_decision()` — the single place the `indicators` jsonb is assembled | Modify — filter redundant keys here, not at the 3 call sites |
| `tests/test_indicator_payload.py` | Pins which keys are and are not written | **Create** |
| `brain.py` | Trading cycle — add the per-cycle `market_context` capture call | Modify (Task 3 only) |
| `tests/test_market_context_capture.py` | Pins per-cycle capture before the embed is removed | **Create** |
| `scheduler.py` | Idle-loop `_maybe_*` jobs | Modify — add retention job |
| `tests/test_activity_retention.py` | Pins the retention gate | **Create** |
| `docs/reference/VERIFY.md` | Verify ledger | Modify — add V-13, V-14 |
| `docs/reference/CAPACITY.md` | Capacity projections | Modify — record actuals after |

---

## Task 1: Filter redundant keys at the single write chokepoint

`db_records.log_decision()` merges every non-`None` kwarg into the `indicators` jsonb. `brain.py` passes `git_sha=config.GIT_SHA` and `config_hash=self.config_hash` at three sites (lines 681-682, 703, 814-815), so both land inside the jsonb on every row.

Both are already columns on `trading_sessions`, and every decision carries `session_id`. Verified 2026-08-10: **1 distinct value each across 1,653 rows** on 08-07. 42 bytes/row ≈ **40 MB/year**.

**Files:**
- Modify: `db_records.py:12-50` (`log_decision`)
- Test: `tests/test_indicator_payload.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `db_records.INDICATOR_DENYLIST: frozenset[str]` and the filtering behaviour inside `log_decision`. Tasks 2 and 3 extend the same denylist.

- [ ] **Step 1: Write the failing test**

Create `tests/test_indicator_payload.py`:

```python
"""Pins what reaches brain_decisions.indicators.

That payload is 1,848 bytes/row -- over half of all projected storage growth --
and it is ALSO the substrate [P-35]'s entry-edge study runs on. So it needs a
test that fails in BOTH directions: if a redundant key comes back, and if a
load-bearing key disappears.

log_decision() merges **kwargs into the jsonb, so filtering there covers every
call site including ones that do not exist yet.
"""
from unittest.mock import patch

import db_records


def _logged_indicators(**kwargs):
    """Run log_decision and return the indicators dict it would have written."""
    captured = {}

    class _Tbl:
        def insert(self, payload):
            captured.update(payload)
            return self

        def execute(self):
            return type('R', (), {'data': [{'id': 'x'}]})()

    with patch.object(db_records, 'database') as db:
        db.supabase.table.return_value = _Tbl()
        db_records.log_decision(
            session_id='s', symbol='INFY', signal='BUY', confidence=70,
            indicators={'adx': 25.0}, reasons=[], skip_reasons=[], **kwargs)
    return captured.get('indicators', {})


def test_session_constants_are_not_written():
    """git_sha and config_hash are columns on trading_sessions and every
    decision carries session_id, so embedding them repeats one value ~1,650x
    a day."""
    ind = _logged_indicators(git_sha='abc123', config_hash='def456')
    assert 'git_sha' not in ind
    assert 'config_hash' not in ind


def test_load_bearing_keys_survive():
    """[P-35] reads these. Losing one silently breaks the edge study."""
    ind = _logged_indicators(regime='TRENDING', market_bias='BULLISH',
                             stop_loss=95.0, git_sha='abc123')
    assert ind['adx'] == 25.0
    assert ind['regime'] == 'TRENDING'
    assert ind['market_bias'] == 'BULLISH'
    assert ind['stop_loss'] == 95.0
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd ~/Desktop/GITHUB/zerodha-brain
python3 -m pytest tests/test_indicator_payload.py -v
```

Expected: `test_session_constants_are_not_written` FAILS — `git_sha` is present.

- [ ] **Step 3: Implement the denylist**

In `db_records.py`, above `log_decision`:

```python
# Keys that must never reach brain_decisions.indicators.
#
# Filtered HERE rather than at the call sites because log_decision merges
# **kwargs into the jsonb -- so this covers all three sites in brain.py and any
# future one. Each entry was verified redundant on 2026-08-10 against 1,653
# rows from 08-07; see docs/superpowers/plans/2026-08-10-storage-scaling.md.
#
#   git_sha, config_hash -- columns on trading_sessions; 1 distinct value each
INDICATOR_DENYLIST = frozenset({'git_sha', 'config_hash'})
```

Inside `log_decision`, immediately after the `for k, v in kwargs.items()` merge loop, add:

```python
        for k in INDICATOR_DENYLIST:
            enhanced.pop(k, None)
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
python3 -m pytest tests/test_indicator_payload.py -v
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite**

```bash
python3 -m pytest -q
```

Expected: `933 passed` (931 + 2). A failure elsewhere means a test asserts on the embedded `git_sha` — update it to read `trading_sessions.git_sha` rather than reverting this.

- [ ] **Step 6: Commit**

```bash
git add db_records.py tests/test_indicator_payload.py
git commit -m "perf(storage): stop embedding session constants in every decision

git_sha and config_hash are already columns on trading_sessions and every
decision carries session_id. Verified 2026-08-10: 1 distinct value each across
1,653 rows on 08-07 -- one value stored ~1,650 times a day. 42 bytes/row,
~40MB/year.

Filtered in log_decision rather than at brain.py's three call sites, because
log_decision merges **kwargs into the jsonb -- so the denylist also covers call
sites that do not exist yet.

The test asserts in both directions: redundant keys stay out, and the keys
[P-35]'s edge study reads stay in."
```

---

## Task 2: Make `event_policy` sparse — store the exception, not the default

89 bytes/row for a value that was **1 distinct across 1,653 rows**. It is `NORMAL` on almost every day; it only varies on expiry and results days, which is exactly when it matters. Storing it only when it is *not* `NORMAL` keeps the signal and drops the bulk. ≈85 bytes/row ≈ **81 MB/year**.

**Files:**
- Modify: `db_records.py` (`log_decision`)
- Modify: `tests/test_indicator_payload.py`

**Interfaces:**
- Consumes: `INDICATOR_DENYLIST` and the filter loop from Task 1.
- Produces: `event_policy` becomes an *optional* key. **Any reader must treat an absent key as `NORMAL`.**

- [ ] **Step 1: Write the failing test**

Append to `tests/test_indicator_payload.py`:

```python
def test_event_policy_dropped_when_normal():
    """NORMAL on nearly every day; storing it costs 89 bytes a row to record
    'nothing special happened'."""
    ind = _logged_indicators(event_policy='NORMAL')
    assert 'event_policy' not in ind


def test_event_policy_kept_when_it_is_not_normal():
    """Expiry and results days are the whole reason this field exists."""
    for policy in ('STAND_ASIDE', 'RAISE_BAR'):
        ind = _logged_indicators(event_policy=policy)
        assert ind['event_policy'] == policy
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
python3 -m pytest tests/test_indicator_payload.py -k event_policy -v
```

Expected: `test_event_policy_dropped_when_normal` FAILS — the key is present.

- [ ] **Step 3: Implement**

In `db_records.py`, immediately after the `INDICATOR_DENYLIST` pop loop added in Task 1:

```python
        # Sparse: record the exception, not the default. event_policy is NORMAL
        # on nearly every day, so storing it embeds 89 bytes to say "nothing
        # special happened". Expiry and results days are the whole reason the
        # field exists and those still record.
        # READERS MUST TREAT AN ABSENT KEY AS 'NORMAL'.
        if enhanced.get('event_policy') in (None, '', 'NORMAL'):
            enhanced.pop('event_policy', None)
```

- [ ] **Step 4: Run tests**

```bash
python3 -m pytest tests/test_indicator_payload.py -v && python3 -m pytest -q
```

Expected: the new tests PASS; full suite `935 passed`.

- [ ] **Step 5: Commit**

```bash
git add db_records.py tests/test_indicator_payload.py
git commit -m "perf(storage): make event_policy sparse

89 bytes/row, 1 distinct value across 1,653 rows on 08-07. It is NORMAL on
nearly every day; expiry and results days are the whole reason it exists and
those still record.

Readers must treat an absent key as NORMAL -- stated in the docstring because
this is the kind of implicit default that silently becomes a bug.

~81MB/year."
```

---

## Task 3: Capture `market_context` every cycle, then stop embedding it

The largest single win — 232 bytes/row ≈ **210 MB/year** — but the only one that could lose data, so it is sequenced last and split into two steps.

Verified 2026-08-10: **19 distinct embedded values on 08-07, but only 10 rows in the `market_context` table for the same day.** The table exists and has the same fields (`nifty_level`, `nifty_change_percent`, `india_vix`, `volatility_bucket`, `advancing_stocks`, `declining_stocks`, `time_bucket`, `realized_vol`). So the embed is *mostly* redundant — but the table is captured less often. **Close that gap before removing the embed, or ~9 cycles per day lose their market snapshot.**

**Files:**
- Modify: `brain.py` (add the per-cycle capture call)
- Modify: `db_records.py` (`INDICATOR_DENYLIST`)
- Test: `tests/test_market_context_capture.py` (create)

**Interfaces:**
- Consumes: `INDICATOR_DENYLIST` from Task 1.
- Produces: readers wanting market state at decision time join `market_context` on `session_id` and nearest `captured_at <= decided_at`.

- [ ] **Step 1: Write the failing test for per-cycle capture**

Create `tests/test_market_context_capture.py`:

```python
"""market_context must be captured once per cycle before the embedded copy in
brain_decisions.indicators can be removed.

Measured 2026-08-10: 19 distinct embedded values on 08-07 but only 10 table
rows. Removing the embed without closing that gap loses ~9 cycles/day of
market state.
"""
from unittest.mock import patch

import brain


def test_market_context_written_once_per_cycle():
    with patch.object(brain.db, 'log_market_context') as w:
        b = brain.TradingBrain.__new__(brain.TradingBrain)
        b.session_id = 's1'
        brain.TradingBrain._capture_market_context(b, {'nifty_level': 100.0})
    assert w.call_count == 1
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
python3 -m pytest tests/test_market_context_capture.py -v
```

Expected: FAIL — no `_capture_market_context`.

- [ ] **Step 3: Find where the cycle already computes market state**

```bash
grep -n "market_context\|log_market_context" brain.py db_records.py
```

Note the existing call site and the dict it builds — reuse it; do not recompute.

- [ ] **Step 4: Implement per-cycle capture**

Add to `TradingBrain` in `brain.py`:

```python
def _capture_market_context(self, ctx: dict) -> None:
    """Persist the cycle's market snapshot to its own table.

    Called once per cycle. Previously this state was ALSO embedded into every
    decision's indicators (232 bytes x ~1,650 rows/day) while the table itself
    only received ~10 rows/day. One row per cycle carries the same information
    for ~1/165th of the bytes. Never raises -- a data job must not take down a
    trading cycle.
    """
    if not ctx:
        return
    try:
        db.log_market_context(self.session_id, ctx)
    except Exception as e:
        print(f"[brain] market context capture failed (non-fatal): {e}")
```

Call it once per cycle, at the point the cycle's market state is computed.

- [ ] **Step 5: Run tests**

```bash
python3 -m pytest tests/test_market_context_capture.py -v && python3 -m pytest -q
```

Expected: new test PASSES; full suite `936 passed`.

- [ ] **Step 6: Commit the capture change alone, and deploy it**

```bash
git add brain.py tests/test_market_context_capture.py
git commit -m "feat(data): capture market_context every cycle

Precondition for dropping the embedded copy from every decision. Measured
2026-08-10: 19 distinct embedded values on 08-07 vs only 10 table rows, so the
table currently under-samples what the embed captures."
git push origin main
```

⚠️ **Deploy pre-open or post-close only.**

- [ ] **Step 7: Verify on real data before removing anything**

After the next full session, run:

```sql
-- substitute the session's IST date for :day (current_date is UTC and names
-- the wrong day after 18:30 UTC)
select
  (select count(*) from market_context
     where captured_at::date = :day) as table_rows,
  (select count(distinct indicators->'market_context') from brain_decisions
     where created_at::date = :day) as distinct_embedded;
```

**Gate: `table_rows >= distinct_embedded`.** If it is lower, capture is still under-sampling — fix that before Step 8. Do not proceed on a partial session (see [C1]); use a full-length day.

- [ ] **Step 8: Only once Step 7 passes — remove the embed**

Add to `tests/test_indicator_payload.py`:

```python
def test_market_context_is_not_embedded():
    """It has its own per-cycle table. 232 bytes x ~1,650 rows/day to repeat
    ~19 distinct values."""
    ind = _logged_indicators(market_context={'nifty_level': 100.0})
    assert 'market_context' not in ind
```

In `db_records.py`, add `'market_context'` to `INDICATOR_DENYLIST`:

```python
INDICATOR_DENYLIST = frozenset({'git_sha', 'config_hash', 'market_context'})
```

- [ ] **Step 9: Run tests and commit**

```bash
python3 -m pytest -q
git add db_records.py tests/test_indicator_payload.py
git commit -m "perf(storage): stop embedding market_context in every decision

Now captured once per cycle in its own table (previous commit, verified live).
232 bytes/row to repeat ~19 distinct values across ~1,650 rows/day, ~210MB/year.

Readers join market_context on session_id and nearest captured_at <= decided_at."
```

---

## Task 4: Schedule `brain_activity` retention

1.12M rows / **434 MB a year** of write-only data — every reader is `order by created_at desc limit N` and nothing reads history (verified by grep, 2026-08-10). `prune_brain_activity(keep_days)` already exists in Postgres and refuses to keep under 14 days.

**Files:**
- Modify: `scheduler.py`
- Test: `tests/test_activity_retention.py` (create)

**Interfaces:**
- Consumes: Postgres function `prune_brain_activity(integer) returns bigint`.
- Produces: `scheduler._maybe_prune_activity()`, called from the idle loop.

- [ ] **Step 1: Write the failing test**

Create `tests/test_activity_retention.py`:

```python
"""Retention must never run while a session could be live."""
from unittest.mock import MagicMock, patch

import scheduler


def _clock(hour, weekday=0):
    d = MagicMock()
    d.weekday.return_value = weekday
    d.hour = hour
    d.date.return_value.isoformat.return_value = '2026-08-10'
    return patch.object(scheduler, 'datetime', MagicMock(now=MagicMock(return_value=d)))


def test_does_not_run_during_market_hours():
    scheduler._activity_pruned_days.clear()
    with _clock(11), patch.object(scheduler.db, 'prune_activity') as p:
        scheduler._maybe_prune_activity()
    p.assert_not_called()


def test_runs_once_post_close():
    scheduler._activity_pruned_days.clear()
    with _clock(17), patch.object(scheduler.db, 'prune_activity', return_value=5) as p:
        scheduler._maybe_prune_activity()
        scheduler._maybe_prune_activity()
    assert p.call_count == 1
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
python3 -m pytest tests/test_activity_retention.py -v
```

Expected: FAIL — no `_activity_pruned_days`.

- [ ] **Step 3: Add the DB wrapper**

In `db_records.py`:

```python
def prune_activity(keep_days: int = 90) -> int:
    """Delete brain_activity rows older than keep_days via the Postgres
    function, which refuses to keep fewer than 14 days. Returns rows removed."""
    try:
        res = database.supabase.rpc(
            'prune_brain_activity', {'p_keep_days': keep_days}).execute()
        return int(res.data or 0)
    except Exception as e:
        print(f"[prune_activity] error: {e}")
        return 0
```

Add `prune_activity` to the re-export list in `database.py` (the `from db_records import ...` line).

- [ ] **Step 4: Add the scheduler job**

In `scheduler.py`, beside the other `_maybe_*` jobs:

```python
_activity_pruned_days = set()


def _maybe_prune_activity() -> None:
    """Retention for the live-feed table, once per day after 17:00 IST.

    brain_activity is write-only in practice: every reader does
    `order by created_at desc limit N`. At ~4,500 rows/day that is ~1.1M rows
    and ~434MB a year of data nothing reads.

    Deliberately post-close and day-gated. Never raises.
    """
    if config.QA_MODE:
        return
    try:
        now = datetime.now(IST)
        today = now.date().isoformat()
        if now.hour < 17 or today in _activity_pruned_days:
            return
        _activity_pruned_days.add(today)
        removed = db.prune_activity(90)
        print(f"[SCHEDULER] activity retention: removed {removed} rows")
    except Exception as e:
        print(f"[SCHEDULER] activity retention errored (non-fatal): {e}")
```

Call `_maybe_prune_activity()` in the idle loop next to `_maybe_backfill_candles()`.

- [ ] **Step 5: Run tests**

```bash
python3 -m pytest tests/test_activity_retention.py -v && python3 -m pytest -q
```

Expected: 2 new PASS; full suite `938 passed`.

- [ ] **Step 6: Commit**

```bash
git add scheduler.py db_records.py database.py tests/test_activity_retention.py
git commit -m "feat(retention): prune brain_activity after 90 days

Write-only in practice -- every reader is 'order by created_at desc limit N'
and nothing reads history (verified by grep 2026-08-10). ~4,500 rows/day is
~1.1M rows and ~434MB a year.

Post-close and day-gated, with a test pinning the gate shut during market
hours. The Postgres function refuses to keep under 14 days."
```

---

## Task 5: Register the verifies and record actuals

**Files:**
- Modify: `docs/reference/VERIFY.md`
- Modify: `docs/reference/CAPACITY.md`

- [ ] **Step 1: Add V-13 and V-14 to `docs/reference/VERIFY.md`**

```markdown
### V-13 · [P-38] the indicators payload actually shrank
Shipped <fill the deploy date on ship>. Four keys stopped being embedded per decision.

```sql
select round(pg_total_relation_size('brain_decisions')::numeric
             / nullif(n_live_tup, 0)) as bytes_per_row
from pg_stat_user_tables where relname = 'brain_decisions';
```
**PASS** = bytes_per_row on rows written after the deploy is **≤ 1,500**
(from 1,848). Old rows keep their embedded copies and drag the table average
down slowly, so judge this on a fresh day's rows rather than the whole table:
add `where created_at::date = 'YYYY-MM-DD'` against a full session.
**FAIL** = unchanged → the deploy did not take; check the session's `git_sha`.

### V-14 · [P-38] retention runs and nothing lost the feed
```sql
select count(*) as rows, min(created_at)::date as oldest
from brain_activity;
```
**PASS** = `oldest` is within ~90 days and the dashboard activity feed still
renders. **FAIL** = oldest keeps receding → the job is not firing; check for
`[SCHEDULER] activity retention` in the logs after 17:00 IST.
```

- [ ] **Step 2: Record measured actuals in `docs/reference/CAPACITY.md`**

After one full session on the new build, re-run the growth-rate query in that
doc's "Re-measure triggers" section and update the `brain_decisions` bytes/row
and size/yr figures with what actually happened. **Replace the projection with
the measurement** — do not leave both.

- [ ] **Step 3: Commit**

```bash
git add docs/reference/VERIFY.md docs/reference/CAPACITY.md
git commit -m "docs: register V-13/V-14 and record post-change storage actuals"
```

---

## Expected outcome

| change | bytes/row saved | ≈ MB/year |
|---|---|---|
| Task 1 — `git_sha` + `config_hash` | 42 | 40 |
| Task 2 — sparse `event_policy` | 85 | 81 |
| Task 3 — `market_context` | 220 | 210 |
| **`brain_decisions` subtotal** | **347 (−19%)** | **331** |
| Task 4 — `brain_activity` retention | — | ~270 |
| **total** | | **~600 MB/yr** |

**3.3 GB/yr → ~2.7 GB/yr.** On Supabase Pro (8 GB) that extends runway from
~2.4 to ~3 years.

**Deliberately not attempted, and why:**
- `orb` (15.4%), `trend_tells` (13.6%), `timing` (10.8%) are ~40% of the jsonb
  but are genuinely per-decision — 383, ~893 and 893 distinct values
  respectively on 08-07. Normalising them would be lossy.
- **Column compression (`SET COMPRESSION lz4`) does not help here.** Postgres
  only compresses values past the ~2KB TOAST threshold; at 1,848 bytes/row
  these stay inline and uncompressed. Worth revisiting only if the payload
  grows past 2KB.
- Storage was never the binding constraint — **query cost was**, and both
  cliffs ([P-37]: the autopsy nested loop and `count(*)`) are already fixed.
  This plan is a tidy-up that buys runway, not a rescue.
