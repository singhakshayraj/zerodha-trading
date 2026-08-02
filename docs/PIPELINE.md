# PIPELINE — the execution board

**Where feedback becomes tracked work.** The live kanban: every finding (from a
review, an audit, or you) lands here as an item with a **measure-of-done**;
daily work pulls the top **Ready** item. Strategy/why-order lives in
[ROADMAP.md](ROADMAP.md); current reality in [STATUS.md](STATUS.md).

_Last updated: 2026-08-02 · Burn-down this week: 0 shipped / 5 ready / 4 blocked._

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
- **DO:** each working session, pull the top **Ready** item, ship it, move it to
  **Done**, add one line to STATUS.
- **VERIFY:** the next review checks whether shipped items moved their metric;
  ones that didn't come back to **Ready**.

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
- **[P-04] Rotate Telegram bot token + Supabase anon key.** [you] · *done =* new
  creds live; old ones dead. · *source:* Sprint 0 security fix (were exposed).

## 🟢 READY — pull these now (no blocker, [me])

- **[P-05] Fix stop execution — STOP_LOSS_HIT avg −1.59R.** [me] · *done =* stops
  cap near −1R (stop-limit vs market / size-down); re-measure the bucket. ·
  *source:* T4. _Fixable independent of edge — highest ready value._
  _07-28: still unfixed — bucket measured −1.87R (6 trades), worse than baseline._
  _08-02: still unfixed. All-time `STOP_LOSS_HIT` bucket (28 trades since
  inception) avg **−1.62R** — confirms priority; no new sessions this week to
  move the number either way._
- **[P-06] Module split part 2 (scoring/`advise` + `run_*` loops).** [me] · *done
  =* no file >600 lines, 828 green. · *source:* SE4.
- **[P-07] Dark-flag the "trade-only-open" filter.** [me] · *done =* logged +
  graded (not enforced) per session. · *source:* T4 (open is the only +EV bucket).
- **[P-16] Regime-conditional read — TRENDING sessions look worse.** [me] · *done
  =* a T4-style breakdown of PF/expectancy/win-rate by `trades.regime` across
  the 5 measured sessions, checking whether TRENDING is systematically worse
  than SIDEWAYS/BEARISH or this is small-sample noise. · *source:* post-session
  review 07-29 — `DAILY_STOP_3R` fired 2/2 recent sessions (07-28, 07-29,
  both tagged TRENDING); 07-29 win rate 12.5% (4/32) vs 30.8% on 07-28, PF 0.18
  (worst of the 5 measured sessions). _08-02: no new session data this week —
  still open, unchanged._
- **[P-18] Advisor calibration is poor and non-monotonic.** [me] · *done =*
  ECE recomputed once graded_calls ≥ 50 (currently 22, most bins low-n);
  re-check monotonicity then — don't promote confidence into a scored input
  before it holds. · *source:* weekly review 08-02 gate re-measure — first
  recorded baseline: ECE 48.5%, `monotonic=false`, `built_at=2026-07-29`
  (unchanged since, no new advisor runs this week). DARK signal, no live
  impact yet — watch only.

## 🔨 IN PROGRESS

- _(none — Sprint 0/2 just shipped)_

## 🗓️ BACKLOG — after gate #6 / decisions

- **[P-08] FA1 client-profile layer** (horizon/risk/tax → advice conditioned on
  the person). [both]
- **[P-09] FA4 position-sizing / entry-quality on rotation targets.** [me]
- **[P-10] FA3 regime-conditional factor weights (Pillar 3).** [me] · needs graded
  data across regimes.
- **[P-11] Promote daily/weekly alignment into the score** once it's gradeable
  (~early Aug) AND attribution shows it predicts. [me]
- **[P-12] Agent P4 — per-stock timeline UI** (sparkline + verdict path). [me]
- **[P-13] Activate Marketaux news key** → `news.sentiment` populates. [you→me]

## ⏸️ PARKED — explicitly deferred, revisit when raised

- **[P-14] Advisor active-testing "enhancer".** [both] · parked 2026-07-28 by user
  — "build a system to actively test the advisor page." Not scoped yet: does
  "test" mean (a) synthetic/adversarial holdings to probe `advise()` edge cases,
  (b) a live shadow-mode harness that re-runs the advisor against historical
  price paths to check verdicts hold up, (c) UI/E2E test coverage for
  `/advisor`, or (d) something else. **Do not build until re-raised** —
  surface it next time the advisor is discussed.

## ✅ DONE (recent — for burn-down + verify)

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

- **Per session (weekdays post-close):** an agent runs the audit skills, appends
  any findings here as new items, moves shipped items to Done, updates STATUS.
- **Weekly (weekend):** an agent runs a deeper review — re-measures PF /
  expectancy / drawdown + advisor calibration ECE, checks whether Done items
  moved their metric (VERIFY), refreshes the burn-down, and flags anything that
  regressed back to Ready.
**Live routines** (managed via `/schedule`; edit at claude.ai/code/routines):
- **Post-session review** — `trig_01SfvoCZ5tb7kecKwU6koDrY`, weekdays 16:30 IST
  (`0 11 * * 1-5` UTC). Reads the day's metrics, drains shipped items to Done,
  adds findings, updates STATUS + this board.
- **Weekly review** — `trig_01KWSXfHW5Q2r4sYbzNiqUtR`, Sundays 10:00 IST
  (`30 4 * * 0` UTC). Re-measures gate metrics, VERIFIES Done items moved their
  measure, refreshes the burn-down.

Both are docs-only (never edit code) and evidence-based (no invented findings).
They commit `chore(review): …` to main.
