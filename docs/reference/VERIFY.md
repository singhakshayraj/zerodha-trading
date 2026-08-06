# VERIFY — the open-checks ledger

**Every shipped fix registers its check here, and `/post-session-check` runs
them.** This is the missing half of the loop: PIPELINE says what shipped,
this says how we'll *know* it worked, and the post-session audit executes it
and writes the result back.

Before this file existed, "verify next session" lived as prose scattered
across STATUS, PIPELINE and KNOWN_ISSUES, and nothing made anyone run it —
[P-05] sat "verified" for two days on a number that turned out to measure half
the book.

## Rules

- **Shipping a fix means adding a row here**, with runnable SQL and a
  pass condition stated as a number. No SQL, no verify — say so explicitly
  instead ("manual: needs a device screenshot") rather than leaving it vague.
- `/post-session-check` runs every **OPEN** check as its §0 and reports
  PASS / FAIL / NOT-YET (no data to judge on).
- **PASS** → mark it here with the date + evidence, and close the PIPELINE item.
- **FAIL** → the PIPELINE item goes back to **Ready**, with the failing number.
- A check that has passed twice on separate sessions can move to **Retired**
  (or become a standing invariant, below).
- Timestamps are UTC. `current_date` is UTC — on a session run before ~05:30
  UTC that is still the right date, but after midnight IST substitute the
  session date explicitly.

---

## 🔵 OPEN — run these next session

### V-1 · [P-27] `model_stop` reaches the execution blob
Shipped: brain `8c875df` (2026-08-07). Was: absent on 100% of 77 closed trades.

```sql
select count(*) stop_exits,
       count(*) filter (where execution->'exit'->>'model_stop' = 'true') flagged,
       count(*) filter (where (execution->'exit'->>'slippage_bps')::numeric
                          = (execution->'exit'->>'charges_bps')::numeric) charges_only
from trades
where created_at::date = current_date
  and status = 'CLOSED' and exit_reason = 'STOP_LOSS_HIT';
```

**PASS** = `flagged` = `stop_exits` **and** `charges_only` = `stop_exits`
(on a capped stop fill the entire residual adverse move is charges — that is
the proof PAPER_SLIPPAGE_PCT was not applied twice).
**NOT-YET** if `stop_exits` = 0. **FAIL** → reopen [P-27].

### V-2 · [P-27] short stops are visible, and [P-05] re-judged on both sides
Shipped: brain `8c875df`. Was: `STOP_LOSS_HIT` 100% LONG; all 30 short exits
pooled into `COVER_SHORT`, worst −1.356R past the cap and invisible.

```sql
select exit_reason, position_type, count(*) n,
       round(avg(r_multiple)::numeric, 3) avg_r,
       round(min(r_multiple)::numeric, 3) worst
from trades
where created_at::date = current_date and status = 'CLOSED'
  and r_multiple is not null
group by 1, 2 order by 1, 2;
```

**PASS** = `STOP_LOSS_HIT` contains **SHORT** rows (and `TARGET_HIT` too, if any
short hit target). Then, and only then, **re-judge [P-05]**: pooled
`STOP_LOSS_HIT` `avg_r` should sit at **≈ −1.25R − charges**, and `worst`
should not run far past it.
⚠️ The 08-06 "−1.252R, on target" measured LONGs only — **do not** treat it as
the baseline. Short-side `exit_reason` semantics changed on 08-07, so buckets
are **not comparable across that boundary**.

### V-3 · [P-28] no phantom trade row
Shipped: brain `8c875df`. Was: a never-filled row force-closed as
`SQUARE_OFF_FAILED` with a fabricated exit price — the standing +1 gap.

```sql
select (select count(*) from trades where created_at::date = current_date) trades_rows,
       (select total_trades_executed from trading_sessions
         where created_at::date = current_date order by created_at desc limit 1) session_count,
       (select count(*) from brain_activity
         where activity_type = 'ORDER_PLACED' and created_at::date = current_date) orders_placed,
       (select count(*) from trades where created_at::date = current_date
          and entry_price is null and coalesce(exit_reason, '') <> 'ORDER_FAILED') phantom;
```

**PASS** = `phantom` = 0 **and** `trades_rows` = `session_count` = `orders_placed`.
**FAIL** → reopen [P-28].

### V-4 · [P-24] advisor paper book de-duplicated
Code shipped: brain `f645ff3` (2026-08-07). **DB repair not yet run** —
`scripts/repair_p24_paper_books.sql` in the brain repo needs a human; the
prod write was blocked from the 08-07 session.

```sql
select count(*) closed_rows, sum(realized_pnl) total
from advisor_paper_positions
where book = 'MANAGEMENT' and source = 'SEED' and is_open = false;
```

**PASS** = `9` rows / `−39983.84`. Currently `16` / `−71512.79`.
This is a **one-shot** check — retire it once it passes.

### V-5 · [P-31] universe breadth actually widened
Shipped: brain `DATA_UNIVERSE_ROTATION_N=40` (2026-08-07). Every session to date
analysed the same ~46 names (holdings + Nifty 50), so 1,883 decisions on 08-06
covered only **46 symbols**.

```sql
select count(distinct symbol) symbols, count(*) decisions,
       round(count(*)::numeric / nullif(count(distinct symbol),0), 1) decisions_per_symbol
from brain_decisions where created_at::date = current_date;
```

**PASS** = `symbols` ≈ **80–90** (was 46) and `decisions` ≥ the 08-06 baseline of
1,883. **FAIL** if symbols is still ~46 → the rotation did not engage; check the
session log for `Added N nifty500_rot stocks to universe` and that
`data_collection_active()` is true.

### V-6 · [P-31] the wider universe did NOT blow the cycle budget ⚠️
**This is the risk the breadth change introduces, and it must be checked the
first session.** Per-cycle analysis cost scales with universe size. W1 measured
32 cycles at avg 459s (analysis ≈160s + 300s sleep) on 46 symbols; ~86 symbols
should land near ~600s.

```sql
with c as (
  select created_at, lag(created_at) over (order by created_at) prev
  from brain_activity
  where activity_type = 'CYCLE_START' and created_at::date = current_date
)
select count(*) cycles,
       round(avg(extract(epoch from created_at - prev))) avg_gap_s,
       round(max(extract(epoch from created_at - prev))) max_gap_s
from c where prev is not null;
```

**PASS** = `avg_gap_s` ≤ 700 and `cycles` ≥ 25.
**FAIL** = avg > 700s or cycles < 20 → analysis is crowding out the day. Remedy
is one env var: drop `DATA_UNIVERSE_ROTATION_N` to 20 (or 0 to revert entirely).
Total decisions is the real scoreboard — breadth is only worth having if
`symbols × cycles` went **up**.

---

## 👁️ WATCH — trend lines, not pass/fail

These need N consistent readings before they mean anything. Record the number
every session; **do not act on a single reading.**

### W-A · trend-tells kept-bucket sign
Two positive sessions running for the first time: **08-05 +0.134R**,
**08-06 +0.182R**. A **third** consecutive positive is a real signal worth
acting on. Still blocks ~73% of trades, so it stays dark regardless until then.
Measured by `/counterfactual-audit` §2. Log each session's number below.

| session | kept-bucket avg R | blocked % |
|---|---|---|
| 2026-08-05 | +0.134 | — |
| 2026-08-06 | +0.182 | 73% |

### W-B · advisor calibration (ECE)
48.5%, non-monotonic, n=22 graded calls — poor, but DARK (no live weight) and
too small to act on. **Do not re-check before ~late Aug 2026**: ~85% of
`portfolio_advice` is `trigger_type=MACRO` on a **30-trading-day** horizon, so
the graded pool grows slowly and a large ungraded backlog is normal, not
starvation. Tracked as [P-18].

---

## ✅ PASSED — kept for the record

### [K8] `inplay_list` locks on session days — PASSED 2026-08-07
Open since 08-03 (last lock had been 07-29). Closed on evidence, not a fix:
it has locked on **every session since** — 08-05 at 06:17 UTC (7 names) and
08-06 at 04:26 UTC (10 names). The 08-03 gap was the legitimate zero-lock path
(no candidate cleared `RVOL_THRESHOLD` on a quiet tape), not the `db_stocks`
split breaking `lock_inplay_list`. Now covered continuously by **I-4**.

```sql
select date::text, count(*) n, max(locked_at)::text locked
from inplay_list group by 1 order by 1 desc limit 6;
```

Prior verifies, done before this file existed, recorded in PIPELINE's Done
section: [P-20] advisor-starve (verified live 08-04 + 08-05), [P-15]/[P-05]/
[P-07] (verified on 08-03's two sessions), [P-22]/[P-23] (closed 08-06).

---

## ♾️ STANDING INVARIANTS — should hold every session, forever

Cheap, and they catch a whole class of regression rather than one bug. Run
them every session alongside the OPEN checks.

### I-1 · no duplicate paper exits
The [P-24] failure shape: the same shares realized twice.

```sql
select symbol, entry_price, exit_price, realized_pnl, count(*) n
from advisor_paper_positions
where book = 'MANAGEMENT' and is_open = false
group by 1, 2, 3, 4 having count(*) > 1;
```
**PASS** = 0 rows.

### I-2 · exit reasons are side-symmetric
After [P-27], a reason that only ever appears on one side means a code path
is collapsing exits again.

```sql
select exit_reason, count(*) filter (where position_type = 'LONG') longs,
       count(*) filter (where position_type = 'SHORT') shorts
from trades
where status = 'CLOSED' and created_at::date >= '2026-08-07'
group by 1 order by 1;
```
**WARN** if `STOP_LOSS_HIT` or `TARGET_HIT` is 100% one-sided across a week
with trades on both sides.

### I-3 · every closed trade carries its risk unit
```sql
select count(*) filter (where r_multiple is null and pnl is not null
                          and coalesce(exit_reason,'') <> 'ORDER_FAILED') missing_r
from trades where created_at::date = current_date and status = 'CLOSED';
```
**PASS** = 0. Without `r_multiple` a trade is invisible to every R-based
verdict on this board — including the ones that decide whether a flag ships.
(On 08-06 this was 1 — the [P-28] phantom row. It should read 0 once V-3 passes.)

### I-4 · the in-play list locks on session days
`or_rvol` is a **column on `inplay_list`**, not a `stock_observations` payload
key — an earlier draft of this ledger guessed wrong and would have silently
failed. Zero rows on a quiet tape is legitimate (`maybe_lock_inplay` has a real
no-qualifier path), so this is a WARN-on-streak, not a per-day FAIL.

```sql
select date::text, count(*) n, round(max(or_rvol), 2) top_rvol,
       max(locked_at)::text locked
from inplay_list group by 1 order by 1 desc limit 6;
```
**PASS** = a row for today. **WARN** if two or more consecutive session days
have no lock — that is no longer a quiet tape, it is a broken lock path.
