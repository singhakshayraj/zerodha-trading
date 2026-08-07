# PIPELINE — the execution board

**Where feedback becomes tracked work.** The live kanban: every finding (from a
review, an audit, or you) lands here as an item with a **measure-of-done**;
daily work pulls the top **Ready** item. Strategy/why-order lives in
[ROADMAP.md](ROADMAP.md); current reality in [STATUS.md](STATUS.md).

_Last updated: 2026-08-07 (post-close) · Burn-down: 15 shipped +
verified live / 1 in-progress / 6 ready / 4 blocked. **Session `2ddadca7`
closed 15:22 IST — 36 trades, −₹3,422.57, 11W/25L.** VERIFY V-1/V-2/V-3/V-5/V-6
all **PASSED** ([reference/VERIFY.md](reference/VERIFY.md)): closes out
**[P-27]**+**[P-28]** as verified-live (not just shipped) and confirms
**[P-05]** at −1.211R pooled over both sides (was −1.252R LONG-only on 08-06).
**[P-31]** diversity-half verified too (86 symbols, cycle budget fine). **K8**
(inplay-lock) resolved on evidence. Only **V-4** ([P-24] DB repair) stays open
— blocked on a human running the repair script, not on data. New Ready item:
**[P-30]** (exit-frontier candle-replay phase 2, source [P-29] shipped today).
`/post-session-check` + `/counterfactual-audit` full sweep (data-quality
scorecard, flag verdicts) still queued per STATUS.md — not run this pass.
Android mobile re-check still open. Prior:_
_2026-08-05 (post-session) · Burn-down: 9 shipped + verified live
/ 0 in-progress / 4 ready / 4 blocked. (P-19 + P-05 + P-07 + P-06 (database.py) + P-20 +
P-14 phases 1-3 shipped; P-15/P-05/P-07 verified live on 08-03's two sessions, P-20
verified live on 08-04 + 08-05 (no advisor stall either day); P-16 resolved as no-op.
New 08-05 findings: P-14 Phase 2 snapshot tables still 0 rows after the first official
session since shipping (→ [P-22]); brain git_sha mismatch, P-05 re-fix still unconfirmed
live (→ [P-23]).)_

---

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

## The feedback loop (how this board is fed + drained)

```
 REVIEW ─▶ TRIAGE ─▶ PIPELINE ─▶ DO (daily) ─▶ VERIFY ─▶ REVIEW
 cadence   finding→   item lands   pull top     next review
           solution   w/ measure   Ready, ship  re-measures
```

- **REVIEW (cadence):** per market session — `/post-session-check` +
  `/counterfactual-audit` (small findings, daily); **weekly** — a 3-lens eval +
  re-measure the gate metrics (big findings). Automated via the scheduled agents
  (see §Cadence at the bottom).
- **TRIAGE:** each finding → an item below with owner + a *measurable* done.
  Findings live in KNOWN_ISSUES with their own IDs (`K`/`W`/`A`/`B`); a finding
  earns a `P-nn` here only when it becomes tracked work. The two namespaces are
  deliberately separate — `K7` is not `P-07`.
- **DO:** each working session, pull the top **Ready** item, ship it, move it to
  **Done**, add one line to STATUS.
- **VERIFY:** shipping owes a row in
  [reference/VERIFY.md](reference/VERIFY.md) — runnable SQL plus the number
  that counts as a pass. `/post-session-check` runs that ledger as its §0 and
  writes the result back: **PASS** closes the item here, **FAIL** returns it to
  **Ready** carrying the failing number.

**The rule that makes the loop closed:** a fix with no VERIFY row is not
shipped, it is *unmeasured*. [P-05] spent two days marked verified on a number
that turned out to measure half the book — that is precisely the failure this
ledger exists to prevent.

Item format: `[ID] Title — owner · measure-of-done · source`
Owners: **[me]** buildable now · **[you]** decision/action · **[both]**.

---

## 🔴 BLOCKED — waiting on a decision/action (mostly [you])

- **[P-01] Gate #6 backtest — the edge verdict.** [you→me] · *done =*
  `backtest.py` outputs per-regime PF over ≥2yrs. · *blocked on:* Kite ₹500/mo.
  _The hinge — everything strategic waits on this._
- **[P-02] Fundamentals provider (agent P3).** [you→me] · *done =*
  `stock_observations.payload.fundamentals` non-null. · *blocked on:* source pick.
- **[P-03] TOTP headless auto-login (SE3).** [you→me] · *done =* a session starts
  with no manual token paste. · *blocked on:* Zerodha API/TOTP setup.
  _07-31 review: the manual-paste dependency just cost 2 consecutive trading
  days (07-30, 07-31 — both regular NSE sessions) — brain online + heartbeating
  but no START command, zero sessions/trades/advisor runs either day. Sharpens
  priority on this item once unblocked._
  _08-02 review: unresolved — still zero sessions since 07-29 (heartbeat
  confirms brain ONLINE, `current_cycle=0`, "Waiting for START command" as of
  08-02 04:39 UTC). No new trading weekday has passed since the 07-31 flag
  (08-01/08-02 are weekend), so the day-count hasn't grown, but the pipeline
  has now produced zero fresh data for a full calendar week — blocking VERIFY
  on [P-05], [P-07], [P-16] and the P-15/P-17 fixes below alike._
- **[P-04] Rotate Telegram bot token (+ anon key = unnecessary).** [you] · *done
  =* new Telegram token live, old dead. · *source:* Sprint 0 security fix.
  _08-03 audit ([reference/CRED_ROTATION.md](reference/CRED_ROTATION.md)):
  repos + full git history are clean (no secret ever committed); RLS verified
  airtight (sensitive tables service_role-only, rest deny-all, no rls_disabled
  errors). So the anon key is safe-by-design → **skip rotating it** (rotation
  would force a JWT-secret regen that also breaks service_role, for ~zero gain).
  The ONE real action is the **Telegram token** (was in Railway logs pre-scrub):
  BotFather → revoke → `railway variables --set TELEGRAM_BOT_TOKEN=… --service
  zerodha-brain`. Runbook has exact steps. Reduced from a 2-cred task to 1._

## 🟢 READY — pull these now (no blocker, [me])

- **[P-24] Advisor paper book double-counts realized P&L — CODE SHIPPED
  2026-08-07 (brain `f645ff3`), DB REPAIR PENDING [you].** *Remaining:* run
  `scripts/repair_p24_paper_books.sql` (brain repo) against prod — this session
  was blocked from writing to the DB. **Code half VERIFIED LIVE 08-07** — 20
  advisor runs / 120 rotations produced zero new duplicate pairs; all 7 dupes
  are frozen at 08-06. ⚠️ **The 9 / −₹39,983.84 target is STALE** — the book
  grows as advice closes out (18 / −₹77,325.36 at 08-07 close → target now
  11 / −₹45,796.41). Derive it at run time; the invariant is the duplicate sum
  −₹31,528.95. Script updated (brain `a06d9fe`). _Note the audit's TRIM claim was wrong — ITC 40+40 and
  SILVERBEES 213+212 are honest half-trims of 80 and 425, not full exits;
  KNOWN_ISSUES §A1 corrected. A real second bug was there though: the rotation
  leg read the pre-trim qty and overwrote the trim's shrink._ Original item:
  [me] · *done =*
  each closed position has **exactly one** row with the real closed qty, and
  `sum(realized_pnl)` over closed SEED rows equals the per-name sum (today:
  −₹39,983.84, not the recorded −₹71,512.79). · *source:* 08-06 mid-session audit.
  _Every rotated-out holding was written twice (`qty=0`/`SELL_VERDICT` at
  04:31:06 **and** `qty=<real>`/`ROTATION_OUT` at 04:31:13), same P&L both times
  — the 7 duplicate pairs account for the −₹31,528.95 gap to the rupee. Separately
  **TRIM books a full exit while leaving the position open** (ITC open 40 + closed
  TRIM 40 for the whole −25.8%; SILVERBEES open 213 + closed 212). Corrupts
  `/advisor/accountability`'s realized record + win-rate. **Fix now while the
  books are one day old** — near-zero history to migrate. Detail:
  [reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md) §A1. **Parked to
  post-market by the user 08-06.**_
- **[P-30] Exit-frontier phase 2 — exact resolution by candle replay.** [me] ·
  *done =* every cell reports `resolved / intra-bar ambiguous / no data`, the
  optimistic-pessimistic bounds are computed over the unresolved remainder only
  (the −0.219/−0.337 gap at the best cell should collapse), and the replay is
  validated against ground truth (trades that really did `STOP_LOSS_HIT` or
  `TARGET_HIT`). · *source:* [P-29].
  _Evidenced feasible: `candles` is 5-minute, 88.5% window coverage, and at the
  decisive cell **48 of 51 ambiguous trades resolve exactly** (1 intra-bar, 2 no
  data). Note 5-min bars narrow the ambiguity to a single bar — they do not
  eliminate it, so keep both bounds for the remainder. Full design, algorithm
  and acceptance criteria: [reference/EXIT_FRONTIER.md](reference/EXIT_FRONTIER.md) §5._
- **[P-26] Decide the paper MANAGEMENT seed basis.** [me→you] · *done =* seed
  price rule chosen + implemented. · *source:* 08-06 audit §A2.
  _Seeding at the holdings' **cost basis** books pre-advisor history (RVNL −46.3%,
  NBCC +73.0%) as advisor realized results. Alpha is unaffected (baseline carries
  it too) but the win/loss scorecard reads as advisor skill when it isn't.
  **Recommend seeding at seed-day price** so the advisor only owns what happened
  after it spoke. Bundle with [P-24]._


- **[P-06] Module split part 2 — IN PROGRESS (scoring half done).** [me] · *done
  =* no file >600 lines, suite green. · *source:* SE4.
  _08-02–03 shipped: the **entire advisor family is now split and all <600** —
  `advisor_scoring.py` 554 (scoring/`advise`, brain `4cb62ce`) + `advisor_rotation.py`
  59 (rotation helpers, brain `a89b82d`), on top of part-1's advisor_risk/digest.
  **portfolio_advisor 1155 → 587**, behaviour-identical, suite 847 green, F-lint
  clean throughout. Patch-namespace hazards handled per split (weekly_trend
  repointed to advisor_scoring; rotation/news_sentiment untouched-safe).
  **Status (08-04): advisor family + database.py all <600.** Remaining offenders
  are the two highest-risk files + config (exempt):
  • brain.py 2211 — one monolithic `TradingBrain` class; methods share `self`,
    so a split needs mixins/surgery on the trade engine.
  • database.py 1359 → 905 → **561 (now <600 ✅)** — two increments (brain
    `9e370ac` + `4f8cff7`): `db_stocks.py` 479 (stock/observation/universe/level/
    advice-snapshot, 28 fns) + `db_records.py` 362 (decisions/quotes/candles/news/
    tradebook/advice-grading + `_fetch_all`, 17 fns). Same call-time
    `database.supabase` pattern so the 33 `patch('database.supabase')` sites still
    bite (verified each time); nothing in either block is patched by name. Suite
    855, cov 88.6%. **database.py is DONE.**
  • scheduler.py 868 — 64 `patch('scheduler.db')` + dense monkeypatching → any
    extraction risks mass patch-repointing. Highest-risk of the three.
  • config.py 644 — flat flag declarations, exempt.
  _Verdict: advisor family + database.py done via the safe facade pattern. brain.py
  + scheduler.py remain disproportionate risk for a line count (live engine, dense
  monkeypatching) — do only if a file becomes a real merge-conflict/nav pain, one
  carefully-verified pass at a time. config.py exempt._
- **[P-18] Advisor calibration is poor and non-monotonic.** [me] · *done =*
  ECE recomputed once graded_calls ≥ 50 (currently 28, most bins low-n);
  re-check monotonicity then — don't promote confidence into a scored input
  before it holds. · *source:* weekly review 08-02 gate re-measure — first
  recorded baseline: ECE 48.5%, `monotonic=false`, `built_at=2026-07-29`.
  _08-05: graded_calls 21→28, hit rate 42.9%→39.3% — still small-n, DARK,
  watch only._
  _**08-06 — timeline corrected.** 31 graded. The ≥50 gate is NOT days away:
  ~85% of advice rows are `trigger_type=MACRO` and mature at a **30-trading-day**
  horizon, so only ~3 MICRO rows grade per session. First MACRO wave (07-12, 19
  rows) matures ~**08-24**; 07-22's ~**09-02**. Realistic ECE re-measure date:
  **late August**. Don't re-open this weekly expecting movement._
- ~~**[P-22] advisor_paper tables empty**~~ ✅ **DONE — verified live 08-06.**
  Both books seeded on the official run at 04:31 UTC: `advisor_paper_positions`
  42 rows, `advisor_paper_equity` 2 (MANAGEMENT ₹618,714 vs baseline ₹620,695;
  PICKING ₹99,400 vs ₹100,000). Measure met. Original triage kept below.
  _(was: ROOT-CAUSED + fixed 08-06)_ · *done =* `advisor_paper_*` ≥1 row after a clean official run.
  _Two causes, both fixed: (1) **timing** — 08-05's official advisor ran 11:51:57
  IST, ~3s **before** the git_sha-fix redeploy (`5df81c31`, 11:52), so it ran the
  OLD build (no paper engine), and the once-daily dedup then blocked the new code
  from re-running it. (2) **cold-cache MTM** — the paper engine's candle fetch
  would 400 on a retail token from a cold MarketData; fixed by warming holdings
  (brain `489d6b5`, same fix as grading). Next session runs the new code from the
  start → both books seed + snapshot. Carry the verify._
- ~~**[P-23] git_sha mismatch / P-05 re-fix undeployed**~~ ✅ **DONE — verified
  live 08-06.** Session `16f23213` stamps `git_sha=c5fd5254f157`, well past the
  P-05 fix — the push-based deploy holds. Measure met. _The [P-05] **−1.25R
  re-measure** is a separate open verify (see below), not this item._
  Original triage: [me] · *done =* a session stamps `git_sha` ≥ the P-05 fix. _Root cause: the
  brain service **auto-deploys from GitHub**, but `deploy.sh` only did `railway
  up` (local tarball) and the commits were never pushed — so a GitHub rebuild
  reverted to `c689ed4` and three commits (P-05 `b09904` + paper) ran nowhere.
  Fixed live 08-06: pushed → `git_sha` confirmed `a2d9881` mid-session; then
  `deploy.sh` reworked to push-based + hard-abort on unpushed/dirty/non-main so
  it can't recur. [P-05] `STOP_LOSS_HIT` re-verify still wants a clean full
  session on the fix (08-05 n=1 @ −1.157R is uninformative)._

## 🔨 IN PROGRESS

- _(none — Sprint 0/2 just shipped)_

## 🗓️ BACKLOG — after gate #6 / decisions

- **[P-08] FA1 client-profile layer** (horizon/risk/tax → advice conditioned on
  the person). [both]
- **[P-09] FA4 entry-quality on rotation targets — DARK, shipped 08-03** (brain,
  see Done). Weekly-downtrend refusal + single-name weight cap live as dark
  counterfactuals; correlated-cluster lever deferred (no cluster membership for
  non-held names yet). [me]
- **[P-10] FA3 regime-conditional factor weights (Pillar 3).** [me] · needs graded
  data across regimes.
- **[P-11] Promote daily/weekly alignment into the score** once it's gradeable
  (~early Aug) AND attribution shows it predicts. [me]
- ~~**[P-12] Agent P4 — per-stock timeline UI**~~ ✅ SHIPPED 08-03 (see Done).
- **[P-13] Activate Marketaux news key** → `news.sentiment` populates. [you→me]

## 💡 PROPOSED — high-value, awaiting user greenlight

- _(none)_

## 🔨 IN PROGRESS

- **[P-14] Advisor accountability / paper-trade system.** [me] · re-raised +
  scoped 2026-08-05 (was parked 2026-07-28): paper-trade every advisor verdict,
  store outcomes, measure wins/losses → feedback loop. Scope: **two books**,
  track **everything** (holdings + rotation + Nifty-500 scan). Spec:
  [reference/ADVISOR_ACCOUNTABILITY.md](reference/ADVISOR_ACCOUNTABILITY.md).
  - ✅ **Phase 1 (brain `91a48361`):** grading no longer starves — runs on every
    session start + loud `queued/graded/not_due/errors` log; `ADVISOR_BACKTEST_ENABLED=true`
    set on Railway (defaulted false — 2nd starvation cause). *done =* the 38
    matured-but-ungraded rows grade next session.
  - ✅ **Phase 2 (brain `a2d9881`):** `advisor_paper.py` + tables
    `advisor_paper_positions`/`advisor_paper_equity`. MANAGEMENT (holdings +
    HOLD/SELL/TRIM/rotation, baseline=frozen holdings) + PICKING (₹100k cash,
    buys rotation/scan targets, horizon close, baseline=Nifty B&H). Advisory-only,
    +10 tests, suite 867. *done =* both books seed + snapshot on the next official run —
    **met 08-06** (see [P-22], ✅ DONE below).
  - ✅ **Phase 3 (dashboard, auto-deploys Vercel):** `/advisor/accountability`
    ("Advisor scorecard") + API — per-book equity curve vs baseline (alpha),
    realized win/loss record + win-rate, by verdict + source, best/worst trade.
    Empty-state until data accrues; verified end-to-end with fixtures, `next
    build` clean. *done =* page live; fills in as Phase 2 snapshots land
    (still empty-state — blocked on [P-22]).
  - ✅ **UX redesign (dashboard `99fe9a7`, 08-05):** reworked `/advisor` page
    for scannability + mobile, content unchanged. `next build` clean, auto-
    deployed.

## ⏸️ PARKED — explicitly deferred, revisit when raised

- _(none)_

## ✅ DONE (recent — for burn-down + verify)

_2026-08-07_ — **[P-25] Real-money accountability SHIPPED** (brain `3489ac6`).
Infers the user's actual executions by diffing the ~8-min `portfolio_advice`
holdings series, links each to the advice standing at the time, and stamps
`user_decision` with no manual step — closing the loop the Telegram bot never
could ([P-04] stays blocked and no longer matters for this). **Validated against
ground truth before shipping:** 177 runs / 25 symbols → exactly one detection,
`NBCC SELL 115 @ 08-06 04:36`, the sale the user reported, zero false positives.
Backfilled + surfaced on `/advisor/accountability`. Suite 894.
_Documented asymmetry: SELLs land within one refresh, BUYs only T+1 (the
holdings feed reports delivered stock), which is why the paired rotation buy was
never captured._ Verify: **V-7** (event-driven) + invariant **I-5**.

_2026-08-07 post-close_ — **[P-27] + [P-28] + [P-31] all VERIFIED LIVE**, plus
[P-24]'s code half. Session `2ddadca7` (36 trades, −₹3,422.57): V-1 model_stop
15/15, V-2 `COVER_SHORT` gone and **[P-05] re-judged at −1.211R across both
sides**, V-3 counts 36=36=36, V-5 86 symbols, V-6 490s avg. [P-24] code
verified — 20 advisor runs / 120 rotations produced **zero** new duplicate
pairs. **[C3] fixed** (brain `a06d9fe`). **[C1] root-caused:** autopilot fired
on time but retried ~380× on a missing enc_token, costing ~55% of the session —
the largest single data loss of the day, and it is [P-03], not a bug.
Full scorecard in [STATUS.md](STATUS.md); checks in
[reference/VERIFY.md](reference/VERIFY.md).

_2026-08-07 pre-market_ — **[P-31] Data volume + diversity boost.** Diversity
shipped (brain `18b34f9`): sector-balanced Nifty 500 rotation, universe ~46 →
~86, 297 distinct names over 20 sessions vs 46. Volume half is a one-command
runbook (`scripts/session_2026-08-07_data_boost.sh`) — Railway var writes were
blocked from the session. Evidence-led: the 08-06 `ENTRY_DEFERRED` tally showed
`HOURLY_PACE` binding at 44 vs `CONCURRENT_CAP`/`SYMBOL_DAY_CAP` at 1 each, so
only the caps that bind get raised. **Verify V-5 + V-6** — V-6 (cycle cadence)
is the risk this introduces and must be checked the first session.

_2026-08-07_ — **[P-29] Exit-Policy Frontier (`/autopsy`).** Replays all 180
fixed (T, S) exit policies over the 541 closed trades carrying `mfe_r`/`mae_r`.
**None clears breakeven under the optimistic bound** (best −0.219R vs realized
−0.401R); at **zero cost, 3 do** (best +0.009R), so the entries are ≈ a coin
flip and **cost drag −0.239R is essentially the whole loss**. Needs no Kite
data, so it lands a real verdict while [P-01] stays blocked. Breakeven
round-trip cost measured at **≈0.0047%**, ~1/25th of the 0.12% actually paid —
so this is *not* a "cut costs" finding; the edge has to come from the entries.
Numbers cross-checked against SQL; page rendered and inspected at desktop +
mobile, all controls probed, zero console errors. **Full writeup + phase-2
plan: [reference/EXIT_FRONTIER.md](reference/EXIT_FRONTIER.md).**

_2026-08-07 (pre-market)_ — **[P-27] + [P-28] shipped** (brain `8c875df`, suite
870 green). **Verify on the next session, before re-judging [P-05]:**
1. every `STOP_LOSS_HIT` trade carries `execution.exit.model_stop = true` and
   `slippage_bps == charges_bps` (the whole residual adverse move is charges);
2. `STOP_LOSS_HIT` / `TARGET_HIT` now contain SHORT rows — re-measure the
   pooled stop bucket against the −1.25R cap; the 08-06 "−1.252R on target"
   read only LONGs and is not the answer;
3. `trades` == `total_trades_executed` == `ORDER_PLACED` count (+1 gap gone).
_Root causes: `model_stop` went into the broker and never came back out, so
`_fill_leg` had nothing to persist; `_cover_short` hardcoded
`exit_reason='COVER_SHORT'`, collapsing **all** short exits (stop, target,
time-stop, EOD, session-end) into one bucket; a never-filled row was
force-closed as `SQUARE_OFF_FAILED` with a fabricated exit price instead of
`ORDER_FAILED`. Caveat: exit_reason semantics changed, so short-side buckets
are **not comparable across the 08-07 boundary**._

_2026-08-06_ — **[P-21] Edge study: decision-feature mining → decisive NO-edge.**
Mined 1,597 walk-forward-labeled decisions (`decision_outcomes` ⋈ `brain_decisions`).
In-sample (07-22/23) a clean rule appeared — SHORT + before 13:00 IST + STRONG
trend = +0.44R/57% (n=655). **Out-of-sample it collapsed** (backfilled 07-24→08-05
labels): every bucket converges to ~+0.2R/54%, no exploitable spread; per-day the
rule even goes negative (07-29). The apparent edge was regime luck from two
down-days. Firm negatives: `confidence_score` doesn't predict; the `trend_tells`
gate is anti-predictive + sign-unstable (keep dark/off). **No feature-based entry
edge — do not ship one live; the edge verdict still rests on gate #6.** Full
writeup: [reference/EDGE_STUDY_P21.md](reference/EDGE_STUDY_P21.md). Side-fix:
decision labeling was starving (manual, unrun since 07-23) → now auto-runs every
session (brain `c5fd525`) + backfilled, so the study re-runs for free as data grows.


_2026-08-04 post-session — VERIFY pass, single full-day session:_
Session `1042e121` 04:00–09:51 UTC, `COMPLETED`/`MARKET_CLOSED`, brain
`c689ed44cbf1` (git_sha stamped). 90 trades, −₹10,827, PF 0.16, −0.64R avg —
no gate flip, still deep reject zone. **[P-20] verified** (see below). Gate
metrics re-based on 521 closed trades: PF 0.405→0.310, expectancy
−0.394R→−0.442R, max drawdown ≈−₹13,668→≈−₹23,200 (expected — soft-stop +
one weak session). Open-window vs after converged to both-negative
(reinforces [P-07] SKIP). Full detail in [STATUS.md](STATUS.md).
- **[P-05] stop-fill cap — RE-OPENED then RE-FIXED** (brain `b09904fe55fb`). The
  first live re-measure showed the bucket got *worse* (−1.40R avg / −1.60R worst,
  short stops −1.44R under `COVER_SHORT`). Root cause via `execution.exit`: the cap
  clamped the *reference/hint* to −1.25R but `PaperBroker._fill` re-applied
  `PAPER_SLIPPAGE_PCT`+charges on top. Fix: `model_stop` flag from both exit paths
  skips the double slippage on stop exits (charges kept). +3 test assertions,
  suite 856 green. _VERIFY next session: STOP_LOSS_HIT ≈ −1.25R − charges._
- **Mobile (dashboard):** Chrome-Android scroll/alignment fix — `100vh`/`100vw`
  → `dvh`/`100%` (URL-bar dynamic-viewport jank; iOS Safari was unaffected).
  `next build` clean, auto-deployed via Vercel.

_2026-08-04_ (brain `9bd59ad`, deployed):
- **[P-20] Advisor refresh + timeline capture now run inside the trading loop.**
  `_maybe_run_advisor` + `_maybe_capture_timeline` were outer-idle-loop only, so
  full-day sessions (post −3R-soft) starved the advisor for the whole session
  (08-03 last refresh 11:50). Now called once per cycle in the inner loop too —
  daemon-threaded + interval-gated, so no trade-loop impact. +1 test, suite 853.
  Resolves KNOWN_ISSUES K7. **VERIFIED live 08-04**: session `1042e121`
  (04:00–09:51 UTC) got 42 advisor runs spanning 04:23→09:45 UTC, no midday
  stall (was starving past ~11:50 pre-fix on 08-03).

_2026-08-03 / 08-04 — VERIFY pass, first live verification since 07-29:_
Two sessions ran 08-03 (morning `3fe00787` DAILY_STOP_3R, afternoon `1ef3f27f`
MARKET_CLOSED under the new soft-stop config). Data-quality PASS (77 trades /
1549 decisions / 320 advice rows, zero nulls). Every fix confirmed live:
- **[P-15]** — `stock_observations`: PRE_OPEN 20 / POST_CLOSE 20 / INTRADAY 40
  (was 100% INTRADAY).
- **[P-07]** — 24 `OUTSIDE_OPEN_WOULD_BLOCK` rows logged. ⚠️ **verdict: keep
  DARK, do NOT enable** — counterfactual 08-03 had the open window as the *worst*
  bucket (−0.51R vs −0.23R after 10:15), pooled open now −0.23R (negative,
  degraded from T4's +0.11R), sign not consistent. The "open is the only +EV
  window" thesis is dented; re-measure over more full-day sessions.
- **[P-05]** — `STOP_LOSS_HIT` −1.34R (11 trades), moved from −1.62R toward the
  ≈−1.25R target; small sample, keep watching. **[P-09]** — 9 well-formed
  `rotation_entry_quality` rows. **db_stocks split** — full session, no errors.
- **Soft daily-stop** confirmed as designed — `LIMIT_WOULD_STOP` fires logged,
  afternoon ran to `MARKET_CLOSED` not `DAILY_STOP_3R`. git_sha `9e370ac719df`.
- Gate metrics re-based on 447 closed trades: PF 0.376→0.405, expectancy
  −0.408R→−0.394R, max drawdown ≈−₹6,697→≈−₹13,668 (expected — soft-stop lets
  sessions bleed further by design). No gate flip.
- **[P-17]**/**[P-19]** — no stall; railway logs scanned clean (no 400 spam).
  **[P-18]** unchanged (22 graded / ECE 48.5%, watch-only). New findings →
  [P-20] (advisor-starve) + KNOWN_ISSUES K7/K8.

_2026-08-03_ (brain — code + suite green at 852; deployed `9e370ac`, VERIFIED live above):
- **[P-09] FA4 rotation entry-quality (DARK).** A rotation into a stronger score
  still needs to be a quality ENTRY. `rotation_entry_quality()` computes, per
  chosen target: weekly-downtrend (countertrend entry → `would_block`) + single-
  name weight vs `ROTATION_MAX_SINGLE_NAME_PCT` (over-concentration →
  `would_resize`). Plumbed `weekly` through score_universe → find_rotation_candidate
  → target. Flags stash on `indicators.rotation_entry_quality` (jsonb, migration-
  free, gradeable) + logged; only refuse/resize when `ROTATION_QUALITY_ENABLED`
  (default off — measure first, VISION §7). Correlated-cluster lever deferred
  (no cluster membership for non-held names). +5 tests.

_2026-08-03_ (dashboard, auto-deploys from main on Vercel):
- **[P-12] Per-stock timeline UI.** The agent's `stock_observations` (price /
  trend_score / verdict per capture) were collected since P1/P2 shipped but
  never surfaced. New `/advisor/timeline` page + `/api/advisor/timeline` route:
  per-holding card with an inline-SVG price sparkline + a verdict-dot path
  (oldest→newest, same verdict palette as /advisor), sorted freshest-observed
  first. Sidebar nav link added. No new deps; tsc + lint + `next build` clean;
  data-shape verified against prod (every symbol has price+verdict+score points).

_2026-08-02_ (code written + suite green locally at 847; **pending commit + deploy + live verify**):
- **[P-05] Stop-execution fill cap.** Root cause of the −1.62R STOP_LOSS_HIT
  bucket = poll latency: the ~30s exit checker fills at whatever price the poll
  caught, already drifted past the stop. Fix models a resting broker-side
  stop-market order: `config.PAPER_STOP_SLIPPAGE_CAP_R` (default 0.25) caps the
  stop-exit fill a bounded band past the stop → worst STOP_LOSS_HIT ≈ −1.25R,
  genuine slippage inside the band kept, no fill ever better than the stop, MAE
  stays honest (real low recorded before the capped fill). Only STOP_LOSS_HIT
  is capped (target/time-stop/cover untouched). +8 tests (`test_stop_fill_cap.py`),
  2 exit-latency tests updated to pin cap=0. _VERIFY next session: re-measure
  the STOP_LOSS_HIT R bucket — should move from −1.62R toward ≈−1.25R._
- **[P-07] Trade-only-open dark flag.** `_open_window_gate` mirrors the
  cooldown dark-flag pattern: every entry after the open window (default 10:15
  IST, `OPEN_WINDOW_END_*`) logs an `OUTSIDE_OPEN_WOULD_BLOCK` counterfactual
  (deduped per symbol); only blocks when `TRADE_ONLY_OPEN_ENABLED`. Wired into
  both BUY + SHORT entry paths. +5 tests. _VERIFY: next session's activity feed
  shows WOULD_BLOCK rows; counterfactual-audit can then rank it._
- **[P-16] Regime read — RESOLVED as a no-op (premise false).** Ran the
  breakdown: `trades.regime` comes from `regime_detector.py`, whose vocabulary
  is only TRENDING/WEAK_TREND/UNKNOWN — **SIDEWAYS/BEARISH can never tag a
  trade** (that's the separate market-level `market_regime.py`). So "TRENDING
  vs SIDEWAYS/BEARISH" is untestable: the strategy enters on ADX>threshold =
  TRENDING by construction (268/289 trades TRENDING, 21 WEAK_TREND, 0 other).
  TRENDING PF 0.42 / −0.384R vs WEAK_TREND PF 0.17 / −0.712R (n=21, small).
  The 07-28 (PF 0.65) vs 07-29 (PF 0.18) gap that seeded this is **both
  TRENDING** — within-regime variance (per-session PF spans 0.04→1.03), not a
  regime effect. DAILY_STOP_3R firing on consecutive TRENDING sessions is the
  base case, not a signal. No live action; a real regime-conditional test needs
  the market-level labels + multi-regime history = gate #6 ([P-01]).

_2026-08-02_ (brain `642ed94`, deployed):
- **[P-19] Killed the `/quote/ltp` 400-InputException spam.** The paper broker
  called `/quote/ltp` on every fill, but that endpoint 400s on a retail enctoken
  (same reason as `TRADING_MODE_FORCE=HOLDINGS_ONLY`) — so it always failed and
  the fill fell back to `hint_price` anyway, leaving a guaranteed-failing HTTP
  call + a `[PAPER] LTP fetch failed … 400` log line per fill flooding session
  logs. Fix: `config.PAPER_QUOTE_LTP_ENABLED` (default off) skips the doomed
  call; zero behaviour change (hint_price was already the effective path). +2
  tests, suite 834 green. _source: live log investigation 07-28._

_2026-07-30_ (brain `e81f706`, deployed):
- **[P-15] pre/post timeline capture fixed** — root cause: `_capture_stock_timeline`
  deduped on a rolling 1h window, so the 15:35 POST_CLOSE snapshot was deduped
  against the ~15:2X intraday refresh and never inserted. Fix = phase-aware dedup
  (INTRADAY hourly; PRE_OPEN/POST_CLOSE once-per-phase-per-day). _VERIFY next
  session: `stock_observations` shows POST_CLOSE rows (+ PRE_OPEN when the token
  is live before 09:14)._
  _08-02: still can't verify — `stock_observations` is still 100% `INTRADAY`
  (80 rows, unchanged from 07-29) because zero sessions have run since the fix
  deployed (see [P-03] above). Not a regression, just untested — carries over
  to next actual session._
- **[P-17] advisor stall hardened** — staleness self-heal (reset `_advisor_running`
  after >10min) + gate-decision logging (running / skip:no-token). _VERIFY: a
  future stall shows `[SCHEDULER] advisor gate → …` in logs + self-recovers._
  Note: PRE_OPEN still needs the token live before 09:14 — the real cure is the
  daily-token dependency ([P-03] TOTP), which both 07-28/07-29 incidents argue for.
  _08-02: no stall to observe either way — the advisor hasn't run at all since
  07-29 (no session, no token). Verify carries over to the next real run._

_2026-07-27:_ Sprint 0 (token scrub, RLS hole closed, EDGE-UNVERIFIED banner,
−3R hard stop) · Sprint 2 (CI both repos, `deploy.sh`, module split part 1) ·
T4 trade-quality first read · docs reorg (both repos).
_2026-07-26:_ advisor portfolio-risk v2 (correlation) · Telegram digest line ·
Pillar-1 calibration infra · per-stock agent P1 + P2 · 4 UI enhancements.

---

## Cadence (the scheduled loop)

```
         ┌── ships a fix ──▶ registers a check in reference/VERIFY.md
         │                                    │
  PIPELINE item                        (next session)
         ▲                                    │
         │                                    ▼
   TRIAGE: gets a P-nn        /post-session-check §0 runs the ledger
         ▲                          │                    │
         │                       PASS │                  │ FAIL
   KNOWN_ISSUES finding            │                     │
   (K / W / A / B id)              ▼                     ▼
         ▲                    item → Done          item → Ready
         │                                       (with the number)
         └──────── audit skills append findings ◀──────────┘
```

- **Per session (weekdays post-close):** an agent runs the audit skills —
  **VERIFY ledger first**, then the data-quality scorecard, then
  `/counterfactual-audit`. It appends findings to KNOWN_ISSUES, promotes the
  ones worth work to items here, drains PASSed items to Done, returns FAILed
  ones to Ready, and updates STATUS.
- **Weekly (weekend):** an agent runs a deeper review — re-measures PF /
  expectancy / drawdown + advisor calibration ECE, sweeps VERIFY for checks
  that have sat OPEN for more than a week (a check nothing ever satisfies is
  itself a finding), refreshes the burn-down, and flags regressions.
- **Never run the session audit before market close** (~10:00 UTC / 15:30 IST)
  — auditing a live session misreports.
**Live routines** (managed via `/schedule`; edit at claude.ai/code/routines):
- **Post-session review** — `trig_01SfvoCZ5tb7kecKwU6koDrY`, weekdays 16:30 IST
  (`0 11 * * 1-5` UTC). Reads the day's metrics, drains shipped items to Done,
  adds findings, updates STATUS + this board.
- **Weekly review** — `trig_01KWSXfHW5Q2r4sYbzNiqUtR`, Sundays 10:00 IST
  (`30 4 * * 0` UTC). Re-measures gate metrics, VERIFIES Done items moved their
  measure, refreshes the burn-down.

Both are docs-only (never edit code) and evidence-based (no invented findings).
They commit `chore(review): …` to main.

> ✅ **CONFIRMED LIVE 2026-08-07.** The post-session routine fired on schedule
> and committed `08a117e chore(review): post-session 2026-08-07` at 11:19 UTC
> (16:49 IST) — authored by Claude, syncing PIPELINE to what STATUS/VERIFY had
> recorded. So the cadence is genuinely automated, not manual, and the earlier
> doubt here was wrong.
> Two things it does **not** do, which is why the manual pass still matters:
> it works from what the docs already say rather than re-querying prod, and it
> explicitly leaves the full `/post-session-check` + `/counterfactual-audit`
> sweep queued. Treat it as a bookkeeping pass that keeps the board consistent
> between real audits, and expect to rebase — it commits to main while you work.
