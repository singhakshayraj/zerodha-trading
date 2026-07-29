# PIPELINE — the execution board

**Where feedback becomes tracked work.** The live kanban: every finding (from a
review, an audit, or you) lands here as an item with a **measure-of-done**;
daily work pulls the top **Ready** item. Strategy/why-order lives in
[ROADMAP.md](ROADMAP.md); current reality in [STATUS.md](STATUS.md).

_Last updated: 2026-07-29 · Burn-down this week: 6 shipped / 6 ready / 4 blocked._

---

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
- **[P-04] Rotate Telegram bot token + Supabase anon key.** [you] · *done =* new
  creds live; old ones dead. · *source:* Sprint 0 security fix (were exposed).

## 🟢 READY — pull these now (no blocker, [me])

- **[P-05] Fix stop execution — STOP_LOSS_HIT avg −1.59R.** [me] · *done =* stops
  cap near −1R (stop-limit vs market / size-down); re-measure the bucket. ·
  *source:* T4. _Fixable independent of edge — highest ready value._
  _07-28: still unfixed — bucket measured −1.87R (6 trades), worse than baseline._
- **[P-06] Module split part 2 (scoring/`advise` + `run_*` loops).** [me] · *done
  =* no file >600 lines, 828 green. · *source:* SE4.
- **[P-07] Dark-flag the "trade-only-open" filter.** [me] · *done =* logged +
  graded (not enforced) per session. · *source:* T4 (open is the only +EV bucket).
- **[P-15] `stock_observations` missing PRE_OPEN/POST_CLOSE rows.** [me] · *done
  =* a session-day shows `phase` values other than `INTRADAY` (at least one
  PRE_OPEN + one POST_CLOSE per symbol). · *source:* post-session review
  07-28 — queried all 20 rows in the table (all-time), 100% `INTRADAY`, despite
  P2 scheduler (commit `77ab595`) claiming pre-open/hourly/post-close capture.
  _07-29: still unfixed — now 80/80 rows (100% all-time) `INTRADAY`._
- **[P-16] Regime-conditional read — TRENDING sessions look worse.** [me] · *done
  =* a T4-style breakdown of PF/expectancy/win-rate by `trades.regime` across
  the 5 measured sessions, checking whether TRENDING is systematically worse
  than SIDEWAYS/BEARISH or this is small-sample noise. · *source:* post-session
  review 07-29 — `DAILY_STOP_3R` fired 2/2 recent sessions (07-28, 07-29,
  both tagged TRENDING); 07-29 win rate 12.5% (4/32) vs 30.8% on 07-28, PF 0.18
  (worst of the 5 measured sessions).
- **[P-17] Advisor gate fired ~5h late on 07-28.** [me] · *found:* the 09:45
  gate + a manual `advisor_run_now` force at 10:06 IST both sat unconsumed
  through 2+ scheduler cycles (confirmed live: cycles ~82s of work, ~8.5min
  apart, engine otherwise healthy — trades/decisions logging normally); the
  official run finally fired at **14:41:42 IST**. Same window showed
  recurring `400 InputException` on `/quote/ltp` for several symbols (WIPRO,
  TITAN, TCS, HINDUNILVR, HINDALCO) — kite_client fails fast on 400s (no
  retry/hang per code), so this alone doesn't explain a 5h stall, but is a
  plausible correlated symptom. **07-29 update: advisor ran clean, no repeat**
  — may have been a one-off, but still worth hardening. Leading hypothesis:
  `_advisor_running` (in-memory flag, `scheduler.py`) got stuck `True` from an
  early wedged attempt and only cleared on a restart/timeout — untested.
  *done =* add a log line at the top of `_maybe_run_advisor` (gate evaluated:
  forced/official/lite/skip + reason) so a stall is diagnosable from logs
  alone next time, and add a staleness self-heal (reset `_advisor_running` if
  a thread has been "running" longer than e.g. 10 min). *source:* live
  investigation 2026-07-28, missed by the scheduled review (which only checks
  run-happened, not timing).

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
