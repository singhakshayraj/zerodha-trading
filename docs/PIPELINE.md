# PIPELINE — the execution board

**Where feedback becomes tracked work.** The live kanban: every finding (from a
review, an audit, or you) lands here as an item with a **measure-of-done**;
daily work pulls the top **Ready** item. Strategy/why-order lives in
[ROADMAP.md](ROADMAP.md); current reality in [STATUS.md](STATUS.md).

_Last updated: **2026-08-30** (Sun, weekly review) · Burn-down: **24 shipped +
verified live / 0 in-progress / 4 ready / 5 blocked**._ (No PIPELINE item
moved this pass — nothing shipped since 08-28's chore commit, and no session
ran over the weekend, so nothing to move.)

**This pass (weekly review):** re-measured the gate metrics fresh against
prod (not carried from STATUS) and re-ran every re-checkable VERIFY row over
the week's growth. No new trading session since `f4419be8` (08-28, Fri) —
08-29/08-30 are the weekend, confirmed via `trading_sessions` (no row
`started_at >= 2026-08-28` besides Friday's).

**Gate re-measure vs the last weekly baseline (08-23 → 08-30, 5 sessions'
growth: 08-24 through 08-28):**

| Metric | 08-23 | 08-30 | Δ |
|---|---|---|---|
| Profit factor | 0.343 | **0.3685** | +0.026, still deep reject |
| Expectancy | −0.429R | **−0.4213R** | +0.008R, still negative |
| Max drawdown | ≈−₹41,817 | **≈−₹59,206.27** | −₹17,389 deeper, by design (soft stop) |
| Advisor ECE | 30.3%, n=37 | **22.1%, n=98** | pool +61 (MACRO wave matured), ECE fell further — not new evidence, see below |

**No gate flipped.** PF stays far below the 1.1 reject line and nowhere near
1.3 go (VISION §6.1). This is paper-book performance on entries already
taken, not the edge verdict — gate #6 ([P-01]) remains the real hinge and is
still blocked on the ₹500/mo Kite decision.

**VERIFY re-checks with more data this week:**
- **V-13 (TARGET_HIT fill cap) — still PASSING, larger sample.** `n=17`
  (was 14 at the 08-27 pass), **17/17 inside the cap band**, `avg_r` **1.266**
  unchanged. The fix keeps holding as fills accumulate.
- **[P-05] stop-execution cap — still holding, larger sample.** Pooled
  `STOP_LOSS_HIT` since 08-07 is now **LONG −1.248R (n=42) / SHORT −1.214R
  (n=72) / pooled ≈−1.227R (n=114)** — was −1.226R (n=43) at the 08-23 review.
  Essentially unchanged as n nearly tripled; the fix is not decaying.
- **V-14 (exact win-rate past 1000) — still unverifiable in this
  environment.** SQL side: `total=1018, wins=239, win_rate=0.2348`. PASS needs
  comparing this to the session's `[kelly] Historical win rate: W/T` log line,
  which needs Railway log access this environment does not have — carries to
  the next pass that has it, as it has every pass since 08-28.
- **I-4 (in-play lock) — PASS through 08-28,** all three sessions this week
  that could lock did (08-26/27/28, 10/10 each). **Monday 2026-08-31 is still
  the decisive post-weekend stress test** ([C7] specifically broke after a
  weekend) — not yet reached from this Sunday pass.
- **I-1 (no duplicate paper exits) — PASS, 0 rows.** **I-3 (every closed
  trade carries `r_multiple`) — PASS, 0 missing every day 08-24→08-28.**
  **I-2 (exit-reason side symmetry) — PASS** on the two reasons the check
  actually watches (`STOP_LOSS_HIT` 25L/46S, `TARGET_HIT` 20L/22S, both
  two-sided); `EOD_CLOSE`/`SESSION_END` stay one-sided each, which is [C10]'s
  already-documented teardown-race artifact, not a new asymmetry.
- **I-7 (session labelling) — ⚠️ gap on the newest session.** 08-24 through
  08-27 are fully labelled (0 missing each day). **08-28's 409 directional
  decisions are 0% labelled**, two days after close — `label_decisions.py
  2026-08-28` hasn't been run yet. Not a code regression (labelling is a
  manual/scheduled step, not automatic same-day per I-7's own design), but
  it's now sat two days including a weekend — run it before the edge study
  (V-12) is next re-read, or that day's decisions stay invisible to it.

**Advisor ECE fell further (30.3%→22.1%) as the graded pool nearly tripled
(37→98) — read this as continued confirmation of [P-18]'s closed verdict, not
new movement.** [P-18] was answered 2026-08-25 on the discrimination measure
(AUC ≈0.49, corr 0.02 — confidence carries no information) specifically
*because* ECE improving is compression toward the base rate, not a
calibration gain (see [P18_CALIBRATION.md](reference/P18_CALIBRATION.md)).
No AUC re-check ran this pass (needs `scripts/advisor_discrimination.py`,
not available in this docs-only environment); nothing here contradicts the
closed verdict.

**git log check:** nothing shipped since the last pass's chore commit
(`2a6b7b8`) — `git log` on `main` is unchanged, confirmed via `git pull`
(fast-forward, no new commits beyond `2a6b7b8`). No board move needed.

**No new PIPELINE item from this pass.** [C9] (no portfolio-level exposure
cap, found 08-27) and [C10] (EOD exit side-confound, found 08-27) are both
already recorded in KNOWN_ISSUES and both explicitly "not fixed by design"
pending the decommission decision — nothing this week's data changes about
either. Dashboard API (`zerodha-trading-liard.vercel.app`) still unreachable
from this environment (proxy `403 CONNECT tunnel failed`) — same as every
recent pass; all numbers above measured directly against Supabase.

**Prior pass (08-28 post-session), for reference:** session `f4419be8`, 34
trades, PF 0.184 — weak but inside range. V-14's trigger crossed (1,018 >
1000) but stayed unverified for the same Railway-log-access reason as this
pass. Full detail: `git log docs/PIPELINE.md`.

> **Where the history went.** This preamble used to stack every prior update,
> and the weekly gate re-measures sat above the board — together pushing the
> actual kanban ~130 lines down. Gate numbers now live in
> [reference/GATE_MEASURES.md](reference/GATE_MEASURES.md); prior preambles are
> in `git log docs/PIPELINE.md`, which is a better changelog than a doc that
> only ever grows. **Keep this section to the current pass.**

---

## 📊 Gate re-measure — latest 2026-08-30 (weekly)

**PF 0.3685 · expectancy −0.4213R · max drawdown ≈−₹59,206.27 · advisor ECE
22.1% (n=98).** Re-measured fresh against prod this pass, over all 1,018
closed trades (936 carrying `r_multiple`). No gate flipped; PF has never left
the reject zone, nowhere near the 1.1 reject or 1.3 go lines (VISION §6.1).
Full history, method and the 3-lens read:
**[reference/GATE_MEASURES.md](reference/GATE_MEASURES.md)** (next due Sunday
09-06).

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

- **[P-38] Supabase is on the FREE tier (500 MB) and will not hold a year.**
  [you] · *done =* tier decision made. · *source:* [P-37] capacity + the 08-23
  weekly review's own measurement (**97 MB / 500 MB, 19%**).
  _Projected growth is ~3.3 GB/yr; the storage plan's lossless savings are
  ~600 MB/yr. That gap is not closable by optimisation — **the fix is a tier
  change** (Pro = 8 GB ≈ 2.4 years). Tasks 1/2/4 shipped 08-23 anyway because
  they are cheap and lossless; Task 3 (`market_context`) is deliberately parked,
  since it is the only one that can lose data and it is not worth that risk to
  buy weeks. The clock is paused only because no session has run since 08-10 —
  it restarts the day trading does._

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
  _⚠️ **2026-08-23: the FUNCTIONAL half is already live** — token set and valid
  (`getMe` → @singhakshayraj_bot), chat reachable, digest + intraday alerts
  enabled, and the 09:16 preflight would fire on the current stale token. What
  remains is only the **security rotation** of a token that appeared in Railway
  logs pre-scrub. Every note elsewhere claiming the alarm was dormant for want
  of this token was wrong._
  _08-03 audit ([reference/CRED_ROTATION.md](reference/CRED_ROTATION.md)):
  repos + full git history are clean (no secret ever committed); RLS verified
  airtight (sensitive tables service_role-only, rest deny-all, no rls_disabled
  errors). So the anon key is safe-by-design → **skip rotating it** (rotation
  would force a JWT-secret regen that also breaks service_role, for ~zero gain).
  The ONE real action is the **Telegram token** (was in Railway logs pre-scrub):
  BotFather → revoke → `railway variables --set TELEGRAM_BOT_TOKEN=… --service
  zerodha-brain`. Runbook has exact steps. Reduced from a 2-cred task to 1._
  _**08-13 evidence, not a reprioritization:** the dependency this item guards
  against just cost **3 consecutive weekdays** (08-11/08-12/08-13) — zero rows
  in every session-scoped table, heartbeat ONLINE/`current_cycle=0`/"Waiting
  for START command" throughout. Previously worst-documented gap was 2 days
  (07-30/07-31); this is now the worst case on record. Still user-deprioritised,
  not re-raised here — logged so the next priority review has the number._
  _**08-14 evidence:** extends to **4 consecutive weekdays** (08-11→08-14),
  same signature (heartbeat ONLINE, `current_cycle=0`, "Waiting for START
  command", zero session/decision/advice rows). Still not re-raised — logging
  only._
  _**08-17 evidence:** extends to **5 consecutive weekdays** (08-11, 08-12,
  08-13, 08-14, 08-17 — weekend excluded), same signature. Still not
  re-raised — logging only._
  _**08-23 weekly-review evidence:** extends to **9 consecutive weekdays**
  (08-11 through 08-21, weekends excluded — 08-15/08-16 and 08-22/08-23
  skipped), same signature (`brain_heartbeat` ONLINE, `current_cycle=0`,
  "Waiting for START command", zero rows in `trading_sessions`/
  `brain_decisions`/`portfolio_advice` for the whole window). This is now the
  longest gap on record for this project, more than double the previous
  worst case (4 days). Still not re-raised per standing user
  deprioritization — logging only, so the next priority review has the
  number._
- **[P-38] Storage-scaling plan — execute or defer.** [you→me] · *done =* a
  decision on Supabase tier (upgrade to Pro vs. stay free), then the plan at
  `docs/superpowers/plans/2026-08-10-storage-scaling.md` either runs (6 tasks,
  31 checkbox steps) or is explicitly deferred with the tier upgraded instead.
  · *source:* [P-37]'s capacity pass. · *blocked on:* the plan's own Task 0
  gate. **Confirmed 2026-08-10 (post-session): org is on the free tier**, DB
  at 97 MB / 500 MB (19%), ≈6 weeks of runway at the measured growth rate —
  the plan's own escalation clause fires ("stop and escalate... the correct
  fix is a tier change, not 600 MB of savings"). The trim plan alone does not
  remove the need for that decision — it only stretches runway.
  _**08-23 weekly review:** DB size re-measured at **97 MB / 500 MB (19%),
  unchanged byte-for-byte since 08-10** — with zero trading sessions writing
  data across the 9-weekday gap above, the runway clock has paused rather
  than continued counting down. Not a reason to deprioritize the decision
  (it resumes ticking the moment sessions restart), just a note that no
  extra urgency has accrued this week._

## 🟢 READY — pull these now (no blocker, [me])

- **[P-40] Storage Option B — de-duplicate per-cycle data out of `brain_decisions.indicators`.** [me] · *done =* `market_context` and `event_policy` no longer stored per decision; measured bytes/row drop recorded in VERIFY.
  `market_context` (232 B) and `event_policy` (92 B) are **byte-identical for every decision in a cycle** — ~85 rows per cycle, ~2,900 times a session. Compression cannot touch this: pglz compresses each row independently, so cross-row duplication is invisible to it. Only a foreign key removes it, and a `market_context` table already exists (235 rows) to point at.
  Estimated ~25–30% off the largest table — **larger than the compression attempt was ever going to deliver**, and it does not depend on any codec behaving.
  Deferred by the user 2026-08-27 ("we'll come back to it later"); raised only when they ask.
  ⚠️ Sequencing: this needs the `event_policy` sparse-drop bug looked at too — the logic is supposed to omit `NORMAL`, yet it is present on every sampled row with min = max.

- ~~**[P-41] Settle whether this data compresses at all.**~~ ✅ **DONE 2026-08-27 — answer is NO.**
  Measured in-database with a scratch table and an uncompressed control column, same 500 real blobs: **pglz compressed 0 of 500 rows, lz4 compressed 0 of 500** (1,427 B → 1,431 B, a 4-byte header difference). Harness validated in the same table — a repetitive blob compressed 2,015 → 51 B, ~97%.
  The old 42% estimate measured the JSON **text** form; Postgres stores **jsonb binary**, which has already stripped the quotes/colons/commas that made text look compressible. **Compression is closed as a storage lever.** Remaining levers: [P-40] de-duplication, and storing less.



- ~~**[P-36] Aggregate at the data, not in Node.**~~ ✅ **SHIPPED 2026-08-10.**
  Architect pass over the API layer. The codebase already had the right pattern
  (`/api/analytics/insights` calls Postgres RPCs) and applied it inconsistently;
  the heavy routes pulled whole tables over the wire because PostgREST cannot
  aggregate. `/api/autopsy` was making **24 sequential round trips** for all
  23,835 candles, then discarding ~73% client-side.
  Three new functions (`autopsy_dataset`, `learn_stats`, `insights_totals`),
  each returning one `jsonb` row so the 1000-row page cap stops mattering.
  **Combined latency 5.04s → 0.94s (−81%)**; autopsy −85%, insights −73%,
  learn −86%. Output verified identical field-by-field on all three, and
  `totalDeployed` is now *more* accurate (Postgres `numeric` vs accumulated JS
  float drift). Rule written up in
  [reference/ENGINEERING_SPEC.md](reference/ENGINEERING_SPEC.md) so new routes
  inherit it. No new security lints (`security invoker` + pinned `search_path`).

- ~~**[P-35] Re-test the entry edge on the grown sample.**~~ ✅ SHIPPED 2026-08-10
  · 🔴 **RESULT REVERSED 2026-08-23 — no entry edge.** Labelling 08-10 (329
  decisions) took pooled out-of-sample from **+0.097R (t=+3.0) → −0.003R
  (t=−0.1)**; the rule scored **−0.532R** on 08-10, its worst day. V-12 FAILED
  exactly as registered. Nothing was enabled, so nothing needs reverting. The
  rule still beat plain SHORT 9/10 days, so it was never merely directional —
  it picks better-than-average entries, just not better than the 0.309R cost of
  taking them. Original entry:
  ✅ **SHIPPED 2026-08-10** (brain `scripts/edge_study.py`). **Reverses [P-21].** The sample
  had grown 1,597 → 5,481 labeled decisions across 10 days (SHORT labels on ten
  days, not two), retiring the exact limitation [P-21] named — and nobody had
  re-run it. Walk-forward out-of-sample: **+0.097R net, n=1,383, t=+3.0**; the
  frozen rule beats plain SHORT on **9/9 days**. Both boring explanations ruled
  out and now checked automatically by the script: cost is flat across rules (the
  edge is in gross, +0.374R vs +0.105R), and it is not merely shorting a falling
  market. Verify **V-12**; writeup
  [reference/EDGE_STUDY_P35.md](reference/EDGE_STUDY_P35.md).
  _⚠️ **Not evidence of profitability.** Counterfactual labels rather than real
  fills, +0.097R against an average 0.310R cost, one 10-day market period, and
  4/7 OOS days positive. Nothing is enabled — the follow-up is to re-run it after
  each session and see whether it survives, which is how [P-21]'s version died.
  Also backfilled 08-07's 366 missing labels as part of this._

- ~~**[P-24] Advisor paper book double-counts realized P&L.**~~ ✅ **DONE
  2026-08-10 — code (brain `f645ff3`) + DB repair both complete.** The repair
  ran against prod pre-market once the Supabase connector came up: 18 rows /
  −₹77,325.36 → **11 / −₹45,796.41**, duplicate sum −₹31,528.95 removed, every
  target hit exactly. **V-4 PASSED, I-1 back to 0 rows.** Rollback snapshot:
  `scripts/p24_rollback_2026-08-10.sql` (brain repo).
  _The code half had already been verified live on 08-07 (20 advisor runs / 120
  rotations, zero new dupes). The "targets go stale, re-derive them" warning
  turned out not to bite this time — the book had not grown since 08-07 — but
  deriving at run time is still the right habit, since it moved once already
  (9/−39,983.84 → 11/−45,796.41)._
  _Note the audit's TRIM claim was wrong — ITC 40+40 and SILVERBEES are honest
  half-trims, not full exits; KNOWN_ISSUES §A1 corrected, and those rows were
  confirmed untouched after the repair._
- **[P-32] Grade a verdict the day its `stop_level` breaks, not 30 days later.**
  [me] · *done =* every open `portfolio_advice` row carrying a `stop_level` is
  checked each session against the daily close; a break writes an
  `invalidated_at` + the close that broke it, and those rows become gradeable
  immediately. Measure: **the graded pool grows by more than the ~3 MICRO
  rows/session it grows by today**, and ECE is recomputable without waiting for
  the 30-day MACRO wave. · *source:* `thesis-tracker` via
  [reference/FINSERV_PLUGINS.md](reference/FINSERV_PLUGINS.md) §A.
  _The advisor already emits `stop_level` — "hold while ₹520 holds" — and then
  never looks at it again. Checking it is a fast, unambiguous falsification
  that needs no new data. Directly attacks [P-18]'s small-n stall._
  _⚠️ Design question to settle first: a break is evidence the HOLD was wrong,
  but only if the level was meant as a thesis invalidation rather than a
  suggested stop for the user. Read `advise()` before building — SELL sets
  `stop = None`, so coverage is partial by construction._
- ~~**[P-33] Every verdict carries a bear case.**~~ ✅ **SHIPPED 2026-08-10**
  (brain `bcdb667`, dashboard). `build_counter_case()` states the opposite side
  in the verdict's own numbers — HOLD names the level whose daily close ends it;
  TRIM gets **two** different cases because it has two causes (overextended =
  you capped the upside, mixed = you booked a loss on noise); SELL argues the
  reversal; SELL_ON_BOUNCE names both ways it fails. Surfaced on `/advisor` as
  its own labelled block, **not** another bullet in the confirmatory list.
  Verify **V-11**. Suite 925.
  _Migration applied before the code, deliberately: `advise()`'s dict spreads
  straight into the insert, so shipping code first would have broken the
  advisor. An unrecognised verdict returns a loud "treat as unfalsifiable"
  rather than '' — the failure mode to avoid is looking compliant._
  _Half the measure is deferred by arithmetic, not by omission: grouping graded
  outcomes by whether the counter-case happened needs ~30 trading days of
  matured MACRO advice that carries one._
- **[P-34] No-trade band on the rotation advisor.** [me] · *done =* rotation
  suppresses any switch whose modelled edge is below a configurable band, with
  the band expressed in the same round-trip cost units the frontier uses;
  measured against the counterfactual of trading anyway. · *source:*
  `portfolio-rebalance`, FINSERV_PLUGINS §C.
  _[P-29]/[P-30] measured cost drag at −0.239R of a −0.401R loss and showed no
  exit policy clears breakeven even at zero cost. A no-trade band is the
  standard answer to that arithmetic. **Rotation advisor only — not the
  intraday engine**, whose pacing is deliberately loose for data collection._
  _⚠️ Ordering: this is a live-behaviour change to advice the user may act on.
  It should follow [P-24]/[P-26], which are already rewriting the same book._
- **[P-26] Decide the paper MANAGEMENT seed basis.** [me→you] · *done =* seed
  price rule chosen + implemented. · *source:* 08-06 audit §A2.
  _Seeding at the holdings' **cost basis** books pre-advisor history (RVNL −46.3%,
  NBCC +73.0%) as advisor realized results. Alpha is unaffected (baseline carries
  it too) but the win/loss scorecard reads as advisor skill when it isn't.
  **Recommend seeding at seed-day price** so the advisor only owns what happened
  after it spoke. Bundle with [P-24]._


- **[P-06] Module split part 2 — PARTIALLY DONE (advisor family + database.py all <600).** [me] · *done
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
- ~~**[P-18] Advisor calibration is poor and non-monotonic.**~~ ✅ **ANSWERED
  2026-08-25 — confidence carries no information; never promote it.** The ≥50
  gate opened on 08-24 (37→79 graded). On n=98: **corr 0.0205 (t=0.20), AUC
  0.4556**, avg confidence 70.3 when right vs 69.8 when wrong. The 90–100 bin
  hits 28.6% against a 48% base rate.
  _⚠️ **This item's own success criterion was wrong.** It asked for ECE +
  monotonicity, which measure CALIBRATION, not DISCRIMINATION — and a signal
  that always predicts the base rate is perfectly calibrated and useless. ECE
  falling 30.3%→22.6% looked like progress and was just compression toward the
  base rate. Replacement criterion for any re-open: **AUC materially above 0.5 under BOTH labels** (absolute and market-neutral; `scripts/advisor_discrimination.py`),
  not a better ECE._ Writeup:
  [reference/P18_CALIBRATION.md](reference/P18_CALIBRATION.md).
  _Original item + history below, kept for the record._ First
  recorded baseline: ECE 48.5%, `monotonic=false`, `built_at=2026-07-29`.
  _08-05: graded_calls 21→28, hit rate 42.9%→39.3% — still small-n, DARK,
  watch only._
  _**08-06 — timeline corrected.** 31 graded. The ≥50 gate is NOT days away:
  ~85% of advice rows are `trigger_type=MACRO` and mature at a **30-trading-day**
  horizon, so only ~3 MICRO rows grade per session. First MACRO wave (07-12, 19
  rows) matures ~**08-24**; 07-22's ~**09-02**. Realistic ECE re-measure date:
  **late August**. Don't re-open this weekly expecting movement._
  _**08-09 weekly review:** ECE itself moved for the first time — **48.5%→35.6%**
  (`built_at=2026-08-07`, still `monotonic=false`), graded pool unchanged at 31
  (no new session this week). Directionally good but n is still ~40% of the
  action gate; recorded in [reference/VERIFY.md](reference/VERIFY.md) W-B so
  it's tracked as a trend line, not treated as a verdict on one reading._
  _**08-16 weekly review:** graded pool grew 31→37 and ECE fell further,
  35.6%→30.3% (`built_at=2026-08-10` — this had already landed live in
  `app_config` and in STATUS's 08-10 post-session entry the day it was
  measured; this pass just caught PIPELINE/GATE_MEASURES/VERIFY up to it).
  Still `monotonic=false`, now ~74% of the ≥50 action gate. No new session
  this week, so the pool itself hasn't grown past 08-10._
  _**08-24 post-session — the ≥50 gate is crossed.** `graded_calls` jumped
  37→79 (`built_at=2026-08-24`, base rate 45.6%) — the predicted MACRO wave
  matured. ECE **fell further, 30.3%→22.6%**, but **`monotonic=false`
  still holds** on the recheck this item's own measure-of-done called for.
  Verdict unchanged: do not promote confidence into a scored input. This
  item's original trigger has now fired; it stays open only because the
  answer at the trigger is "not yet," not because the trigger hasn't come._
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

- _(none)_ — [P-14] closed 2026-08-10, see DONE.

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
- ~~**[P-13] Activate Marketaux news key**~~ ✅ **DONE — verified 2026-08-23.**
  `MARKETAUX_API_KEY` is set on Railway and `NEWS_ENABLED=true`; `news_events`
  holds **137 rows, all with sentiment**, newest 2026-08-10 (i.e. the last day a
  session ran). It was already working and the board had not noticed.

## 💡 PROPOSED — high-value, awaiting user greenlight

- _(none)_

## ⏸️ PARKED — explicitly deferred, revisit when raised

- _(none)_

## ✅ DONE (recent — for burn-down + verify)

- ~~**[P-39] Push + deploy the [C7] in-play-lock fix, verify it locks live.**~~
  ✅ **DONE 2026-08-26** — brain `eb75ded` confirmed live: session `c40c5634`
  stamps a new `git_sha=2e884587d855` (was `893267c447e3`), and
  `inplay_list` locked all 10 candidates for the day with `or_rvol`
  populated on every row (first lock 05:02:50 UTC). **Verify I-4: PASS**
  (was NOT-YET). · *source:* [reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md)
  §C7, root-caused 2026-08-25.
  _Root cause: `market_data._get_historical` hardcoded a 3-calendar-day
  candle window regardless of the caller's `days` argument, so after any
  weekend (≤1 prior trading day) `opening_range_stats` couldn't get its
  required ≥2 days and every candidate came back `or_rvol=None` —
  `inplay.rank()` returned empty and the list never locked. Fix floors the
  per-interval window instead of fixing it, so callers asking for more get
  more. Proven live on INFY pre-push (`or_rvol` None → 0.5221), suite 943._
  _⚠️ **Today is not the scenario that actually broke.** 08-26 is mid-week
  (Wed, after Tue's own session ran) — the bug specifically hit sessions
  after a weekend gap. The literal measure-of-done (git_sha moved + a lock)
  is met, so this closes, but the real stress test is the next session after
  a weekend — **Monday 2026-08-31**. Watch I-4 that day; if it warns again,
  re-open._

- **2026-08-23 (23:58 IST) — infinite-reload regression fixed same night,
  undocumented until this pass.** `493ee92` (`components/TokenAlert.tsx`,
  `lib/api.ts`). The stale-token banner shipped earlier that evening
  (`62ee323`) used the shared `api` client; its 401-response interceptor
  clears the session and hard-redirects to `/connect` — but `/connect` by
  definition has no token yet, so the banner's own fetch 401'd, wiped
  whatever token the user was mid-paste on, and reloaded into the same loop.
  Fix: the banner now uses a plain `fetch` with the header set manually,
  skips `/connect` entirely, and stays silent with no token — a passive
  advisory component can no longer log the user out. Also documented the
  hazard on the interceptor itself for future callers. `/connect` verified
  200 post-fix. Given the manual-token-paste dependency is this project's
  single point of failure ([P-03]/[P-04]), a same-night catch mattered.
  Missed by the 08-24 automated review despite running after it — caught via
  `git log -25` this pass.

- **2026-08-23 (evening) — two dashboard features shipped, undocumented until
  this pass.** Found via `git log -25` during the 08-24 post-session review;
  not tracked as board items beforehand, so recorded here rather than "moved."
  - **Stale-token banner** (`components/TokenAlert.tsx`, commits `0f7bddf`,
    `62ee323`). Shows a red warning on every page when the `enc_token` is
    missing or predates the day's ~04:34 IST flush. Design-review item #1's
    partial fix — needs no credential, surfaces the [C1]/token_incident state
    that was previously written and read by nothing on the dashboard side.
  - **Nifty-500 stock lookup + on-demand refresh** (`components/StockLookup.tsx`,
    `app/api/advisor/lookup/route.ts`, `app/api/advisor/refresh/route.ts`,
    commits `e6b904d`, `b453e8b`, `0efe1f5`, `eca1a8e`, `bbf1c10`). Look up any
    Nifty-500 name (not just current holdings) with a typeahead dropdown and
    the full read (not just a score); searched-but-unscored names are now
    distinguished from names outside the scan universe entirely.

- ~~**[P-37] Capacity — fix the two cliffs that break within a year.**~~ ✅
  **SHIPPED 2026-08-10** (found shipped in git log, was never moved off the
  board). `EXPLAIN ANALYZE`-led, not guessed: `autopsy_dataset()`'s Nested Loop
  had the right plan already, but its loop count is the trade count, which
  grows linearly (577×0.29ms today → ~7.5s/year); bounded to a rolling window
  (default 400d) + a partial index (`idx_trades_closed_excursion`, Seq Scan
  20.6ms → Index Scan 0.85ms). `count(*)` on `brain_decisions` (417ms warm at
  21k rows, →~18s/year) split into an exact **claim** (PF/expectancy/P&L, from
  `trades` only) vs an O(1) **indicator** (`pg_class.reltuples` via
  `approx_rows()`, rendered with `~`). `brain_activity` retention deliberately
  deferred (write-only, 17 MB today, not yet worth the irreversible delete).
  `/api/autopsy` 0.406s → 0.284s on top of [P-36]. All exact figures verified
  unchanged after the change (692 trades, PF 0.358, −0.4155R, −₹33,267).
  Projections in [reference/CAPACITY.md](reference/CAPACITY.md). _Follow-up
  spawned [P-38] (the storage-trim plan, now in Blocked)._

- ~~**[P-14] Advisor accountability / paper-trade system.**~~ ✅ **DONE — verified live 2026-08-10.** [me] · re-raised +
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
    build` clean. *done =* page live; fills in as Phase 2 snapshots land — **met.**
  - ✅ **UX redesign (dashboard `99fe9a7`, 08-05):** reworked `/advisor` page
    for scannability + mobile, content unchanged. `next build` clean, auto-
    deployed.
  **Closed 2026-08-10 on data, not on a code change.** All four sub-items were
  already ✅ but the item sat in IN PROGRESS because Phase 3 was noted
  "still empty-state — blocked on [P-22]", and [P-22] had since been resolved
  without this note being updated. Prod now shows both books populated:
  **MANAGEMENT 31 positions (20 open / 11 closed) + 2 equity snapshots;
  PICKING 7 open + 2 snapshots**, newest 2026-08-07. The scorecard is no longer
  an empty state. _Caveat: 2 equity snapshots per book is one per session since
  seeding, so the alpha curve is still only two points — it needs sessions, not
  work._



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
runbook (`scripts/premarket_pacing.sh`) — Railway var writes were
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
