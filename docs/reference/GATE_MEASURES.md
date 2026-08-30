# GATE MEASURES — the go/no-go time series

The periodic re-measure of [VISION.md](../VISION.md) §6.1's go/no-go gates.
Split out of [PIPELINE.md](../PIPELINE.md) on 2026-08-10: these are a **time
series**, and stacking each new one on top of the live kanban was pushing the
actual board 130 lines down the page. PIPELINE now carries only the latest
numbers and links here.

**The gates** (VISION §6.1): profit factor **>1.3 go / <1.1 reject**; expectancy
positive; advisor calibration is DARK and not scored.

## Latest — 2026-08-30 (weekly, 5 sessions' growth since 08-23)

| Metric | Value | vs prior |
|---|---|---|
| Profit factor | **0.3685** | 0.343 (08-23) → 0.3685 |
| Expectancy | **−0.4213R** | −0.429R → −0.4213R |
| Max drawdown | **≈−₹59,206.27** | ≈−₹41,817 → −₹59,206 |
| Advisor calibration ECE | **22.1%**, non-monotonic, n=98 | 30.3% (n=37) → 22.1% (n=98) |

Measured directly from `trades` (1,018 closed, 936 carrying `r_multiple`) and
`app_config.advisor_calibration_latest` (`built_at=2026-08-28`) this pass.
Five sessions ran since the 08-23 review (08-24 through 08-28); none since —
08-29/08-30 are the weekend, confirmed via `trading_sessions`.

**No gate has ever flipped.** PF has sat in the reject zone at every measure and
is nowhere near either threshold — this week's move (0.343→0.3685) is well
inside the established per-session PF range's noise, not a trend. The drawdown
deepening is *by design* — the −3R daily stop is soft, so full-day sessions
bleed past the marker; that is data collection working as intended, not a
regression.

**Advisor ECE fell further as the graded pool nearly tripled** (37→98,
crossing [P-18]'s ≥50-graded action gate on 08-24): 30.3% → 22.1%. **This is
not new evidence** — [P-18] closed 2026-08-25 on the *discrimination* measure
(AUC ≈0.49, corr(confidence, correct) = 0.02, n=98 — confidence carries no
information), specifically because ECE improving is compression toward the
48% base rate, not a calibration gain. See
[P18_CALIBRATION.md](P18_CALIBRATION.md). Re-open only on AUC materially
above 0.5 under both labels — never on a better ECE. No AUC re-check ran this
pass (needs `scripts/advisor_discrimination.py`, not available in this
docs-only environment).

⚠️ **None of this is the edge verdict.** Paper PF measures entries the book
already took; gate #6 (a historical backtest, [P-01]) is the verdict, and it is
blocked. [P-30] sharpened the surrounding picture — no exit policy clears
breakeven *even at zero transaction cost* — so the edge has to come from the
entries.

---

## 📊 Weekly gate re-measure (2026-08-30)

**Five sessions ran this week** (08-24 through 08-28) — the first real
multi-session week since the 08-11→08-21 silent stretch. `trading_sessions`
confirms no new session since `f4419be8` (08-28); 08-29/08-30 are the
weekend.

| Metric | Value | Δ vs 08-23 |
|---|---|---|
| Profit factor | **0.3685** | +0.026 |
| Expectancy | **−0.4213R** | +0.008R |
| Max drawdown | **≈−₹59,206.27** | −₹17,389 deeper (by design) |
| Advisor calibration ECE | **22.1%**, non-monotonic, n=98 | pool +61, ECE −8.2pp |

**Recently-Done pipeline items re-verified over the week's growth — did they
move their measure-of-done?**
- **[P-05] stop-execution fill cap — HELPS, still holding.** Pooled
  `STOP_LOSS_HIT` since 08-07: LONG −1.248R (n=42), SHORT −1.214R (n=72),
  pooled **≈−1.227R (n=114)** — was −1.226R (n=43) at 08-23. Unchanged as the
  sample nearly tripled: the cap is not decaying, and the bucket stays inside
  the −1.25R design target.
- **V-13 TARGET_HIT fill cap (brain `f1c7d35`, shipped 08-27) — confirmed,
  more data.** `n=17` (was 14), **17/17 inside the cap band**, `avg_r` 1.266
  unchanged. Working as designed: the realism fix understates rather than
  overstates performance, the safe direction for a gate.
- **[C7]/I-4 in-play-lock fix (brain `eb75ded`) — held mid-week, decisive test
  still ahead.** Locked 10/10 on 08-26, 08-27 and 08-28. All three were
  mid-week sessions (Wed/Thu/Fri) — [C7] specifically broke the first session
  *after a weekend*. **Monday 2026-08-31 is that test**, not yet reached from
  this Sunday review.
- **[P-18] advisor calibration (closed 08-25) — verdict holds, ECE move is
  not new information.** Graded pool grew 37→98 as the MACRO wave matured;
  ECE fell 30.3%→22.1%. Per [P-18]'s own corrected criterion this is expected
  compression toward the base rate, not discrimination improving — no AUC
  re-check available in this environment to test the actual open question.

**One data-quality gap found this pass:** I-7 shows 08-24 through 08-27 fully
labelled but **08-28's 409 directional decisions 0% labelled**, two days
after close (spans the weekend). Not a regression — `label_decisions.py` is a
manual step — but it means V-12's edge study is currently blind to 08-28
until it runs.

**3-lens sanity:**
- **Trader** — PF 0.3685, deep reject zone, no flip. This week's move from
  0.343 is noise inside the established per-session range (0.04–1.03
  observed), not a trend — five sessions is too few to read as a direction.
- **Advisor** — ECE 22.1% (n=98) continues falling as predicted, but the
  question that matters (does confidence discriminate right-vs-wrong calls)
  was already answered negatively on 08-25 and nothing this week's ECE move
  changes that. No new risk.
- **Engineer** — no new operational finding. [C9] (no portfolio-level
  exposure cap) and [C10] (EOD exit side-confound) both remain open by
  deliberate choice, pending the decommission decision — unchanged from
  08-27. [P-03]/[P-04] token-paste dependency: still user-deprioritised, not
  re-raised. One new action surfaced: run `label_decisions.py 2026-08-28`
  (see I-7 above).

**No go/no-go gate flipped.** Nothing regressed; the two verified-live fixes
([P-05], V-13) both continued to hold on larger samples rather than decaying.
No item moved on this board — see [PIPELINE.md](../PIPELINE.md) for the full
readout.

---

## 📊 Weekly gate re-measure (2026-08-23)

**No new trading session in 13 days.** `trading_sessions` still tops out at
`max(started_at) = 2026-08-10 04:07 UTC`, `total_sessions = 87`. Direct
Supabase queries confirm zero rows in `trading_sessions`/`brain_decisions`/
`portfolio_advice` for the entire 08-11→08-21 window (all three counted
`0` from a single query). Silent-weekday count is now **9** (08-11 through
08-21, weekends excluded) — up from 5 at the 08-17 pass, a new record.
`brain_heartbeat`: ONLINE, `current_cycle=0`, "Waiting for START command" as
of 08-23 04:37 UTC — same standing state as every pass since 08-11
([P-03]/[P-04] stay user-deprioritised, not re-raised here).

All figures below are a **re-measure of the same 08-10 data**, third weekly
review running on it unchanged (08-16, and now 08-23):

| Metric | Value | vs 08-16 |
|---|---|---|
| Profit factor | **0.343** | unchanged |
| Expectancy | **−0.429R** | unchanged |
| Max drawdown | **≈−₹41,817.14** | unchanged |
| Advisor calibration ECE | **30.3%**, non-monotonic, n=37 | unchanged |

**Re-verified [P-05] holds, recomputed fresh (not just carried forward):**
pooled `STOP_LOSS_HIT` since the 08-07 fix, split by side — LONG **−1.285R
(n=17)**, SHORT **−1.187R (n=26)**, pooled **−1.226R (n=43)** — exactly
matching the 08-16 reading. Confirms no drift, no regression.

**Invariant re-check:** I-1 (no duplicate paper exits) still **0 rows**.
Supabase DB size still **97 MB / 500 MB (19%)** — byte-identical to 08-10,
since nothing has written to the trade/decision tables in 13 days; [P-38]'s
runway clock has paused, not ticked down further.

**3-lens sanity:**
- **Trader** — PF 0.343, deep reject zone, no new trades to read, no change
  in substance from 08-16.
- **Advisor** — ECE 30.3% (n=37), unchanged; still non-monotonic and below
  [P-18]'s ≥50-graded action gate. First MACRO wave still expected ~08-24 —
  next week's review is the one likely to show movement, if a session runs
  to generate MICRO rows and the MACRO wave matures on schedule.
- **Engineer** — the operational story is the same one three passes running:
  the manual-token-paste dependency ([P-03]/[P-04]) has now cost 9
  consecutive weekdays, more than double the prior worst case (4 days). No
  new technical finding — the mechanism (heartbeat ONLINE, waiting for
  START) is identical to every prior silent day. Not re-raised, per standing
  user deprioritization; logged so the number is on record.

No go/no-go gate flipped (PF stays far below the 1.1 reject line). Nothing
regressed; nothing moved to Ready. [VERIFY.md](VERIFY.md)'s OPEN section
still has no date-independent checks (V-7/V-9/V-10/V-11/V-12 remain
event-driven, all still awaiting a live session) — none has a runnable check
sitting stale, so no ledger-staleness finding this pass either.

---

## 📊 Weekly gate re-measure (2026-08-16)

**No new trading session this week.** `trading_sessions` max `started_at` is
still 08-10; zero rows in `trading_sessions`/`brain_decisions`/`portfolio_advice`
for 08-11 through 08-15 (confirmed directly against prod). The four
consecutive silent weekdays (08-11→08-14) already logged in the 08-14
post-session pass haven't grown — 08-15/08-16 are weekend, same non-growth
pattern as the 08-02 weekly review. `brain_heartbeat`: ONLINE,
`current_cycle=0`, "Waiting for START command" as of today 04:37 UTC — same
standing state, not re-raised ([P-03]/[P-04] stay user-deprioritised).

All figures in the "Latest" table above are a **re-measure of the same 08-10
data**, not new information — see the docs-sync note above for why the
numbers moved from what this table last showed.

**Re-verified [P-05] holds on a much larger sample.** Pooled `STOP_LOSS_HIT`
since the 08-07 fix: **−1.226R (n=43)**, inside the −1.25R cap and consistent
with V-2's original −1.211R at n=15 — the fix has held as the sample nearly
tripled (all from already-closed trades; no new session was needed to check
this). See [VERIFY.md](VERIFY.md) V-2.

**3-lens sanity:**
- **Trader** — PF 0.343, deep reject zone, unchanged in substance. No new
  trades to read. Max drawdown ≈−₹41,817 (peak-to-trough of realized P&L,
  all-time) is essentially the 08-10 read — no new bleed.
- **Advisor** — ECE 30.3% (n=37), continuing the improvement trend, still
  non-monotonic and still under [P-18]'s ≥50-graded action gate. First MACRO
  wave still expected ~08-24; watch, don't act.
- **Engineer** — no new session this week, so no new operational finding
  beyond the standing [P-03]/[P-04] token-paste gap (still 4 consecutive
  silent weekdays, unchanged — not re-raised, per standing user
  deprioritization).

No go/no-go gate flipped (PF stays far below the 1.1 reject line). Nothing
regressed; nothing moved to Ready. [VERIFY.md](VERIFY.md)'s OPEN section has
had no date-independent checks since 08-10 (V-7/V-9/V-10/V-11/V-12 are all
event-driven, still awaiting a live session) — none has sat open past a week
with no path to resolve, so no ledger-staleness finding this pass.

---

## 📊 Weekly gate re-measure (2026-08-09)

**No new trading session this week** (last session `2ddadca7` ended 08-07
09:52 UTC; 08-08/08-09 are weekend, next session Mon 08-10 per STATUS). So
this is a clean re-measure over the same underlying data the 08-07/08-08
post-session passes already recorded, computed directly from `trades` +
`app_config.advisor_calibration_latest` rather than carried-forward prose:

| Metric | Value (610 closed trades w/ `r_multiple`; 692 total CLOSED) | Gate (VISION §6.1) | Δ vs 08-02 review | Δ vs 08-07 post-close |
|---|---|---|---|---|
| Profit factor | **0.358** (gross win ₹18,563 / gross loss ₹51,830) | >1.3 go / <1.1 reject → **reject zone, no flip** | 0.376→0.358 | 0.371→0.358 |
| Expectancy | **−0.4155R** avg | negative | −0.408R→−0.4155R | −0.414R→−0.4155R |
| Max drawdown | **≈−₹33,378** (peak-to-trough equity, all-time) | — | ≈−6,697→−33,378 (deepening is by design — soft `-3R` stop lets full-day sessions bleed past the marker; see FLAG log, not a regression) | ≈−29,320→−33,378 (08-07's −₹3,423 session) |
| Advisor calibration ECE | **35.6%**, still non-monotonic, **31** graded calls | DARK — not scored | 48.5%→35.6% (n=22→31) | 48.5%→35.6% (STATUS's 08-06 narrative had already noted 28→31 graded but the tracked ECE/VERIFY W-B number was stale until this pass) |

**82 of 692 CLOSED trades carry no `r_multiple`** (all dated ≤2026-07-06 —
`COVER_SHORT` 39, `SESSION_END` 17, `AUTO_SQUARED_ZERODHA` 10, `BRAIN_SIGNAL`
8, `ORDER_FAILED`/`SQUARE_OFF_FAILED` 7, `STOP_LOSS_HIT` 1). Pre-dates every
tracked fix on this board, not a new gap — excluded from expectancy by
construction (`avg()` skips nulls), noted here so the 610-vs-692 count
doesn't read as unexplained.

No go/no-go gate flipped — PF stays deep in reject territory, nowhere near
either threshold. **Advisor calibration is the one number that moved for a
real reason**: ECE fell 12.9pp as the graded pool grew 22→31 (all MICRO-horizon
matures; the 30-day MACRO wave still isn't due — see [P-18]/W-B). Still
non-monotonic and still under the 50-graded action threshold, so this stays a
**watch note, not an action** — recorded in [VERIFY.md](VERIFY.md)
W-B so it isn't lost again.

**[P-24] DB repair (V-4) — still open, unchanged.** `advisor_paper_positions`
MANAGEMENT/SEED closed rows: still **18 rows / −₹77,325.36**, still **7**
duplicate pairs (I-1), all still frozen at `first_seen=last_seen=2026-08-06`
— the code fix continues to hold (no new dupes), but the repair script itself
hasn't been run yet. Third day open; not yet "over a week" but it's the one
Ready item that's pure user-action and has sat untouched since 08-06.

**3-lens sanity:**
- **Trader** — PF unchanged in substance (0.358, deep reject), no new
  trades to read since last Friday. Drawdown deepened exactly as the
  soft-stop design predicts; not a new risk.
- **Advisor** — ECE improved (48.5%→35.6%) but n=31 is still low and the
  curve is still non-monotonic; [P-18]'s own criteria (≥50 graded, expected
  late August per the MACRO-wave timeline) already covers when this becomes
  actionable — no new item needed.
- **Engineer** — no new session ran this week, so no new operational
  finding. The one standing engineering risk is non-technical: [P-24]'s DB
  repair is a one-command script (`scripts/repair_p24_paper_books.sql` in
  the brain repo) still waiting on a human to run it against prod.
  _✅ Since resolved — the repair ran 2026-08-10 pre-market once the Supabase
  connector came up. Left as written because this is a dated snapshot._

Nothing regressed; nothing moved to Ready. See prior weekly re-measure below
for the 08-02 baseline this compares against.

## 📊 Weekly gate re-measure (2026-08-02)

**No new trading data this week.** `trading_sessions` max `started_at` is still
07-29; `brain_heartbeat` shows `status=ONLINE, current_cycle=0, "Waiting for
START command"` as of 08-02 04:39 UTC — same stalled state STATUS flagged on
07-31. Zero sessions, zero trades, zero advisor runs since 07-29. All figures
below are therefore **unchanged from last review, not re-verified against new
data** — first-time cumulative baseline for future deltas:

| Metric | Value (370 closed trades, all-time) | Gate (VISION §6.1) |
|---|---|---|
| Profit factor | **0.376** | >1.3 go / <1.1 reject → **reject zone, no flip** |
| Expectancy | **−0.408R** avg | negative |
| Max drawdown | **≈−₹6,697** (peak-to-trough equity) | — |
| Advisor calibration ECE | **48.5%**, non-monotonic, 22 graded calls (most bins low-n) | DARK — not scored |

No go/no-go gate flipped. Paper PF confirms the standing conclusion (no edge
on paper data) but this is not the edge verdict — gate #6 is, and it's still
blocked on the Kite ₹500/mo decision ([P-01]).

**3-lens sanity:** trader — PF unchanged, deep reject zone, nothing new to
read since no new trades. advisor — calibration ECE 48.5%/non-monotonic is
the first hard number recorded for it; poor but DARK (no live weight), and
n=22 is too small to act on — watch, don't fix (new [P-18]). engineer — the
real story this week is operational, not statistical: the manual-token-paste
SPOF has now stalled the *entire* pipeline for a full week, which means none
of [P-05]/[P-07]/[P-16] can accumulate the fresh session data they need to be
tested. This sharpens [P-03]'s priority further; no new risk beyond what's
already tracked there.
