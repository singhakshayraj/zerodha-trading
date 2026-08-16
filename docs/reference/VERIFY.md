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
_2026-08-08: V-8 added ([P-30] candle replay), validated at build time; it is a standing re-check, not a one-shot._
_2026-08-10: V-9 ([C1] durable no-token trace) and V-10 ([C5] candle-day coverage) added — both event-driven, both first judgeable on the 08-10 session._
_2026-08-10: V-12 added ([P-35] entry edge — re-run after each session's labeling)._
_2026-08-10: V-11 added ([P-33] bear case) — first judgeable on today's 09:20 advisor run._
_2026-08-10: **V-4 PASSED** — the [P-24] repair ran pre-market. **No date-independent check remains open**; V-7/V-9/V-10 all need a live session to judge._

### V-7 · [P-25] a real trade is captured and linked, with no manual step
Shipped 2026-08-07 (brain `3489ac6`, dashboard). Backfill already recovered the
one historical execution (NBCC SELL 115, 08-06 04:36, `followed_advice=true`,
advice stamped `accept`). This check is **event-driven, not daily**: it can only
pass on a session where you actually trade.

```sql
select symbol, side, quantity, price, price_is_estimated, detected_at::text,
       verdict_at_time, followed_advice, advice_id is not null linked
from user_executions order by detected_at desc limit 10;
```

**PASS** = the next real sell/add appears within one advisor refresh (~8 min),
`linked` is true, and the matching `portfolio_advice` row has `user_decision`
set without anyone tapping anything.
**NOT-YET** on any session where holdings did not change — that is the normal
case and must not be read as a failure.
⚠️ **A BUY will not appear same-day.** The holdings feed reports delivered stock
only, so a purchase lands T+1 and an intraday round-trip never lands at all.
Do not treat a missing same-day buy as a defect.

### V-8 · [P-30] the candle replay agrees with real exits
Shipped 2026-08-08 (dashboard). The replay orders two touches the extremes
already recorded; trades that really stopped out or hit target are cases where
the answer is known, so it must agree there. **Validated at build time: 85/85
(50/50 stops, 35/35 targets) among trades whose exit moment is covered by an
archived bar.** This row exists to catch a regression, and to re-check the
number as the book grows.

Not a SQL check — the replay is code, so the check is the page. Open
`/autopsy` and read the **Ground truth** line in the "How this is computed"
panel. It reports, live, `stopAgree / stopChecked` and `tgtAgree / tgtChecked`
against the ladder-snapped levels; the exact-price version (the stricter one,
85/85) is reproduced by
`docs/reference/EXIT_FRONTIER.md` §5.1's method.

**PASS** = every disagreement is explained by [C5] (the exit landed past the
last archived bar). **FAIL** = a disagreement where the archive *does* cover
the exit moment — that is a replay bug, and it invalidates every exact cell on
the surface.
⚠️ The page's own readout is the *ladder-snapped* check and runs a few points
lower (52/55 stops, 32/40 targets at ship time) because a real target of, say,
1.87R snaps to the 1.75R/2.00R grid. That gap is the snapping, not the replay —
do not chase it.

### V-9 · [C1] a missing token leaves a durable trace
Shipped 2026-08-10 (brain `ce057e4`). A *stale* token always wrote a durable
`token_incident`; a *missing* one wrote only a heartbeat, which is a
current-state field overwritten on the next tick. That asymmetry is why 08-07's
lost morning left no evidence — `brain_activity` was empty 03:30–07:11 UTC and
nothing durable existed either.

```sql
select key, value from app_config where key = 'token_incident';
```
**PASS** = on any day the brain wanted to start and had no token, this holds a
line containing `no token at start` with that day's IST timestamp.
**NOT-YET** on any day the token was pasted on time — the normal case, and not
a failure. Cleared automatically once a token proves live, so read it *during*
an incident or from the dashboard banner, not days later.

### V-10 · [C5] the candle archive covers the whole traded day
Shipped 2026-08-10 (brain `ce057e4`). Post-close backfill (15:40–16:30 IST)
re-reads the full day for every symbol traded.

```sql
select t.symbol, count(c.*) bars
from (select distinct symbol from trades
       where created_at::date = 'YYYY-MM-DD') t
left join candles c
  on c.symbol = t.symbol and c.trade_date = 'YYYY-MM-DD' and c.interval = '5minute'
group by 1 order by bars asc limit 10;
```
**PASS** = no traded symbol has 0 bars, and the busiest names carry roughly a
full session of 5-minute bars (~75 for 09:15–15:30) rather than a handful.
Substitute the session's IST date explicitly — `current_date` is UTC and will
name the wrong day when run after 18:30 UTC.
**The sharper check** is [P-30]'s own number: the share of clean-exit trades
whose exit lands past the last archived bar should fall from the measured
**10 of 118** toward 0 for sessions after this ships. Earlier sessions are not
backfilled — this only runs forward.

### V-11 · [P-33] every verdict carries a bear case
Shipped 2026-08-10 (brain `bcdb667`, dashboard). `reasons` is confirmatory by
construction; this is the disconfirming half, so a verdict can be scored against
something later.

```sql
select verdict,
       count(*) n,
       count(*) filter (where coalesce(counter_case,'') <> '') with_case
from portfolio_advice
where run_date = 'YYYY-MM-DD' and is_official
group by 1 order by 1;
```
**PASS** = `with_case = n` for every verdict except `INSUFFICIENT`, which must be
0 (it has no call to argue against). Substitute the session's IST date —
`current_date` is UTC and names the wrong day after 18:30 UTC.
**Historical rows are null** and always will be; the column was added
2026-08-10, so only judge `run_date >= 2026-08-10`.
First real read: today's 09:20 IST advisor run.

_The second half of the measure — grouping graded outcomes by whether the
counter-case is what actually happened — needs graded rows carrying one, so it
cannot be checked until ~30 trading days of MACRO advice matures. Not a failure
in the meantime._

### V-12 · [P-35] the entry edge still holds as days accumulate
Registered 2026-08-10. [P-35] found the first entry-edge candidate that survives
out-of-sample testing (+0.097R net, n=1,383, t=+3.0). It is thin and rests on
counterfactual labels, so the check is whether it *survives contact with more
data* — which is exactly how [P-21]'s version died.

Not SQL — a script in the brain repo, run AFTER the post-session labeler:

```bash
python3 scripts/label_decisions.py YYYY-MM-DD   # label the session just closed
python3 scripts/edge_study.py                   # re-run the walk-forward
```

**PASS** = pooled out-of-sample net R stays **positive with t > 2**, and the
rule keeps beating plain SHORT on a majority of days.
**FAIL** = it falls to zero/negative, or t drops below 2 as n grows. That is a
real answer, not a regression — record it and close the candidate.
⚠️ Exclude any day whose labels are all `NO_DATA` (07-14 is one). The script
filters on `r_multiple is not null`; a future day with an empty candle archive
would otherwise silently dilute the result.

### I-6 · the Nifty-500 pin still matches the live instrument master
[C2]'s failure mode is silent: a delisted or renamed name keeps its dead token
and the advisor's rotation scan 400s on it, one line among thousands. Tokens are
pinned in-repo because the authenticated OMS has no instruments endpoint, so
they can only go stale.

Not SQL — a script in the brain repo:
```bash
python3 scripts/audit_nifty500_tokens.py    # read-only, no auth, exit 1 on drift
```
**PASS** = exit 0, "every pinned token matches the live master".
**FAIL** = any WRONG or ABSENT line → fix via `build_nifty500_tokens.py`, or
drop the row if the name is genuinely gone.
Exit **2** means the fetched master looked truncated — that is *not* a failure of
the pin; re-run rather than rebuilding anything.
_2026-08-08: **PASS**, 499/499 after dropping JBCHEPHARM._
Worth running at quarterly index reconstitution, not every session.

### I-5 · no phantom executions on quiet days
The failure mode that would destroy this feature's credibility is inventing
trades. A torn holdings fetch is guarded in code; this catches it in the data.

```sql
select detected_at::date d, count(*) n, count(distinct symbol) syms
from user_executions group by 1 order by 1 desc limit 7;
```
**WARN** on any day where `syms` is a large fraction of the ~20 holdings —
real activity is a name or two; twelve at once is a torn snapshot that slipped
the guard, not a portfolio liquidation. Cross-check against `portfolio_advice`
run symbol counts for that day before believing it.

---

## 👁️ WATCH — trend lines, not pass/fail

These need N consistent readings before they mean anything. Record the number
every session; **do not act on a single reading.**

### W-A · trend-tells kept-bucket sign
Two positive sessions running for the first time: **08-05 +0.134R**,
**08-06 +0.182R**. A **third** consecutive positive is a real signal worth
acting on. Still blocks ~73% of trades, so it stays dark regardless until then.
Measured by `/counterfactual-audit` §2. Log each session's number below.

| session | kept-bucket avg R | blocked bucket avg R | blocked % |
|---|---|---|---|
| 2026-08-05 | +0.134 | — | — |
| 2026-08-06 | +0.182 | — | 73% |
| **2026-08-07** | **−0.093** (n=16) | −0.741 (n=19) | 54% |

**🔴 STREAK BROKEN — the third reading is negative, so trend-tells does NOT
earn ENABLE.** Two positives then a negative is exactly the *sign instability*
[P-21] identified when it called this gate anti-predictive; it stays dark.

Read the counter-argument honestly, because today's split looks compelling in
isolation: the gate would have blocked 19 trades averaging **−0.741R**
(−₹2,905) and kept 16 averaging −0.093R (−₹423). That is strong
discrimination. But the **kept bucket is still negative** — enabling it buys a
smaller loss, not a profit — and a rule that flips sign session to session is
the definition of something fitted to noise. Needs a genuinely consistent run,
not one good day.

### W-B · advisor calibration (ECE)
**30.3%** (was 35.6%), still non-monotonic, **n=37** graded calls (was 31) —
continuing to improve, still too small to act on. Read from
`app_config.advisor_calibration_latest`, `built_at=2026-08-10`, re-confirmed
in the 2026-08-16 weekly review (this row had again gone stale — the 08-10
number was live in `app_config` and in STATUS's own 08-10 post-session entry
the same day, but this ledger and GATE_MEASURES.md's "Latest" table kept
carrying the 08-07 read through two more review cycles). **Do not re-check
monotonicity before ~late Aug 2026**: ~85% of `portfolio_advice` is
`trigger_type=MACRO` on a **30-trading-day** horizon, so the graded pool grows
slowly (~3 MICRO rows/session) and a large ungraded backlog is normal, not
starvation. Tracked as [P-18], whose action gate is ≥50 graded calls.

| date | ECE | n graded | monotonic |
|---|---|---|---|
| 2026-08-02 (baseline) | 48.5% | 22 | false |
| 2026-08-07 (built_at) / 2026-08-09 (re-confirmed) | 35.6% | 31 | false |
| 2026-08-10 (built_at) / 2026-08-16 (re-confirmed) | 30.3% | 37 | false |

---

## ✅ PASSED — kept for the record

### V-4 · [P-24] advisor paper book de-duplicated — PASSED 2026-08-10
Repair run against prod `gilmuwmtdpjccibfhqtx` at ~01:20 IST pre-market, via the
Supabase MCP connector once it finally came up. Targets **derived at run time**
as the script insists — and they had not drifted since 08-07 after all.

| | before | after | target |
|---|---|---|---|
| closed MANAGEMENT/SEED rows | 18 | **11** | 11 ✅ |
| `sum(realized_pnl)` | −77,325.36 | **−45,796.41** | −45,796.41 ✅ |
| duplicate sum removed | | **−31,528.95** | −31,528.95 ✅ |

All 7 pairs were the documented shape: `ROTATION_OUT` created 04:31:13 carrying
the real qty, `SELL_VERDICT` created 04:31:06 with `qty=0`, identical prices and
P&L, all frozen at 2026-08-06. Step 1 set the 7 survivors' real quantity
(91/146/65/15/115/90/97), step 2 deleted the 7 twins — each returned id matched
the rollback snapshot.

**I-1 now returns 0 rows**, and 0 closed rows are left with `qty=0`. The ITC and
SILVERBEES TRIM rows the script warned not to touch are intact.

Rollback snapshot of all 14 rows:
`scripts/p24_rollback_2026-08-10.sql` (brain repo).

_Note for future prod work: `UPDATE` and `DELETE` both went through. The
standing "prod writes may be blocked by the permission classifier" caveat did
not bite here._

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

_2026-08-16 weekly re-measure: pooled `STOP_LOSS_HIT` since 08-07 is now
**−1.226R (n=43)**, up from n=15 — still inside the −1.25R cap as the sample
nearly tripled. The fix holds._

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
_2026-08-07: 7 rows — failing but frozen (all `2026-08-06`, none new)._
_**2026-08-10: PASS — 0 rows.** The V-4 repair ran; the duplicates are gone. From
here this is a live regression check: any pair appearing with a **newer** date is
a genuine reintroduction of the [P-24] bug, not legacy._

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
_2026-08-07: **PASS.** `STOP_LOSS_HIT` 4L/11S, `TARGET_HIT` 2L/5S,
`BRAIN_SIGNAL` 3L/3S — the two buckets the check names are both two-sided.
`EOD_CLOSE` 0L/6S and `SESSION_END` 2L/0S **are** one-sided, and that is by
design, not a collapsed path: shorts auto-cover at 15:15 and longs auto-close
at 15:20, so each EOD reason belongs to one side by construction. Do not
"fix" that asymmetry._

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
