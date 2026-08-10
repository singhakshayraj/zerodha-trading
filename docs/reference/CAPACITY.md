# CAPACITY — what breaks first, and when

_Measured 2026-08-10 ([P-37]). Re-measure when the universe or pacing changes —
both move these numbers by more than growth does._

## Growth rate

Use **recent** rates, not lifetime averages: [P-31] doubled the universe
(46 → 86 symbols) on 08-07, which raised the decision rate **1.76×** on its own
(347 → 610 decisions/hour). Rates below are normalised per session-hour from
08-07 and scaled to a full 6.25h day.

| table | rows/day | bytes/row | rows/yr (250d) | **size/yr** |
|---|---|---|---|---|
| `brain_decisions` | 3,813 | 1,848 | 953k | **1.76 GB** |
| `candles` | 6,356 | 314 | 1.59M | 486 MB |
| `brain_activity` | 4,486 | 394 | 1.12M | 434 MB |
| `portfolio_advice` | 800 | 2,180 | 200k | 436 MB |
| `decision_outcomes` | ~1,500 | 279 | 375k | 105 MB |
| `trades` | ~156 | 1,504 | 39k | 59 MB |
| | | | **~4.3M rows** | **≈3.3 GB** |

Today: **77 MB**. So storage is ~40× current in a year.

**Storage is not the constraint** — *if* the org is on Pro. ⚠️ **Confirmed
2026-08-10 (post-session review): the org (`singhakshayraj's Org`) is on the
free tier**, not Pro. Current DB size **97 MB / 500 MB** (19%). At the measured
~13.6 MB/trading-day rate that's **≈6 weeks of runway** — matching [P-38]'s own
estimate. Per [P-38] Task 0's own instruction: *"If Free, stop and escalate
before implementing anything below — the correct fix is a tier change, not
600 MB of savings."* [P-38]'s trim only buys ~2.4 GB back a year; it does not
change which tier is needed. Needs a user decision: upgrade to Pro, or accept
running the trim plan under a hard ~6-week clock.

`brain_decisions` at **1,848 bytes/row** is over half the total. That is the
`indicators` jsonb, which carries ~30 keys including nested `regime`,
`trend_tells`, `level_snapshot`, `market_context` and a `git_sha`/`config_hash`
repeated on every row. It is also the substrate [P-35]'s edge study runs on, so
it is expensive *and* load-bearing — do not trim it casually.

## What actually breaks: query cost, not disk

Three cliffs were found by `EXPLAIN ANALYZE`, not by guessing. Two are fixed.

### 1. `autopsy_dataset()` — nested loop over trades ✅ FIXED
The plan was already optimal (Nested Loop, Index Scan on
`candles_symbol_interval_ts_key`). The problem was the **loop count**: it is the
trade count, and trades grow linearly. Candle growth is harmless — the index
makes that leg logarithmic.

    577 trades x ~0.29ms  = ~0.2s   today
 25,000 trades x ~0.29ms  = ~7.5s   in a year

**Fix:** bounded to a rolling window (`p_days`, default 400) plus a partial
index `idx_trades_closed_excursion`. The trades leg went **Seq Scan 20.6ms →
Index Scan 0.85ms**. Safe to bound because [P-30] established the verdict is
stable — replaying five years will not overturn it, only cost five years of work
per page load.

### 2. `count(*)` on the big tables ✅ FIXED
`count(*)` on `brain_decisions` measured **417ms warm** at 21k rows — an Index
Only Scan with 4,796 heap fetches, because rows arrive continuously and the
visibility map trails them. At 953k rows that is **~18 seconds**.

**Fix:** separate the two kinds of number.
- A **claim** — profit factor, expectancy, P&L — stays exact. These come only
  from `trades`, which stays small.
- An **indicator** — "how many decisions have been recorded" — now uses
  `pg_class.reltuples` via `approx_rows()`, which is O(1) forever. The UI
  renders these rounded with a `~`, because presenting an estimate as a precise
  figure is the actual error.

### 3. `brain_activity` growth — ⏳ deferred, deliberately
1.12M rows / 434 MB a year of **write-only** data: every reader does
`order by created_at desc limit N`, and nothing reads history.

`prune_brain_activity(keep_days)` exists but is **not scheduled and has not been
run** — deleting prod rows is irreversible and 45k rows / 17 MB is not yet worth
it. It refuses to keep under 14 days. Run it when the table reaches a few
hundred MB.

## Re-measure triggers

- the universe size changes again (it is the single biggest lever)
- pacing caps rise (`DATA_MAX_NEW_TRADES_PER_HOUR` drives the trade count, which
  is what `autopsy_dataset` loops over)
- any page starts feeling slow — check `EXPLAIN (analyze, buffers)` before
  adding an index; two of the three cliffs above had perfect plans already

```sql
-- growth + bloat snapshot
select relname, n_live_tup, n_dead_tup,
       pg_size_pretty(pg_total_relation_size(relid)) as size, last_autovacuum
from pg_stat_user_tables where schemaname='public'
order by pg_total_relation_size(relid) desc limit 10;
```
