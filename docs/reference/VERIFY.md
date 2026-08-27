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
_2026-08-26: **I-4 PASSED — [C7] is verified live.** `inplay_list` locked on session `c40c5634`: 10 rows, `locked_at` 10:32:54 IST, top `or_rvol` 15.89. The series gap 08-07 → 08-26 is exactly the three failures the fix targeted (08-10, 08-24, 08-25). First session able to judge it._
_2026-08-27: **I-4 PASSED again** — `inplay_list` locked 10/10 on session `a73fbf67`, first lock 09:53 IST. Still mid-week (Thu, after Wed's own session); the post-weekend stress test is still Monday 08-31. **V-13 PASSED** (moved to ✅ below) and **V-14 checked, still NOT-YET** (984 ≤ 1000)._
_2026-08-10: **V-4 PASSED** — the [P-24] repair ran pre-market. **No date-independent check remains open**; V-7/V-9/V-10 all need a live session to judge._

### V-15 · [P-38] TOAST compression actually applies
Ships 2026-08-27 as `scripts/storage_toast_compression_2026-08-27.sql` (brain),
run by hand post-close. Design:
`docs/superpowers/specs/2026-08-27-storage-toast-compression-design.md`.
`brain_decisions.indicators` averaged **1,100 B of a 1,344 B row** and was never
compressed — only 92 of 32,145 rows exceeded the default 2032 B
`toast_tuple_target`, so the largest column in the database was stored raw.

```sql
select c.relname,
       pg_size_pretty(pg_total_relation_size(c.oid))                        total,
       pg_size_pretty(coalesce(pg_total_relation_size(c.reltoastrelid), 0)) toast,
       (select round(avg(pg_column_size(indicators))) from brain_decisions)  avg_ind_decisions,
       (select round(avg(pg_column_size(indicators))) from portfolio_advice) avg_ind_advice
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relname in ('brain_decisions','portfolio_advice');
```
**PASS** = `avg_ind_decisions` **1,100 → ≤ 700** and `brain_decisions` total
**52 MB → ≤ 40 MB**.
**GUARD (the real risk)** = `brain_decisions.toast` must stay **< 5 MB**. Tens
of MB means the values went **out-of-line**, which costs an extra fetch on
every read and hits the labelling pass and edge study hardest — roll back and
raise `toast_tuple_target`.
**RESULT 2026-08-27 — FAIL, reverted.** Applied with the brain IDLE; produced
**no compression**: `avg_ind_decisions` stayed at exactly **1,100** and
`brain_decisions` moved 50 → 49 MB, which was dead-tuple reclaim, not encoding.
Two mechanism errors — `VACUUM FULL` does not recompress (TOAST applies on
write, so only an `UPDATE` re-routes a value), and `toast_tuple_target = 1400`
sat *above* much of the table (08-10 rows average 1,050 B), so nothing
triggered. Reverted to stock defaults; 32,145 rows intact, 0 null `indicators`.
Kept: 110 → 108 MB of bloat reclaim. See the spec header for what a correct
attempt requires.

Expected once applied: database 114 → ~95.3 MB (−16.4%), growth 7.88 → 6.51
MB/session (−17.4%), runway 49 → 62 sessions (+27%). This moves the [P-38]
tier decision from ~February to ~April; it does not remove it.

### I-7 · every session's decisions are actually labelled
**Standing invariant, added 2026-08-27 after this check found a live gap.**
`decision_outcomes` is what the edge study reads. On 2026-08-26 only **77 of
724** directional decisions were labelled, so that day's figure was computed on
11% of the data and read **+0.488R**; with the remaining 647 labelled it is
**+0.071R**. The pooled verdict did not move (+0.008 → +0.009R, t=+0.3,
n 1,858 → 2,051), but a per-day number was badly wrong and nothing caught it.

```sql
select bd.created_at::date::text the_day,
       count(*) directional,
       count(*) filter (where do2.decision_id is not null) labelled,
       count(*) filter (where do2.decision_id is null)     missing
from brain_decisions bd
left join decision_outcomes do2 on do2.decision_id = bd.id
where bd.signal in ('BUY','SELL') and bd.created_at >= '2026-07-15'
group by 1 having count(*) filter (where do2.decision_id is null) > 0
order by 1 desc;
```
**PASS** = no rows returned. **FAIL** = any date with `missing > 0` → run
`python3 scripts/label_decisions.py <date>` (no token needed) and re-run the
edge study before trusting that day's number.

Scoped to **≥ 2026-07-15** deliberately: the candle archive is empty for 07-14
and earlier, so May and early-July decisions can never be labelled and would
fail this check forever.

### V-14 · the win rate keeps moving past 1000 closed trades
Shipped 2026-08-27 (brain `49b76e5`). `get_win_rate` selected every closed
trade and counted in Python; PostgREST caps a rowset at 1000 and the book was
at **914**, adding ~69 a session. It would have silently frozen on the oldest
1000. Now two server-side exact counts.

```sql
select count(*) total,
       count(*) filter (where pnl > 0) wins,
       round((count(*) filter (where pnl>0))::numeric/count(*),4) win_rate
from trades where status='CLOSED' and pnl is not null;
```
**PASS** = once `total` > 1000, the `[kelly] Historical win rate: W/T` line in
the session log reports the **same T** as this query. **FAIL** = the log says
1000 while the query says more — the cap is back.
**NOT-YET** = total ≤ 1000 (no session has crossed it yet).
_2026-08-27 checked post-session `a73fbf67`: total **984** — still NOT-YET._

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

### V-12 · [P-35] the entry edge — 🔴 **CONVERGED TO ZERO**
_2026-08-26 (day 13, session 08-25 labeled — 348 decisions):_ pooled
out-of-sample **+0.001R, t=+0.0** on n=1,834.

Four readings, and they are no longer wandering — they are settling:

| sample | pooled OOS net | t |
|---|---|---|
| 10 days | +0.097R | **+3.0** |
| 11 days | −0.003R | −0.1 |
| 12 days | +0.031R | +1.0 |
| **13 days** | **+0.001R** | **+0.0** |

**This is now a confident answer, not an unstable one.** The estimate is
converging on zero as n grows; the t=+3.0 at ten days was the outlier, which is
what an initial false positive looks like when more data arrives. The rule still
beats its own day's baseline **9 of 12 days** — it does select better-than-average
decisions — but the margin it wins is **exactly the cost of taking them**
(avg 0.317R).

**Keep running it, but stop expecting it to turn.** Re-open only if the pooled
OOS clears **t > 2 on a materially larger sample**, not on a single good day —
that mistake has now been made once and corrected twice.

_Prior: ⚠️ UNSTABLE (12 days) · 🔴 FAILED (11 days)_
_2026-08-25 (day 12, session 08-24 labeled — 555 decisions):_ the rule scored
**+0.474R** (n=124, t=+4.7), its second-best day, immediately after its worst.
Pooled out-of-sample moved **−0.003R → +0.031R (t=+1.0)**.

**The instability is the finding.** Across three readings the pooled OOS has gone
**+0.097 (t=+3.0) → −0.003 (t=−0.1) → +0.031 (t=+1.0)** — wandering around zero,
with each new day moving it a lot because per-day n is small (35–341). Two
adjacent sessions produced −0.532R and +0.474R.

Verdict unchanged and now better supported: **positive but indistinguishable
from noise, not actionable.** A rule whose estimate swings this far on one day
of data is not an edge; it is an estimate with a wide error bar. Keep running
it — the point of this row is that a single flattering reading must not be
mistaken for a result.

_Prior: 🔴 FAILED 2026-08-23_
**The check did its job.** Labelling 2026-08-10 (329 decisions) took pooled
out-of-sample from **+0.097R (t=+3.0) → −0.003R (t=−0.1)**. The rule scored
−0.532R on 08-10 (n=262, t=−7.7), its worst day ever. Per this row's own FAIL
condition that is *a real answer, not a regression*: **there is no entry edge**,
and the candidate is closed. [P-35] annotated; see EDGE_STUDY_P35.md.
Keep running it — the ledger row stays open as the standing re-check.

_Original registration:_
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

### W-B · advisor calibration (ECE) — ✅ **CLOSED 2026-08-25, and the metric was wrong**
The ≥50-graded gate opened (37→79 on 08-24). Measured on n=98: **corr 0.0205
(t=0.20), AUC 0.4556** — confidence carries no information about whether a call
is right. avg 70.3 when right vs 69.8 when wrong.

⚠️ **ECE was the wrong thing to watch.** It measures calibration, not
discrimination, and a signal that always predicts the base rate is perfectly
calibrated and useless — so ECE improving 30.3%→22.6% was compression toward the
base rate, not progress. **Re-open only on AUC materially above 0.5**, never on
a better ECE. See [P18_CALIBRATION.md](P18_CALIBRATION.md).

_Original watch note:_
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

### V-13 · TARGET_HIT fills obey the cap band — PASSED 2026-08-27
Shipped 2026-08-27 (brain `f1c7d35`). ⚠️ **Pass condition rewritten the same
day — the original was wrong.**

**What the original said, and why it was wrong.** It claimed PASS = `avg_r ≥
1.60`, on the reasoning that the cap recovers gain lost to the ~30s poll
pulling back from the target. A replay of **222 real trades** through
`_exit_fill_price` says the opposite: the cap also clamps **overshoots** — polls
that caught a price *beyond* the target — and on this history those outweigh
the pullbacks.

| exit | n | mean R change | worst |
|---|---|---|---|
| STOP_LOSS_HIT | 149 | **+0.117** | +0.000 |
| TARGET_HIT | 73 | **−0.062** | **−2.043** |

So TARGET_HIT `avg_r` is expected to drift **down**, roughly 1.389 → ~1.33.
The original `≥ 1.60` would have failed a change that is working exactly as
designed and triggered a pointless rollback.

**The change still stands**, on realism rather than on the effect size: a
resting target-limit fills at its limit, so a fill booked 2R beyond the target
was never achievable. The error now runs toward *understating* performance,
which is the safe direction for a go/no-go gate. (Caveat: a genuine gap
through a sell-limit *can* fill better than the limit, so clamping is slightly
conservative in that case.)

**Test the mechanism, not the effect size:**

```sql
select count(*) n,
       count(*) filter (
         where (position_type = 'LONG'  and exit_price between
                  target_price - 0.25*abs(entry_price-stop_loss_price) - 0.01
                  and target_price + 0.01)
            or (position_type = 'SHORT' and exit_price between
                  target_price - 0.01
                  and target_price + 0.25*abs(entry_price-stop_loss_price) + 0.01)
       ) inside_band,
       round(avg(r_multiple)::numeric,3) avg_r
from trades
where exit_reason = 'TARGET_HIT' and created_at >= '2026-08-27'
  and entry_price is not null and stop_loss_price is not null
  and target_price is not null and exit_price is not null;
```
**PASS** = `inside_band = n` (every target fill lands in the band) on n ≥ 10.
**FAIL** = any fill outside it → the cap is not reaching the exit path, or a
long/short sign is inverted.
**NOT-YET** = fewer than 10 TARGET_HIT trades since the deploy.

*Pre-verified offline 2026-08-27:* 222 real trades replayed through
`_exit_fill_price`, **0 band violations** across both directions, so the sign
logic is confirmed on real geometry before it ever runs live.

**PASSED live 2026-08-27, session `a73fbf67`:** `n=14`, `inside_band=14`
(every TARGET_HIT fill lands in the band), `avg_r=1.266` — drifted down from
the 1.389 baseline exactly as predicted, confirming the corrected pass
condition rather than the original (which would have failed this same
result).

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

**Result 2026-08-26 — PASS.** 10 rows, `locked_at` `2026-08-26 05:02:54 UTC`
(10:32:54 IST, one minute after a late 10:31 session start), top `or_rvol`
15.89. This is the check [C7] was fixed for; it had returned zero on 08-10,
08-24 and 08-25. Standing invariant, so it stays open and keeps running.

⚠️ **This was a mid-week session**, not the post-weekend case [C7] broke on. The real stress test is the first session after a weekend gap — **Monday 2026-08-31**.
