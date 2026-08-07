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

_2026-08-07: V-1, V-2, V-3, V-5 and V-6 all PASSED on session `2ddadca7` and moved to ✅ below. Only V-4 remains — it is blocked on a DB repair, not on data._

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

### V-1 · [P-27] `model_stop` persisted — PASSED 2026-08-07
Session `2ddadca7`. **15 of 15** stop exits carry
`execution.exit.model_stop = true` (LONG 4/4, SHORT 11/11). Was **0 of 12** on
08-06. The fix now leaves the trace it was supposed to.

### V-2 · [P-27] short stops visible + [P-05] re-judged — PASSED 2026-08-07
`COVER_SHORT` has **disappeared entirely** — every short exit now carries a real
reason. Both sides appear in both buckets:

| exit_reason | side | n | avg R |
|---|---|---|---|
| STOP_LOSS_HIT | LONG | 4 | −1.304 |
| STOP_LOSS_HIT | **SHORT** | **11** | **−1.177** |
| TARGET_HIT | LONG | 2 | +1.344 |
| TARGET_HIT | **SHORT** | **5** | **+0.935** |
| BRAIN_SIGNAL | LONG / SHORT | 3 / 3 | −0.707 / −0.344 |
| EOD_CLOSE | SHORT | 6 | −0.238 |
| SESSION_END | LONG | 2 | −0.324 |

**[P-05] verdict, now measured over the whole book:** pooled `STOP_LOSS_HIT`
= **−1.211R (n=15)**, inside the −1.25R cap. The 08-06 headline of −1.252R
measured LONGs only and 11 of today's 15 stops are SHORT — i.e. the old number
was describing the smaller half. Note the sides differ (LONG −1.304 vs SHORT
−1.177) on small n; re-read once n grows.

### V-3 · [P-28] phantom trade row — PASSED 2026-08-07
`trades` **36** = `total_trades_executed` **36** = `ORDER_PLACED` **36**;
phantom rows **0**, still-open at close **0**. The standing +1 gap (78/77/77 on
08-06) is gone.

### V-5 · [P-31] universe breadth — PASSED 2026-08-07
**86 distinct symbols** (was 46), 1,653 decisions over 20 cycles. Decisions
*per cycle* went 46 → **83**; the lower absolute total vs 08-06's 1,883 is
purely the 2h50m session ([C1]), not the change.

### V-6 · [P-31] cycle budget — PASSED 2026-08-07
20 cycles, **avg 490s, max 520s** against a ≤700s threshold — versus 459s at 46
symbols. **Nearly double the universe for ~7% more cycle time.** Analysis was
never the bottleneck; the 300s inter-cycle sleep dominates. Breadth is close to
free, and the concern that motivated this check was unfounded.

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
